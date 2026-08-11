import { createTuner } from './tuner.js';
import { createMetronome } from './metronome.js';
import { createDrumMachine, DRUM_VOICES, DRUM_VOICE_LABELS } from './drumMachine.js';
import { loadSettings, saveSettings, settingsToMidi } from './settings.js';
import {
  midiToFreq,
  buildTuning,
  playableRange,
  TUNING_STRING_COUNT,
} from './notes.js';
import { resumeAudioContext, setMetronomeVolume, setDrumVolume, setDrumVoiceVolume } from './audio.js';
import { INPUT_GAIN_MIN, INPUT_GAIN_MAX } from './pitch.js';

const viewHome = document.getElementById('view-home');
const viewTuner = document.getElementById('view-tuner');
const viewMetronome = document.getElementById('view-metronome');
const viewDrum = document.getElementById('view-drum');
const btnTuner = document.getElementById('btn-tuner');
const btnMetronome = document.getElementById('btn-metronome');
const btnDrum = document.getElementById('btn-drum');
const btnTunerBack = document.getElementById('btn-tuner-back');
const btnMetronomeBack = document.getElementById('btn-metronome-back');
const btnDrumBack = document.getElementById('btn-drum-back');
const btnMetronomePlay = document.getElementById('btn-metronome-play');
const btnDrumPlay = document.getElementById('btn-drum-play');
const btnDrumReset = document.getElementById('btn-drum-reset');
const tunerNote = document.getElementById('tuner-note');
const tunerCents = document.getElementById('tuner-cents');
const tunerFreq = document.getElementById('tuner-freq');
const tunerNeedle = document.getElementById('tuner-needle');
const tunerMeter = document.getElementById('tuner-meter');
const tunerGateMark = document.getElementById('tuner-gate-mark');
const tunerGateSlider = document.getElementById('tuner-gate');
const tunerBoostSlider = document.getElementById('tuner-boost');
const tunerCard = document.querySelector('.tuner-card');
const metronomeCard = document.querySelector('.metronome-card');
const tempoDial = document.getElementById('tempo-dial');
const tempoDialKnob = document.getElementById('tempo-dial-knob');
const metronomeBpm = document.getElementById('metronome-bpm');
const metronomeBpmMinus5 = document.getElementById('metronome-bpm-minus-5');
const metronomeBpmMinus = document.getElementById('metronome-bpm-minus');
const metronomeBpmPlus = document.getElementById('metronome-bpm-plus');
const metronomeBpmPlus5 = document.getElementById('metronome-bpm-plus-5');
const btnMetronomeTap = document.getElementById('btn-metronome-tap');
const metronomeBeats = document.getElementById('metronome-beats');
const metronomeBeatsEnabled = document.getElementById('metronome-beats-enabled');
const metronomeBeatsMinus = document.getElementById('metronome-beats-minus');
const metronomeBeatsPlus = document.getElementById('metronome-beats-plus');
const metronomeVolumeSlider = document.getElementById('metronome-volume');
const drumTempoSlider = document.getElementById('drum-tempo');
const drumBpmReadout = document.getElementById('drum-bpm');
const drumBeats = document.getElementById('drum-beats');
const drumBeatsMinus = document.getElementById('drum-beats-minus');
const drumBeatsPlus = document.getElementById('drum-beats-plus');
const drumSubbeats = document.getElementById('drum-subbeats');
const drumSubbeatsMinus = document.getElementById('drum-subbeats-minus');
const drumSubbeatsPlus = document.getElementById('drum-subbeats-plus');
const drumGrid = document.getElementById('drum-grid');
const drumVolMaster = document.getElementById('drum-vol-master');
const drumVolKick = document.getElementById('drum-vol-kick');
const drumVolSnare = document.getElementById('drum-vol-snare');
const drumVolHihat = document.getElementById('drum-vol-hihat');

