export const EXPANDED_TITLE = 'Mehdi Sabouri Space';
export const CONTRACTED_TITLE = 'm10i.space';

export const KEYFRAME_STEP_MS = 50;
export const ENDPOINT_HOLD_MS = 5000;

/** Forward path only; runner ping-pongs index 0 → n → 0 */
export const morphKeyframes: string[] = [
	EXPANDED_TITLE,
	'Mehdi Sa+ouri Space',
	'Mehdi Sa1ouri Space',
	'Mehdi Sa1+uri Space',
	'Mehdi Sa+uri Space',
	'Mehdi Sa2uri Space',
	'Mehdi S+2uri Space',
	'Meh+i S12uri Space',
	'Me+1i S+uri Space',
	'Me11i S3uri Space',
	'Me+i S31ri Space',
	'Me2+ S+ri Space',
	'Me21 S4ri Space',
	'Me+ 14ri Space',
	'M+3 +ri Space',
	'M13 5ri Space',
	'M+ 51i Space',
	'M4 +i +pace',
	'M4+6i space',
	'+46i space',
	'm++i+space',
	'm10i.space',
	CONTRACTED_TITLE,
];
