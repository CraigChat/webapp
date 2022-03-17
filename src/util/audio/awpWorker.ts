import { makeLogger } from '../logger';

const libavPath = '/assets/libav-2.5.4.4-ennuicastr.js';
const vadPath = '/assets/vad-m.wasm.js';
const ncWasmPath = '/assets/noise-repellent-m.wasm.js';
const ncPath = '/assets/noise-repellent-m.js';
const logger = makeLogger('AWP Worker');

// import libavPath from 'craig-webapp-tools/libav/libav-2.5.4.4-ennuicastr.js?url';
// import vadPath from 'craig-webapp-tools/vad/vad-m.wasm.js?url';
// import ncWasmPath from 'craig-webapp-tools/noise-repellent/noise-repellent-m.wasm.js?url';
// import ncPath from 'craig-webapp-tools/noise-repellent/noise-repellent-m.js?url';

declare function importScripts(path: string): void;
declare let LibAV: any, NoiseRepellent: any, NoiseRepellentFactory: any, WebRtcVad: any;
export {};

// Number of milliseconds to run the VAD for before/after talking
const vadExtension = 2000;

// Similar, for RTC transmission
const rtcVadExtension = 1000;

// Code for an atomic waiter, which simply informs us whenever the write head changes
const waitWorkerCode = `
onmessage = function(ev) {
    var prevVal = 0;
    var buf = ev.data;
    while (Atomics.wait(buf, 1, prevVal)) {
        var ts = Date.now();
        var newVal = Atomics.load(buf, 1);
        if (prevVal !== newVal) {
            postMessage([ts, prevVal, newVal]);
            prevVal = newVal;
        }
    }
};
`;

function waitTillPropExists(obj: any, name: string, timeout: number = 1000) {
  const start = Date.now();
  while (!obj[name] && Date.now() - start < timeout) {
    // Wait
  }
}

// Handler for data from AWP
class AWPHandler {
  // Port for AWP
  port: MessagePort;

  // Handler for incoming data
  ondata: (ts: number, data: Float32Array[]) => unknown;

  // If we're using shared buffers, these are set
  incoming?: Float32Array[];
  incomingRW?: Int32Array;
  outgoing?: Float32Array[];
  outgoingRW?: Int32Array;
  waitWorker?: Worker;

  // Otherwise, these are used
  ts?: number;
  buf?: Float32Array[];

  constructor(port: MessagePort, ondata: (ts: number, data: Float32Array[]) => unknown) {
    this.port = port;
    this.ondata = ondata;
    port.onmessage = this.onmessage.bind(this);
  }

  onmessage(ev: MessageEvent) {
    const msg = ev.data;

    // We could be receiving a command, or just data
    if (typeof msg === 'object' && msg.c === 'buffers') {
      // Buffers command
      this.incoming = msg.outgoing;
      this.incomingRW = msg.outgoingRW;
      this.outgoing = msg.incoming;
      this.outgoingRW = msg.incomingRW;

      // Create a worker to inform us when we have incoming data
      const ww = (this.waitWorker = new Worker(`data:application/javascript,${encodeURIComponent(waitWorkerCode)}`));
      ww.onmessage = (ev: MessageEvent) => {
        const msg: number[] = ev.data;
        const ts = msg[0];
        const start = msg[1];
        const end = msg[2];
        const buf: Float32Array[] = [];
        const bufSz = this.incoming![0].length;
        let len = end - start;

        /* We still need an atomic load just to guarantee a memory fence in this thread */
        /* deepscan-disable-next-line */
        Atomics.load(this.incomingRW!, 1);

        if (end < start) {
          // We wrapped around
          len += bufSz;
          const brk = bufSz - start;
          for (let i = 0; i < this.incoming!.length; i++) {
            const sbuf = new Float32Array(len);
            sbuf.set(this.incoming![i].subarray(start), 0);
            sbuf.set(this.incoming![i].subarray(0, end), brk);
            buf.push(sbuf);
          }
        } else {
          // Simple case
          for (let i = 0; i < this.incoming!.length; i++) buf.push(this.incoming![i].slice(start, end));
        }

        this.ondata(ts, buf);
      };

      // Start it up
      ww.postMessage(this.incomingRW);

      return;
    } else if (typeof msg === 'number') {
      // Timestamp
      this.ts = msg;
    } else {
      // Must be data
      this.buf = msg;
    }

    if (this.ts && this.buf) {
      const ts = this.ts;
      const buf = this.buf;
      delete this.ts;
      delete this.buf;
      this.ondata(ts, buf);
    }
  }

