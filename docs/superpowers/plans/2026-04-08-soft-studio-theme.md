# Soft Studio Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AgentFleet's dark-only theme with a dual-theme system — warm off-white light theme (default) + softened dark theme with teal accent.

**Architecture:** Each HTML file gets updated CSS variables (light on `:root`, dark on `[data-theme="dark"]`), a theme toggle button, and a shared JS snippet for theme detection/persistence. No new files — all changes are inline within existing HTML files.

**Tech Stack:** Vanilla CSS custom properties, vanilla JS, `prefers-color-scheme` media query, `localStorage`

**Spec:** `docs/superpowers/specs/2026-04-08-soft-studio-theme-design.md`

---

## Chunk 1: Hub Pages (Sidebar Layout)

These 4 files share the same CSS variable structure and sidebar layout. Each gets identical variable blocks and toggle placement.

### Task 1: Update `hub/dashboard.html`

**Files:**
- Modify: `hub/dashboard.html`

This is the reference implementation. All subsequent hub pages copy this pattern.

- [ ] **Step 1: Replace `:root` CSS variables with light theme**

Replace the existing `:root` block (lines 8-34) with:

```css
:root {
  --bg: #FDFBF9;
  --surface: #F5F1EC;
  --surface-hover: #EDE8E0;
  --surface-elevated: #E8E2DA;
  --border: #E8E2DA;
  --border-subtle: #F0EBE4;

  --text: #1A1A1A;
  --text-secondary: #6B6560;
  --text-tertiary: #8A8580;

  --accent: #14B8A6;
  --accent-hover: #0D9488;
  --accent-subtle: rgba(20, 184, 166, 0.10);

  --success: #059669;
  --success-subtle: rgba(5, 150, 105, 0.10);
  --warning: #D97706;
  --warning-subtle: rgba(217, 119, 6, 0.10);
  --danger: #C53030;
  --danger-subtle: rgba(197, 48, 48, 0.10);
  --info: #8168E0;
  --info-subtle: rgba(129, 104, 224, 0.10);

  --sidebar-width: 220px;
}
```

- [ ] **Step 2: Add `[data-theme="dark"]` block after `:root`**

```css
[data-theme="dark"] {
  --bg: #222228;
  --surface: #2C2C33;
  --surface-hover: #333340;
  --surface-elevated: #38384A;
  --border: #38383F;
  --border-subtle: #2F2F38;

  --text: #E8E8F0;
  --text-secondary: #9090A0;
  --text-tertiary: #707078;

  --accent: #2DD4BF;
  --accent-hover: #5EEAD4;
  --accent-subtle: rgba(45, 212, 191, 0.12);

  --success: #34D399;
  --success-subtle: rgba(52, 211, 153, 0.12);
  --warning: #FBBF24;
  --warning-subtle: rgba(251, 191, 36, 0.10);
  --danger: #F87171;
  --danger-subtle: rgba(248, 113, 113, 0.12);
  --info: #A78BFA;
  --info-subtle: rgba(167, 139, 250, 0.12);
}
```

- [ ] **Step 3: Replace hardcoded colors with CSS variable references**

Replace these hardcoded values throughout the `<style>` block:

| Find | Replace with | Notes |
|------|-------------|-------|
| `box-shadow: inset 0 1px 0 rgba(255,255,255,0.03)` | `box-shadow: none` | White inset glow doesn't work on light backgrounds. Remove it. |
| `box-shadow: 0 4px 12px rgba(124, 108, 240, 0.25)` | `box-shadow: 0 4px 12px var(--accent-subtle)` | Button hover glow |
| `background: rgba(34,211,238,0.1); color: #5cc8db` | `background: var(--accent-subtle); color: var(--accent)` | question/explore/refactor tags — use accent instead of cyan |
| `background: rgba(139,144,160,0.1)` | `background: var(--border-subtle)` | Default tag background |

- [ ] **Step 4: Add theme toggle button to sidebar footer**

In the sidebar footer HTML (before the "Sign out" button), add:

```html
<button onclick="toggleTheme()" class="theme-toggle" id="theme-toggle" title="Toggle theme">
  <svg id="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
  <svg id="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
</button>
```

Add these CSS rules:

```css
.theme-toggle {
  display: flex; align-items: center; justify-content: center;
  width: 100%; background: transparent; border: 1px solid var(--border);
  color: var(--text-secondary); padding: 7px 0; border-radius: 6px;
  cursor: pointer; transition: all 0.15s; margin-bottom: 8px;
}
.theme-toggle:hover { color: var(--text); border-color: var(--text-tertiary); }
.theme-toggle svg { width: 16px; height: 16px; }
```

- [ ] **Step 5: Add theme detection and toggle JS**

Add this at the **very start** of the `<script>` block (before any other code):

