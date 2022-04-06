/* eslint-disable @typescript-eslint/no-unused-vars */
import { context, timeOffset, vadExtension } from '.';
import { connected, transmitting } from './net';
import { sentRecently } from './processing';

export let canvas: HTMLCanvasElement | null;
export let ctx: CanvasRenderingContext2D | null;
export function setWaveformCanvas(c: HTMLCanvasElement) {
  if (c) {
    canvas = c;
    ctx = c.getContext('2d');
    refreshWave();
  }
}

const waveData: number[] = [];
const waveVADs: number[] = [];
const peakData: number[] = [];
let curPeak = 0;
const rmsData: number[] = [];
let rmsPlaceholders = 0;
let rootSum = 0;
let lastPeak = 0;

const peakWidth = 5;
const log10 = Math.log(10);
const log1036 = log10 * 3.6;

// const vadColors = ['#18181b', '#71717a', '#166534', '#22c55e'];
const vadColors = ['#18181b', '#71717a', '#047857', '#10b981'];
const peakColors = ['#991b1b', '#854d0e', '#166534'];
const noPeakColors = ['#ef4444', '#eab308', '#22c55e'];

// Update the wave display when we retroactively promote VAD data
export function updateWaveRetroactive(): void {
  const timeout = Math.ceil((context!.sampleRate * vadExtension) / 1024000);
  let i = Math.max(waveVADs.length - timeout, 0);
  for (; i < waveVADs.length; i++) waveVADs[i] = waveVADs[i] === 1 ? 2 : waveVADs[i];
}

export function pushMax(val: number, vad: boolean, rawVad: boolean) {
  if (waveData.length >= 100) waveData.shift();
  if (waveVADs.length >= 100) waveVADs.shift();

  // Bump up surrounding ones to make the wave look nicer
  if (waveData.length > 0) {
    let last = waveData.pop();
    if (last < val) last = (last + val) / 2;
    else val = (last + val) / 2;

    waveData.push(last);
  }

  waveData.push(val);
  waveVADs.push(transmitting ? (rawVad ? 3 : vad ? 2 : 1) : 0);

  // And push to peak data too
  peakData.push(val);
  if (val > curPeak) curPeak = val;
  const root = Math.sqrt(val);
  if (vad && rawVad && transmitting) {
    rmsData.push(root);
    rootSum += root;
  } else {
    rmsData.push(null);
    rmsPlaceholders++;
  }

  // Shift over obsolete data
  const max = 30 * context!.sampleRate;
  let recalculate = false;
  while (peakData.length > max) {
    if (peakData[0] === curPeak) recalculate = true;
    peakData.shift();
    const root = rmsData.shift();
    if (root !== null) rootSum -= root;
    else rmsPlaceholders--;
  }
  if (recalculate) curPeak = Math.max(...peakData);

  refreshWave();
}

function refreshWave() {
  // Figure out the ceiling of the display
  const maxVal = Math.max(
    Math.min(Math.max(...waveData) * 1.1, 1),
    0.015 // So the too-quiet bar will always show
  );
  const dh = Math.log(maxVal + 1) / log10;
  const waves: number[] = [];
  for (const max of waveData) {
    // waves.push(Math.log(max + 1) / log1036 - dh);
    const d = Math.log(max + 1) / log10 / dh;
    waves.push(d);
  }
  waves.reverse();

  // Fill ctx with the wave
  if (ctx && canvas) {
    let w = canvas.width;
    const h = canvas.height;
    // peakWidth pixels at the right for peak meter
    if (w > peakWidth * 2) w -= peakWidth;

    const good = connected && transmitting && timeOffset && sentRecently;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < waveData.length; i++) {
      ctx.fillStyle = good ? vadColors[waveVADs[waveVADs.length - i - 1]] ?? '#18181b' : '#18181b';
      ctx.fillRect(Math.ceil(w / 100) * i, h / 2 - (waves[i] * h) / 2, Math.ceil(w / 100), waves[i] * h);
    }
    // Peak meter at the right
    let peak = (2 * Math.log(waveData[waveData.length - 1])) / log1036 + 1;
    if (peak < lastPeak) peak = (lastPeak * 3 + peak) / 4;
    lastPeak = peak;
    // ctx.fillStyle = '#fff';
    for (let pi = 0; pi < 3; pi++) {
      const pl = (2 - pi) / 3,
        pu = (3 - pi) / 3;
      if (peak <= pu) {
        ctx.fillStyle = peakColors[pi];
        ctx.fillRect(w, ~~((h * pi) / 3), peakWidth, ~~((h * 2 * (3 - pi)) / 3));
      }
      if (peak >= pl) {
        ctx.fillStyle = noPeakColors[pi];
        if (peak >= pu) ctx.fillRect(w, ~~(h - pu * h), peakWidth, ~~(h * 2 * pu));
        else ctx.fillRect(w, ~~(h - peak * h), peakWidth, ~~(h * 2 * peak));
      }
    }
  }
}
