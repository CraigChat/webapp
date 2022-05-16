import { UserExtraType } from './audio/protocol';

interface Events {
  recId: (id: number) => void;
  startTime: (time: number) => void;
  selfTransmitting: (transmitting: boolean) => void;
  connected: (connected: boolean) => void;
  pong: (msg: DataView) => void;
  speech: (userTrack: number | null, status: boolean) => void;
  user: (track: number, nick: string, status: boolean) => void;
  userExtra: (track: number, type: UserExtraType, data: string) => void;
  userMediaReady: (deviceId?: string) => void;
  userMediaStopped: () => void;
  vad: (on: boolean) => void;
  rawVad: (on: boolean) => void;
  max: (perc: number) => void;
}

type EventMap<E extends keyof Events> = Map<E, { [key: string]: Events[E] }>;
export const listeners = new Map() as EventMap<keyof Events>;

export function addListener<E extends keyof Events>(key: string, event: E, listener: Events[E]): void {
  if (!listeners.has(event)) listeners.set(event, {});
  listeners.get(event)![key] = listener;
}

export function removeListener(key: string, event: keyof Events): void {
  if (!listeners.has(event)) return;
  delete listeners.get(event)![key];
}

export function removeAllListeners(event: keyof Events): void {
  if (!listeners.has(event)) return;
  listeners.delete(event);
}

export function removeAllListenersFromKey(key: string): void {
  for (const event of listeners.keys()) {
    delete listeners.get(event)![key];
  }
}

export function emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
  if (!listeners.has(event)) return;
  for (const key in listeners.get(event)!) {
    // @ts-ignore
    listeners.get(event)![key](...args);
  }
}

export function waitTill<E extends keyof Events>(event: E): Promise<void> {
  return new Promise((resolve) => {
    const listener = () => {
      removeListener(listener.toString(), event);
      resolve();
    };
    addListener(listener.toString(), event, listener);
  });
}