```javascript
(function initTheme() {
  const saved = localStorage.getItem('agentfleet-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('agentfleet-theme')) {
      const t = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
      updateThemeIcon(t);
    }
  });
})();
function updateThemeIcon(theme) {
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    sun.style.display = theme === 'dark' ? 'block' : 'none';
    moon.style.display = theme === 'dark' ? 'none' : 'block';
  }
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('agentfleet-theme', next);
  updateThemeIcon(next);
}
```

Note: `updateThemeIcon` shows the **sun** when in dark mode (click to go light) and **moon** when in light mode (click to go dark).

- [ ] **Step 6: Verify in browser**

Run: `node hub/index.js` (if not already running)
Open dashboard in browser. Verify:
- Light theme loads by default (warm off-white background)
- Toggle switches to dark theme (lifted charcoal)
- Status colors (green/amber/red) are readable on both
- Tags render correctly
- Sidebar, stats cards, panels, forms all look correct
- Preference persists on page reload

- [ ] **Step 7: Commit**

```bash
git add hub/dashboard.html
git commit -m "feat: add Soft Studio dual-theme to dashboard"
```

---

### Task 2: Update `hub/agents.html`

**Files:**
- Modify: `hub/agents.html`

Follow the exact same pattern as Task 1. The agents page has the same CSS variable block (lines 8-17).

- [ ] **Step 1: Replace `:root` variables with light theme** (same values as Task 1 Step 1)

- [ ] **Step 2: Add `[data-theme="dark"]` block** (same values as Task 1 Step 2)

- [ ] **Step 3: Replace hardcoded colors**

Same replacements as Task 1 Step 3, plus:
- Line 59: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.03)` in `.agent-table` → `box-shadow: none`
- Line 92: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.03)` in `.setup-panel` → `box-shadow: none`
- Line 84: `rgba(34,211,238,0.1); color: #5cc8db` → `var(--accent-subtle); color: var(--accent)`
- Line 86: `rgba(139,144,160,0.1)` → `var(--border-subtle)`

- [ ] **Step 4: Add theme toggle to sidebar footer** (same HTML as Task 1 Step 4, same CSS)

- [ ] **Step 5: Add theme JS** (same code as Task 1 Step 5)

- [ ] **Step 6: Verify in browser** — Check table rows, status dots, tags, setup panel, search/filter

- [ ] **Step 7: Commit**

```bash
git add hub/agents.html
git commit -m "feat: add Soft Studio dual-theme to agents page"
```

---

### Task 3: Update `hub/dispatches.html`

**Files:**
- Modify: `hub/dispatches.html`

- [ ] **Step 1: Replace `:root` variables** (same as Task 1)

- [ ] **Step 2: Add `[data-theme="dark"]` block** (same as Task 1)

- [ ] **Step 3: Replace hardcoded colors**

- Line 59: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.03)` → `box-shadow: none`
- Line 12: The `--accent-subtle: rgba(124, 108, 240, 0.12)` is already in `:root` and gets replaced

- [ ] **Step 4: Add theme toggle to sidebar footer** (same HTML/CSS)

- [ ] **Step 5: Add theme JS** (same code)

- [ ] **Step 6: Verify in browser** — Check dispatch cards, status badges, timeline, border-left colors

- [ ] **Step 7: Commit**

```bash
git add hub/dispatches.html
git commit -m "feat: add Soft Studio dual-theme to dispatches page"
```

---

### Task 4: Update `hub/settings.html`

**Files:**
- Modify: `hub/settings.html`

- [ ] **Step 1: Replace `:root` variables** (same as Task 1)

- [ ] **Step 2: Add `[data-theme="dark"]` block** (same as Task 1)

- [ ] **Step 3: Replace hardcoded colors**

- Line 47: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.03)` → `box-shadow: none`
- Line 60: `box-shadow: 0 4px 12px rgba(124, 108, 240, 0.25)` → `box-shadow: 0 4px 12px var(--accent-subtle)`

- [ ] **Step 4: Add theme toggle to sidebar footer** (same HTML/CSS)

- [ ] **Step 5: Add theme JS** (same code)

- [ ] **Step 6: Verify in browser** — Check sections, forms, members table, Linear integration panel, code blocks

- [ ] **Step 7: Commit**

```bash
git add hub/settings.html
git commit -m "feat: add Soft Studio dual-theme to settings page"
```

---

## Chunk 2: Landing & CLI Pages (No Sidebar)

These pages have a different variable naming scheme and no sidebar. The toggle goes in the header area instead.

### Task 5: Update `hub/landing.html`

**Files:**
- Modify: `hub/landing.html`

The landing page uses different variable names (`--surface2`, `--text-dim`, `--purple`, `--green`, `--blue`, etc.). These need to be remapped to the new palette.

- [ ] **Step 1: Replace `:root` variables**

Replace the existing `:root` block (lines 8-16) with:

