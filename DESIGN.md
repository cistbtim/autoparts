---
# gstack: design-md-format=spec
name: VelGenius
description: A calm, data-dense workshop and parts-trading tool. Warm paper-grey content, a dark graphite sidebar, and a single orange accent used only where the user must act.
colors:
  primary: "#ff7a2e"
  primary-soft: "#ff9a5c"
  on-primary: "#ffffff"
  background: "#f0ede8"
  surface: "#ffffff"
  surface-muted: "#f5f2ee"
  surface-sunken: "#e8e4de"
  sidebar: "#2b2e3b"
  text: "#1c1c1e"
  text-muted: "#48484a"
  text-subtle: "#8e8e93"
  border: "#e4e1dc"
  border-strong: "#d3cfc8"
  success: "#16a34a"
  warning: "#d97706"
  error: "#dc2626"
  info: "#2563eb"
  dark-background: "#080b12"
  dark-surface: "#0f1420"
  dark-surface-muted: "#161c2d"
  dark-text: "#f1f5f9"
typography:
  display:
    fontFamily: Rajdhani
    fontWeight: 700
    fontSize: 1.75rem
    letterSpacing: 0.01em
  wordmark:
    fontFamily: Barlow Condensed
    fontWeight: 500
    fontSize: 3.375rem
  heading:
    fontFamily: DM Sans
    fontWeight: 700
    fontSize: 1.25rem
    lineHeight: 1.3
  body:
    fontFamily: DM Sans
    fontWeight: 400
    fontSize: 0.875rem
    lineHeight: 1.5
  label:
    fontFamily: DM Sans
    fontWeight: 700
    fontSize: 0.6875rem
    letterSpacing: 0.05em
  mono:
    fontFamily: DM Mono
    fontFeature: tnum
rounded:
  sm: 8px
  md: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.surface-muted}"
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  nav-item:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.text-subtle}"
  nav-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
---

# VelGenius

## Overview

**Creative North Star:** An instrument panel, not a brochure. Everything on screen is either a number someone needs or an action someone can take; decoration earns its place only by helping one of those two.

**Product context:** Multi-role platform for car-parts shops, workshops, scrapyards and suppliers (admin, manager, shipper, stockman, customer, workshop, supplier, licence agent). Used all day, often on a phone in a workshop, in English, Chinese, Thai, Japanese, French, Spanish and Portuguese.

**Mode per surface:** Operate (inventory, orders, stock-take, workshop, supplier portal). Persuade only on the public login, customer shop and catalogue pages.

**Key characteristics:**
- Dark graphite sidebar frames a warm paper-grey workspace.
- One accent colour (orange). Colour elsewhere means status, never decoration.
- Prices, quantities and codes read first: large, tabular, aligned.
- Dense but calm: generous row height, quiet borders, no shadows on resting elements.

**Source of truth in code:** the `:root` and `[data-theme="light"]` variables in `src/styles.js`. This file names them and sets the rules; if they disagree, fix whichever is wrong and update this file in the same change.

## Colors

**Strategy:** Restrained. Neutrals carry the interface; the orange accent is rare and means "do this next".

**Light or dark:** Light workspace by default (people read prices and part numbers in bright workshops and shop counters), with a dark theme available. The sidebar stays dark in both themes so navigation never competes with content.

Use the CSS variables (`--accent`, `--surface`, `--text2`, ...), never raw hex values in components. Orange is for the single primary action per view, the active nav item and focus rings. Success, warning, error and info colours appear only on statuses, validation and alerts, and always with a text label, never colour alone (colour-blind users, and bright screens). Dark-mode surfaces step up in lightness (`dark-background` to `dark-surface` to `dark-surface-muted`) so hierarchy survives without shadows.

## Typography

**Faces:** DM Sans for all interface text (an Operate surface, where a clean humanist sans is the right tool). Rajdhani for large numbers: prices, totals, counts, dashboard figures. DM Mono for part numbers, SKUs, OE codes and order IDs. Barlow Condensed for the VelGenius wordmark only.

All four are bundled via `@fontsource`, so there is no runtime font request.

**Scale:** Page title 28px display, section heading 20px, body 14px, label 11px uppercase with 0.05em tracking. Levels differ by size and weight together, never weight alone.

