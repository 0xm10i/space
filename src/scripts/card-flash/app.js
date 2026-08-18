const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = [
	{ id: 'spades', symbol: '♠', red: false },
	{ id: 'hearts', symbol: '♥', red: true },
	{ id: 'diamonds', symbol: '♦', red: true },
	{ id: 'clubs', symbol: '♣', red: false },
];

const PILE_COUNT = 5;
const CARDS_PER_PILE = 7;
const FLASH_POOL_SIZE = 17;
const MAX_HEARTS = 3;

const WAIT_MIN_MS = 10_000;
const WAIT_MAX_MS = 30_000;
const FLASH_VISIBLE_MS = 200;
const RESPONSE_MS = 5000;
const COUNTDOWN_START_MS = 4100;
const COUNTDOWN_STEP_MS = 300;
const COUNTDOWN_NUMBERS = [3, 2, 1];
const EVALUATE_DELAY_MS = 300;
const REVEAL_PAUSE_MS = 400;
const CARD_VANISH_MS = 250;
const SCORE_FLASH_MS = 600;
const SCORE_FLASH_MEGA_MS = 900;

/** @type {Record<string, number>} */
const RANK_VALUES = {
	'2': 2,
	'3': 3,
	'4': 4,
	'5': 5,
	'6': 6,
	'7': 7,
	'8': 8,
	'9': 9,
	'10': 10,
	J: 11,
	Q: 12,
	K: 13,
	A: 14,
};

const viewHome = document.getElementById('view-home');
const viewPlay = document.getElementById('view-play');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnPlayAgain = document.getElementById('btn-play-again');
const playScore = document.getElementById('play-score');
const playHearts = document.getElementById('play-hearts');
const playTimer = document.getElementById('play-timer');
const playfield = document.getElementById('playfield');
const flashSlot = document.getElementById('flash-slot');
const revealRow = document.getElementById('reveal-row');
const scoreFlashEl = document.getElementById('score-flash');
const responseCountdown = document.getElementById('response-countdown');
const playfieldOverlay = document.getElementById('playfield-overlay');
const pilesEl = document.getElementById('piles');
const gameoverScore = document.getElementById('gameover-score');

/** @type {ReturnType<typeof setTimeout> | null} */
let waitTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let flashHideTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let responseEndTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let evaluateDelayTimer = null;
/** @type {ReturnType<typeof setTimeout>[]} */
const countdownTimers = [];
/** @type {ReturnType<typeof setInterval> | null} */
let displayTimerInterval = null;
/** @type {number} */
let gameStartedAt = 0;

/** @typedef {{ rank: string; suit: typeof SUITS[number] }} Card */

/** @type {Card[][]} */
let piles = [];
/** @type {Card[]} */
let flashPool = [];
let flashIndex = 0;
let hearts = MAX_HEARTS;

/** @type {Card | null} */
let currentFlash = null;

let score = 0;
let selectionEnabled = false;
let gameGeneration = 0;
/** @type {'complete' | 'hearts' | 'incomplete' | 'stopped'} */
let gameEndReason = 'stopped';

/** @type {number[]} */
let selectedPileIndices = [];

function buildDeck() {
	/** @type {Card[]} */
	const deck = [];
	for (const rank of RANKS) {
		for (const suit of SUITS) {
			deck.push({ rank, suit });
		}
	}
	return deck;
}