  sendData(buf: Float32Array[]) {
    if (this.outgoing) {
      // Using shared memory
      const bufSz = this.outgoing[0].length;
      let len = buf[0].length;
      if (len > bufSz) {
        // This is bad!
        len = bufSz;
      }
      let writeHead = this.outgoingRW![1];
      if (writeHead + len > bufSz) {
        // We wrap around
        const brk = bufSz - writeHead;
        for (let i = 0; i < this.outgoing.length; i++) {
          this.outgoing[i].set(buf[i % buf.length].subarray(0, brk), writeHead);
          this.outgoing[i].set(buf[i % buf.length].subarray(brk), 0);
        }
      } else {
        // Simple case
        for (let i = 0; i < this.outgoing.length; i++) this.outgoing[i].set(buf[i % buf.length], writeHead);
      }
      writeHead = (writeHead + len) % bufSz;

      // Inform AWP
      Atomics.store(this.outgoingRW!, 1, writeHead);
      Atomics.notify(this.outgoingRW!, 1);
    } else {
      // Just message passing
      this.port.postMessage({ c: 'data', d: buf });
    }
  }
}

// Our initial message tells us what kind of worker to be
onmessage = function (ev) {
  const msg = ev.data;
  switch (msg.c) {
    case 'encoder':
      doEncoder(msg);
      break;

    case 'filter':
      doFilter(msg);
      break;

    case 'max':
      doMax(msg);
      break;

    case 'dynaudnorm':
      doDynaudnorm(msg);
      break;
  }
};

