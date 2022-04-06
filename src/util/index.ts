import { TFunction } from 'i18next';
import { StateUpdater, useEffect, useState } from 'preact/hooks';

export function encodeText(text: string): Uint8Array {
  if (window.TextEncoder) {
    return new TextEncoder().encode(text);
  }

  // I don't care to do this right, ASCII only
  const ret = new Uint8Array(text.length);
  for (let ni = 0; ni < text.length; ni++) {
    let cc = text.charCodeAt(ni);
    if (cc > 127) cc = 95;
    ret[ni] = cc;
  }
  return ret;
}

export function decodeText(text: ArrayBuffer): string {
  if (window.TextDecoder) {
    return new TextDecoder('utf-8').decode(text);
  }
  let ret = '';
  const t8 = new Uint8Array(text);
  for (let ni = 0; ni < t8.length; ni++) {
    ret += String.fromCharCode(t8[ni]);
  }
  return ret;
}

export function bytesToRepr(x: number): string {
  const suffixes = ['B', 'KiB', 'MiB', 'GiB'];
  while (suffixes.length > 1 && x >= 1024) {
    x /= 1024;
    suffixes.shift();
  }
  return Math.round(x) + suffixes[0];
}

export function useSyncedState<T = any>(defaultState: T, key: string): [T, StateUpdater<T>] {
  const [val, setVal] = useState(localStorage.getItem(key) ? (JSON.parse(localStorage.getItem(key)) as any as T) : defaultState);
  useEffect(() => localStorage.setItem(key, JSON.stringify(val)), [val, key]);
  return [val, setVal];
}

export type StringT = string | ((t: TFunction) => string);

export function asT(t: TFunction, text: string | ((t: TFunction) => string)) {
  if (typeof text === 'function') return text(t);
  return text;
}
