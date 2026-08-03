# m10i.space

Personal site and hub for GitHub Pages tools, hosted at [m10i.space](https://m10i.space).

Built with [Astro](https://astro.build/) and TypeScript. Static output is deployed to GitHub Pages via Actions.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Project layout

| Path | Purpose |
|------|---------|
| `src/data/profile.ts` | Name, bio, social links |
| `src/data/tools.ts` | Links to your GH Pages tools (edit when you ship something new) |
| `src/content/blog/` | Markdown posts (optional `draft: true` in frontmatter) |
| `public/CNAME` | Custom domain for GitHub Pages |

## Add a tool

Add an object to the `tools` array in `src/data/tools.ts`:

```ts
{
  title: 'My tool',
  url: 'https://<user>.github.io/<repo>/',
  description: 'Short description.',
  repo: 'https://github.com/<user>/<repo>',
  featured: true,
}
```

## Write a blog post

Create `src/content/blog/my-post.md`:

```md
---
title: My post
description: One-line summary for meta tags.
pubDate: 2026-08-03
draft: false
---

Your content here.
```

The Blog nav link appears once at least one non-draft post exists.

## Deploy (GitHub Pages + custom domain)

1. Push this repo to GitHub (e.g. `m10i.space` or `username.github.io`).
2. **Settings → Pages → Build and deployment**: Source = **GitHub Actions**.
3. **Settings → Pages → Custom domain**: `m10i.space`, then enable **Enforce HTTPS** after DNS is valid.
4. At your domain registrar, for apex `m10i.space`, set DNS per [GitHub’s custom domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site):
   - **A** records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Optional **AAAA** → GitHub’s IPv6 addresses from the same doc
5. Push to `main`; the workflow in `.github/workflows/deploy.yml` builds and publishes `dist/`.

`public/CNAME` must contain `m10i.space` so the custom domain survives each deploy.

## Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