// Encode with libav
function doEncoder(msg: any) {
  const inPort: MessagePort = msg.port;
  const inSampleRate: number = msg.inSampleRate || 48000;
  const outSampleRate: number = msg.outSampleRate || 48000;
  const format: string = msg.format || 'opus';
  const channelLayout: number = msg.channelLayout || 4;
  const channelCount: number = msg.channelCount || 1;
  let p: Promise<unknown> = Promise.all([]);
  let pts = 0;
  let seq = 0;

  let libav: any;
  const encOptions: any = {
    sample_rate: outSampleRate,
    frame_size: (outSampleRate * 20) / 1000,
    channel_layout: 4,
    channels: 1
  };

  let c: number, frame: number, pkt: number;
  let buffersrc_ctx: number, buffersink_ctx: number;

  // Load libav
  logger.log('Loading libav...');
  (globalThis as any).LibAV = { nolibavworker: true, base: './' };
  importScripts(libavPath);
  waitTillPropExists(LibAV, 'LibAV');
  logger.log('Loaded libav:', !!LibAV.LibAV);

  return LibAV.LibAV({ noworker: true })
    .then((la: any) => {
      libav = la;

      if (format === 'flac') {
        encOptions.sample_fmt = libav.AV_SAMPLE_FMT_S32;
      } else {
        encOptions.sample_fmt = libav.AV_SAMPLE_FMT_FLT;
        encOptions.bit_rate = 128000;
      }

      // Create the encoder
      return libav.ff_init_encoder(format === 'flac' ? 'flac' : 'libopus', encOptions, 1, outSampleRate);
    })
    .then((ret: any) => {
      c = ret[1];
      frame = ret[2];
      pkt = ret[3];
      encOptions.frame_size = ret[4];

      // Create the filter
      return libav.ff_init_filter_graph(
        'anull',
        {
          sample_rate: inSampleRate,
          sample_fmt: libav.AV_SAMPLE_FMT_FLTP,
          channels: channelCount,
          channel_layout: channelLayout
        },
        {
          sample_rate: encOptions.sample_rate,
          sample_fmt: encOptions.sample_fmt,
          channel_layout: 4,
          frame_size: encOptions.frame_size
        }
      );
    })
    .then((ret: any) => {
      buffersrc_ctx = ret[1];
      buffersink_ctx = ret[2];

      // Now we're prepared for input
      new AWPHandler(inPort, ondata);
    })
    .catch(console.error);

  function ondata(ts: number, data: Float32Array[]) {
    // Put it in libav format
    while (data.length < channelCount) data = data.concat(data);
    const frames = [
      {
        data,
        channels: channelCount,
        channel_layout: channelLayout,
        format: libav.AV_SAMPLE_FMT_FLTP,
        pts,
        sample_rate: inSampleRate
      }
    ];
    pts += data[0].length;

    p = p
      .then(() => {
        // Filter
        return libav.ff_filter_multi(buffersrc_ctx, buffersink_ctx, frame, frames);
      })
      .then((frames) => {
        // Encode
        if (frames.length === 0) return [];
        return libav.ff_encode_multi(c, frame, pkt, frames);
      })
      .then((encPackets) => {
        if (encPackets.length === 0) return;

        // They only need the raw data
        const packets = [];
        for (let pi = 0; pi < encPackets.length; pi++) packets.push(encPackets[pi].data);

        // Send the encoded packets to the *host*
        postMessage({ c: 'packets', t: Date.now() - ts, ts, s: seq, d: packets });
        seq += packets.length;
      })
      .catch(console.error);
  }
}

