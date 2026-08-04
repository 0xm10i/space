import {
	ENDPOINT_HOLD_MS,
	EXPANDED_TITLE,
	KEYFRAME_STEP_MS,
	morphKeyframes,
} from '../data/titleMorph';

type RunnerPhase = 'holdExpanded' | 'contract' | 'holdContracted' | 'expand';

function isDigit(char: string): boolean {
	return char >= '0' && char <= '9';
}

function digitIndicesNewInNext(prev: string, next: string): Set<number> {
	const indices = new Set<number>();
	for (let i = 0; i < next.length; i++) {
		const char = next[i]!;
		if (!isDigit(char)) continue;
		const prevChar = prev[i];
		if (prevChar !== char) {
			indices.add(i);
		}
	}
	return indices;
}

function renderTitle(root: HTMLElement, next: string, prev: string) {
	const newDigits = digitIndicesNewInNext(prev, next);
	const stage = document.createElement('span');
	stage.className = 'morph-stage';
	stage.setAttribute('aria-hidden', 'true');

	for (let i = 0; i < next.length; i++) {
		const char = next[i]!;
		const span = document.createElement('span');
		span.className = 'morph-char';
		span.textContent = char;

		if (char === ' ') {
			span.classList.add('morph-char--space');
		}

		if (isDigit(char)) {
			span.classList.add('morph-char--digit');
		}
		if (newDigits.has(i)) {
			span.classList.add('morph-char--merge-in');
		}

		stage.appendChild(span);
	}

	root.replaceChildren(stage);
}

function runLoop(root: HTMLElement) {
	const lastIndex = morphKeyframes.length - 1;
	let index = 0;
	let phase: RunnerPhase = 'holdExpanded';
	let prev = morphKeyframes[0]!;

	renderTitle(root, prev, prev);

	const tick = () => {
		switch (phase) {
			case 'holdExpanded':
				phase = 'contract';
				index += 1;
				const firstStep = morphKeyframes[index]!;
				renderTitle(root, firstStep, prev);
				prev = firstStep;
				scheduleNext(KEYFRAME_STEP_MS);
				break;
			case 'contract':
				if (index >= lastIndex) {
					phase = 'holdContracted';
					scheduleNext(ENDPOINT_HOLD_MS);
					return;
				}
				index += 1;
				const next = morphKeyframes[index]!;
				renderTitle(root, next, prev);
				prev = next;
				scheduleNext(KEYFRAME_STEP_MS);
				break;
			case 'holdContracted':
				phase = 'expand';
				index -= 1;
				const backStep = morphKeyframes[index]!;
				renderTitle(root, backStep, prev);
				prev = backStep;
				scheduleNext(KEYFRAME_STEP_MS);
				break;
			case 'expand':
				if (index <= 0) {
					phase = 'holdExpanded';
					scheduleNext(ENDPOINT_HOLD_MS);
					return;
				}
				index -= 1;
				const expanded = morphKeyframes[index]!;
				renderTitle(root, expanded, prev);
				prev = expanded;
				scheduleNext(KEYFRAME_STEP_MS);
				break;
		}
	};

	let timeoutId: number | undefined;

	const scheduleNext = (delayMs: number) => {
		timeoutId = window.setTimeout(tick, delayMs);
	};

	scheduleNext(ENDPOINT_HOLD_MS);

	return () => {
		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
		}
	};
}

export function initMorphingTitle() {
	const root = document.querySelector<HTMLElement>('[data-morphing-title]');
	if (!root) return;

	if (root.closest('[data-morph-off]')) {
		root.textContent = EXPANDED_TITLE;
		return;
	}

	runLoop(root);
}