const METER_FULL_SCALE_RMS = 0.04;
const BPM_MIN = 20;
const BPM_MAX = 240;
const TAP_IDLE_MS = 2000;
const BEATS_MIN = 1;
const BEATS_MAX = 16;
const SUBBEATS_MIN = 1;
const SUBBEATS_MAX = 16;

let settings = loadSettings();
setMetronomeVolume(settings.metronomeVolume ?? 1);
setDrumVolume(1);
setDrumVoiceVolume('kick', 1);
setDrumVoiceVolume('snare', 1);
setDrumVoiceVolume('hhClosed', 1);
let activeTuner = null;
let activeMetronome = null;
let activeDrumMachine = null;
let metronomeBpmValue = 90;
let metronomeBeatsValue = 4;
let metronomeBeatsEnabledValue = true;
let drumBpmValue = 90;
let drumBeatsValue = 4;
let drumSubbeatsValue = 4;
let drumPlayheadStep = 0;
let beatPulseTimeout = null;
let tapTimes = [];

function meterLevelFraction(rms) {
  return Math.min(1, rms / METER_FULL_SCALE_RMS);
}

function gateMarkLeftPercent(gate) {
  return Math.min(100, (gate / METER_FULL_SCALE_RMS) * 100);
}

function syncGateSliderUi(slider, mark) {
  if (!slider || !mark) return;
  slider.value = String(settings.noiseGate);
  mark.style.left = `${gateMarkLeftPercent(settings.noiseGate)}%`;
}

function bindGateSlider(slider, mark, apply) {
  if (!slider || !mark) return;
  syncGateSliderUi(slider, mark);
  slider.addEventListener('input', () => {
    const value = parseFloat(slider.value);
    settings.noiseGate = value;
    mark.style.left = `${gateMarkLeftPercent(value)}%`;
    apply(value);
  });
  slider.addEventListener('change', () => {
    saveSettings(settings);
  });
}

function syncInputGainUi(slider) {
  if (!slider) return;
  slider.value = String(settings.inputGain ?? 3);
}

function bindInputGainSlider(slider, apply) {
  if (!slider) return;
  syncInputGainUi(slider);
  slider.addEventListener('input', () => {
    const value = Math.min(INPUT_GAIN_MAX, Math.max(INPUT_GAIN_MIN, parseFloat(slider.value)));
    settings.inputGain = value;
    apply(value);
  });
  slider.addEventListener('change', () => {
    saveSettings(settings);
  });
}

function syncMetronomeVolumeUi(slider) {
  if (!slider) return;
  slider.value = String(settings.metronomeVolume ?? 1);
}

function bindMetronomeVolumeSlider(slider) {
  if (!slider) return;
  syncMetronomeVolumeUi(slider);
  slider.addEventListener('input', () => {
    const value = parseFloat(slider.value);
    settings.metronomeVolume = value;
    setMetronomeVolume(value);
  });
  slider.addEventListener('change', () => {
    saveSettings(settings);
  });
}

function showView(name) {
  const map = {
    home: viewHome,
    tuner: viewTuner,
    metronome: viewMetronome,
    drum: viewDrum,
  };
  for (const [key, el] of Object.entries(map)) {
    const active = key === name;
    el.classList.toggle('view-active', active);
    el.hidden = !active;
  }
}

function tunerFreqBounds() {
  const ms = settingsToMidi(settings);
  const tuning = buildTuning({
    strings: TUNING_STRING_COUNT,
    lowestMidi: ms.lowestMidi,
    highestMidi: ms.highestMidi,
  });
  const { min, max } = playableRange({ tuning, frets: settings.frets });
  return {
    minFreq: Math.max(25, midiToFreq(min) * 0.94),
    maxFreq: Math.min(800, midiToFreq(max) * 1.06),
  };
}

function resetTunerUi() {
  tunerNote.textContent = '—';
  tunerCents.textContent = '';
  tunerFreq.textContent = '';
  tunerNeedle.style.left = '50%';
  tunerMeter.style.width = '0%';
  tunerCard.classList.remove('in-tune');
}

