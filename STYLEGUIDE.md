# m10i.space Style Guide

This document defines the visual language for m10i.space. **The home page (`src/pages/index.astro` + `src/styles/global.css`) is the reference.** All pages should use the same tokens, typography, spacing, and component patterns defined here.

`Layout.astro` loads `global.css` on every page. Page-specific stylesheets may add layout or interactive UI, but must **reuse the design tokens and patterns below** — not introduce alternate colors, fonts, or radii.

---

## Design tokens

All tokens live in `:root` inside `src/styles/global.css`. Use CSS variables; do not hard-code hex values in new styles.

### Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg` | `#ffffff` | `#141414` | Page background |
| `--bg-elevated` | `#ffffff` | `#1c1c1c` | Cards, raised surfaces |
| `--text` | `#1a1a1a` | `#e8e6e3` | Primary body text |
| `--text-muted` | `#5c5c5c` | `#9a9590` | Secondary text, nav links, descriptions |
| `--accent` | `#8f2d56` | `#d66a96` | Taglines, hover accents, primary actions |
| `--accent-hover` | `#742448` | `#e888ad` | Link hover, primary button hover |
| `--border` | `#d8d2c8` | `#333333` | Borders, dividers |
| `--link` | `#8f2d56` | `#d66a96` | Inline links |

Dark mode follows `prefers-color-scheme: dark`. Do not add a manual theme toggle unless the whole site adopts one.

### Typography

| Token | Value |
|-------|-------|
| `--font-sans` | `'Space Grotesk', system-ui, sans-serif` |
| `--font-mono` | `'IBM Plex Mono', ui-monospace, monospace` |

Fonts are loaded in `Layout.astro` (weights 400, 500, 600 for Space Grotesk; 400, 500 for IBM Plex Mono).

**Base:** `html` uses `--font-sans`, `line-height: 1.6`, `--text` on `--bg`.

### Layout

| Token | Value | Notes |
|-------|-------|-------|
| `--max-width` | `42rem` (~672px) | Content column width |
| `--space` | `1.25rem` (20px) | Base spacing unit |

Content areas use:

```css
max-width: calc(var(--max-width) + 2 * var(--space));
margin: 0 auto;
padding: … var(--space);
```

`main` padding: `2rem var(--space) 3rem` (top / sides / bottom).

---

## Typography scale

Use these sizes consistently. Avoid one-off `font-size` values unless there is a strong functional reason (e.g. a tuner readout).

| Role | Size | Weight | Font | Color | Example class / element |
|------|------|--------|------|-------|-------------------------|
| Page title (in content) | `1.75rem` | 600 | sans | `--text` | `.hero h1`, blog `<h1>` |
| Site title (header) | `1rem` | 600 | sans | `--text` | `.site-title` |
| Body | `1rem` (inherit) | 400 | sans | `--text` | default |
| Bio / secondary body | inherit | 400 | sans | `--text-muted` | `.hero .bio` |
| Tagline | `0.9rem` | 400 | **mono** | `--accent` | `.hero .tagline` |
| Section label | `0.75rem` | 600 | sans | `--text-muted` | `.section-title` |
| Card title | inherit | 600 | sans | `--text` | `.tool-card__title` |
| Card description | `0.9rem` | 400 | sans | `--text-muted` | `.tool-card__desc` |
| Card meta | `0.75rem` | 400 | **mono** | `--text-muted` | `.tool-card__meta` |
| Nav links | `0.9rem` | 400 | sans | `--text-muted` | `.site-nav a` |
| Footer | `0.85rem` | 400 | sans | `--text-muted` | `.site-footer` |
| Post date | `0.8rem` | 400 | **mono** | `--text-muted` | `.post-list time` |
| Empty state | `0.95rem` | 400 | sans | `--text-muted` | `.empty-state` |

### Section labels

Section headings use uppercase labels, not large display headings:

```css
font-size: 0.75rem;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.08em;
color: var(--text-muted);
margin: 2.5rem 0 1rem;
```

Class: `.section-title`.

### Prose (blog posts)

Wrap article content in `.prose`:

