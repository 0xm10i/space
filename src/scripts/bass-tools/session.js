import {
  buildTuning,
  playableRange,
  pickRandomSequence,
  midiToName,
  midiPitchClass,
  pitchClassesForNoteRange,
  positionsForMidi,
  TUNING_STRING_COUNT,
} from './notes.js';
import { createNoteBucket } from './note-bucket.js';
import { playNote, playSuccessBell, resumeAudioContext } from './audio.js';

const PLAYBACK_TAIL_MS = 280;
const SEQUENCE_GAP_MS = 150;
const WRONG_REPLAY_DELAY_MS = 600;
const CORRECT_HOLD_MS = 800;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildWrongHints(targetSequence, targetIndex, detectedMidi) {
  return targetSequence.slice(0, targetIndex + 1).map((midi, i) => {
    if (i < targetIndex) return 'correct';
    if (midi === detectedMidi) return 'same';
    return midi > detectedMidi ? 'up' : 'down';
  });
}

export function createSession(settings, callbacks, answerSource) {
  if (!answerSource) throw new Error('answerSource is required');

  const noteCount = Math.min(3, Math.max(1, settings.noteCount ?? 1));
  const quizMode = settings.quizMode === 'name' ? 'name' : 'imitate';
  const tuning = buildTuning({
    strings: TUNING_STRING_COUNT,
    lowestMidi: settings.lowestMidi,
    highestMidi: settings.highestMidi,
  });
  const range = playableRange({ tuning, frets: settings.frets });
  let allowedPitchClasses = pitchClassesForNoteRange(settings.noteRange);

  function pickBucketSequence(excludeMidi) {
    return pickRandomSequence(
      range.min,
      range.max,
      noteCount,
      settings.maxIntervalSemitones,
      excludeMidi,
      allowedPitchClasses,
    );
  }

  function sequenceAllowed(seq) {
    return seq.every((m) => allowedPitchClasses.has(midiPitchClass(m)));
  }

  const bucket = createNoteBucket({ pickSequence: pickBucketSequence });

  let state = 'idle';
  let targetSequence = [];
  let targetIndex = 0;
  let targetPosition = null;
  let roundIndex = 0;
  let attemptsOnCurrent = 0;
  let roundStartedAt = 0;
  let playTargetGeneration = 0;
  let pendingHints = null;

  function sessionPayload(extra = {}) {
    return {
      state,
      targetSequence,
      targetIndex,
      noteCount,
      quizMode,
      attemptsOnCurrent,
      progress: stats.completed,
      promptPosition: targetPosition,
      ...extra,
    };
  }

  function pickTargetPosition(midi) {
    const positions = positionsForMidi(tuning, settings.frets, midi);
    if (positions.length === 0) return null;
    return positions[Math.floor(Math.random() * positions.length)];
  }

  function answersMatch(guess, expected) {
    if (quizMode === 'name') {
      return midiPitchClass(guess) === midiPitchClass(expected);
    }
    return guess === expected;
  }

  const stats = {
    totalNotes: settings.notesPerSet,
    completed: 0,
    firstTryCorrect: 0,
    wrongAttempts: 0,
    totalTimeMs: 0,
    longestStreak: 0,
    currentStreak: 0,
    perNote: {},
    startedAt: null,
    noteTimings: [],
  };

  function recordPerNote(midi, wrongDelta, firstTry, countAppearance = true) {
    const name = midiToName(midi);
    if (!stats.perNote[name]) {
      stats.perNote[name] = { midi, wrongAttempts: 0, appearances: 0, firstTryCorrect: 0 };
    }
    if (countAppearance) stats.perNote[name].appearances++;
    stats.perNote[name].wrongAttempts += wrongDelta;
    if (firstTry) stats.perNote[name].firstTryCorrect++;
  }

  async function playTarget() {
    const generation = ++playTargetGeneration;
    state = 'playing';
    targetIndex = 0;
    answerSource.setAccepting(false);
    callbacks.onStateChange?.(sessionPayload({ hints: pendingHints }));
    await resumeAudioContext();
    for (let i = 0; i < targetSequence.length; i++) {
      await playNote(targetSequence[i]);
      if (generation !== playTargetGeneration) return;
      if (i < targetSequence.length - 1) {
        await delay(SEQUENCE_GAP_MS);
        if (generation !== playTargetGeneration) return;
      }
    }
    await delay(PLAYBACK_TAIL_MS);
    if (generation !== playTargetGeneration) return;
    await answerSource.waitAfterPlayback();
    if (generation !== playTargetGeneration) return;
    pendingHints = null;
    state = 'listening';
    callbacks.onStateChange?.(sessionPayload());
    answerSource.setAccepting(true);
  }

  async function showNamePrompt() {
    const generation = ++playTargetGeneration;
    targetIndex = 0;
    answerSource.setAccepting(false);
    pendingHints = null;
    state = 'listening';
    callbacks.onStateChange?.(sessionPayload());
    if (generation !== playTargetGeneration) return;
    answerSource.setAccepting(true);
    void resumeAudioContext().then(() => {
      if (generation !== playTargetGeneration) return;
      return playNote(targetSequence[0]);
    });
  }

  async function nextNote() {
    if (roundIndex >= settings.notesPerSet) {
      state = 'finished';
      stats.totalTimeMs = Date.now() - stats.startedAt;
      answerSource.stop();
      callbacks.onFinished?.(getResults(stats));
      return;
    }
    attemptsOnCurrent = 0;
    pendingHints = null;
    targetSequence = bucket.current();
    targetIndex = 0;
    targetPosition = quizMode === 'name' ? pickTargetPosition(targetSequence[0]) : null;
    roundStartedAt = Date.now();
    roundIndex++;
    callbacks.onStateChange?.(
      sessionPayload({
        state: 'pick',
        acceptedNames: [],
      }),
    );
    if (quizMode === 'name') {
      await showNamePrompt();
    } else {
      await playTarget();
    }
  }

  async function handleCorrectCelebration(firstTry) {
    const generation = playTargetGeneration;
    pendingHints = null;
    answerSource.setAccepting(false);
    const revealedNames = targetSequence.map((m) => midiToName(m));
    callbacks.onCorrect?.({ sequence: targetSequence, names: revealedNames, firstTry });
    callbacks.onStateChange?.(
      sessionPayload({
        state: 'correct',
        revealedNames,
      }),
    );
    await resumeAudioContext();
    await playSuccessBell();
    if (generation !== playTargetGeneration) return;
    await delay(CORRECT_HOLD_MS);
    if (generation !== playTargetGeneration) return;
    await answerSource.waitAfterPlayback();
    if (generation !== playTargetGeneration) return;
    if (firstTry || !sequenceAllowed(bucket.current())) {
      bucket.replaceCurrent();
    }
    bucket.advance();
    await nextNote();
  }

  function onSequenceNoteCorrect() {
    const acceptedMidi = targetSequence[targetIndex];
    recordPerNote(acceptedMidi, 0, false);
    const acceptedNames = targetSequence.slice(0, targetIndex + 1).map((m) => midiToName(m));
    callbacks.onStateChange?.(
      sessionPayload({
        state: 'sequence-progress',
        acceptedNames,
        partialReveal: acceptedNames[acceptedNames.length - 1],
      }),
    );
    targetIndex++;
  }

  async function submitAnswer(detectedMidi) {
    if (state !== 'listening') return;
    const expected = targetSequence[targetIndex];
    if (expected == null) return;

    if (answersMatch(detectedMidi, expected)) {
      const isLast = targetIndex === targetSequence.length - 1;
      if (!isLast) {
        onSequenceNoteCorrect();
        return;
      }
      answerSource.setAccepting(false);
      const firstTry = attemptsOnCurrent === 0;
      const elapsed = Date.now() - roundStartedAt;
      stats.noteTimings.push(elapsed);
      stats.completed++;
      if (firstTry) {
        stats.firstTryCorrect++;
        stats.currentStreak++;
        stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
      } else {
        stats.currentStreak = 0;
      }
      recordPerNote(expected, 0, firstTry);
      void handleCorrectCelebration(firstTry);
    } else {
      answerSource.setAccepting(false);
      attemptsOnCurrent++;
      stats.wrongAttempts++;
      stats.currentStreak = 0;
      recordPerNote(expected, 1, false, false);
      if (quizMode === 'name') {
        pendingHints = null;
        callbacks.onWrong?.({ played: detectedMidi });
        callbacks.onStateChange?.(sessionPayload({ state: 'wrong' }));
        const generation = playTargetGeneration;
        await delay(WRONG_REPLAY_DELAY_MS);
        if (generation !== playTargetGeneration) return;
        state = 'listening';
        callbacks.onStateChange?.(sessionPayload());
        answerSource.setAccepting(true);
        return;
      }
      const hints = buildWrongHints(targetSequence, targetIndex, detectedMidi);
      pendingHints = hints;
      callbacks.onWrong?.({ played: detectedMidi, hints });
      callbacks.onStateChange?.(
        sessionPayload({
          state: 'wrong',
          hints,
        }),
      );
      const generation = playTargetGeneration;
      targetIndex = 0;
      await delay(WRONG_REPLAY_DELAY_MS);
      if (generation !== playTargetGeneration) return;
      await playTarget();
    }
  }

  answerSource.onAnswer((midi) => {
    void submitAnswer(midi);
  });

  return {
    async start() {
      if (state !== 'idle') return;
      stats.startedAt = Date.now();
      answerSource.setAccepting(false);
      await answerSource.start();
      answerSource.setAccepting(false);
      state = 'running';
      roundIndex = 0;
      await nextNote();
    },
    async stop() {
      playTargetGeneration++;
      answerSource.stop();
      state = 'idle';
    },
    getStats: () => ({ ...stats }),
    getListener: () => answerSource.getListener?.() ?? null,
    getState: () => state,
    setNoiseGate(value) {
      answerSource.setNoiseGate?.(value);
    },
    setInputGain(value) {
      answerSource.setInputGain?.(value);
    },
    setNoteRange(value) {
      allowedPitchClasses = pitchClassesForNoteRange(value);
      bucket.rebuildInvalidExceptCurrent(sequenceAllowed);
    },
  };
}

export function getResults(stats) {
  const avgTime =
    stats.noteTimings.length > 0
      ? stats.noteTimings.reduce((a, b) => a + b, 0) / stats.noteTimings.length
      : 0;
  const firstTryPct =
    stats.completed > 0 ? (stats.firstTryCorrect / stats.completed) * 100 : 0;
  const perNoteList = Object.entries(stats.perNote)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.wrongAttempts - a.wrongAttempts);

  return {
    totalTimeMs: stats.totalTimeMs,
    completed: stats.completed,
    firstTryCorrect: stats.firstTryCorrect,
    firstTryPct,
    wrongAttempts: stats.wrongAttempts,
    avgTimeMs: avgTime,
    longestStreak: stats.longestStreak,
    perNote: perNoteList,
  };
}
