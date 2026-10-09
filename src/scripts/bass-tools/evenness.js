import { PitchListener } from './pitch.js';
import { getAudioContext, resumeAudioContext, scheduleMetronomeClick } from './audio.js';

const LOOKAHEAD_SEC = 0.1;
const SCHEDULER_MS = 25;
const BUFFER_SIZE = 320;
const FULL_SCALE_RMS = 0.04;
const EVEN_COLOR = '#c44';
const ODD_COLOR = '#3b7ddd';
const EVEN_FILL = 'rgba(204, 68, 68, 0.38)';
const ODD_FILL = 'rgba(59, 125, 221, 0.38)';
const LATENCY_MIN_MS = -200;
const LATENCY_MAX_MS = 200;

function clampLatencyMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(LATENCY_MAX_MS, Math.max(LATENCY_MIN_MS, n));
}

const LOWPASS_MIN_HZ = 80;
const LOWPASS_MAX_HZ = 8000;

function clampLowpassHz(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 600;
  return Math.min(LOWPASS_MAX_HZ, Math.max(LOWPASS_MIN_HZ, n));
}

export function createEvenness(options, callbacks = {}) {
  const { inputGain, inputDeviceId, canvas } = options;
  const { onLevel } = callbacks;

  const listener = new PitchListener({
    noiseGate: 0,
    inputGain,
    lowpassHz: clampLowpassHz(options.lowpassHz ?? 600),
    minFreq: 25,
    maxFreq: 800,
    centsTolerance: 100,
    stableFramesRequired: 999,
  });
  listener.setListeningEnabled(true);

  let bpm = options.bpm ?? 90;
  let latencySec = clampLatencyMs(options.latencyMs ?? 0) / 1000;
  let originTime = 0;
  let running = false;
  let raf = null;
  let schedulerId = null;
  let nextClickTime = 0;
  let lastBeatIndex = 0;
  let lastSampleIndex = 0;
  let lastLevel = 0;

  const evenBuffer = new Float32Array(BUFFER_SIZE);
  const oddBuffer = new Float32Array(BUFFER_SIZE);

  function periodSec() {
    return 60 / bpm;
  }

  function displayTime(audioTime) {
    return audioTime - latencySec;
  }

  function beatIndexAt(time) {
    return Math.floor((time - originTime) / periodSec());
  }

  function phaseAt(time) {
    const T = periodSec();
    const elapsed = time - originTime;
    const wrapped = elapsed - Math.floor(elapsed / T) * T;
    return wrapped / T;
  }

  function bufferForBeat(index) {
    return index % 2 === 0 ? evenBuffer : oddBuffer;
  }

  function fillRange(buffer, fromIndex, toIndex, value) {
    const start = Math.max(0, Math.min(BUFFER_SIZE, fromIndex));
    const end = Math.max(0, Math.min(BUFFER_SIZE, toIndex));
    for (let i = start; i < end; i += 1) {
      buffer[i] = value;
    }
  }

  function writeThrough(fromBeat, fromSample, toBeat, toSample, value) {
    if (toBeat < fromBeat) return;
    if (toBeat === fromBeat) {
      fillRange(bufferForBeat(fromBeat), fromBeat === lastBeatIndex ? fromSample : 0, toSample + 1, value);
      return;
    }

    fillRange(bufferForBeat(fromBeat), fromSample, BUFFER_SIZE, value);
    for (let beat = fromBeat + 1; beat < toBeat; beat += 1) {
      fillRange(bufferForBeat(beat), 0, BUFFER_SIZE, value);
    }
    fillRange(bufferForBeat(toBeat), 0, toSample + 1, value);
  }

  function scheduleClicks() {
    const ac = getAudioContext();
    while (nextClickTime < ac.currentTime + LOOKAHEAD_SEC) {
      scheduleMetronomeClick(false, nextClickTime);
      nextClickTime += periodSec();
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawTrace(ctx, buffer, stroke, fill) {
    const width = canvas.width;
    const height = canvas.height;
    const baseline = height - 1;
    ctx.beginPath();
    ctx.moveTo(0, baseline);
    for (let i = 0; i < BUFFER_SIZE; i += 1) {
      const x = (i / (BUFFER_SIZE - 1)) * width;
      const amp = Math.min(1, buffer[i] / FULL_SCALE_RMS);
      const y = baseline - amp * (height - 2);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, baseline);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.5, canvas.width / 420);
    ctx.stroke();
  }

  function draw() {
    if (!canvas) return;
    resizeCanvas();
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(canvas);
    ctx.fillStyle = styles.getPropertyValue('--evenness-wave-bg').trim() || 'transparent';
    ctx.fillRect(0, 0, width, height);

    drawTrace(ctx, oddBuffer, ODD_COLOR, ODD_FILL);
    drawTrace(ctx, evenBuffer, EVEN_COLOR, EVEN_FILL);

    const beatX = width * 0.5;
    ctx.strokeStyle = styles.getPropertyValue('--evenness-beat-line').trim() || 'rgba(128,128,128,0.7)';
    ctx.lineWidth = Math.max(1, canvas.width / 640);
    ctx.beginPath();
    ctx.moveTo(beatX + 0.5, 0);
    ctx.lineTo(beatX + 0.5, height);
    ctx.stroke();

    const ac = getAudioContext();
    const shown = displayTime(ac.currentTime);
    const phase = running ? phaseAt(shown) : 0;
    const even = running ? beatIndexAt(shown) % 2 === 0 : true;
    const playX = phase * width;
    ctx.strokeStyle = even ? EVEN_COLOR : ODD_COLOR;
    ctx.lineWidth = Math.max(2, canvas.width / 320);
    ctx.beginPath();
    ctx.moveTo(playX + 0.5, 0);
    ctx.lineTo(playX + 0.5, height);
    ctx.stroke();
  }

  function tick() {
    const ac = getAudioContext();
    const now = ac.currentTime;
    const level = listener.rmsLevel;
    lastLevel = level;
    if (onLevel) onLevel(level);

    if (running) {
      const shown = displayTime(now);
      const beat = beatIndexAt(shown);
      const sample = Math.min(BUFFER_SIZE - 1, Math.floor(phaseAt(shown) * BUFFER_SIZE));
      writeThrough(lastBeatIndex, lastSampleIndex, beat, sample, level);
      lastBeatIndex = beat;
      lastSampleIndex = sample;
    }

    draw();
    raf = requestAnimationFrame(tick);
  }

  function firstFutureClick(fromAudioTime) {
    const T = periodSec();
    let click = originTime + T * 0.5;
    if (click <= fromAudioTime) {
      const skipped = Math.floor((fromAudioTime - click) / T) + 1;
      click += skipped * T;
    }
    return click;
  }

  function startClock() {
    const ac = getAudioContext();
    originTime = displayTime(ac.currentTime);
    lastBeatIndex = 0;
    lastSampleIndex = 0;
    evenBuffer.fill(0);
    oddBuffer.fill(0);
    nextClickTime = firstFutureClick(ac.currentTime);
    running = true;
    schedulerId = setInterval(scheduleClicks, SCHEDULER_MS);
    scheduleClicks();
  }

  return {
    async start() {
      await resumeAudioContext();
      await listener.start(inputDeviceId || undefined);
      listener.setListeningEnabled(true);
      startClock();
      raf = requestAnimationFrame(tick);
    },

    stop() {
      running = false;
      if (schedulerId) clearInterval(schedulerId);
      schedulerId = null;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      listener.stop();
      evenBuffer.fill(0);
      oddBuffer.fill(0);
      lastLevel = 0;
      if (onLevel) onLevel(0);
      draw();
    },

    setBpm(value) {
      const next = Math.min(240, Math.max(40, value));
      if (next === bpm) return;
      const ac = getAudioContext();
      const now = ac.currentTime;
      if (running) {
        const shown = displayTime(now);
        const index = beatIndexAt(shown);
        const phase = phaseAt(shown);
        bpm = next;
        originTime = shown - (index + phase) * periodSec();
        nextClickTime = firstFutureClick(now);
      } else {
        bpm = next;
      }
    },

    setLatencyMs(value) {
      latencySec = clampLatencyMs(value) / 1000;
    },

    setInputGain(value) {
      listener.setInputGain(value);
    },

    setLowpassHz(value) {
      listener.setLowpassHz(clampLowpassHz(value));
    },

    getLevel() {
      return lastLevel;
    },
  };
}