// Do a live filter
function doFilter(msg: any) {
  let awpHandler: AWPHandler;

  // Get out our info
  const inPort: MessagePort = msg.port;
  const sampleRate: number = msg.sampleRate;
  let useNR: boolean = msg.useNR;
  let sentRecently: boolean = msg.sentRecently;

  // Let them update it
  onmessage = function (ev) {
    const msg = ev.data;
    if (msg.c !== 'state') return;
    useNR = msg.useNR;
    sentRecently = msg.sentRecently;
  };

  // State for transfer to the host
  let rawVadOn = false;
  let rtcVadOn = false;
  let vadOn = false;
  let max = 0;
  let maxCtr = 0;

  // Libraries
  let m: any = null;
  let nr: any = null;
  let handle: any = null;
  const bufSz = 640; /* 20ms at 32000Hz */
  let dataPtr: number;
  let buf: Int16Array;
  let bi = 0;
  let timeout: null | any = null;
  let rtcTimeout: null | any = null;
  const step = sampleRate / 32000;

  /* WebRTC VAD is pretty finicky, so also keep track of volume as a
   * secondary gate */
  let triggerVadCeil = 0,
    triggerVadFloor = 0;
  let curVadVolume = 0;
  let lastVolume = 0;

  // Load everything
  Promise.all([])
    .then(function () {
      // Load the VAD
      // __filename = vadPath;
      importScripts(vadPath);
      return WebRtcVad();
    })
    .then(function (ret: any) {
      m = ret;

      // Create our WebRTC vad
      handle = m.Create();
      if (handle === 0) {
        postMessage({ c: 'log', i: 'failvad', m: 'Failed to create VAD.' });
        throw new Error();
      }
      if (m.Init(handle) < 0) {
        postMessage({ c: 'log', i: 'failvad', m: 'Failed to initialize VAD.' });
        throw new Error();
      }

      dataPtr = m.malloc(bufSz * 2);
      buf = new Int16Array(m.heap.buffer, dataPtr!, bufSz * 2);
      m.set_mode(3);

      // And load noise-repellent
      logger.log('Loading noise-repellent...');
      // __filename = ncWasmPath;
      importScripts(ncWasmPath);
      logger.log('Loaded noise-repellent factory:', !!(globalThis as any).NoiseRepellentFactory);
      (globalThis as any).NoiseRepellent = { NoiseRepellentFactory };
      importScripts(ncPath);
      waitTillPropExists(NoiseRepellent, 'NoiseRepellent');
      logger.log('Loaded noise-repellent:', !!NoiseRepellent.NoiseRepellent);
      return NoiseRepellent.NoiseRepellent(sampleRate);
    })
    .then(function (ret: any) {
      nr = ret;
      nr.set(NoiseRepellent.N_ADAPTIVE, 1);
      nr.set(NoiseRepellent.AMOUNT, 20);
      nr.set(NoiseRepellent.WHITENING, 50);
    })
    .then(function () {
      // Now we're ready to receive messages
      awpHandler = new AWPHandler(inPort, ondata);
    })
    .catch(console.error);

  // Called when we receive real data
  function ondata(ts: number, data: Float32Array[]) {
    // Merge together the channels
    const ib = data[0];
    const cc = data.length;
    if (cc !== 1) {
      // Mix it
      for (let i = 1; i < cc; i++) {
        const ibc = data[i];
        for (let j = 0; j < ib.length; j++) ib[j] += ibc[j];
      }

      // Then temper it
      for (let i = 0; i < ib.length; i++) ib[i] /= cc;
    }

    // Perform noise reduction and output
    let nrbuf = ib;
    if (nr) {
      let ob = ib;
      nrbuf = nr.run(ib);
      if (useNR) ob = nrbuf;
      const od = [];
      if (!sentRecently) {
        ob = ob.slice(0);
        ob.fill(0);
      }
      while (od.length < data.length) od.push(ob.slice(0));
      awpHandler.sendData(od);
    }

    // Transfer data for the VAD
    let vadSet = rawVadOn;
    for (let i = 0; i < ib.length; i += step) {
      const v = nrbuf[~~i];
      const a = Math.abs(v);
      curVadVolume += a;

      buf[bi++] = v * 0x7fff;

      if (bi == bufSz) {
        // We have a complete packet
        vadSet = !!m.Process(handle, 32000, dataPtr!, bufSz);
        bi = 0;

        if (vadSet) {
          // Adjust the trigger value quickly up or slowly down
          const triggerTarget = curVadVolume / bufSz;
          if (triggerTarget > triggerVadCeil) {
            triggerVadCeil = triggerTarget;
          } else {
            triggerVadCeil = (triggerVadCeil * 1023 + triggerTarget) / 1024;
          }
        } else {
          const triggerTarget = (curVadVolume / bufSz) * 2;
          triggerVadFloor = (triggerVadFloor * 511 + triggerTarget) / 512;
        }
        lastVolume = curVadVolume;
        curVadVolume = 0;
      }
    }

    // Gate the VAD by volume
    if (vadSet) {
      const relVolume = lastVolume / bufSz;
      vadSet = false;
      // We must be over the floor...
      if (relVolume >= triggerVadFloor) {
        // And at least 1/32nd way to the ceiling
        if (
          triggerVadCeil < triggerVadFloor * 2 ||
          relVolume - triggerVadFloor >= (triggerVadCeil - triggerVadFloor) / 32
        ) {
          vadSet = true;
        }
      }
    }

    // Possibly swap the VAD mode
    if (vadSet) {
      // Switch on the transmission VAD
      if (!rtcVadOn) {
        rtcVadOn = true;
      } else if (rtcTimeout) {
        clearTimeout(rtcTimeout);
        rtcTimeout = null;
      }

      // And the recording VAD
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (!rawVadOn) {
        // We flipped on
        rawVadOn = true;
        vadOn = true;
        curVadVolume = 0;
      }
    } else {
      if (rtcVadOn) {
        // Flip off after a second
        if (!rtcTimeout) {
          rtcTimeout = setTimeout(function () {
            rtcTimeout = null;
            rtcVadOn = false;
          }, rtcVadExtension);
        }
      }

      if (rawVadOn) {
        // Flip off after a while
        rawVadOn = false;
        if (!timeout) {
          timeout = setTimeout(function () {
            timeout = null;
            vadOn = false;
          }, vadExtension);
        }
      }
    }

    // Find the max for this input
    for (let i = 0; i < ib.length; i++) {
      let v = ib[i];
      if (v < 0) v = -v;
      if (v > max) max = v;
      if (++maxCtr >= 1024) {
        // Send a max count
        postMessage({ c: 'max', m: max });
        max = maxCtr = 0;
      }
    }

    // And send everything to the host
    postMessage({
      c: 'state',
      rawVadOn,
      rtcVadOn,
      vadOn
    });
  }
}