function updateTunerUi(reading) {
  const level = meterLevelFraction(reading.level);
  tunerMeter.style.width = `${level * 100}%`;
  tunerMeter.classList.toggle('above-gate', reading.level >= settings.noiseGate);

  if (reading.silent) {
    tunerNote.textContent = '—';
    tunerCents.textContent = '';
    tunerFreq.textContent = '';
    tunerNeedle.style.left = '50%';
    tunerCard.classList.remove('in-tune');
    return;
  }

  tunerNote.textContent = reading.name;
  const sign = reading.cents >= 0 ? '+' : '';
  tunerCents.textContent = `${sign}${reading.cents.toFixed(0)} ¢`;
  tunerFreq.textContent = `${reading.freq.toFixed(1)} Hz`;
  const clamped = Math.max(-50, Math.min(50, reading.cents));
  tunerNeedle.style.left = `${50 + clamped}%`;
  tunerCard.classList.toggle('in-tune', reading.inTune);
}

function stopTuner() {
  if (activeTuner) {
    activeTuner.stop();
    activeTuner = null;
  }
  resetTunerUi();
}

function bpmToDialDeg(bpm) {
  const t = (bpm - BPM_MIN) / (BPM_MAX - BPM_MIN);
  return -135 + t * 270;
}

function dialDegToBpm(deg) {
  const clamped = Math.max(-135, Math.min(135, deg));
  const t = (clamped + 135) / 270;
  return Math.round(BPM_MIN + t * (BPM_MAX - BPM_MIN));
}

function pointerToDialDeg(clientX, clientY) {
  const rect = tempoDial.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  return Math.atan2(dx, -dy) * (180 / Math.PI);
}

function syncMetronomeDialUi(bpm) {
  metronomeBpmValue = bpm;
  metronomeBpm.textContent = String(bpm);
  tempoDialKnob.style.transform = `rotate(${bpmToDialDeg(bpm)}deg)`;
  tempoDial.setAttribute('aria-valuenow', String(bpm));
  if (metronomeBpmMinus5) metronomeBpmMinus5.disabled = bpm <= BPM_MIN;
  if (metronomeBpmMinus) metronomeBpmMinus.disabled = bpm <= BPM_MIN;
  if (metronomeBpmPlus) metronomeBpmPlus.disabled = bpm >= BPM_MAX;
  if (metronomeBpmPlus5) metronomeBpmPlus5.disabled = bpm >= BPM_MAX;
}

function resetTapSession() {
  tapTimes = [];
}

function bpmFromTapTimes(times) {
  if (times.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < times.length; i++) {
    sum += times[i] - times[i - 1];
  }
  const meanInterval = sum / (times.length - 1);
  return Math.round(60000 / meanInterval);
}

function handleMetronomeTap() {
  const now = performance.now();
  if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > TAP_IDLE_MS) {
    resetTapSession();
  }
  tapTimes.push(now);
  if (tapTimes.length < 2) return;
  const bpm = bpmFromTapTimes(tapTimes);
  if (bpm == null) return;
  const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
  syncMetronomeDialUi(clamped);
  if (activeMetronome) activeMetronome.setBpm(clamped);
}

function nudgeMetronomeBpm(delta) {
  resetTapSession();
  const bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, metronomeBpmValue + delta));
  syncMetronomeDialUi(bpm);
  if (activeMetronome) activeMetronome.setBpm(bpm);
}

function syncMetronomeBeatsUi(beats) {
  metronomeBeatsValue = beats;
  metronomeBeats.value = String(beats);
  const enabled = metronomeBeatsEnabledValue;
  metronomeBeats.disabled = !enabled;
  metronomeBeatsMinus.disabled = !enabled || beats <= BEATS_MIN;
  metronomeBeatsPlus.disabled = !enabled || beats >= BEATS_MAX;
}

