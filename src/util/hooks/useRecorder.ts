import { useEffect, useState } from 'preact/compat';

export enum RecorderState {
  REQUESTING_PERMISSION,
  READY,
  ERROR
}

/** Prompt for user permission to record audio. */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>(RecorderState.REQUESTING_PERMISSION);
  const [error, setError] = useState<Error>();
  const [stream, setStream] = useState<MediaStream>();

  useEffect(() => {
    // Remove streams
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(undefined);
    }
  }, [stream]);

  useEffect(() => {
    if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          setStream(stream);
          setState(RecorderState.READY);
        })
        .catch((error) => {
          console.error(error);
          setState(RecorderState.ERROR);
          setError(error);
        });
    } else {
      setState(RecorderState.ERROR);
      setError(new Error('getUserMedia is not supported'));
    }
  }, []);

  return { state, error };
}