// Do simply histogram generation
function doMax(msg: any) {
  // Get out our info
  const inPort: MessagePort = msg.port;

  // State for transfer to the host
  let max = 0;
  let maxCtr = 0;

  const awpHandler: AWPHandler = new AWPHandler(inPort, ondata);

  function ondata(ts: number, data: Float32Array[]) {
    const ib = data[0];
    for (let i = 0; i < ib.length; i++) {
      let v = ib[i];
      if (v < 0) v = -v;
      if (v > max) max = v;
      if (++maxCtr >= 1024) {
        // Send a max count
        postMessage({ c: 'max', m: max });
        max = maxCtr = 0;
      }
    }
    awpHandler.sendData(data);
  }
}

// Do compression/normalization
function doDynaudnorm(msg: any) {
  let awpHandler: AWPHandler;

  // Get out our info
  const inPort: MessagePort = msg.port;
  const sampleRate: number = msg.sampleRate;

  let la: any; // libav
  let frame: number;
  let buffersrc_ctx: number, buffersink_ctx: number;
  let pts = 0;

  // Load libav
  logger.log('Loading libav...');
  (globalThis as any).LibAV = { nolibavworker: true, base: './' };
  importScripts(libavPath);
  waitTillPropExists(LibAV, 'LibAV');
  logger.log('Loaded libav:', !!LibAV.LibAV);
  return LibAV.LibAV({ noworker: true })
    .then((ret: any) => {
      la = ret;
      return la.av_frame_alloc();
    })
    .then((ret: any) => {
      frame = ret;
      return la.ff_init_filter_graph(
        'dynaudnorm=f=10:g=3',
        {
          sample_rate: sampleRate,
          sample_fmt: la.AV_SAMPLE_FMT_FLT,
          channels: 1,
          channel_layout: 4
        },
        {
          sample_rate: sampleRate,
          sample_fmt: la.AV_SAMPLE_FMT_FLT,
          channels: 1,
          channel_layout: 4,
          frame_size: 1024
        }
      );
    })
    .then((ret: any) => {
      buffersrc_ctx = ret[1];
      buffersink_ctx = ret[2];

      // Now we're ready for input
      awpHandler = new AWPHandler(inPort, ondata);
    })
    .catch(console.error);

  function ondata(ts: number, data: Float32Array[]) {
    // Handle input
    const ib = data[0];

    const frames = [
      {
        data: ib,
        channels: 1,
        channel_layout: 4,
        format: la.AV_SAMPLE_FMT_FLT,
        pts,
        sample_rate: sampleRate
      }
    ];
    pts += ib.length;

    return la
      .ff_filter_multi(buffersrc_ctx, buffersink_ctx, frame, frames, false)
      .then((frames: any) => {
        for (let fi = 0; fi < frames.length; fi++) {
          const frame = [frames[fi].data];
          while (frame.length < data.length) frame.push(frame[0]);
          // Send it back
          awpHandler.sendData(frame);
        }
      })
      .catch(console.error);
  }
}
