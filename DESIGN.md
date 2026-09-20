---
name: 电气仪控实训室
description: 面向手机现场核验的紧凑型实训签到界面。
colors:
  ink: "#10213f"
  muted: "#5d6f8d"
  line: "#e4eaf3"
  surface: "#ffffff"
  canvas: "#f3f6fb"
  blue: "#0b6cf4"
  blue-deep: "#0755c6"
  blue-soft: "#eaf3ff"
  green: "#1eaf72"
  orange: "#b85513"
  danger: "#dd4a4a"
typography:
  display:
    fontFamily: "Source Han Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(28px, 4vw, 42px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Source Han Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(22px, 3vw, 32px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Source Han Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Source Han Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "13px"
    fontWeight: 800
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "18px"
  sheet: "24px 24px 0 0"
  pill: "99px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "54px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px 15px"
  card-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "32px"
  status-hero:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "clamp(24px, 4vw, 42px)"
  checkin-sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
    padding: "12px clamp(22px, 5vw, 40px) 34px"
---

# Design System: 电气仪控实训室

## Overview

**Creative North Star: "Operational Training Console"**

This is an operational, mobile-first interface for recording real training time and on-site photo evidence. It uses a pale gray work canvas, navy identity moments, and electric blue task surfaces to make current status and the next check-in action immediately scannable.

Information is deliberately compact: a live training card leads the dashboard, while progress, statistics, and historical records use quiet white containers. Status is expressed with text plus restrained green, orange, or red accents.

**Key Characteristics:**

- Mobile check-in action remains clear and thumb-reachable.
- Dense, data-led cards use white surfaces and measured shadows.
- Navy frames identity; electric blue identifies active training and primary actions.

## Colors

The palette is an electrical-control-room contrast: cool neutrals carry reading density, while blue reserves visual authority for active work.

### Primary

- **Electric Action Blue:** used for primary buttons, progress, active indicators, and the training-status hero.
- **Deep Action Blue:** used for hover and active training states.
- **Soft Blue Wash:** used behind profile and compact utility icons.

### Neutral

- **Control Navy:** primary text and brand/identity field.
- **Muted Slate:** secondary descriptions, metadata, and record details.
- **Work Canvas:** page background behind dashboard cards.
- **White Surface:** cards, fields, sheets, and navigation.
- **Fine Divider:** quiet boundaries in form and record layouts.

### Status

- **Verified Green:** completed or positive states, always accompanied by a label.
- **Attention Orange:** remaining goal or warning states, always accompanied by a label.
- **Error Red:** field and photo-validation errors.

**The Status-in-Words Rule.** Green, orange, and red support explicit state labels; color never carries the status alone.

## Typography

**Display Font:** Source Han Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif

**Body Font:** Source Han Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif

**Character:** A single Chinese-first sans stack keeps operational copy direct and avoids visual friction between labels, numbers, and short actions. Headlines and key values use heavy weight with compact negative tracking.

### Hierarchy

- **Display** (800, `clamp(28px, 4vw, 42px)`, 1.2): greeting and entry-view title.
- **Headline** (800, `clamp(22px, 3vw, 32px)`, 1.2): training state and section headings.
- **Body** (400, 14px, 1.6): instructions, secondary context, and record metadata.
- **Label** (800, 13px): controls, badges, and compact status text.
- **Timer** (700, `clamp(35px, 6.4vw, 70px)`, tabular numerals): live-duration readout.

**The Numbers-Align Rule.** Duration values use tabular numerals and stay visually distinct from descriptive copy.

## Layout

The entry screen is a two-column identity composition above 720px and stacks into a short navy brand band plus centered form below that width. The dashboard centers within a 1000px content width, then narrows to a 16px mobile gutter. Its priority order is greeting, active training, monthly progress, statistics, and history.

On mobile, the hero action expands to full width; progress details become two columns; statistics remain a compact three-card row; and check-in opens from the bottom edge as a full-width sheet. At 390px, the profile and secondary wordmark details truncate or hide before core task labels do.

## Elevation & Depth

Depth is structural and limited. The canvas stays flat; white reporting cards lift with a single diffuse shadow, active blue status blocks carry a firmer shadow, and the photo sheet rises above a navy backdrop. Focus is an explicit blue outline rather than a shadow-only cue.

### Shadow Vocabulary

- **Surface lift** (`0 18px 45px rgba(0, 0, 0, 0.11)`): summary and history containers.
- **Compact card lift** (`0 12px 30px rgba(0, 0, 0, 0.08)`): statistic cards.
- **Active task lift** (`0 20px 35px rgba(0, 0, 0, 0.2)`): training hero.
- **Sheet lift** (`0 -18px 52px rgba(0, 0, 0, 0.22)`): bottom-sheet check-in.

## Shapes

The form language is gently rounded and practical: fields and primary controls use 12px corners, reporting cards use 16px, the active hero uses 18px, and the bottom sheet has rounded top corners only. Pills are reserved for compact status and progress affordances; dividers are pale and thin.

## Components

### Buttons

**Character:** solid, high-contrast actions for a single next step.

- **Shape:** rounded rectangle (12px) with a 54px minimum height.
- **Primary:** electric blue with white bold text and 12px/20px internal padding.
- **Hover / Focus:** deepens and lifts 1px on hover; visible focus uses a 3px translucent blue outline.
- **Hero action:** reverses to white with blue text inside the active training card.
- **Text action:** no container; electric-blue bold text gains an underline on hover.

### Inputs / Fields

**Character:** white operational fields with a clear but quiet outline.

- **Style:** white fill, fine blue-gray border, and rounded corners (12px).
- **Focus:** a 3px translucent blue outline with 3px offset.
- **Error:** red text is reserved for explicit validation messages beneath the field.

### Cards / Containers

**Character:** clean reporting modules that separate dense facts without visual noise.

- **Corner Style:** 16px for summary, history, and statistic cards; 18px for the training hero.
- **Background:** white for reporting; electric blue for the active training state.
- **Shadow Strategy:** white cards use low surface lift; the hero uses active task lift.
- **Internal Padding:** 32px desktop / 24px mobile for major cards; 22px desktop / 15px mobile for statistics.

### Navigation

**Character:** a slim white top bar that keeps identity present without competing with the task.

- **Style:** 74px desktop / 64px mobile, with a fine bottom divider.
- **Active identity:** electric-blue icon block and pale-blue user label.

### Training Status Hero

**Character:** the dashboard's strongest status surface, combining state, instruction, timer, and the sole primary action.

- **State:** a labeled badge shows readiness or in-progress condition; in-progress adds a green dot.
- **Data:** large timer uses tabular numerals and shares the card with short verification guidance.

### Photo Check-in Sheet

**Character:** a bottom-sheet task completion flow for a mandatory on-site image.

- **Sheet:** white, full-width up to 620px, with 24px rounded top corners, handle, close control, and backdrop.
- **Photo area:** a 15px rounded, dashed blue drop zone that becomes an image preview after selection.
- **Action:** a full-width primary button confirms the check-in after a photo is provided.

## Do's and Don'ts

### Do:

- **Do** lead the member dashboard with the active training state and one clear action.
- **Do** use white cards on the pale canvas for progress, statistics, and history.
- **Do** pair every success, warning, or error color with readable status text.
- **Do** preserve the bottom-sheet photo capture flow for mobile check-in.

### Don't:

- **Don't** use electric blue as a general decorative fill; reserve it for action, active progress, and live training.
- **Don't** replace the photo requirement with a color-only or icon-only state.
- **Don't** introduce heavy borders or dense navigation that competes with training status.
