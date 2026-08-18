import { createSession } from './session.js';
import {
  loadSettings,
  saveSettings,
  settingsToMidi,
  readForm,
  fillForm,
  saveLastSession,
} from './settings.js';
import {
  midiToName,
  midiForPitchClassNear,
  buildTuning,
  playableRange,
  TUNING_STRING_COUNT,
  noteRangePreview,
  clampNoteRange,
  pitchClassesForNoteRange,
  NOTE_NAMES,
} from './notes.js';
import { resumeAudioContext, setPlaybackVolume, playNote } from './audio.js';
import { listAudioInputDevices as listDevices, INPUT_GAIN_MIN, INPUT_GAIN_MAX } from './pitch.js';
import { createMicAnswerSource, createFretboardAnswerSource, createNoteNameAnswerSource } from './answer-sources.js';
import { createFretboard } from './fretboard.js';

const viewHome = document.getElementById('view-home');
const viewPractice = document.getElementById('view-practice');
const viewResults = document.getElementById('view-results');
const settingsForm = document.getElementById('settings-form');
const btnToggleSettings = document.getElementById('btn-toggle-settings');
const btnStop = document.getElementById('btn-stop');
const btnHome = document.getElementById('btn-home');
const practiceProgress = document.getElementById('practice-progress');
const practiceStatus = document.getElementById('practice-status');
const practiceSequence = document.getElementById('practice-sequence');
const practiceHint = document.getElementById('practice-hint');
const practiceLive = document.getElementById('practice-live');
const micMeter = document.getElementById('mic-meter');
const micGateMark = document.getElementById('mic-gate-mark');
const micGateSlider = document.getElementById('mic-gate');
const micBoostSlider = document.getElementById('mic-boost');
const playbackVolumeSlider = document.getElementById('playback-volume');
const noteRangeSlider = document.getElementById('note-range');
const noteRangePreviewEl = document.getElementById('note-range-preview');
const micControls = document.getElementById('mic-controls');
const fretboardWrap = document.getElementById('fretboard-wrap');
const fretboardMount = document.getElementById('fretboard');
const noteNamePad = document.getElementById('note-name-pad');
const resultsSummary = document.getElementById('results-summary');
const resultsPerNote = document.getElementById('results-per-note');
const settingsSaved = document.getElementById('settings-saved');
const inputDeviceSelect = document.getElementById('input-device-select');

const METER_FULL_SCALE_RMS = 0.04;

let settings = loadSettings();
setPlaybackVolume(settings.playbackVolume);
let activeSession = null;
let activeNoteCount = 1;
let activeInputMode = 'mic';
let activeFretboard = null;
let activeNoteNameSource = null;
let meterRaf = null;
let noteNamePadAccepting = false;
let namePromptMidi = null;

const A_PITCH_CLASS = 9;

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
    if (settingsForm.noiseGate) settingsForm.noiseGate.value = settings.noiseGate;
  });
}

function syncPlaybackVolumeUi(slider) {
  if (!slider) return;
  slider.value = String(settings.playbackVolume);
}

function bindPlaybackVolumeSlider(slider) {
  if (!slider) return;
  syncPlaybackVolumeUi(slider);
  slider.addEventListener('input', () => {
    const value = parseFloat(slider.value);
    settings.playbackVolume = value;
    setPlaybackVolume(value);
    if (settingsForm.playbackVolume) settingsForm.playbackVolume.value = String(value);
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
    if (settingsForm.inputGain) settingsForm.inputGain.value = String(value);
  });
  slider.addEventListener('change', () => {
    saveSettings(settings);
  });
}