```css
:root {
  --bg: #FDFBF9;
  --surface: #F5F1EC;
  --surface2: #EDE8E0;
  --border: #E8E2DA;
  --text: #1A1A1A;
  --text-dim: #8A8580;
  --green: #059669;
  --green-dim: rgba(5, 150, 105, 0.10);
  --yellow: #D97706;
  --yellow-dim: rgba(217, 119, 6, 0.10);
  --red: #C53030;
  --red-dim: rgba(197, 48, 48, 0.10);
  --blue: #3B7DD8;
  --blue-dim: rgba(59, 125, 216, 0.10);
  --purple: #14B8A6;
  --cyan: #14B8A6;
}
```

Note: `--purple` is remapped to teal (`#14B8A6`) since it's used as the primary accent on this page.

- [ ] **Step 2: Add `[data-theme="dark"]` block**

```css
[data-theme="dark"] {
  --bg: #222228;
  --surface: #2C2C33;
  --surface2: #333340;
  --border: #38383F;
  --text: #E8E8F0;
  --text-dim: #707078;
  --green: #34D399;
  --green-dim: rgba(52, 211, 153, 0.12);
  --yellow: #FBBF24;
  --yellow-dim: rgba(251, 191, 36, 0.10);
  --red: #F87171;
  --red-dim: rgba(248, 113, 113, 0.12);
  --blue: #5B9BF0;
  --blue-dim: rgba(91, 155, 240, 0.12);
  --purple: #2DD4BF;
  --cyan: #2DD4BF;
}
```

- [ ] **Step 3: Fix hardcoded colors**

- `.btn-green` uses `color: #000` — change to `color: #fff` (green is now darker `#059669`, needs white text). Also update dark theme `.btn-green` to keep `color: #000` since dark theme green is bright `#34D399`. Simplest approach: change `.btn-green { color: var(--bg); }` so it adapts automatically.
- `.join-panel .join-info` has hardcoded `rgba(96,165,250,0.2)` — replace with `var(--blue-dim)` border and `var(--blue)` text (already uses `var(--blue)`).
- `.steps li::before` has `background: var(--surface)` and `border: 1px solid var(--border)` — these already use variables, so they'll adapt.

- [ ] **Step 4: Add theme toggle in the brand header**

After the `<p>` tag in `.brand` div, add:

```html
<button onclick="toggleTheme()" class="theme-toggle-landing" id="theme-toggle" title="Toggle theme">
  <svg id="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
  <svg id="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
</button>
```

CSS for the landing toggle (smaller, inline):

```css
.theme-toggle-landing {
  background: transparent; border: 1px solid var(--border);
  color: var(--text-dim); width: 36px; height: 36px;
  border-radius: 50%; cursor: pointer; transition: all 0.15s;
  display: inline-flex; align-items: center; justify-content: center;
  margin-top: 12px;
}
.theme-toggle-landing:hover { color: var(--text); border-color: var(--text-dim); }
.theme-toggle-landing svg { width: 16px; height: 16px; }
```

- [ ] **Step 5: Add theme JS** (same `initTheme`, `updateThemeIcon`, `toggleTheme` functions at start of `<script>`)

- [ ] **Step 6: Verify** — Check sign-in form, create team form, invite section, join panel, "how it works" steps

- [ ] **Step 7: Commit**

```bash
git add hub/landing.html
git commit -m "feat: add Soft Studio dual-theme to landing page"
```

---

### Task 6: Update `cli/setup.html`

**Files:**
- Modify: `cli/setup.html`

Same variable naming as landing page. Toggle goes in the header.

- [ ] **Step 1: Replace `:root` variables** (same values as Task 5 Step 1)

- [ ] **Step 2: Add `[data-theme="dark"]` block** (same values as Task 5 Step 2)

- [ ] **Step 3: Fix hardcoded colors** — audit for any hardcoded values like the landing page

- [ ] **Step 4: Add theme toggle in header**

Add toggle button next to the connection status in the `<header>` element. Use a small circular toggle like the landing page.

- [ ] **Step 5: Add theme JS** (same code)

- [ ] **Step 6: Verify** — Check wizard steps, agent config form, connection status, code blocks

- [ ] **Step 7: Commit**

```bash
git add cli/setup.html
git commit -m "feat: add Soft Studio dual-theme to CLI setup page"
```

---

## Chunk 3: Final Verification & Commit

### Task 7: Cross-page verification

- [ ] **Step 1: Test theme persistence across navigation**

Navigate between dashboard → agents → dispatches → settings. Verify the theme choice persists (all pages should read from `localStorage`).

- [ ] **Step 2: Test OS preference detection**

Clear `localStorage.removeItem('agentfleet-theme')`, change OS to dark mode, reload — should auto-detect dark. Change to light — should auto-detect light.

- [ ] **Step 3: Test toggle override**

After setting via toggle, OS preference changes should NOT override the manual choice.

- [ ] **Step 4: Visual audit**

Check all pages in both themes for:
- Text readability (no light-on-light or dark-on-dark)
- Status colors visible and distinct
- Tags readable
- Forms and inputs have clear borders
- Scrollbar styling works

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: theme polish from cross-page verification"
```
