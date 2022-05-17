import { makeLogger } from '../logger';

const logger = makeLogger('capture');
const awpUrl = '/awp.js?v=__GIT_REV__';

export interface CaptureOptions {
  context: AudioContext;
  stream?: MediaStream;
  bufferSize?: number;
  outStream?: boolean;
  command:
    | {
        c: 'max' | 'dynaudnorm';
      }
    | {
        c: 'encoder';
        outSampleRate: number;
        format: 'flac' | 'opus';
        channelLayout: number;
        channelCount: number;
      }
    | {
        c: 'filter';
        useNR: boolean;
        sentRecently: boolean;
        useTranscription: boolean;
      };
}

export interface CaptureResult {
  source: MediaStreamAudioSourceNode | null;
  worker: Worker;
  node: AudioWorkletNode | ScriptProcessorNode;
  destination: MediaStreamAudioDestinationNode | null;
  disconnect: () => void;
}

export function isSafari(): boolean {
  // Chrome pretends to be Safari
  return navigator.userAgent.indexOf('Safari') >= 0 && !(navigator.userAgent.indexOf('Chrome') >= 0);
}

export async function createCapture(captureOptions: CaptureOptions): Promise<CaptureResult> {
  if (typeof AudioWorkletNode !== 'undefined' && !isSafari()) {
    logger.log('Creating AWP capture');
    return captureAWP(captureOptions);
  }

  logger.log('Creating script processor capture');
  return captureScriptProcessor(captureOptions);
}

// TODO safari capture
export async function captureAWP({ context, stream, command, outStream }: CaptureOptions): Promise<CaptureResult> {
  await context.audioWorklet.addModule(awpUrl);
  const awn = new AudioWorkletNode(context, 'worker-processor');
  const awpWorker = new Worker(new URL('./awpWorker.ts', import.meta.url), { type: 'classic' });

  // Need a channel for them to communicate
  const mc = new MessageChannel();
  awn.port.postMessage({ c: 'workerPort', p: mc.port1 }, [mc.port1]);
  awpWorker.postMessage(
    {
      port: mc.port2,
      [command.c === 'encoder' ? 'inSampleRate' : 'sampleRate']: context.sampleRate,
      ...command
    },
    [mc.port2]
  );

  let source: MediaStreamAudioSourceNode | null = null;
  if (stream) source = context.createMediaStreamSource(stream);
  source?.connect(awn);

  let destination: MediaStreamAudioDestinationNode | null = null;
  if (outStream) {
    destination = context.createMediaStreamDestination();
    awn.connect(destination);
  }

  // Prepare to terminate
  let dead = false;
  function disconnect() {
    if (dead) return;
    dead = true;

    source?.disconnect(awn);
    if (destination) awn.disconnect(destination);
    awpWorker.terminate();
  }

  // Done!
  return {
    source,
    worker: awpWorker,
    node: awn,
    destination,
    disconnect
  };
}

export async function captureScriptProcessor({ command, context, stream, bufferSize, outStream }: CaptureOptions): Promise<CaptureResult> {
  const node = context.createScriptProcessor(bufferSize || 4096);
  const awpWorker = new Worker(new URL('./awpWorker.ts', import.meta.url), { type: 'classic' });

  // Need a channel for them to communicate
  const mc = new MessageChannel();
  awpWorker.postMessage(
    {
      port: mc.port2,
      [command.c === 'encoder' ? 'inSampleRate' : 'sampleRate']: context.sampleRate,
      ...command
    },
    [mc.port2]
  );
  node.onaudioprocess = createOnAudioProcess(mc.port1);

  let source: MediaStreamAudioSourceNode | null = null;
  if (stream) source = context.createMediaStreamSource(stream);
  source?.connect(node);

  let destination: MediaStreamAudioDestinationNode | null = null;
  if (outStream) {
    destination = context.createMediaStreamDestination();
    node.connect(destination);
  }

  // Prepare to terminate
  let dead = false;
  function disconnect() {
    if (dead) return;
    dead = true;

    source?.disconnect(node);
    if (destination) node.disconnect(destination);
    awpWorker.terminate();
  }

  // Done!
  return {
    source,
    worker: awpWorker,
    node,
    destination,
    disconnect
  };
}

/** Create the onaudioprocess function necessary for any ScriptProcessor */
function createOnAudioProcess(workerPort: MessagePort) {
  const buffer: Float32Array[][] = [];
  let lenPerBuf = 0;

  // Get audio data from the worker
  workerPort.onmessage = function (ev) {
    const buf = ev.data.d;
    const len = buf[0].length;
    if (len > lenPerBuf) lenPerBuf = len;
    buffer.push(buf);
  };

  // And send/receive data from the ScriptProcessor
  return function (ev: AudioProcessingEvent) {
    // Get it into the right format
    const input: Float32Array[] = [];
    const cc = ev.inputBuffer.numberOfChannels;
    for (let i = 0; i < cc; i++) input.push(ev.inputBuffer.getChannelData(i));

    // Send inputs to the worker
    workerPort.postMessage(Date.now());
    workerPort.postMessage(input);

    // Drain any excess buffer
    while (buffer.length >= 3 && buffer.length * lenPerBuf >= 4800) buffer.shift();

    // And send buffered output out
    const out: Float32Array[] = [];
    for (let i = 0; i < cc; i++) out.push(ev.outputBuffer.getChannelData(i));
    const len = out[0].length;
    let i = 0;
    while (i < len && buffer.length) {
      const remain = len - i;
      const first = buffer[0];

      if (first[0].length > remain) {
        // First has enough to fill out the remainder
        for (let c = 0; c < out.length; c++) out[c].set(first[c % first.length].subarray(0, remain), i);
        for (let c = 0; c < first.length; c++) first[c] = first[c].subarray(remain);
        i += remain;
      } else {
        // Use all of the data from first
        for (let c = 0; c < out.length; c++) out[c].set(first[c % first.length], i);
        i += first[0].length;
        buffer.shift();
      }
    }
  };
}