function showView(name) {
  const map = {
    home: viewHome,
    practice: viewPractice,
    results: viewResults,
  };
  for (const [key, el] of Object.entries(map)) {
    const active = key === name;
    el.classList.toggle('view-active', active);
    el.hidden = !active;
  }
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function populateDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    /* labels may be empty until permission */
  }
  const devices = await listDevices();
  inputDeviceSelect.innerHTML = '<option value="">Default</option>';
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Microphone ${inputDeviceSelect.length}`;
    inputDeviceSelect.appendChild(opt);
  }
  inputDeviceSelect.value = settings.inputDeviceId || '';
}

function syncNoteRangeUi() {
  if (noteRangeSlider) noteRangeSlider.value = String(clampNoteRange(settings.noteRange));
  if (noteRangePreviewEl) noteRangePreviewEl.textContent = noteRangePreview(settings.noteRange);
}

function bindNoteRangeSlider() {
  if (!noteRangeSlider) return;
  syncNoteRangeUi();
  noteRangeSlider.addEventListener('input', () => {
    const value = clampNoteRange(noteRangeSlider.value);
    settings.noteRange = value;
    if (noteRangePreviewEl) noteRangePreviewEl.textContent = noteRangePreview(value);
    if (activeSession) activeSession.setNoteRange(value);
    if (activeFretboard && activeInputMode !== 'name') {
      activeFretboard.setAllowedPitchClasses(pitchClassesForNoteRange(value));
    }
    syncNoteNamePad();
  });
  noteRangeSlider.addEventListener('change', () => {
    saveSettings(settings);
  });
}

function syncNoteNamePad() {
  if (!noteNamePad) return;
  const allowed = pitchClassesForNoteRange(settings.noteRange);
  for (const btn of noteNamePad.querySelectorAll('.note-name-btn')) {
    const pc = parseInt(btn.dataset.pitchClass, 10);
    const inRange = allowed.has(pc);
    btn.classList.toggle('note-name-btn--out-of-range', !inRange);
    btn.disabled = !inRange || !noteNamePadAccepting;
  }
}

function setNoteNamePadAccepting(enabled) {
  noteNamePadAccepting = enabled;
  syncNoteNamePad();
}

function buildNoteNamePad() {
  if (!noteNamePad) return;
  noteNamePad.replaceChildren();
  for (let i = 0; i < 12; i++) {
    const pc = (A_PITCH_CLASS + i) % 12;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary note-name-btn';
    btn.dataset.pitchClass = String(pc);
    btn.textContent = NOTE_NAMES[pc];
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const around = namePromptMidi ?? 40;
      void resumeAudioContext().then(() => playNote(midiForPitchClassNear(pc, around)));
      activeNoteNameSource?.submit(pc);
    });
    noteNamePad.appendChild(btn);
  }
  syncNoteNamePad();
}

function applyPromptHighlight(payload) {
  if (!activeFretboard) return;
  const pos = payload.promptPosition;
  const show =
    pos &&
    (payload.state === 'listening' || payload.state === 'wrong' || payload.state === 'correct');
  if (show) {
    activeFretboard.highlight(pos.string, pos.fret);
  } else {
    activeFretboard.clearHighlight();
  }
}

function bindSettings() {
  fillForm(settingsForm, settings);
  populateDevices();
}

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    settings = { ...settings, ...readForm(settingsForm) };
    saveSettings(settings);
    setPlaybackVolume(settings.playbackVolume);
    syncGateSliderUi(micGateSlider, micGateMark);
    syncInputGainUi(micBoostSlider);
    syncPlaybackVolumeUi(playbackVolumeSlider);
    syncNoteRangeUi();
    if (activeSession) {
      activeSession.setNoiseGate(settings.noiseGate);
      activeSession.setInputGain(settings.inputGain);
    }
    settingsSaved.classList.remove('hidden');
    setTimeout(() => settingsSaved.classList.add('hidden'), 2000);
  } catch (err) {
    alert(err.message || 'Invalid settings');
  }
});

btnToggleSettings.addEventListener('click', () => {
  settingsForm.classList.toggle('hidden');
});

function clearPracticeHint() {
  practiceHint.innerHTML = '';
  const placeholder = document.createElement('span');
  placeholder.className = 'hint-slot hint-slot-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.textContent = '↑';
  practiceHint.appendChild(placeholder);
  practiceHint.removeAttribute('aria-label');
  practiceHint.classList.remove('hidden');
}

const HINT_LABELS = {
  correct: 'correct',
  up: 'higher',
  down: 'lower',
  same: 'same pitch',
};

const HINT_SYMBOLS = {
  correct: '✓',
  up: '↑',
  down: '↓',
  same: '=',
};

function renderHints(hints) {
  if (!hints || hints.length === 0) {
    clearPracticeHint();
    return;
  }
  practiceHint.innerHTML = '';
  const labels = [];
  hints.forEach((kind, i) => {
    const span = document.createElement('span');
    span.className = 'hint-slot';
    if (kind === 'correct') span.classList.add('hint-correct');
    span.textContent = HINT_SYMBOLS[kind] || '?';
    practiceHint.appendChild(span);
    labels.push(`note ${i + 1} ${HINT_LABELS[kind] || kind}`);
  });
  practiceHint.setAttribute('aria-label', labels.join(', '));
}

function renderRevealedNames(names) {
  const list = (names || []).filter(Boolean);
  if (list.length === 0) {
    clearPracticeHint();
    return;
  }
  practiceHint.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'hint-reveal';
  span.textContent = list.join(' · ');
  practiceHint.appendChild(span);
  practiceHint.setAttribute('aria-label', list.join(', '));
}

function updateSequenceProgress(noteCount, targetIndex, state) {
  if (noteCount <= 1) {
    practiceSequence.classList.add('hidden');
    practiceSequence.textContent = '';
    return;
  }
  if (state === 'listening' || state === 'sequence-progress' || state === 'wrong') {
    const pos = state === 'listening' ? targetIndex + 1 : Math.min(targetIndex + 1, noteCount);
    practiceSequence.textContent = `Note ${pos} of ${noteCount}`;
    practiceSequence.classList.remove('hidden');
  } else if (state === 'playing') {
    practiceSequence.textContent = `Listen to ${noteCount} notes`;
    practiceSequence.classList.remove('hidden');
  } else {
    practiceSequence.classList.add('hidden');
  }
}

function updatePracticeUi(payload) {
  const midiSettings = settingsToMidi(settings);
  const noteCount = payload.noteCount ?? activeNoteCount;
  const nameMode = payload.quizMode === 'name' || activeInputMode === 'name';
  practiceProgress.textContent = `${payload.progress ?? 0} / ${midiSettings.notesPerSet}`;

  updateSequenceProgress(noteCount, payload.targetIndex ?? 0, payload.state);
  applyPromptHighlight(payload);
  if (Array.isArray(payload.targetSequence) && payload.targetSequence.length > 0) {
    namePromptMidi = payload.targetSequence[0];
  }
  setNoteNamePadAccepting(nameMode && payload.state === 'listening');

  if (payload.state === 'pick') {
    clearPracticeHint();
  } else if (payload.state === 'playing') {
    practiceStatus.textContent = noteCount > 1 ? 'Listen…' : 'Listen…';
    renderHints(payload.hints);
  } else if (payload.state === 'listening') {
    practiceStatus.textContent = promptForAnswer(noteCount);
    if (!nameMode) clearPracticeHint();
  } else if (payload.state === 'sequence-progress') {
    practiceStatus.textContent = promptForAnswer(noteCount);
    renderRevealedNames(payload.acceptedNames ?? [payload.partialReveal]);
  } else if (payload.state === 'wrong') {
    practiceStatus.textContent = nameMode ? 'Not quite — try again' : 'Not quite — listen again';
    clearPracticeHint();
  } else if (payload.state === 'correct') {
    practiceStatus.textContent = 'Correct!';
    renderRevealedNames(payload.revealedNames);
    practiceSequence.classList.add('hidden');
  }
}

function promptForAnswer(noteCount) {
  if (activeInputMode === 'name') return 'Name the note';
  const verb = activeInputMode === 'fretboard' ? 'Tap' : 'Play';
  return noteCount > 1 ? `${verb} the sequence` : `${verb} the note`;
}

function setPracticeChrome(inputMode) {
  const showFretboard = inputMode === 'fretboard' || inputMode === 'name';
  const showMic = inputMode === 'mic';
  const showPad = inputMode === 'name';
  micControls.classList.toggle('hidden', !showMic);
  fretboardWrap.classList.toggle('hidden', !showFretboard);
  noteNamePad?.classList.toggle('hidden', !showPad);
}

function destroyFretboard() {
  if (activeFretboard) {
    activeFretboard.destroy();
    activeFretboard = null;
  }
}

function endPracticeUi() {
  stopMeter();
  destroyFretboard();
  activeNoteNameSource = null;
  namePromptMidi = null;
  setNoteNamePadAccepting(false);
  setPracticeChrome('mic');
}

function startMeter(listener) {
  const tick = () => {
    if (!activeSession) return;
    const level = meterLevelFraction(listener.rmsLevel);
    micMeter.style.width = `${level * 100}%`;
    micMeter.classList.toggle('above-gate', listener.rmsLevel >= settings.noiseGate);
    if (settings.showLiveDetection && listener.lastDetectedMidi != null) {
      practiceLive.textContent = `Detected: ${midiToName(listener.lastDetectedMidi)}`;
      practiceLive.classList.remove('hidden');
    } else if (!settings.showLiveDetection) {
      practiceLive.classList.add('hidden');
    }
    meterRaf = requestAnimationFrame(tick);
  };
  meterRaf = requestAnimationFrame(tick);
}

function stopMeter() {
  if (meterRaf) cancelAnimationFrame(meterRaf);
  meterRaf = null;
  micMeter.style.width = '0%';
  micMeter.classList.remove('above-gate');
}

function renderResults(results) {
  resultsSummary.innerHTML = `
    <dt>Total time</dt><dd>${formatDuration(results.totalTimeMs)}</dd>
    <dt>Sequences completed</dt><dd>${results.completed}</dd>
    <dt>First-try accuracy</dt><dd>${results.firstTryPct.toFixed(1)}%</dd>
    <dt>Avg. time per sequence</dt><dd>${(results.avgTimeMs / 1000).toFixed(1)}s</dd>
    <dt>Wrong attempts</dt><dd>${results.wrongAttempts}</dd>
    <dt>Longest streak</dt><dd>${results.longestStreak}</dd>
  `;
  resultsPerNote.innerHTML = '';
  const top = results.perNote.filter((n) => n.wrongAttempts > 0).slice(0, 12);
  if (top.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No wrong attempts — perfect run!';
    resultsPerNote.appendChild(li);
  } else {
    for (const row of top) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${row.name}</span><span class="wrong">${row.wrongAttempts} miss${row.wrongAttempts === 1 ? '' : 'es'}</span>`;
      resultsPerNote.appendChild(li);
    }
  }
}

