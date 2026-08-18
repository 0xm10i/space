import { PitchListener } from './pitch.js';
import { playNote, resumeAudioContext } from './audio.js';

function waitForSilence(listener, maxMs = 3000) {
  const threshold = listener.noiseGate * 0.6;
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (listener.rmsLevel < threshold) {
        resolve();
        return;
      }
      if (Date.now() - start > maxMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export function createMicAnswerSource(settings, range) {
  const minFreq = 440 * 2 ** ((range.min - 69) / 12) * 0.9;
  const maxFreq = 440 * 2 ** ((range.max - 69) / 12) * 1.1;

  const listener = new PitchListener({
    noiseGate: settings.noiseGate,
    inputGain: settings.inputGain,
    centsTolerance: settings.centsTolerance,
    minFreq,
    maxFreq,
  });

  let accepting = false;
  let lastEmitted = null;
  let onAnswer = null;

  listener.onStable((midi) => {
    if (!accepting) return;
    if (midi === lastEmitted) return;
    lastEmitted = midi;
    listener.consumeStable(midi);
    onAnswer?.(midi);
  });

  return {
    async start() {
      listener.setListeningEnabled(false);
      await listener.start(settings.inputDeviceId || undefined);
      listener.setListeningEnabled(false);
    },
    stop() {
      accepting = false;
      listener.stop();
    },
    setAccepting(enabled) {
      accepting = enabled;
      if (enabled) {
        lastEmitted = null;
        listener.resetStability();
        listener.setListeningEnabled(true);
      } else {
        listener.setListeningEnabled(false);
      }
    },
    async waitAfterPlayback() {
      listener.setMicCaptureEnabled(true);
      await waitForSilence(listener);
      listener.resetStability();
    },
    onAnswer(cb) {
      onAnswer = cb;
    },
    getListener() {
      return listener;
    },
    setNoiseGate(value) {
      listener.setNoiseGate(value);
    },
    setInputGain(value) {
      listener.setInputGain(value);
    },
  };
}

export function createFretboardAnswerSource(fretboard) {
  let accepting = false;
  let onAnswer = null;

  fretboard.onSelect((midi, pos) => {
    if (!accepting) return;
    fretboard.flash(pos.string, pos.fret);
    void resumeAudioContext().then(() => playNote(midi));
    onAnswer?.(midi);
  });

  return {
    async start() {
      fretboard.setInteractive(false);
    },
    stop() {
      accepting = false;
      fretboard.setInteractive(false);
    },
    setAccepting(enabled) {
      accepting = enabled;
      fretboard.setInteractive(enabled);
    },
    async waitAfterPlayback() {},
    onAnswer(cb) {
      onAnswer = cb;
    },
  };
}

export function createNoteNameAnswerSource() {
  let accepting = false;
  let onAnswer = null;

  return {
    async start() {},
    stop() {
      accepting = false;
    },
    setAccepting(enabled) {
      accepting = enabled;
    },
    async waitAfterPlayback() {},
    onAnswer(cb) {
      onAnswer = cb;
    },
    submit(pitchClass) {
      if (!accepting) return;
      onAnswer?.(pitchClass);
    },
  };
}
