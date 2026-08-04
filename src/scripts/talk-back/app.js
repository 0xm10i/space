'use strict';

// ── DOM refs ────────────────────────────────────────────────────────────────
const previewEl          = document.getElementById('preview');
const playbackEl         = document.getElementById('playback');
const previewWrapper     = document.getElementById('preview-wrapper');
const playbackWrapper    = document.getElementById('playback-wrapper');
const recBadge           = document.getElementById('rec-badge');
const btnRecord          = document.getElementById('btn-record');
const btnStopRec         = document.getElementById('btn-stop-rec');
const btnPtt             = document.getElementById('btn-ptt');
const btnStopPlay        = document.getElementById('btn-stop-play');
const statusEl           = document.getElementById('status');
const hintEl             = document.getElementById('hint');
const langBtns           = document.querySelectorAll('.lang-btn');
const transcriptPanel    = document.getElementById('transcript-panel');
const transcriptPlaceholder = document.getElementById('transcript-placeholder');
const transcriptText     = document.getElementById('transcript-text');
const speechIndicator    = document.getElementById('speech-indicator');
const wpmEl              = document.getElementById('wpm-display');

// ── App state ────────────────────────────────────────────────────────────────
// States: 'idle' | 'recording' | 'ptt-recording' | 'playback'
let appState  = 'idle';
let stream    = null;
let recorder  = null;
let chunks    = [];
let objectUrl = null;

// ── Language ─────────────────────────────────────────────────────────────────
let selectedLang = localStorage.getItem('talkback-lang') || 'en-US';

function setLang(lang) {
  selectedLang = lang;
  localStorage.setItem('talkback-lang', lang);
  langBtns.forEach(b => b.classList.toggle('lang-btn--active', b.dataset.lang === lang));

  // If recognition is active, restart it with the new language immediately
  if (appState === 'recording' || appState === 'ptt-recording') {
    restartSpeechRecognition();
  }
}

// ── Speech recognition ────────────────────────────────────────────────────────
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported      = !!SpeechRecognitionAPI;
let recognition            = null;
let finalTranscript        = '';

// ── Speech speed (WPM) ────────────────────────────────────────────────────────
let recordingStart = null; // timestamp when current take began
let lastWpm        = 0;    // frozen at stop for display during playback

function countWords(str) {
  return str.trim() ? str.trim().split(/\s+/).length : 0;
}

function updateWpm() {
  if (!recordingStart) return;
  const elapsedSec = (Date.now() - recordingStart) / 1000;
  if (elapsedSec < 2) return; // too short to be meaningful
  const words = countWords(finalTranscript);
  if (words === 0) return;
  lastWpm = Math.round((words / elapsedSec) * 60);
  wpmEl.textContent = `${lastWpm} WPM`;
  wpmEl.classList.add('active');
}

function clearWpm() {
  recordingStart = Date.now();
  lastWpm = 0;
  wpmEl.textContent = '';
  wpmEl.classList.remove('active');
}

function freezeWpm() {
  if (lastWpm > 0) {
    wpmEl.textContent = `${lastWpm} WPM`;
    wpmEl.classList.add('active');
  }
}

// Called when recognition ends while still in a recording state — auto-restart
// to keep transcription going after browser-side silence timeouts.
function onRecognitionEnd() {
  if (appState === 'recording' || appState === 'ptt-recording') {
    try { recognition.start(); } catch (_) {}
  }
}

function setupRecognition() {
  recognition               = new SpeechRecognitionAPI();
  recognition.continuous    = true;
  recognition.interimResults= true;
  recognition.maxAlternatives = 3;
  recognition.lang          = selectedLang;

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalTranscript += text + ' ';
      } else {
        interim += text;
      }
    }
    renderTranscript(interim);
  };

  recognition.onerror = (e) => {
    // 'no-speech' is benign; log others for debugging without breaking the UI
    if (e.error !== 'no-speech') console.warn('SpeechRecognition error:', e.error);
  };

  recognition.onend = onRecognitionEnd;
}

function startSpeechRecognition() {
  if (!speechSupported) return;
  setupRecognition(); // always fresh instance to avoid stale state
  clearTranscript();
  setSpeechIndicator('active');
  try { recognition.start(); } catch (_) {}
}

function stopSpeechRecognition() {
  if (!recognition) return;
  recognition.onend = null; // prevent auto-restart
  setSpeechIndicator('');
  freezeWpm();
  try { recognition.stop(); } catch (_) {}
}

function restartSpeechRecognition() {
  if (!recognition) return;
  recognition.onend = null;
  try { recognition.stop(); } catch (_) {}
  // Short delay to let the browser clean up before restarting
  setTimeout(() => {
    if (appState === 'recording' || appState === 'ptt-recording') {
      setupRecognition();
      recognition.lang = selectedLang;
      try { recognition.start(); } catch (_) {}
    }
  }, 150);
}

// ── Transcript helpers ────────────────────────────────────────────────────────
function clearTranscript() {
  finalTranscript = '';
  transcriptText.innerHTML = '';
  transcriptPlaceholder.style.display = 'none';
  clearWpm();
}

function renderTranscript(interim) {
  transcriptPlaceholder.style.display = 'none';
  transcriptText.innerHTML =
    (finalTranscript ? `<span class="final">${escapeHtml(finalTranscript)}</span>` : '') +
    (interim        ? `<span class="interim">${escapeHtml(interim)}</span>` : '');

  // Auto-scroll to the bottom as new text arrives
  const body = transcriptText.closest('.transcript-body');
  if (body) body.scrollTop = body.scrollHeight;

  updateWpm();
}