function syncMetronomeBeatsEnabledUi(enabled) {
  metronomeBeatsEnabledValue = enabled;
  if (metronomeBeatsEnabled) metronomeBeatsEnabled.checked = enabled;
  syncMetronomeBeatsUi(metronomeBeatsValue);
}

function syncMetronomePlayUi(running) {
  btnMetronomePlay.textContent = running ? 'Stop' : 'Play';
  btnMetronomePlay.setAttribute('aria-pressed', running ? 'true' : 'false');
}

function pulseMetronomeBeat() {
  if (!metronomeCard) return;
  metronomeCard.classList.add('beat-pulse');
  if (beatPulseTimeout) clearTimeout(beatPulseTimeout);
  beatPulseTimeout = setTimeout(() => {
    metronomeCard.classList.remove('beat-pulse');
    beatPulseTimeout = null;
  }, 80);
}

function stopMetronome() {
  if (activeMetronome) {
    activeMetronome.stop();
    activeMetronome = null;
  }
  syncMetronomePlayUi(false);
  if (beatPulseTimeout) {
    clearTimeout(beatPulseTimeout);
    beatPulseTimeout = null;
  }
  if (metronomeCard) metronomeCard.classList.remove('beat-pulse');
}

function ensureMetronome() {
  if (!activeMetronome) {
    activeMetronome = createMetronome(
      {
        bpm: metronomeBpmValue,
        beatsPerMeasure: metronomeBeatsValue,
        beatsPerMeasureEnabled: metronomeBeatsEnabledValue,
      },
      { onBeat: () => pulseMetronomeBeat() },
    );
  }
  return activeMetronome;
}

function openMetronomeView() {
  stopTuner();
  stopDrumMachine();
  showView('metronome');
  syncMetronomeDialUi(metronomeBpmValue);
  syncMetronomeBeatsEnabledUi(metronomeBeatsEnabledValue);
  syncMetronomePlayUi(false);
  syncMetronomeVolumeUi(metronomeVolumeSlider);
  ensureMetronome();
  activeMetronome.setBpm(metronomeBpmValue);
  activeMetronome.setBeatsPerMeasure(metronomeBeatsValue);
  activeMetronome.setBeatsPerMeasureEnabled(metronomeBeatsEnabledValue);
}

async function toggleMetronomePlay() {
  await resumeAudioContext();
  const metronome = ensureMetronome();
  if (metronome.isRunning()) {
    metronome.stop();
    syncMetronomePlayUi(false);
    return;
  }
  metronome.setBpm(metronomeBpmValue);
  metronome.setBeatsPerMeasure(metronomeBeatsValue);
  metronome.setBeatsPerMeasureEnabled(metronomeBeatsEnabledValue);
  await metronome.start();
  syncMetronomePlayUi(true);
}

