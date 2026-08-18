export const NOTE_BUCKET_SIZE = 3;

export function createNoteBucket({ size = NOTE_BUCKET_SIZE, pickSequence }) {
  if (typeof pickSequence !== 'function') {
    throw new Error('pickSequence is required');
  }
  const slots = [];
  let index = 0;

  function occupiedMidi(exceptIndex = -1) {
    const midi = new Set();
    for (let i = 0; i < slots.length; i++) {
      if (i === exceptIndex) continue;
      for (const m of slots[i]) midi.add(m);
    }
    return midi;
  }

  function fill() {
    slots.length = 0;
    index = 0;
    for (let i = 0; i < size; i++) {
      slots.push(pickSequence(occupiedMidi()));
    }
  }

  fill();

  return {
    current() {
      return slots[index];
    },
    advance() {
      index = (index + 1) % slots.length;
    },
    replaceCurrent() {
      slots[index] = pickSequence(occupiedMidi());
    },
    rebuildInvalidExceptCurrent(isValid) {
      for (let i = 0; i < slots.length; i++) {
        if (i === index) continue;
        if (!isValid(slots[i])) {
          slots[i] = pickSequence(occupiedMidi(i));
        }
      }
    },
  };
}