function shuffle(items) {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function initDeck() {
	const deck = shuffle(buildDeck());
	piles = [];
	for (let i = 0; i < PILE_COUNT; i += 1) {
		piles.push(deck.slice(i * CARDS_PER_PILE, (i + 1) * CARDS_PER_PILE));
	}
	flashPool = deck.slice(PILE_COUNT * CARDS_PER_PILE, PILE_COUNT * CARDS_PER_PILE + FLASH_POOL_SIZE);
	flashIndex = 0;
	hearts = MAX_HEARTS;
}

/**
 * @param {Card[]} cards
 * @returns {boolean}
 */
function isStraight(cards) {
	const ranks = cards.map((c) => c.rank);
	const values = ranks.map((r) => RANK_VALUES[r]).sort((a, b) => a - b);
	if (values[2] - values[0] === 2 && values[1] - values[0] === 1) {
		return true;
	}
	return ranks.includes('A') && ranks.includes('2') && ranks.includes('3');
}

/**
 * @param {Card[]} cards
 * @returns {{ id: string; label: string; points: number }[]}
 */
function scoreComponents(cards) {
	/** @type {{ id: string; label: string; points: number }[]} */
	const components = [];

	const ranks = cards.map((c) => c.rank);
	const suits = cards.map((c) => c.suit.id);

	/** @type {Record<string, number>} */
	const rankCounts = {};
	/** @type {Record<string, number>} */
	const suitCounts = {};
	for (const rank of ranks) {
		rankCounts[rank] = (rankCounts[rank] ?? 0) + 1;
	}
	for (const suit of suits) {
		suitCounts[suit] = (suitCounts[suit] ?? 0) + 1;
	}

	const maxRankCount = Math.max(...Object.values(rankCounts));
	const maxSuitCount = Math.max(...Object.values(suitCounts));

	if (maxRankCount === 3) {
		components.push({ id: 'trips', label: 'Three of a kind', points: 150 });
		if (ranks.every((r) => r === 'A')) {
			components.push({ id: 'tripleAces', label: 'Triple aces', points: 350 });
		}
	} else if (maxRankCount === 2) {
		components.push({ id: 'pair', label: 'Pair', points: 20 });
	}

	if (maxSuitCount === 3) {
		components.push({ id: 'flush', label: 'Flush', points: 50 });
	} else if (maxSuitCount === 2) {
		components.push({ id: 'twoSuit', label: 'Two suit', points: 15 });
	}

	if (isStraight(cards)) {
		components.push({ id: 'straight', label: 'Straight', points: 40 });
	}

	return components;
}

/**
 * @param {{ id: string; label: string; points: number }[]} components
 */
function sumScore(components) {
	return components.reduce((total, c) => total + c.points, 0);
}

function isPileSelected(pileIndex) {
	return selectedPileIndices.includes(pileIndex);
}

/**
 * @param {Card} card
 * @param {{ flash?: boolean; pileIndex?: number; selectable?: boolean; selected?: boolean; back?: boolean }} [options]
 */
function createCardElement(card, { flash = false, pileIndex = -1, selectable = false, selected = false, back = false } = {}) {
	const el = document.createElement(selectable ? 'button' : 'div');
	if (selectable) {
		el.type = 'button';
	}

	el.className = 'playing-card';
	if (flash) el.classList.add('playing-card--flash');
	if (back) el.classList.add('playing-card--back');
	if (selected) el.classList.add('playing-card--selected');
	if (card.suit.red) el.classList.add('playing-card--red');

	if (back) {
		el.setAttribute('aria-label', 'Flashed card');
	} else {
		el.setAttribute('aria-label', `${card.rank} of ${card.suit.id}`);
	}

	if (!back) {
		const rank = document.createElement('span');
		rank.className = 'playing-card__rank';
		rank.textContent = card.rank;

		const suit = document.createElement('span');
		suit.className = 'playing-card__suit';
		suit.textContent = card.suit.symbol;

		el.append(rank, suit);
	}

	if (selectable && pileIndex >= 0) {
		el.addEventListener('click', () => onPileTopClick(pileIndex));
	}

	return el;
}

function createCardBackElement({ flash = true } = {}) {
	/** @type {Card} */
	const dummy = { rank: '', suit: SUITS[0] };
	return createCardElement(dummy, { flash, back: true });
}

function renderPiles() {
	pilesEl.replaceChildren();
	pilesEl.classList.toggle('piles--disabled', !selectionEnabled);

	for (let pileIndex = 0; pileIndex < PILE_COUNT; pileIndex += 1) {
		const pile = piles[pileIndex];
		const pileEl = document.createElement('div');
		pileEl.className = 'pile';
		if (pile.length === 0) {
			pileEl.classList.add('pile--empty');
		}

		const stackEl = document.createElement('div');
		stackEl.className = 'pile__stack';
		stackEl.style.setProperty('--stack-count', String(Math.min(pile.length, 3)));

		if (pile.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'pile__empty-slot';
			empty.setAttribute('aria-hidden', 'true');
			stackEl.append(empty);
		} else {
			const visibleDepth = Math.min(pile.length, 3);
			for (let depth = visibleDepth - 1; depth >= 0; depth -= 1) {
				const card = pile[depth];
				const isTop = depth === 0;
				const cardEl = createCardElement(card, {
					pileIndex,
					selectable: selectionEnabled && isTop,
					selected: isTop && isPileSelected(pileIndex),
				});
				cardEl.classList.add('playing-card--stacked');
				if (isTop) cardEl.classList.add('playing-card--top');
				cardEl.style.setProperty('--stack-depth', String(depth));
				if (!isTop) {
					cardEl.setAttribute('aria-hidden', 'true');
				}
				stackEl.append(cardEl);
			}
		}

		pileEl.append(stackEl);
		pilesEl.append(pileEl);
	}
}

function renderFlashFaceUp() {
	flashSlot.replaceChildren();
	flashSlot.hidden = !currentFlash;

	if (currentFlash) {
		flashSlot.append(createCardElement(currentFlash, { flash: true }));
	}
}

function renderFlashBack() {
	flashSlot.replaceChildren();
	flashSlot.hidden = false;
	flashSlot.append(createCardBackElement());
}

function clearFlashSlot() {
	flashSlot.replaceChildren();
	flashSlot.hidden = true;
}

function clearRevealRow() {
	revealRow.replaceChildren();
	revealRow.hidden = true;
}

function hideScoreFlash() {
	scoreFlashEl.hidden = true;
	scoreFlashEl.replaceChildren();
	scoreFlashEl.className = 'score-flash';
}

function updateHeartsDisplay() {
	if (!playHearts) return;
	const heartEls = playHearts.querySelectorAll('.heart');
	heartEls.forEach((el, i) => {
		el.classList.toggle('heart--full', i < hearts);
		el.classList.toggle('heart--empty', i >= hearts);
	});
	playHearts.setAttribute('aria-label', `${hearts} ${hearts === 1 ? 'life' : 'lives'}`);
}

function hideCountdown() {
	responseCountdown.hidden = true;
	responseCountdown.textContent = '';
}

function hideGameOverOverlay() {
	playfieldOverlay.hidden = true;
	playfield.classList.remove('playfield--gameover');
}

function showGameOverOverlay() {
	let message = `Final score: ${score}.`;
	if (gameEndReason === 'complete') {
		message = `All ${FLASH_POOL_SIZE} cards flashed. ${message}`;
	} else if (gameEndReason === 'hearts') {
		message = `No hearts left. ${message}`;
	} else if (gameEndReason === 'incomplete') {
		message = `Incomplete hand — pick two cards. ${message}`;
	}

	gameoverScore.textContent = message;
	playfieldOverlay.hidden = false;
	playfield.classList.add('playfield--gameover');
}

function clearAllTimers() {
	if (waitTimer !== null) {
		clearTimeout(waitTimer);
		waitTimer = null;
	}
	if (flashHideTimer !== null) {
		clearTimeout(flashHideTimer);
		flashHideTimer = null;
	}
	if (responseEndTimer !== null) {
		clearTimeout(responseEndTimer);
		responseEndTimer = null;
	}
	if (evaluateDelayTimer !== null) {
		clearTimeout(evaluateDelayTimer);
		evaluateDelayTimer = null;
	}
	for (const timer of countdownTimers) {
		clearTimeout(timer);
	}
	countdownTimers.length = 0;
}

/** @param {{ hide?: boolean }} [options] */
function stopElapsedTimer({ hide = true } = {}) {
	if (displayTimerInterval !== null) {
		clearInterval(displayTimerInterval);
		displayTimerInterval = null;
	}
	if (hide) {
		playTimer.hidden = true;
		playTimer.textContent = '';
	}
}

/** @param {number} ms */
function formatElapsed(ms) {
	const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateElapsedTimer() {
	playTimer.textContent = formatElapsed(Date.now() - gameStartedAt);
}

function startElapsedTimer() {
	stopElapsedTimer({ hide: false });
	playTimer.hidden = false;
	updateElapsedTimer();
	displayTimerInterval = setInterval(updateElapsedTimer, 1000);
}

function updateScoreDisplay() {
	playScore.textContent = `Score: ${score}`;
}

function resetRoundUi() {
	selectedPileIndices = [];
	selectionEnabled = false;
	hideCountdown();
	hideScoreFlash();
	clearRevealRow();
}

function scheduleFlash() {
	clearAllTimers();
	resetRoundUi();
	currentFlash = null;
	clearFlashSlot();
	renderPiles();

	if (flashIndex >= FLASH_POOL_SIZE) {
		endGame({ reason: 'complete' });
		return;
	}

	const delay = WAIT_MIN_MS + Math.random() * (WAIT_MAX_MS - WAIT_MIN_MS);
	waitTimer = setTimeout(showFlash, delay);
}

function showFlash() {
	waitTimer = null;
	currentFlash = flashPool[flashIndex];
	selectedPileIndices = [];
	renderFlashFaceUp();

	flashHideTimer = setTimeout(beginResponseWindow, FLASH_VISIBLE_MS);
}

function beginResponseWindow() {
	flashHideTimer = null;
	if (!currentFlash) return;

	renderFlashBack();
	selectionEnabled = true;
	selectedPileIndices = [];
	renderPiles();
	hideCountdown();

	for (let i = 0; i < COUNTDOWN_NUMBERS.length; i += 1) {
		const num = COUNTDOWN_NUMBERS[i];
		const timer = setTimeout(() => {
			responseCountdown.hidden = false;
			responseCountdown.textContent = String(num);
		}, COUNTDOWN_START_MS + i * COUNTDOWN_STEP_MS);
		countdownTimers.push(timer);
	}

	responseEndTimer = setTimeout(onResponseTimeout, RESPONSE_MS);
}

function onResponseTimeout() {
	responseEndTimer = null;
	for (const timer of countdownTimers) {
		clearTimeout(timer);
	}
	countdownTimers.length = 0;
	hideCountdown();
	selectionEnabled = false;
	renderPiles();

	const pickCount = selectedPileIndices.length;
	clearFlashSlot();

	if (pickCount < 2) {
		if (!loseHeart()) return;
		if (!advanceFlashIndex()) return;
		scheduleFlash();
		return;
	}
}

function onPileTopClick(pileIndex) {
	if (!selectionEnabled) return;
	if (piles[pileIndex].length === 0) return;

	const pos = selectedPileIndices.indexOf(pileIndex);
	if (pos >= 0) {
		selectedPileIndices.splice(pos, 1);
	} else if (selectedPileIndices.length < 2) {
		selectedPileIndices.push(pileIndex);
	}

	renderPiles();

	if (selectedPileIndices.length === 2) {
		selectionEnabled = false;
		renderPiles();
		evaluateDelayTimer = setTimeout(resolveSelection, EVALUATE_DELAY_MS);
	}
}

function resolveSelection() {
	evaluateDelayTimer = null;
	clearAllTimers();
	hideCountdown();
	selectionEnabled = false;

	if (!currentFlash || selectedPileIndices.length !== 2) {
		endGame({ reason: 'incomplete' });
		return;
	}

	void playRevealSequence();
}

async function playRevealSequence() {
	const gen = gameGeneration;
	const flash = currentFlash;
	const picks = selectedPileIndices.map((i) => piles[i][0]);
	const cards = [flash, picks[0], picks[1]];
	const components = scoreComponents(cards);
	const total = sumScore(components);

	clearFlashSlot();
	revealRow.hidden = false;
	revealRow.replaceChildren();

	for (const card of cards) {
		revealRow.append(createCardElement(card, { flash: false }));
	}

	await delay(REVEAL_PAUSE_MS);
	if (gen !== gameGeneration) return;

	const cardEls = [...revealRow.children];
	for (const el of cardEls) {
		el.classList.add('playing-card--vanish');
	}

	await delay(CARD_VANISH_MS);
	if (gen !== gameGeneration) return;

	clearRevealRow();
	await showScoreFlash(total, components);
	if (gen !== gameGeneration) return;

	if (total > 0) {
		score += total;
		updateScoreDisplay();
		consumePileTops(selectedPileIndices);
	} else if (!loseHeart()) {
		return;
	}

	selectedPileIndices = [];
	currentFlash = null;
	renderPiles();

	if (!advanceFlashIndex()) return;
	scheduleFlash();
}

/**
 * @param {number} total
 * @param {{ id: string; label: string; points: number }[]} components
 */
async function showScoreFlash(total, components) {
	hideScoreFlash();

	let tier = 'score-flash--small';
	let duration = SCORE_FLASH_MS;
	if (total >= 400) {
		tier = 'score-flash--mega';
		duration = SCORE_FLASH_MEGA_MS;
	} else if (total >= 150) {
		tier = 'score-flash--large';
	} else if (total >= 50) {
		tier = 'score-flash--medium';
	}

	scoreFlashEl.className = `score-flash ${tier}`;
	scoreFlashEl.hidden = false;

	const value = document.createElement('span');
	value.className = 'score-flash__value';
	value.textContent = total > 0 ? `+${total}` : '0';
	scoreFlashEl.append(value);

	if (components.length > 0) {
		const breakdown = document.createElement('span');
		breakdown.className = 'score-flash__breakdown';
		breakdown.textContent = components.map((c) => c.label).join(' · ');
		scoreFlashEl.append(breakdown);
	}

	await delay(duration);
	hideScoreFlash();
}

function consumePileTops(pileIndices) {
	const sorted = [...pileIndices].sort((a, b) => b - a);
	for (const pileIndex of sorted) {
		if (piles[pileIndex].length > 0) {
			piles[pileIndex].shift();
		}
	}
}

function loseHeart() {
	hearts -= 1;
	updateHeartsDisplay();
	if (hearts <= 0) {
		endGame({ reason: 'hearts' });
		return false;
	}
	return true;
}

function advanceFlashIndex() {
	flashIndex += 1;
	if (flashIndex >= FLASH_POOL_SIZE) {
		endGame({ reason: 'complete' });
		return false;
	}
	return true;
}

/** @param {number} ms */
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function showView(name) {
	const views = {
		home: viewHome,
		play: viewPlay,
	};

	for (const [key, el] of Object.entries(views)) {
		const active = key === name;
		el.classList.toggle('view-active', active);
		el.hidden = !active;
	}
}

function startGame() {
	gameGeneration += 1;
	clearAllTimers();
	score = 0;
	initDeck();
	updateScoreDisplay();
	updateHeartsDisplay();
	hideGameOverOverlay();
	hideScoreFlash();
	clearRevealRow();
	clearFlashSlot();
	showView('play');
	gameStartedAt = Date.now();
	startElapsedTimer();
	renderPiles();
	scheduleFlash();
}

function stopGame() {
	gameGeneration += 1;
	gameEndReason = 'stopped';
	clearAllTimers();
	stopElapsedTimer();
	selectionEnabled = false;
	currentFlash = null;
	selectedPileIndices = [];
	hideCountdown();
	hideScoreFlash();
	clearRevealRow();
	clearFlashSlot();
	hideGameOverOverlay();
	renderPiles();
	showView('home');
}

/** @param {{ reason?: typeof gameEndReason }} [options] */
function endGame({ reason = 'hearts' } = {}) {
	gameGeneration += 1;
	gameEndReason = reason;
	clearAllTimers();
	stopElapsedTimer({ hide: false });
	updateElapsedTimer();
	selectionEnabled = false;
	currentFlash = null;
	selectedPileIndices = [];
	hideCountdown();
	hideScoreFlash();
	clearRevealRow();
	clearFlashSlot();
	renderPiles();
	showGameOverOverlay();
}

function onKeyDown(event) {
	if (viewPlay.hidden) return;
	if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
		event.preventDefault();
	}
}

function init() {
	btnStart.addEventListener('click', startGame);
	btnStop.addEventListener('click', stopGame);
	btnPlayAgain.addEventListener('click', () => {
		stopElapsedTimer();
		hideGameOverOverlay();
		showView('home');
	});
	document.addEventListener('keydown', onKeyDown);
}

init();
