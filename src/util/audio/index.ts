import { bytesToRepr } from '..';
import { addListener, emit } from '../events';
import { makeLogger } from '../logger';
import { CaptureResult, createCapture } from './capture';
import {
  bufferedAmount,
  connect,
  ConnectOptions,
  dataSock,
  errorHandler,
  flacInfo,
  ping,
  pingSock,
  setTransmitting
} from './net';
import { startLocalProcessing } from './processing';
import { EnnuicastrId, EnnuicastrInfo, EnnuicastrParts } from './protocol';

// The Opus or FLAC packets to be handled. Format: [granulePos, data]
type Packet = [number, DataView];

let packets: Packet[] = [];
export let context: AudioContext | null = null;
export let stream: MediaStream | null = null;
export let zeroPacket = new Uint8Array([0xf8, 0xff, 0xfe]);
export let timeOffset: null | number = null;
let targetTimeOffset: null | number = null;
const timeOffsetAdjPerFrame = 0.0002;
const pongs: number[] = [];
let sendSilence = 400;
let sentZeroes = 999;
export let capture: CaptureResult | null = null;
export let lastSentTime = 0;
export function setLastSentTime(to: number): void {
  lastSentTime = to;
}
const logger = makeLogger('audio');

// TODO use apples webkitAudioContext

// Number of milliseconds to run the VAD for before/after talking
export const vadExtension = 2000;
export let vadOn = false;
export function setVadOn(to: boolean): void {
  vadOn = to;
  emit('vad', to);
}
export let rawVadOn = false;
export function setRawVadOn(to: boolean): void {
  rawVadOn = to;
  emit('rawVad', to);
}

export async function start(opts: ConnectOptions) {
  await connect(opts);
  startLocalProcessing();
  await getStream();
  await startEncoder(false, false);
}

export async function stop() {
  await dataSock?.close();
  await pingSock?.close();
}

// Handle pongs for our time offset
addListener('audio', 'pong', (msg: DataView) => {
  const sent = msg.getFloat64(EnnuicastrParts.pong.clientTime, true);
  const recvd = performance.now();
  pongs.push(recvd - sent);
  while (pongs.length > 5) pongs.shift();
  if (pongs.length < 5) {
    // Get more pongs now!
    setTimeout(ping, 150);
  } else {
    // Get more pongs... eventually
    setTimeout(ping, 10000);

    // And figure out our offset
    const latency =
      pongs.reduce(function (a, b) {
        return a + b;
      }) / 10;
    const remoteTime = msg.getFloat64(EnnuicastrParts.pong.serverTime, true) + latency;
    targetTimeOffset = remoteTime - recvd;
    if (timeOffset === null) timeOffset = targetTimeOffset;
  }
});

export async function getStream() {
  // Remove active sources
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    emit('userMediaStopped');
  }

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: { ideal: false },
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 24 }
    }
  });

  const audioTrackSettings = stream.getAudioTracks()[0].getSettings();
  logger.log('Audio track settings: ', audioTrackSettings);
  context = new AudioContext({ latencyHint: 'playback', sampleRate: audioTrackSettings.sampleRate });
  emit('userMediaReady');
}

export async function startEncoder(flac = false, continuous = false) {
  const audioTrackSettings = stream!.getAudioTracks()[0].getSettings();
  const sampleRate = flac && context!.sampleRate === 44100 ? 44100 : 48000;

  if (flac) {
    // Notify server of sample rate
    const info = new DataView(new ArrayBuffer(EnnuicastrParts.info.length));
    info.setUint32(0, EnnuicastrId.INFO, true);
    info.setUint32(EnnuicastrParts.info.key, EnnuicastrInfo.SAMPLE_RATE, true);
    info.setUint32(EnnuicastrParts.info.value, sampleRate, true);
    flacInfo(info.buffer);

    // Set zero packet
    switch (sampleRate) {
      case 44100:
        zeroPacket = new Uint8Array([
          0xff, 0xf8, 0x79, 0x0c, 0x00, 0x03, 0x71, 0x56, 0x00, 0x00, 0x00, 0x00, 0x63, 0xc5
        ]);
        break;
      default:
        zeroPacket = new Uint8Array([
          0xff, 0xf8, 0x7a, 0x0c, 0x00, 0x03, 0xbf, 0x94, 0x00, 0x00, 0x00, 0x00, 0xb1, 0xca
        ]);
    }
  }

  let channelLayout = 4;
  const channelCount = ~~(<any>audioTrackSettings).channelCount;
  if (channelCount > 1) channelLayout = Math.pow(2, channelCount) - 1;

  capture = await createCapture({
    context: context!,
    stream: stream!,
    // matchSampleRate: true,
    bufferSize: 16384,
    outStream: true,
    command: {
      c: 'encoder',
      outSampleRate: sampleRate,
      format: flac ? 'flac' : 'opus',
      channelLayout,
      channelCount
    }
  });

  // Accept encoded packets
  let last = 0;
  capture.worker.onmessage = function (ev) {
    const msg = ev.data;
    if (msg.c !== 'packets') return;

    // Figure out the packet start time
    const p = msg.d;
    const now = msg.ts + performance.now() - Date.now(); // time adjusted from Date.now to performance.now
    let pktTime = Math.round(now * 48 - p.length * 960);

    // Add them to our own packet buffer
    for (let pi = 0; pi < p.length; pi++) {
      packets.push([pktTime, new DataView(p[pi].buffer)]);
      pktTime += 960;
    }

    // Check for sequence issues
    if (msg.s > last) errorHandler(`Sequence error! ${msg.s} ${last}`);
    last = msg.s + p.length;

    handlePackets(continuous);
  };
}

