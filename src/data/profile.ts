export type ProfileLink = {
	label: string;
	href: string;
};

export const profile = {
	name: 'Mehdi Sabouri',
	tagline: 'Software Engineer',
	bio: 'Personal hub for projects and tools. I build software and ship small things on the web.',
	links: [
		{ label: 'GitHub', href: 'https://github.com/0xm10i' },
	] satisfies ProfileLink[],
};