function showTranscriptPlaceholder() {
  transcriptText.innerHTML = '';
  transcriptPlaceholder.style.display = '';
}

function setSpeechIndicator(state) {
  speechIndicator.className = 'speech-indicator' + (state ? ` ${state}` : '');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg) { statusEl.textContent = msg; }

function revokePreviousUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

// ── State machine ─────────────────────────────────────────────────────────────
function applyState(state) {
  appState = state;

  const idle         = state === 'idle';
  const recording    = state === 'recording';
  const pttRecording = state === 'ptt-recording';
  const playback     = state === 'playback';

  // Video panels
  previewWrapper.classList.toggle('hidden', playback);
  playbackWrapper.classList.toggle('hidden', !playback);

  // Buttons
  btnRecord.disabled = recording || pttRecording || playback;
  btnRecord.classList.toggle('hidden', recording || playback);
  btnStopRec.classList.toggle('hidden', !recording);
  btnPtt.disabled = playback;
  btnPtt.classList.toggle('hidden', recording || playback);
  btnPtt.classList.toggle('btn-ptt--active', pttRecording);
  btnStopPlay.classList.toggle('hidden', !playback);

  // REC badge
  recBadge.classList.toggle('active', recording || pttRecording);

  // Transcript panel: show placeholder when idle with no text, keep content otherwise
  if (idle && !finalTranscript.trim()) showTranscriptPlaceholder();

  // Status messages
  if (idle)         setStatus('Ready. Hit Record or hold the button / Space bar.');
  if (recording)    setStatus('Recording… click Stop when you\'re done.');
  if (pttRecording) setStatus('Recording… release to play back.');
  if (playback)     setStatus('Playing back your take.');
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function initMedia() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    previewEl.srcObject = stream;
    applyState('idle');
    btnRecord.disabled = false;
    btnPtt.disabled    = false;
    hintEl.textContent = 'Tip: hold Space bar as a keyboard shortcut for Hold to Record.';
  } catch (err) {
    const denied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
    setStatus(denied
      ? 'Camera/mic access denied. Allow access in your browser settings and reload.'
      : `Could not access camera/mic: ${err.message}`
    );
    console.error(err);
  }
}

// ── MediaRecorder factory ─────────────────────────────────────────────────────
function buildRecorder(onStopCallback) {
  const mimeType = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ].find(t => MediaRecorder.isTypeSupported(t)) || '';

  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = onStopCallback;
}

function handleRecorderStop() {
  const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
  chunks = [];
  startPlayback(blob);
}

// ── Recording ─────────────────────────────────────────────────────────────────
function startRecording() {
  if (!stream) return;
  revokePreviousUrl();
  chunks = [];
  buildRecorder(handleRecorderStop);
  recorder.start(100);
  startSpeechRecognition();
  applyState('recording');
}

function stopRecording() {
  stopSpeechRecognition();
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

// ── Playback ──────────────────────────────────────────────────────────────────
function startPlayback(blob) {
  revokePreviousUrl();
  objectUrl = URL.createObjectURL(blob);

  playbackEl.src = objectUrl;
  playbackEl.currentTime = 0;

  applyState('playback');

  // Keep any transcript visible during playback (shows what was said)
  if (finalTranscript.trim()) renderTranscript('');

  playbackEl.play().catch((err) => {
    setStatus(`Playback error: ${err.message}`);
    console.error(err);
    applyState('idle');
  });

  playbackEl.onended = stopPlayback;
}

function stopPlayback() {
  playbackEl.onended = null;
  playbackEl.pause();
  playbackEl.currentTime = 0;
  playbackEl.src = '';
  revokePreviousUrl();
  applyState('idle');
}

// ── Push-to-talk ──────────────────────────────────────────────────────────────
function startPtt() {
  if (appState === 'ptt-recording') return;
  if (appState === 'playback')  stopPlayback();
  if (appState === 'recording') return;
  if (!stream) return;

  revokePreviousUrl();
  chunks = [];
  buildRecorder(handleRecorderStop);
  recorder.start(100);
  appState = 'ptt-recording';
  startSpeechRecognition();
  applyState('ptt-recording');
}

function stopPtt() {
  if (appState !== 'ptt-recording') return;
  stopSpeechRecognition();
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

// ── Button listeners ──────────────────────────────────────────────────────────
btnRecord.addEventListener('click', () => {
  if (appState === 'playback') stopPlayback();
  startRecording();
});

btnStopRec.addEventListener('click', stopRecording);
btnStopPlay.addEventListener('click', stopPlayback);

btnPtt.addEventListener('pointerdown', (e) => { e.preventDefault(); startPtt(); });
btnPtt.addEventListener('pointerup',    () => stopPtt());
btnPtt.addEventListener('pointerleave', () => stopPtt());

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  e.preventDefault();
  startPtt();
});

document.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  stopPtt();
});

// Language selector
langBtns.forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));

// ── Boot ──────────────────────────────────────────────────────────────────────
// Apply persisted (or default) language
setLang(selectedLang);

// Mark speech recognition as unsupported if the browser doesn't have the API
if (!speechSupported) {
  setSpeechIndicator('unsupported');
}

initMedia();
