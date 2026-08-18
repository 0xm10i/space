export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${octave}`;
}

export function nameToMidi(name) {
  const match = name.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) throw new Error(`Invalid note name: ${name}`);
  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = parseInt(match[3], 10);
  let pc = NOTE_NAMES.indexOf(letter);
  if (pc < 0) throw new Error(`Invalid note name: ${name}`);
  if (accidental === '#') pc += 1;
  if (accidental === 'b') pc -= 1;
  pc = ((pc % 12) + 12) % 12;
  return (octave + 1) * 12 + pc;
}

/** Evenly spaced open-string tunings between lowest and highest MIDI (5 strings). */
export const TUNING_STRING_COUNT = 5;

export function buildTuning({ strings, lowestMidi, highestMidi }) {
  if (strings < 1) throw new Error('strings must be >= 1');
  if (lowestMidi > highestMidi) throw new Error('lowest must be <= highest');
  if (strings === 1) return [lowestMidi];
  const tuning = [];
  for (let i = 0; i < strings; i++) {
    const t = i / (strings - 1);
    tuning.push(Math.round(lowestMidi + t * (highestMidi - lowestMidi)));
  }
  return tuning;
}

export function playableRange({ tuning, frets }) {
  const min = Math.min(...tuning);
  const max = Math.max(...tuning) + frets;
  return { min, max };
}

export function midiAtFret(tuning, stringIndex, fret) {
  if (stringIndex < 0 || stringIndex >= tuning.length) {
    throw new Error('stringIndex out of range');
  }
  if (fret < 0) throw new Error('fret must be >= 0');
  return tuning[stringIndex] + fret;
}

/** All (string, fret) positions that produce `midi` on this board. */
export function positionsForMidi(tuning, frets, midi) {
  const positions = [];
  for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
    const fret = midi - tuning[stringIndex];
    if (fret >= 0 && fret <= frets) {
      positions.push({ string: stringIndex, fret });
    }
  }
  return positions;
}

export const NOTE_RANGE_MIN = 1;
export const NOTE_RANGE_MAX = 12;
export const NOTE_RANGE_DEFAULT = 3;

const FOURTHS_FROM_B_LABELS = ['B', 'E', 'A', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
const B_PITCH_CLASS = 11;

export function clampNoteRange(width) {
  const n = Number(width);
  if (!Number.isFinite(n)) return NOTE_RANGE_DEFAULT;
  return Math.min(NOTE_RANGE_MAX, Math.max(NOTE_RANGE_MIN, Math.round(n)));
}

/** Pitch classes growing in fourths from B (MIDI % 12). */
export function pitchClassesForNoteRange(width) {
  const count = clampNoteRange(width);
  const pcs = new Set();
  let pc = B_PITCH_CLASS;
  for (let i = 0; i < count; i++) {
    pcs.add(pc);
    pc = (pc + 5) % 12;
  }
  return pcs;
}

export function noteRangeLabels(width) {
  return FOURTHS_FROM_B_LABELS.slice(0, clampNoteRange(width));
}

export function noteRangePreview(width) {
  const count = clampNoteRange(width);
  return `${count} — ${noteRangeLabels(count).join(', ')}`;
}

export function midiPitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

/** MIDI with `pitchClass` nearest to `aroundMidi` (ties break toward the lower note). */
export function midiForPitchClassNear(pitchClass, aroundMidi) {
  const pc = ((pitchClass % 12) + 12) % 12;
  let delta = pc - midiPitchClass(aroundMidi);
  if (delta > 6) delta -= 12;
  if (delta < -6) delta += 12;
  if (delta === 6) delta = -6;
  return aroundMidi + delta;
}

export function allNotesInRange(min, max, allowedPitchClasses = null) {
  const notes = [];
  for (let m = min; m <= max; m++) {
    if (allowedPitchClasses && !allowedPitchClasses.has(midiPitchClass(m))) continue;
    notes.push(m);
  }
  return notes;
}

function toExcludeSet(excludeMidi) {
  if (excludeMidi == null) return new Set();
  if (excludeMidi instanceof Set) return excludeMidi;
  if (Array.isArray(excludeMidi)) return new Set(excludeMidi);
  return new Set([excludeMidi]);
}

function pickFromPool(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickRandomNote(min, max, excludeMidi = null, allowedPitchClasses = null) {
  const pool = allNotesInRange(min, max, allowedPitchClasses);
  if (pool.length === 0) throw new Error('empty note range');
  const excluded = toExcludeSet(excludeMidi);
  const filtered = pool.filter((m) => !excluded.has(m));
  const pickFrom = filtered.length > 0 ? filtered : pool;
  return pickFromPool(pickFrom);
}

export function pickRandomSequence(
  min,
  max,
  length,
  maxInterval,
  excludeMidi = null,
  allowedPitchClasses = null,
) {
  if (length < 1) throw new Error('length must be >= 1');
  const excluded = new Set(toExcludeSet(excludeMidi));
  const seq = [];
  for (let i = 0; i < length; i++) {
    if (i === 0) {
      const note = pickRandomNote(min, max, excluded, allowedPitchClasses);
      seq.push(note);
      excluded.add(note);
      continue;
    }
    const prev = seq[i - 1];
    const lo = Math.max(min, prev - maxInterval);
    const hi = Math.min(max, prev + maxInterval);
    const intervalPool = allNotesInRange(lo, hi, allowedPitchClasses).filter((m) => !excluded.has(m));
    const note =
      intervalPool.length > 0
        ? pickFromPool(intervalPool)
        : pickRandomNote(min, max, excluded, allowedPitchClasses);
    seq.push(note);
    excluded.add(note);
  }
  return seq;
}

export function centsOff(freq, targetMidi) {
  const targetFreq = midiToFreq(targetMidi);
  return 1200 * Math.log2(freq / targetFreq);
}

export function midiFromFreqWithCents(freq, centsTolerance = 40) {
  const midi = Math.round(freqToMidi(freq));
  const cents = centsOff(freq, midi);
  if (Math.abs(cents) <= centsTolerance) return midi;
  return null;
}
