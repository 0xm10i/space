import { midiAtFret, midiPitchClass } from './notes.js';

const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const FLASH_MS = 220;

export function createFretboard(container, { tuning, frets, allowedPitchClasses = null, dimWhenInactive = true }) {
  const stringCount = tuning.length;
  let onSelect = null;
  let interactive = false;
  let flashTimer = null;

  const root = document.createElement('div');
  root.className = 'fretboard';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Bass fretboard');

  const scroll = document.createElement('div');
  scroll.className = 'fretboard-scroll';

  const neck = document.createElement('div');
  neck.className = dimWhenInactive ? 'fretboard-neck fretboard-inactive' : 'fretboard-neck';
  neck.style.setProperty('--string-count', String(stringCount));
  neck.style.gridTemplateColumns = `2rem repeat(${frets}, minmax(1.65rem, 2rem))`;

  for (const fret of INLAY_FRETS) {
    if (fret > frets) continue;
    const inlay = document.createElement('div');
    inlay.className = fret % 12 === 0 ? 'fretboard-inlay fretboard-inlay--double' : 'fretboard-inlay';
    inlay.style.gridColumn = String(fret + 1);
    inlay.style.gridRow = `1 / span ${stringCount}`;
    inlay.setAttribute('aria-hidden', 'true');
    neck.appendChild(inlay);
  }

  for (let visualRow = 0; visualRow < stringCount; visualRow++) {
    const stringIndex = stringCount - 1 - visualRow;
    const line = document.createElement('div');
    line.className = 'fretboard-string-line';
    line.style.gridRow = String(visualRow + 1);
    line.style.gridColumn = '1 / -1';
    line.style.setProperty('--string-width', `${1.15 + visualRow * 0.55}px`);
    line.setAttribute('aria-hidden', 'true');
    neck.appendChild(line);

    for (let fret = 0; fret <= frets; fret++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fretboard-cell';
      if (fret === 0) btn.classList.add('fretboard-cell--nut');
      btn.dataset.string = String(stringIndex);
      btn.dataset.fret = String(fret);
      btn.dataset.midi = String(midiAtFret(tuning, stringIndex, fret));
      btn.style.gridRow = String(visualRow + 1);
      btn.style.gridColumn = String(fret + 1);
      const stringNumber = visualRow + 1;
      btn.setAttribute(
        'aria-label',
        fret === 0 ? `String ${stringNumber}, open` : `String ${stringNumber}, fret ${fret}`,
      );
      btn.disabled = true;
      neck.appendChild(btn);
    }
  }

  scroll.appendChild(neck);
  root.appendChild(scroll);
  container.replaceChildren(root);

  function cellAt(stringIndex, fret) {
    return neck.querySelector(`[data-string="${stringIndex}"][data-fret="${fret}"]`);
  }

  function handleClick(event) {
    const btn = event.target.closest('.fretboard-cell');
    if (!btn || !neck.contains(btn) || !interactive) return;
    const stringIndex = parseInt(btn.dataset.string, 10);
    const fret = parseInt(btn.dataset.fret, 10);
    const midi = midiAtFret(tuning, stringIndex, fret);
    onSelect?.(midi, { string: stringIndex, fret });
  }

  neck.addEventListener('click', handleClick);

  function applyAllowedPitchClasses(allowed) {
    for (const btn of neck.querySelectorAll('.fretboard-cell')) {
      const midi = parseInt(btn.dataset.midi, 10);
      const inRange = !allowed || allowed.has(midiPitchClass(midi));
      btn.classList.toggle('fretboard-cell--out-of-range', !inRange);
    }
  }

  applyAllowedPitchClasses(allowedPitchClasses);

  function clearHighlight() {
    for (const el of neck.querySelectorAll('.fretboard-cell--prompt')) {
      el.classList.remove('fretboard-cell--prompt');
    }
  }

  return {
    onSelect(cb) {
      onSelect = cb;
    },
    setAllowedPitchClasses(allowed) {
      applyAllowedPitchClasses(allowed);
    },
    setInteractive(enabled) {
      interactive = enabled;
      neck.classList.toggle('fretboard-inactive', dimWhenInactive && !enabled);
      for (const btn of neck.querySelectorAll('.fretboard-cell')) {
        btn.disabled = !enabled;
      }
    },
    highlight(stringIndex, fret) {
      clearHighlight();
      const cell = cellAt(stringIndex, fret);
      if (!cell) return;
      cell.classList.add('fretboard-cell--prompt');
    },
    clearHighlight() {
      clearHighlight();
    },
    flash(stringIndex, fret) {
      for (const el of neck.querySelectorAll('.fretboard-cell--flash')) {
        el.classList.remove('fretboard-cell--flash');
      }
      const cell = cellAt(stringIndex, fret);
      if (!cell) return;
      cell.classList.remove('fretboard-cell--flash');
      void cell.offsetWidth;
      cell.classList.add('fretboard-cell--flash');
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        cell.classList.remove('fretboard-cell--flash');
        flashTimer = null;
      }, FLASH_MS);
    },
    destroy() {
      if (flashTimer) clearTimeout(flashTimer);
      neck.removeEventListener('click', handleClick);
      container.replaceChildren();
      onSelect = null;
      interactive = false;
    },
  };
}
