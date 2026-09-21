---
version: 1.0.0
name: VNT Core & Nomaden
description: High-contrast ISP network operations telemetry design system anchored in VNT Crimson Red (#E41919), Nomaden Electric Gold (#FFCE00), and Cinema Obsidian (#0B0F17).
colors:
  primary: "#E41919"
  primary-hover: "#B91C1C"
  secondary: "#FFCE00"
  secondary-hover: "#E5B800"
  dark: "#111111"
  muted: "#64748B"
  neutral: "#0B0F17"
  surface: "#FFFFFF"
  surface-dark: "#161E2E"
  surface-subtle: "#F8FAFC"
  border: "#E2E8F0"
  border-dark: "#242E42"
  on-primary: "#FFFFFF"
  on-secondary: "#0B0F17"
  on-dark: "#FFFFFF"
  on-surface: "#111111"
typography:
  h1:
    fontFamily: Causten, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 3.5rem
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  h2:
    fontFamily: Causten, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 2.5rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h3:
    fontFamily: Causten, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.3
  body-lg:
    fontFamily: Causten, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 1.25rem
    fontWeight: 300
    lineHeight: 1.6
  body-md:
    fontFamily: Causten, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Causten, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 0.75rem
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  sm: 8px
  md: 16px
  lg: 32px
  xl: 48px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: 12px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 12px
  button-pill-nav:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.full}"
    padding: 8px
  button-pill-nav-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: 8px
  card-feature:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.dark}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-highlight:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.dark}"
    rounded: "{rounded.xl}"
    padding: 32px
  badge:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.tertiary}"
    rounded: "{rounded.full}"
    padding: 6px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: 12px
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
---

## Overview

A clean, modern SaaS design system characterized by friendly geometry, open negative space, and vibrant azure-blue accents.

The visual language balances structural clarity with warmth: crisp whites and soft cool-tinted canvases (`#F7FBFF`) provide a breathable foundation, energizing electric blues (`#0A72D4`) drive user focus, and rich cyan accents (`#0369A1`) lend subtle depth. Rounded pill silhouettes and generous 32px/48px container radiuses create an approachable, human-centered digital experience.

## Colors

- **Primary ({colors.primary}):** Electric vibrant blue for high-emphasis CTAs, active navigation items, and key focal points.
- **Primary Hover ({colors.primary-hover}):** Deepened royal blue for interactive hover and pressed feedback states.
- **Secondary ({colors.secondary}):** High-legibility slate gray (`#4B5563`) for body copy, subheaders, and neutral descriptions.
- **Tertiary ({colors.tertiary}):** Deep ocean cyan (`#0369A1`) for highlights, badge accents, and high-contrast tags.
- **Neutral ({colors.neutral}):** Cool soft-blue tint (`#F7FBFF`) used for section canvas backgrounds and subtle surface layering.
- **Surface ({colors.surface}):** Pure white (`#FFFFFF`) for cards, elevated modals, and floating navigation pills.
- **Dark ({colors.dark}):** Deep charcoal ink (`#1A202C`) for high-contrast headlines and primary readability.
- **Muted ({colors.muted}):** Balanced cool slate (`#64748B`) for input placeholders, secondary metadata, and icon accents.
- **Border ({colors.border}):** Subtle perimeter stroke and divider tone (`#E2E8F0`) defining cards and segmented containers.

## Typography

Typography relies on **Causten** (or system humanist sans-serif), combining structural precision with open, geometric letterforms.

- **Headlines (H1/H2):** Bold (700) and SemiBold (600) weights with slightly tightened tracking (`-0.025em`) for modern editorial impact.
- **Subheadings & Lead Body:** Light (300) weight at larger sizes (`1.25rem` / `20px`) to create an airy, unhurried reading cadence.
- **Body & Captions:** Regular (400) and Medium (500) weights for crisp legibility across informational copy and dashboards.
- **Badges & Overlines:** Bold (700) uppercase with expanded tracking (`0.08em`) for category labels.

## Layout

- **Baseline Grid:** 4px / 8px scale.
- **Intra-component Gaps:** `md` (16px) for form inputs and icon-label pairings.
- **Card & Grid Spacing:** `lg` (24px) to `xl` (32px) for content grids and feature card layouts.
- **Section Breaks:** `2xl` (48px) to `3xl` (64px) on mobile; expanded to 96px–128px on desktop viewports.
- **Max Width Container:** 1280px (`max-w-7xl`) centered with responsive gutter padding (`px-6` mobile to `px-28` desktop).

## Elevation & Depth

- **Level 1 (Cards):** Soft ambient shadow (`0 8px 30px rgba(0, 0, 0, 0.04)`) over white surfaces.
- **Level 2 (Active CTA & Floating Nav):** Blue-tinted glow shadow (`0 8px 20px -6px rgba(91, 170, 252, 0.6)`).
- **Level 3 (Feature Containers):** Soft deep diffuse shadow (`0 15px 40px -15px rgba(0, 0, 0, 0.15)`).
- **Glassmorphism:** Frosted floating headers using `backdrop-blur-md` with `rgba(255, 255, 255, 0.95)` fill and `1px solid rgba(255, 255, 255, 0.6)` border.

## Shapes

- **Pill Radius (`rounded-full` / `9999px`):** The signature shape. Applied to all action buttons, floating navigation containers, tags, and category chips.
- **Card Radius (`lg` 32px / `xl` 48px):** Broad, friendly rounded corners on major content cards, previews, and section containers.
- **Sub-element Radius (`sm` 8px / `md` 16px):** Used on nested thumbnail tiles, badge icons, and inner widgets.

## Components

- **`button-primary`:** Main high-emphasis CTA. Full pill shape with solid `{colors.primary}` fill and crisp white text.
- **`button-primary-hover`:** State variant for primary button hover and active clicks with darkened blue fill.
- **`button-secondary`:** Outlined or white pill button for secondary actions.
- **`button-pill-nav`:** Segmented pill navigation item with smooth transitions between inactive and active states.
- **`button-pill-nav-active`:** Active navigation pill highlighted with electric blue background.
- **`card-feature`:** Clean white container with 32px border radius, subtle border, and ambient shadow for feature showcases.
- **`card-highlight`:** Light tinted backdrop container (`{colors.neutral}`) with 48px corner radius for hero sections and testimonial highlights.
- **`badge`:** Small pill chip with light tinted background and tertiary cyan typography for feature flags.
- **`input-field`:** Full-pill input container with muted placeholder styling.
- **`divider`:** Subtle 1px structural separator using `{colors.border}`.

## Do's and Don'ts

### Do's
- **Do** maintain generous white space and light cool backgrounds to preserve an open, airy feeling.
- **Do** use `rounded-full` for all buttons, search bars, and interactive chips.
- **Do** reference semantic design tokens (`{colors.primary}`, `{rounded.full}`) rather than hardcoding static hex codes.
- **Do** pair bold headlines with light-weight subheaders (`fontWeight: 300`) to match the signature typographic hierarchy.

### Don'ts
- **Don't** use sharp rectangular buttons or sharp 0px corners on interactive components.
- **Don't** introduce heavy, dark unbranded backgrounds on primary marketing sections.
- **Don't** use arbitrary blue hues outside the defined palette (`#0A72D4`, `#0369A1`, `#005BAE`).
- **Don't** nest variant keys in token definitions (e.g. use `button-primary-hover` as a sibling, not a child).
