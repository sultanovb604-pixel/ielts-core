# Vortex English Design QA Report

This report contains implementation-ready design and layout fixes for the current local product. Findings are based on static CSS analysis and UI rules across desktop (1440x900) and mobile (390x844).

## 1. Landing Hero Mobile Image Overflow
* **Severity:** High
* **Route:** `/english`
* **Viewport:** 390x844 (Mobile)
* **Selector/File:** `.landing-art img` (`english-pages.css:502`)
* **Issue:** The base CSS uses a negative inset and expanded width for the desktop illustration (`inset: 0 -42px 0 -22px; width: 116%;`). In the mobile media query (`@media (max-width:560px)`), only `right: 0` and `width: 100%` are declared. Because `left: -22px` is not reset, the image overflows the left side of the screen, breaking horizontal scrolling and responsive layout bounds.
* **Proposed Fix:** Add `inset: 0;` (or `left: 0; right: 0;`) explicitly inside the `@media (max-width:560px)` block to override the negative positioning.
* **Acceptance Criterion:** The hero artwork fits perfectly within a 390px mobile viewport without causing horizontal scrolling or bleeding off-screen.

## 2. Admin Panel Mobile List Overflow
* **Severity:** High
* **Route:** `/admin`
* **Viewport:** 390x844 (Mobile)
* **Selector/File:** `.student-row` (`admin.css:2`)
* **Issue:** On mobile screens (`max-width: 620px`), `.student-row` forces a 3-column grid (`grid-template-columns: 36px minmax(0,1fr) 58px`). Due to the `.panel` padding, the center column for student names becomes excessively tight. Long names or emails will overlap, clip, or break the grid.
* **Proposed Fix:** Simplify the mobile layout by dropping the avatar column or stacking the data. Change to `grid-template-columns: 1fr auto;` and hide the `.avatar` on mobile.
* **Acceptance Criterion:** The student list renders fluidly on 390px screens without text truncation, overlap, or horizontal scrolling.

## 3. Input Focus WCAG Contrast Failure
* **Severity:** Medium
* **Route:** All Routes (`/english/login`, `/english/signup`, `/english/materials`)
* **Viewport:** All
* **Selector/File:** `input:focus-visible`, `.field input:focus` (`english-pages.css:280, 544`)
* **Issue:** Inputs and search fields use a very light focus ring: `box-shadow: 0 0 0 4px rgba(23,105,238,.12)` and `outline: 3px solid rgba(23,105,238,.34)`. This pale blue ring against a white background fails the WCAG 2.1 3:1 non-text contrast ratio, making it inaccessible for keyboard navigation.
* **Proposed Fix:** Remove the transparency. Use a solid 2px outline using the core brand blue: `outline: 2px solid var(--blue); outline-offset: 2px;`.
* **Acceptance Criterion:** All input focus rings meet a minimum 3:1 contrast ratio against their backgrounds.

## 4. Password Toggle Legibility
* **Severity:** Medium
* **Route:** `/english/login`, `/english/signup`, `/english/account`
* **Viewport:** All
* **Selector/File:** `.password-toggle` (`english-pages.css:284`)
* **Issue:** The "Show/Hide" toggle button uses `color: var(--blue)` (#1769ee) on a `background: var(--blue-soft)` (#edf4ff). For small 11px text, this contrast ratio (~4.5:1) is borderline and fails AAA accessibility guidelines, making it difficult to read for visually impaired users.
* **Proposed Fix:** Darken the text color specifically for this button to `var(--blue-dark)` (#0b54c7) to strengthen contrast.
* **Acceptance Criterion:** The password toggle text achieves clear legibility and passes WCAG AAA contrast for small text.

## 5. Abrupt Loading State (Empty State Re-use)
* **Severity:** Low
* **Route:** `/english/materials`
* **Viewport:** 1440x900
* **Selector/File:** `#resourceList .empty` (`english-materials.js:59`)
* **Issue:** On initial load, the JS injects `<div class="empty">...<h2>Loading your library.</h2>...</div>`. This abruptly uses the exact same visual styling as the "No materials found" empty state. Visually, it feels unpolished and unprofessional compared to a standard loading skeleton or dedicated spinner.
* **Proposed Fix:** Add a distinct `.loading-state` class that uses a pulsing skeleton UI or spinner, instead of overloading the dashed-border `.empty` container.
* **Acceptance Criterion:** The materials library displays a distinct loading indicator on initial fetch that does not resemble the empty error state.
