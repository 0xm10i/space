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
		title: 'Bass Tools',
		url: '/bass-tools/',
		description:
			'Ear training, chromatic tuner, metronome, and drum machine for bass — play back random notes by ear.',
		repo: 'https://github.com/0xm10i/bass-tools',
		featured: true,
		tags: ['music', 'bass'],
	},
];