async function startPractice(noteCount, inputMode) {
  try {
    await resumeAudioContext();
    activeInputMode =
      inputMode === 'fretboard' ? 'fretboard' : inputMode === 'name' ? 'name' : 'mic';
    activeNoteCount = activeInputMode === 'name' ? 1 : noteCount;
    const midiSettings = {
      ...settingsToMidi(settings),
      noteCount: activeNoteCount,
      quizMode: activeInputMode === 'name' ? 'name' : 'imitate',
    };
    const tuning = buildTuning({
      strings: TUNING_STRING_COUNT,
      lowestMidi: midiSettings.lowestMidi,
      highestMidi: midiSettings.highestMidi,
    });

    destroyFretboard();
    activeNoteNameSource = null;
    namePromptMidi = null;
    setNoteNamePadAccepting(false);
    setPracticeChrome(activeInputMode);
    showView('practice');
    clearPracticeHint();
    practiceSequence.classList.add('hidden');
    practiceStatus.textContent = 'Starting…';

    let answerSource;
    if (activeInputMode === 'fretboard') {
      activeFretboard = createFretboard(fretboardMount, {
        tuning,
        frets: midiSettings.frets,
        allowedPitchClasses: pitchClassesForNoteRange(settings.noteRange),
      });
      answerSource = createFretboardAnswerSource(activeFretboard);
    } else if (activeInputMode === 'name') {
      activeFretboard = createFretboard(fretboardMount, {
        tuning,
        frets: midiSettings.frets,
        dimWhenInactive: false,
      });
      activeNoteNameSource = createNoteNameAnswerSource();
      answerSource = activeNoteNameSource;
      syncNoteNamePad();
    } else {
      const range = playableRange({ tuning, frets: midiSettings.frets });
      answerSource = createMicAnswerSource(midiSettings, range);
    }

    activeSession = createSession(midiSettings, {
      onStateChange: updatePracticeUi,
      onCorrect: () => {},
      onWrong: () => {},
      onFinished: (results) => {
        saveLastSession(results);
        endPracticeUi();
        activeSession = null;
        renderResults(results);
        showView('results');
      },
    }, answerSource);

    syncGateSliderUi(micGateSlider, micGateMark);
    syncInputGainUi(micBoostSlider);
    syncPlaybackVolumeUi(playbackVolumeSlider);
    syncNoteRangeUi();
    const listener = activeSession.getListener();
    if (listener) startMeter(listener);
    await activeSession.start();
  } catch (err) {
    activeSession = null;
    endPracticeUi();
    showView('home');
    const fallback =
      activeInputMode === 'mic'
        ? 'Could not start practice. Check microphone permission.'
        : 'Could not start practice.';
    alert(err.message || fallback);
  }
}

for (const btn of document.querySelectorAll('.btn-start')) {
  btn.addEventListener('click', () => {
    const count = parseInt(btn.getAttribute('data-note-count'), 10);
    const input = btn.getAttribute('data-input') || 'mic';
    void startPractice(count, input);
  });
}

btnStop.addEventListener('click', async () => {
  if (activeSession) {
    await activeSession.stop();
    activeSession = null;
  }
  endPracticeUi();
  showView('home');
});

btnHome.addEventListener('click', () => showView('home'));

bindSettings();
bindNoteRangeSlider();
buildNoteNamePad();
bindGateSlider(micGateSlider, micGateMark, (value) => {
  if (activeSession) activeSession.setNoiseGate(value);
});
bindInputGainSlider(micBoostSlider, (value) => {
  if (activeSession) activeSession.setInputGain(value);
});
bindPlaybackVolumeSlider(playbackVolumeSlider);