**Rules:**
- Money, quantities and codes use tabular numerals so columns line up.
- Text must survive translation: Thai, Chinese and French run 20 to 40 percent longer than English. Wrap or truncate with a tooltip, never let it overflow a button.
- Space Grotesk is installed but not used for display; keep it that way.

## Layout

App shell: fixed dark sidebar (collapsible groups) plus a content column on `--bg`. Content sits in cards on `--surface`. Mobile swaps the sidebar for a bottom nav and a "More" sheet.

Spacing follows a 4px base: 4, 8, 12, 16, 24, 32. Page padding 24px desktop, 16px phone. Prefer one clear column of cards over multi-column dashboards; use a grid only for genuinely parallel things (part cards, stat tiles).

Tables are the main workhorse: left-align text, right-align numbers, sticky header, 44px minimum row height on touch devices.

## Elevation & Depth

Resting surfaces are flat: a 1px `--border`, no shadow. Shadows appear only on things that float: modals, dropdowns, toasts (`--shadow`, `--shadow-lg`). The orange `--glow` is reserved for the focused or selected card in the shop, not for buttons or panels.

## Shapes

Radius hierarchy: 8px for controls (buttons, inputs, chips), 14px for cards and modals, full pill for status badges. A nested element's radius is the parent's radius minus the gap between them. Never put a card inside a card; use a divider or a tinted band instead.

## Components

- **Button:** one `btn-primary` per view. Everything else is `btn-ghost`. Hover brightens (`--accent2`), focus shows a 2px accent ring, disabled drops to 50 percent and loses the pointer. Label says the outcome ("Save part", "Create setup link"), not "Submit".
- **Input:** `--surface2` fill, 1.5px border, accent border on focus. Every field has a visible label above it; placeholders are examples, not labels.
- **Table:** row hover is the **pink tint `rgba(236,72,153,.1)`. This is an intentional house style. Do not change it.**
- **Badge/chip:** pill shape, tinted background plus text. Used for status, grade, condition and colour; never as pure decoration.
- **Modal:** for focused, short tasks only. Long or reference-heavy flows get a page or side panel.
- **Every component has all states designed:** default, hover, focus-visible, active, disabled, loading, empty and error. An empty list says what to do next ("No parts yet — click + Add Part"), never a blank box.

## Do's and Don'ts

- Do: take every colour, radius, shadow and spacing from the tokens above.
- Do: keep one primary action per view and put it where the eye ends (top right of the card or the form footer).
- Do: write copy that names the outcome and the object, and route all user-facing text through `t` / `ts()` so every language gets it.
- Do: show money in `Rajdhani`, codes in `DM Mono`, and align them in columns.
- Do: test at 375px wide and with the longest translation (Thai) before calling a screen done.
- Don't: change the pink table-row hover.
- Don't: introduce a second accent colour, gradients on buttons, or glow effects on resting UI.
- Don't: nest cards, or use a coloured left border on a card to signal state (use a tinted background, an icon and a label).
- Don't: rely on emoji as the icon system for new screens. Existing emoji stay until a screen is redone; new work should use one consistent line-icon set at one stroke width.
- Don't: hard-code hex values or pixel sizes that already exist as tokens.

## Motion

- **Approach:** minimal-functional. Motion confirms an action or explains a change; it never decorates.
- **Easing:** enter ease-out, exit ease-in, move ease-in-out.
- **Duration:** hover and press 150 to 180ms (the app default is 0.18s), panels and modals 250ms, nothing over 400ms.
- **The one authored moment:** a part card lifts slightly and gains the accent border when added to the cart.
- Respect `prefers-reduced-motion`: drop to opacity changes only.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-25 | Initial design system written from the existing `src/styles.js` tokens | Owner asked for a DESIGN.md so UI work stays consistent and moves toward a more commercial, polished look. Documented what exists first, then added rules (one primary action, no emoji icons for new work, state coverage, translation-safe layouts). |
| 2026-10-25 | Keep pink table-row hover | Existing intentional house style; recorded so it is never "cleaned up". |
| 2026-10-25 | Keep orange as the only accent; light workspace + dark sidebar | Matches current brand and the use scene (bright workshops and counters). |