function bindMetronomeUi() {
  syncMetronomeDialUi(metronomeBpmValue);
  syncMetronomeBeatsEnabledUi(metronomeBeatsEnabledValue);
  syncMetronomePlayUi(false);
  bindMetronomeVolumeSlider(metronomeVolumeSlider);

  let dragging = false;

  const applyPointerBpm = (clientX, clientY) => {
    resetTapSession();
    const bpm = dialDegToBpm(pointerToDialDeg(clientX, clientY));
    syncMetronomeDialUi(bpm);
    if (activeMetronome) activeMetronome.setBpm(bpm);
  };

  tempoDial.addEventListener('pointerdown', (e) => {
    dragging = true;
    tempoDial.setPointerCapture(e.pointerId);
    applyPointerBpm(e.clientX, e.clientY);
  });

  tempoDial.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyPointerBpm(e.clientX, e.clientY);
  });

  tempoDial.addEventListener('pointerup', (e) => {
    dragging = false;
    tempoDial.releasePointerCapture(e.pointerId);
  });

  tempoDial.addEventListener('pointercancel', () => {
    dragging = false;
  });

  metronomeBpmMinus5.addEventListener('click', () => nudgeMetronomeBpm(-5));
  metronomeBpmMinus.addEventListener('click', () => nudgeMetronomeBpm(-1));
  metronomeBpmPlus.addEventListener('click', () => nudgeMetronomeBpm(1));
  metronomeBpmPlus5.addEventListener('click', () => nudgeMetronomeBpm(5));

  if (btnMetronomeTap) {
    btnMetronomeTap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleMetronomeTap();
    });
    btnMetronomeTap.addEventListener('click', (e) => {
      if (e.detail === 0) handleMetronomeTap();
    });
  }

  metronomeBeatsMinus.addEventListener('click', () => {
    const beats = Math.max(BEATS_MIN, metronomeBeatsValue - 1);
    syncMetronomeBeatsUi(beats);
    if (activeMetronome) activeMetronome.setBeatsPerMeasure(beats);
  });

  metronomeBeatsPlus.addEventListener('click', () => {
    const beats = Math.min(BEATS_MAX, metronomeBeatsValue + 1);
    syncMetronomeBeatsUi(beats);
    if (activeMetronome) activeMetronome.setBeatsPerMeasure(beats);
  });

  if (metronomeBeatsEnabled) {
    metronomeBeatsEnabled.addEventListener('change', () => {
      const enabled = metronomeBeatsEnabled.checked;
      syncMetronomeBeatsEnabledUi(enabled);
      if (activeMetronome) activeMetronome.setBeatsPerMeasureEnabled(enabled);
    });
  }

  btnMetronomePlay.addEventListener('click', () => {
    void toggleMetronomePlay();
  });
}

function syncDrumTempoUi(bpm) {
  drumBpmValue = bpm;
  if (drumTempoSlider) drumTempoSlider.value = String(bpm);
  if (drumBpmReadout) drumBpmReadout.textContent = `${bpm} BPM`;
}

function syncDrumBeatsUi(beats) {
  drumBeatsValue = beats;
  if (drumBeats) drumBeats.value = String(beats);
  if (drumBeatsMinus) drumBeatsMinus.disabled = beats <= BEATS_MIN;
  if (drumBeatsPlus) drumBeatsPlus.disabled = beats >= BEATS_MAX;
}

function syncDrumSubbeatsUi(subbeats) {
  drumSubbeatsValue = subbeats;
  if (drumSubbeats) drumSubbeats.value = String(subbeats);
  if (drumSubbeatsMinus) drumSubbeatsMinus.disabled = subbeats <= SUBBEATS_MIN;
  if (drumSubbeatsPlus) drumSubbeatsPlus.disabled = subbeats >= SUBBEATS_MAX;
}

function syncDrumPlayUi() {
  const playing = activeDrumMachine && activeDrumMachine.isRunning() && !activeDrumMachine.isPaused();
  if (btnDrumPlay) btnDrumPlay.textContent = playing ? 'Pause' : 'Play';
  if (btnDrumPlay) btnDrumPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
}

function updateDrumPlayhead(stepIndex) {
  drumPlayheadStep = stepIndex;
  if (!drumGrid) return;
  for (const btn of drumGrid.querySelectorAll('.drum-step-current')) {
    btn.classList.remove('drum-step-current');
  }
  for (const btn of drumGrid.querySelectorAll(`.drum-step[data-step="${stepIndex}"]`)) {
    btn.classList.add('drum-step-current');
  }
}

