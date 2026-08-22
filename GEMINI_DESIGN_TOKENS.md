# Vortex English Design Tokens & Component Spec

This document defines the atomic design values and reusable component structures for Vortex English, extracted directly from the current production stylesheets (`english-pages.css`, `admin.css`).

## 1. Core Color Palette

### Brand & Interface
*   **Ink (Primary Text):** `--ink: #0b1f44;`
*   **Muted (Secondary Text):** `--muted: #64748f;`
*   **Blue (Primary Brand):** `--blue: #1769ee;`
*   **Blue Dark (Hover State):** `--blue-dark: #0b54c7;`
*   **Blue Soft (Active/Selected Background):** `--blue-soft: #edf4ff;`
*   **Orange (Accent/Eyebrow):** `--orange: #ff735f;`

### Backgrounds & Surfaces
*   **Paper (Cards/Modals):** `--paper: #ffffff;`
*   **Canvas (Page Background):** `--canvas: #f8f9fc;`
*   **Warm (Highlight Background):** `--warm: #fff7ef;`

### Borders & Lines
*   **Line (Dividers/Soft Borders):** `--line: #e1e7f0;`
*   **Line Strong (Inputs/Card Borders):** `--line-strong: #cad4e3;`

### Semantic
*   **Success:** `--success: #087c59;`
*   **Danger (Error/Destructive):** `--danger: #b42318;`
*   **Amber (Warning):** `--amber: #ffad32;`

## 2. Typography

*   **Font Family:** `"DM Sans", system-ui, -apple-system, sans-serif`
*   **Base Weight:** `500` (Medium), `700` (Bold), `800` (Extra Bold)
*   **H1 (Page Title):** `clamp(40px, 5vw, 62px)` | Tracking: `-0.067em` | Line-height: `1.01`
*   **H2 (Section/Card Title):** `clamp(36px, 4vw, 52px)` | Tracking: `-0.045em`
*   **H3:** `25px` | Tracking: `-0.045em`
*   **Eyebrow/Kicker:** `11px` | Weight: `800` | Tracking: `0.09em` | Text-transform: `uppercase`
*   **Body (Intro/Lead):** `17px` | Line-height: `1.65`
*   **Body (Standard):** `14px` | Line-height: `1.55`

## 3. Elevation & Radii

### Shadows
*   **Shadow Small (Cards default):** `--shadow-sm: 0 8px 24px rgba(17,38,79,.06);`
*   **Shadow Medium (Hover/Floating):** `--shadow: 0 18px 50px rgba(17,38,79,.09);`
*   **Shadow Blue (Primary Button):** `--shadow-blue: 0 16px 34px rgba(23,105,238,.22);`

### Border Radii
*   **Cards/Panels:** `18px` to `20px` (varies by container: `--radius: 20px;`)
*   **Buttons:** `11px`
*   **Inputs:** `10px`
*   **Pills/Badges:** `7px` to `14px`

## 4. Layout Metrics

*   **Container Max-Widths:** `.shell` = `1220px`, `.page` = `1180px`
*   **Gaps:** `24px` (Section gaps), `16px` (Card grids), `8px` (Tight elements)
*   **Sidebar (Desktop):** `272px` fixed width
*   **Mobile Breakpoints:** 
    *   `1180px` / `1050px` (Tablet/Grid collapse)
    *   `830px` (Sidebar collapses to hamburger)
    *   `560px` (Mobile layouts)

## 5. Core Components

### Buttons
*   **Primary (`.button.primary`):** Linear gradient (`#2678f6` to `#1260df`), white text, `--shadow-blue`. Hover translates `-2px` Y.
*   **Secondary (`.button.secondary`):** White/transparent background, `--line-strong` border, `--ink` text.
*   **Danger (`.button.danger`):** `#fffafa` background, `#efc9c5` border, `--danger` text.
*   **Text Link (`.text-link`):** `--blue` color, `14px`, `800` weight, with gap for trailing arrows.

### Cards
*   **Standard (`.card`):** `background: var(--paper)`, `border: 1px solid var(--line)`, `border-radius: 18px`, `padding: 28px`, `box-shadow: var(--shadow-sm)`.
*   **Interactive Hover:** `transform: translateY(-5px)`, `border-color: #bdd0ef`, `box-shadow: var(--shadow)`.

### Form Fields
*   **Input/Select (`.field input`):** `min-height: 48px`, `padding: 0 13px`, `border: 1px solid #bbc8db`, `border-radius: 10px`. 
*   **Focus State:** `border-color: var(--blue)`, `box-shadow: 0 0 0 4px rgba(23,105,238,.12)`.