- `max-width: 36rem`
- `h1`: `1.75rem`, `margin-top: 0`
- `h2`, `h3`: `margin-top: 2rem`

---

## Spacing

Use `--space` (1.25rem) and simple multiples. Prefer the values already used on the home page.

| Context | Value |
|---------|-------|
| Header / footer horizontal padding | `var(--space)` |
| Main vertical padding | `2rem` top, `3rem` bottom |
| Section title top margin | `2.5rem` |
| Section title bottom margin | `1rem` |
| Hero tagline bottom | `1rem` |
| Hero bio bottom | `1.25rem` |
| Profile links gap | `0.75rem` row, `1.25rem` column |
| Tool grid gap | `0.75rem` |
| Nav link gap | `1.25rem` |
| Header inner gap | `var(--space)` |

---

## Links

**Default inline links** (`a`):

```css
color: var(--link);
text-decoration-thickness: 1px;
text-underline-offset: 0.15em;
```

Hover: `color: var(--accent-hover)`.

**Navigation links** (`.site-nav a`):

- Default: `color: var(--text-muted)`, no underline
- Hover and current page (`[aria-current='page']`): `color: var(--text)`

**Card links** (`.tool-card`): no underline, `color: inherit`; entire card is clickable.

**Profile / hero links**: standard inline link styling inside `.profile-links`.

---

## Borders & radius

| Element | Border | Radius |
|---------|--------|--------|
| Tool cards | `1px solid var(--border)` | `6px` |
| Post list dividers | `border-bottom: 1px solid var(--border)` | — |

**Standard border radius for cards and inputs: `6px`.** Do not use `8px`, `12px`, or pill shapes for general site chrome unless a component spec below explicitly allows it.

---

## Cards

Home page tool cards (`.tool-card`) are the reference for bordered content blocks:

```css
display: block;
padding: 1rem 1.15rem;
background: var(--bg-elevated);
border: 1px solid var(--border);
border-radius: 6px;
color: inherit;
text-decoration: none;
transition: border-color 0.15s, box-shadow 0.15s;
```

Hover:

```css
border-color: var(--accent);
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
```

Structure:

- `.tool-card__title` — bold, small bottom margin
- `.tool-card__desc` — muted, `0.9rem`
- `.tool-card__meta` — mono, `0.75rem`, optional

For non-link cards, use the same padding, background, border, and radius without hover shadow unless the card is interactive.

---

## Buttons

The home page does not use buttons; tool pages do. **New buttons should follow this shared pattern** (aligned with Bass Tools, simplified from Talk Back):

### Primary (`.btn-primary`)

```css
background: var(--accent);
color: #fff;
font-weight: 600;
border: none;
border-radius: 6px;
padding: 0.65rem 1.1rem;
font-size: 1rem;
cursor: pointer;
```

Hover: `background: var(--accent-hover)`.

### Secondary (`.btn-secondary`)

```css
background: transparent;
color: var(--text);
border: 1px solid var(--border);
border-radius: 6px;
padding: 0.65rem 1.1rem;
font-size: 1rem;
cursor: pointer;
```

### Small (`.btn-small`)

```css
padding: 0.35rem 0.75rem;
font-size: 0.875rem;
```

Form controls inherit `--font-sans`. Use `border-radius: 6px` and `border: 1px solid var(--border)` for inputs and selects.

---

## Page sections

### Hero (home page intro)

```html
<section class="hero">
  <p class="tagline">…</p>   <!-- mono, accent -->
  <p class="bio">…</p>       <!-- muted -->
  <div class="profile-links">…</div>
</section>
```

Subpages without a hero should still use a consistent page intro when they have a title + subtitle:

- **Tagline on home:** mono, accent color — this is unique to the home hero.
- **Subpage intros:** use a plain `<h1>` plus a short description in `--text-muted` at `0.9rem`, matching the bio style (not accent mono).

Example pattern for tool pages:

```html
<header class="page-intro">
  <h1>Page title</h1>
  <p class="page-intro__desc">Short description.</p>
</header>
```

Styles in `global.css`:

```css
.page-intro h1 {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.25;
  margin: 0 0 0.5rem;
}

.page-intro__desc {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0 0 1.25rem;
  max-width: 36rem;
}
```