// Once we've parsed new packets, we can do something with them
function handlePackets(continuous: boolean) {
  if (!packets.length || timeOffset === null) return;

  const curGranulePos = packets[packets.length - 1][0];
  setTransmitting(true);

  // We have *something* to handle
  lastSentTime = performance.now();

  // Warn if we're buffering
  const ba = bufferedAmount();
  if (ba > 1024 * 1024) logger.debug(`Buffering ${bytesToRepr(ba)} of audio data!`);

  if (!vadOn) {
    // Drop any sufficiently old packets, or send them marked as silence in continuous mode
    const old = curGranulePos - vadExtension * 48;
    while (packets[0][0] < old) {
      const packet = packets.shift();
      if (!packet) break;
      const granulePos = adjustTime(packet)!;
      if (granulePos < 0) continue;
      if (continuous || sendSilence > 0) {
        /* Send it in VAD-off mode */
        sendPacket(granulePos, packet[1], 0, continuous);
        sendSilence--;
      } else if (sentZeroes < 3) {
        /* Send an empty packet in its stead */
        sendPacket(granulePos, zeroPacket, 0, continuous);
        sentZeroes++;
      }
    }
  } else {
    const vadVal = rawVadOn ? 2 : 1;

    // VAD is on, so send packets
    packets.forEach((packet) => {
      const data = packet[1];

      const granulePos = adjustTime(packet)!;
      if (granulePos < 0) return;

      sendPacket(granulePos, data, vadVal, continuous);
    });

    sentZeroes = 0;
    packets = [];
  }
}

/** Send an audio packet */
function sendPacket(granulePos: number, data: { buffer: ArrayBuffer }, vadVal: number, continous: boolean) {
  const msg = new DataView(new ArrayBuffer(EnnuicastrParts.data.length + (continous ? 1 : 0) + data.buffer.byteLength));
  msg.setUint32(0, EnnuicastrId.DATA, true);
  msg.setUint32(EnnuicastrParts.data.granulePos, granulePos & 0xffffffff, true);
  msg.setUint16(EnnuicastrParts.data.granulePos + 4, (granulePos / 0x100000000) & 0xffff, true);
  if (continous) msg.setUint8(EnnuicastrParts.data.packet, vadVal);
  const data8 = new Uint8Array(data.buffer);
  new Uint8Array(msg.buffer).set(data8, EnnuicastrParts.data.packet + (continous ? 1 : 0));
  dataSock?.send(msg.buffer);
}

// Adjust the time for a packet, and adjust the time-adjustment parameters
function adjustTime(packet: Packet) {
  if (timeOffset === null || targetTimeOffset === null) return;

  // Adjust our offsets
  if (targetTimeOffset > timeOffset) {
    if (targetTimeOffset > timeOffset + timeOffsetAdjPerFrame) timeOffset += timeOffsetAdjPerFrame;
    else timeOffset = targetTimeOffset;
  } else if (targetTimeOffset < timeOffset) {
    if (targetTimeOffset < timeOffset - timeOffsetAdjPerFrame) timeOffset -= timeOffsetAdjPerFrame;
    else timeOffset = targetTimeOffset;
  }

  // And adjust the time
  return Math.round(packet[0] + timeOffset! * 48);
}

export function toggleMute(enabled?: boolean): void {
  if (!stream) return;
  const track = stream.getAudioTracks()[0];
  if (typeof enabled === 'undefined') enabled = !track.enabled;
  track.enabled = enabled;
}