function renderDrumGrid() {
  if (!drumGrid || !activeDrumMachine) return;
  const pattern = activeDrumMachine.getPattern();
  const stepCount = activeDrumMachine.getStepCount();
  const subBeats = activeDrumMachine.getSubBeats();

  drumGrid.innerHTML = '';
  const scroll = document.createElement('div');
  scroll.className = 'drum-grid-scroll';
  const inner = document.createElement('div');
  inner.className = 'drum-grid-inner';

  for (const voice of [...DRUM_VOICES].reverse()) {
    const row = document.createElement('div');
    row.className = 'drum-row';

    const label = document.createElement('span');
    label.className = 'drum-row-label';
    label.textContent = DRUM_VOICE_LABELS[voice];
    row.appendChild(label);

    const steps = document.createElement('div');
    steps.className = 'drum-steps';

    for (let step = 0; step < stepCount; step += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drum-step';
      btn.dataset.voice = voice;
      btn.dataset.step = String(step);
      btn.setAttribute('aria-label', `${DRUM_VOICE_LABELS[voice]} step ${step + 1}`);
      btn.setAttribute('aria-pressed', pattern[voice][step] ? 'true' : 'false');
      if (pattern[voice][step]) btn.classList.add('drum-step-on');
      if (step % subBeats === 0) btn.classList.add('drum-beat-mark');
      if (step === drumPlayheadStep) btn.classList.add('drum-step-current');
      btn.addEventListener('click', () => {
        if (!activeDrumMachine) return;
        activeDrumMachine.toggleStep(voice, step);
        const on = activeDrumMachine.getPattern()[voice][step];
        btn.classList.toggle('drum-step-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      steps.appendChild(btn);
    }

    row.appendChild(steps);
    inner.appendChild(row);
  }

  scroll.appendChild(inner);
  drumGrid.appendChild(scroll);
}

function stopDrumMachine() {
  if (activeDrumMachine) {
    activeDrumMachine.stop();
    activeDrumMachine = null;
  }
  drumPlayheadStep = 0;
  syncDrumPlayUi();
}

function ensureDrumMachine() {
  if (!activeDrumMachine) {
    activeDrumMachine = createDrumMachine(
      { bpm: drumBpmValue, beats: drumBeatsValue, subBeats: drumSubbeatsValue },
      {
        onStep: ({ stepIndex }) => updateDrumPlayhead(stepIndex),
      },
    );
  }
  return activeDrumMachine;
}

function openDrumView() {
  stopTuner();
  stopMetronome();
  showView('drum');
  syncDrumTempoUi(drumBpmValue);
  syncDrumBeatsUi(drumBeatsValue);
  syncDrumSubbeatsUi(drumSubbeatsValue);
  syncDrumPlayUi();
  ensureDrumMachine();
  activeDrumMachine.setBpm(drumBpmValue);
  activeDrumMachine.setBeats(drumBeatsValue);
  activeDrumMachine.setSubBeats(drumSubbeatsValue);
  drumPlayheadStep = activeDrumMachine.getStepIndex();
  renderDrumGrid();
  updateDrumPlayhead(drumPlayheadStep);
}

async function toggleDrumPlayPause() {
  await resumeAudioContext();
  const drum = ensureDrumMachine();
  if (!drum.isRunning()) {
    drum.setBpm(drumBpmValue);
    await drum.start();
  } else if (drum.isPaused()) {
    await drum.resume();
  } else {
    drum.pause();
  }
  syncDrumPlayUi();
}

function bindDrumVolumeSlider(slider, apply) {
  if (!slider) return;
  slider.addEventListener('input', () => {
    const value = parseFloat(slider.value);
    apply(value);
  });
}

function bindDrumUi() {
  syncDrumTempoUi(drumBpmValue);
  syncDrumBeatsUi(drumBeatsValue);
  syncDrumSubbeatsUi(drumSubbeatsValue);
  syncDrumPlayUi();

  bindDrumVolumeSlider(drumVolMaster, (value) => {
    setDrumVolume(value);
  });
  bindDrumVolumeSlider(drumVolKick, (value) => {
    setDrumVoiceVolume('kick', value);
  });
  bindDrumVolumeSlider(drumVolSnare, (value) => {
    setDrumVoiceVolume('snare', value);
  });
  bindDrumVolumeSlider(drumVolHihat, (value) => {
    setDrumVoiceVolume('hhClosed', value);
  });

  if (drumTempoSlider) {
    drumTempoSlider.addEventListener('input', () => {
      const bpm = parseInt(drumTempoSlider.value, 10);
      syncDrumTempoUi(bpm);
      if (activeDrumMachine) activeDrumMachine.setBpm(bpm);
    });
  }

  drumBeatsMinus.addEventListener('click', () => {
    const beats = Math.max(BEATS_MIN, drumBeatsValue - 1);
    syncDrumBeatsUi(beats);
    if (activeDrumMachine) {
      activeDrumMachine.setBeats(beats);
      syncDrumPlayUi();
      drumPlayheadStep = 0;
      renderDrumGrid();
    }
  });

  drumBeatsPlus.addEventListener('click', () => {
    const beats = Math.min(BEATS_MAX, drumBeatsValue + 1);
    syncDrumBeatsUi(beats);
    if (activeDrumMachine) {
      activeDrumMachine.setBeats(beats);
      syncDrumPlayUi();
      drumPlayheadStep = 0;
      renderDrumGrid();
    }
  });

  drumSubbeatsMinus.addEventListener('click', () => {
    const sub = Math.max(SUBBEATS_MIN, drumSubbeatsValue - 1);
    syncDrumSubbeatsUi(sub);
    if (activeDrumMachine) {
      activeDrumMachine.setSubBeats(sub);
      syncDrumPlayUi();
      drumPlayheadStep = 0;
      renderDrumGrid();
    }
  });

  drumSubbeatsPlus.addEventListener('click', () => {
    const sub = Math.min(SUBBEATS_MAX, drumSubbeatsValue + 1);
    syncDrumSubbeatsUi(sub);
    if (activeDrumMachine) {
      activeDrumMachine.setSubBeats(sub);
      syncDrumPlayUi();
      drumPlayheadStep = 0;
      renderDrumGrid();
    }
  });

  btnDrumPlay.addEventListener('click', () => {
    void toggleDrumPlayPause();
  });

  btnDrumReset.addEventListener('click', () => {
    if (!activeDrumMachine) return;
    activeDrumMachine.resetPosition();
    updateDrumPlayhead(0);
  });
}

async function startTuner() {
  stopMetronome();
  stopDrumMachine();
  try {
    showView('tuner');
    resetTunerUi();
    const { minFreq, maxFreq } = tunerFreqBounds();
    activeTuner = createTuner(
      {
        noiseGate: settings.noiseGate,
        inputGain: settings.inputGain,
        inputDeviceId: settings.inputDeviceId,
        minFreq,
        maxFreq,
      },
      { onReading: updateTunerUi },
    );
    syncGateSliderUi(tunerGateSlider, tunerGateMark);
    syncInputGainUi(tunerBoostSlider);
    await activeTuner.start();
  } catch (err) {
    stopTuner();
    showView('home');
    alert(err.message || 'Could not start tuner. Check microphone permission.');
  }
}

btnTuner.addEventListener('click', () => {
  void startTuner();
});

btnMetronome.addEventListener('click', () => {
  openMetronomeView();
});

btnDrum.addEventListener('click', () => {
  openDrumView();
});

btnTunerBack.addEventListener('click', () => {
  stopTuner();
  showView('home');
});

btnMetronomeBack.addEventListener('click', () => {
  stopMetronome();
  showView('home');
});

btnDrumBack.addEventListener('click', () => {
  stopDrumMachine();
  showView('home');
});

bindMetronomeUi();
bindDrumUi();
bindGateSlider(tunerGateSlider, tunerGateMark, (value) => {
  if (activeTuner) activeTuner.setNoiseGate(value);
});
bindInputGainSlider(tunerBoostSlider, (value) => {
  if (activeTuner) activeTuner.setInputGain(value);
});
