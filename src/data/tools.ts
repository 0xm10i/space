export type Tool = {
	title: string;
	url: string;
	description: string;
	repo?: string;
	featured?: boolean;
	tags?: string[];
};

/** Add one entry per tool — this is the only file to edit when you ship something new. */
export const tools: Tool[] = [
	{
		title: 'Ear Training for 5-String Bass',
		url: '/ear-training-for-bass/',
		description:
			'Note imitation and fretboard practice for bass — hear a note and play it back, tap it on an on-screen fretboard, or name a highlighted fret.',
		featured: true,
		tags: ['music', 'bass', 'ear-training'],
	},
	{
		title: 'Bass Tools',
		url: '/bass-tools/',
		description: 'Chromatic tuner, metronome, drum machine, and evenness practice for bass.',
		featured: true,
		tags: ['music', 'bass'],
	},
	{
		title: 'Talk Back',
		url: '/talk-back/',
		description:
			'Speaking drills — record yourself on camera, get instant playback, and see a live transcript with a words-per-minute readout.',
		featured: true,
		tags: ['speech', 'practice'],
	},
	{
		title: 'Card Flash',
		url: '/card-flash/',
		description:
			'Focus game — five piles of seven cards, memorize each flash, pick two tops for combinable poker-style scores across 17 rounds with three hearts.',
		tags: ['focus', 'game'],
	},
];