---

## Header & footer

### Header (`.site-header`)

- Background: `var(--bg)`
- Inner flex: space-between, wrap, align center
- Site title: no underline; hover → `var(--accent)`

### Footer (`.site-footer`)

- `font-size: 0.85rem`
- `color: var(--text-muted)`
- Links use default link colors

---

## Lists

### Tool grid (`.tool-grid`)

- Unstyled list, CSS grid, `gap: 0.75rem`

### Post list (`.post-list`)

- Unstyled list
- Items: `padding: 0.75rem 0`, bottom border
- Title links: no underline, `font-weight: 500`, `--text`
- Date: mono, `0.8rem`, muted

---

## Motion & accessibility

- Card hovers: `0.15s` transitions
- Site title morph animation: respect `prefers-reduced-motion: reduce` (already handled in `global.css`)
- Use `aria-current="page"` on active nav links
- Interactive elements need visible focus styles when adding new components (extend global focus rules if missing)

---

## Semantic colors (tools only)

For feedback inside interactive tools (success, error, meters), page CSS may define:

| Token | Light-oriented value | Usage |
|-------|----------------------|-------|
| `--success` | `#2d8a5c` | Correct notes, saved settings |
| `--danger` | `#c44` | Errors, wrong pitch |

These are **not** part of the core brand palette. Use only in tool UIs, not for marketing or blog content.

---

## File organization

| File | Scope |
|------|-------|
| `src/styles/global.css` | Tokens, layout, header/footer, home patterns, blog prose, shared components (`.page-intro`, `.card`, `.btn-*`, `.hidden`) |
| `src/styles/bass-tools.css` | Bass Tools views, forms, meters — uses global tokens and shared components |
| `src/styles/talk-back.css` | Talk Back video UI — must use global tokens |

**Rule:** New site-wide patterns belong in `global.css`. Page CSS should scope under a wrapper (e.g. `.talk-back`) and reference `var(--accent)`, not duplicate hex colors.

---

## Current inconsistencies (to fix over time)

These pages still diverge from the home reference. Bass Tools has been aligned (see git history).

| Area | Home / global | Bass Tools | Talk Back |
|------|---------------|------------|-----------|
| Content max-width | `42rem` + padding | Aligned | `640px` |
| Card radius | `6px` | Aligned | `12px` |
| Primary button radius | `6px` | Aligned | `50px` (pill) |
| Page intro | `.page-intro` + `.page-intro__desc` | Aligned | `.talk-back-intro`, centered |
| Section labels | uppercase `0.75rem` | Aligned (view titles) | uppercase labels (similar) |
| Button padding | `0.65rem 1.1rem` | Aligned | `12px 28px`, pill |
| Shadows | subtle on card hover only | minimal | `0 8px 32px` on video |

Priority when refactoring Talk Back:

1. Use global tokens everywhere (already mostly true).
2. Unify border-radius to **6px** for cards and buttons.
3. Use **42rem** content width.
4. Align subpage intro with `.page-intro` instead of `.talk-back-intro`.

---

## Checklist for new pages

- [ ] Uses `Layout.astro` (loads fonts + `global.css`)
- [ ] No hard-coded colors outside tokens
- [ ] Body text uses `--font-sans`; metadata / dates use `--font-mono`
- [ ] Content column respects `--max-width` and `--space` padding
- [ ] Section groups use `.section-title` for labels
- [ ] Cards match `.tool-card` border, radius, and padding
- [ ] Links follow inline vs nav vs card rules above
- [ ] Buttons use `.btn-primary` / `.btn-secondary` spec (6px radius)
- [ ] Dark mode works via existing CSS variables only

---

## Quick reference (copy-paste)

```css
/* Card */
.my-card {
  padding: 1rem 1.15rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
}

/* Section label */
.my-section-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 2.5rem 0 1rem;
}

/* Muted description */
.my-desc {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Primary button */
.my-btn-primary {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  padding: 0.65rem 1.1rem;
  font-size: 1rem;
  cursor: pointer;
}
.my-btn-primary:hover {
  background: var(--accent-hover);
}
```
