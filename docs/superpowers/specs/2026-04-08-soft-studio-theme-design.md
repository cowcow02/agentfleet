# Soft Studio Theme — Design Spec

## Overview

Replace AgentFleet's current dark-only theme with a dual-theme system: a warm off-white **light theme** (default) and a softened **dark theme**. The goal is to make the platform friendlier, easier to view, and more approachable while keeping the existing layout and component structure intact.

## Color System

### Light Theme (default)

| Role | Value | Notes |
|------|-------|-------|
| Background | `#FDFBF9` | Subtle warm white |
| Surface | `#F5F1EC` | Cards, sidebar, panels |
| Surface Hover | `#EDE8E0` | Interactive hover state |
| Surface Elevated | `#E8E2DA` | Elevated elements, active tabs |
| Border | `#E8E2DA` | Standard borders |
| Border Subtle | `#F0EBE4` | Subtle dividers |
| Text Primary | `#1A1A1A` | Headings, body text |
| Text Secondary | `#6B6560` | Labels, secondary info |
| Text Tertiary | `#8A8580` | Placeholders, muted text |
| Accent | `#14B8A6` | Teal — buttons, links, active states |
| Accent Hover | `#0D9488` | Darker teal on hover |
| Accent Subtle | `rgba(20, 184, 166, 0.10)` | Teal tint backgrounds |
| Success | `#059669` | Online, completed |
| Success Subtle | `rgba(5, 150, 105, 0.10)` | |
| Warning | `#D97706` | Busy, running |
| Warning Subtle | `rgba(217, 119, 6, 0.10)` | |
| Danger | `#C53030` | Offline, failed, error |
| Danger Subtle | `rgba(197, 48, 48, 0.10)` | |
| Info | `#8168E0` | Warm indigo — dispatched, info |
| Info Subtle | `rgba(129, 104, 224, 0.10)` | |

### Dark Theme

| Role | Value | Notes |
|------|-------|-------|
| Background | `#222228` | Lifted from current `#0f1117` |
| Surface | `#2C2C33` | Cards, sidebar, panels |
| Surface Hover | `#333340` | Interactive hover state |
| Surface Elevated | `#38384A` | Elevated elements, active tabs |
| Border | `#38383F` | Standard borders |
| Border Subtle | `#2F2F38` | Subtle dividers |
| Text Primary | `#E8E8F0` | Headings, body text |
| Text Secondary | `#9090A0` | Labels, secondary info |
| Text Tertiary | `#707078` | Placeholders, muted text |
| Accent | `#2DD4BF` | Brighter teal for dark backgrounds |
| Accent Hover | `#5EEAD4` | Lighter teal on hover |
| Accent Subtle | `rgba(45, 212, 191, 0.12)` | Teal tint backgrounds |
| Success | `#34D399` | Online, completed |
| Success Subtle | `rgba(52, 211, 153, 0.12)` | |
| Warning | `#FBBF24` | Busy, running |
| Warning Subtle | `rgba(251, 191, 36, 0.10)` | |
| Danger | `#F87171` | Offline, failed, error |
| Danger Subtle | `rgba(248, 113, 113, 0.12)` | |
| Info | `#A78BFA` | Warm indigo, brighter for dark bg |
| Info Subtle | `rgba(167, 139, 250, 0.12)` | |

## Theme Switching

### CSS Architecture

- Light theme variables defined on `:root`
- Dark theme variables defined on `[data-theme="dark"]`
- All color references use `var(--name)` — no hardcoded colors in component styles

### JavaScript Behavior

```
1. On page load:
   a. Check localStorage.getItem('agentfleet-theme')
   b. If set → apply that theme
   c. If not set → check window.matchMedia('(prefers-color-scheme: dark)')
   d. Apply result to document.documentElement.dataset.theme

2. matchMedia listener:
   - If no manual override in localStorage → update theme on OS change

3. Toggle button click:
   - Flip current theme
   - Save to localStorage
   - Apply to document.documentElement.dataset.theme
```

### Toggle UI

- Sun/moon icon in the sidebar footer (hub pages)
- Same toggle in the header area for landing.html and setup.html (no sidebar)
- Icon transitions smoothly between sun ↔ moon states

## Files to Modify

All styling is embedded in HTML `<style>` tags. No external CSS files.

| File | Changes |
|------|---------|
| `hub/dashboard.html` | Replace `:root` vars, add `[data-theme="dark"]` block, add toggle + JS |
| `hub/agents.html` | Same pattern |
| `hub/dispatches.html` | Same pattern |
| `hub/settings.html` | Same pattern |
| `hub/landing.html` | Same pattern, toggle in header instead of sidebar |
| `cli/setup.html` | Same pattern, toggle in header instead of sidebar |

### Per-file changes

1. **CSS**: Replace `:root` variables with light palette. Add `[data-theme="dark"]` block with dark palette. Replace any hardcoded color values (e.g., `rgba(124, 108, 240, ...)`) with CSS variable references.

2. **HTML**: Add theme toggle button to sidebar footer (or header for pages without sidebar).

3. **JS**: Add ~15-line theme detection and toggle script at the end of each page's `<script>` block.

## What Does NOT Change

- Layout structure (sidebar, main area, grid systems)
- Spacing, padding, margins
- Border-radius values
- Typography (font families, sizes, weights)
- Animations and transitions
- Component structure (stats cards, panels, agent cards, dispatch cards, forms, tabs)
- Functional JavaScript (API calls, WebSocket, data rendering)
- `hub/index.js` server code

## Success Criteria

- Light theme is the default and feels warm and inviting
- Dark theme is noticeably lighter than the current theme
- Theme toggle works and persists across page navigations
- OS preference is respected when no manual override exists
- All semantic status colors (success/warning/danger/info) maintain readable contrast on both backgrounds
- No layout or functional regressions
