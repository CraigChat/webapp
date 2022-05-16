import { addListener, emit, removeListener, waitTill } from '../events';
import { makeLogger } from '../logger';
import { context, lastSentTime, setLastSentTime, setRawVadOn, setVadOn, stream, vadOn } from '.';
import { createCapture } from './capture';

export let sentRecently = false;
// A timeout for periodic checks that are done regardless of processing backend
export let procInterval: null | any = null;
const logger = makeLogger('processing');
// En/disable noise reduction
export let useNR = false;
export function setUseNR(to: boolean): void {
  useNR = to;
}

export async function startLocalProcessing() {
  if (!stream) await waitTill('userMediaReady');
  logger.log('Starting local processing');
  sentRecently = true;
  setLastSentTime(performance.now() + 2500);

  // Some things done periodically other than audio per se
  if (!procInterval) {
    procInterval = setInterval(function () {
      // Display an issue if we haven't sent recently
      const now = performance.now();
      sentRecently = lastSentTime > now - 1500;
      if (!sentRecently) logger.warn('Audio encoding is not functioning!');
    }, 100);
  }

  await startWorker();
}

async function startWorker() {
  const capture = await createCapture({
    context: context!,
    stream: stream!,
    bufferSize: 1024,
    outStream: true,
    command: {
      c: 'filter',
      // useNR: useNR,
      // sentRecently: sentRecently,
      // useTranscription: config.useTranscription
      useNR,
      sentRecently,
      useTranscription: false
    }
  });

  let lastUseNR = useNR;
  let lastSentRecently = sentRecently;

  // Accept state updates
  capture.worker.onmessage = function (ev) {
    const msg = ev.data;

    if (msg.c === 'state') {
      // VAD state
      setRawVadOn(msg.rawVadOn);
      // if (msg.rtcVadOn !== vad.rtcVadOn) rtcVad(capture.destination, msg.rtcVadOn);
      if (msg.vadOn !== vadOn) {
        // if (msg.vadOn) wd.updateWaveRetroactive(vad.vadExtension);
        setVadOn(msg.vadOn);
        emit('speech', null, msg.vadOn);
      }
    } else if (msg.c === 'max') emit('max', msg.m);

    // This is also an opportunity to update them on changed state
    if (useNR !== lastUseNR || sentRecently !== lastSentRecently) {
      capture.worker.postMessage({
        c: 'state',
        useNR,
        sentRecently
      });
      lastUseNR = useNR;
      lastSentRecently = sentRecently;
    }
  };

  // Restart if we change devices
  addListener('processing', 'userMediaStopped', () => {
    removeListener('processing', 'userMediaStopped');
    capture.disconnect();
    startLocalProcessing();
  });
}
