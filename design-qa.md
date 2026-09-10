# Precision Studio home — design QA

Date: 2026-09-09. Selected direction: option 1, “Better practice. Clearer progress.”

## Result

Local design QA: passed for the selected homepage scope. No open P0/P1/P2 findings after iteration. This is not a guarantee of bug-free production or an authenticated exam-flow audit.

## Evidence

- Reference: `C:/Users/user/.codex/generated_images/01a05df0-5f6d-74b2-a8cb-6cf88991e890/exec-686a19e8-1e59-4024-ad78-7930bafd8678.png` (1825 × 862).
- Rendered comparison: `../precision-qa/desktop-final.png`; reference and screenshot opened together in the same comparison input.
- Viewport requested 1825 × 862; browser reported 1826 × 862 CSS pixels because of display scaling. Guest, Reading, no selected answer, scroll at top.
- Responsive evidence: `../precision-qa/mobile.png` (390), `mobile-320-final.png` (320), `tablet-final.png` (1024), `footer-final.png`.
- In-app screenshot capture has visible resampling softness. Actual DOM fonts, line heights and element bounds were checked; these captures do not establish native-pixel sharpness on every device.

## Five fidelity surfaces

| Surface | Assessment |
| --- | --- |
| Typography | Existing Plus Jakarta Sans display and DM Sans body retained; strong two-line title, blue second line, clear body and answer hierarchy. No clipped title at tested widths. |
| Spacing | 1460px hero shell, 64px desktop column gap, normal-flow result strip. Reduced demo height and paragraph spacing after first comparison; next section begins near the reference position (about 11px lower). |
| Layout | Two-column desktop, centered single-column tablet/mobile. 320, 390, 1024 and desktop checks showed no horizontal document overflow. Existing lower sections and routes preserved. |
| Colors | White/navy/blue design retained. Active radios/tabs and focus treatments visible. Fixed low-contrast heading in the existing dark bottom CTA. |
| Image quality | Generated pale-blue backdrop based on the selected reference; no text baked into hero or fake CSS illustration. Existing brand asset and Material Symbols icons retained. Background crop adapts on small screens. |

## Iterations and fixes

1. Initial demo was too tall and moved the next section down: tightened toolbar, passage line height and inner spacing; increased display heading to match reference hierarchy.
2. Timer's display rule could override hidden state: explicit hidden handling added.
3. Existing mobile navigation specificity exposed a hidden Dashboard link to guests: scoped hidden rule corrected and menu retested; the guest menu now excludes Dashboard.
4. Existing bottom CTA had dark heading and no horizontal inner padding: corrected contrast, padding and button width; verified in footer screenshot.
5. Discarded intermediate captures taken after automatic viewport/scroll changes; final comparison is at top of the page in matching desktop state.
6. The first Vercel candidate exposed a deployment-only issue: the unchanged server's public JavaScript allowlist blocked the new external demo file. Moved the same demo logic inline into `english.html`, matching the existing page pattern, and removed the unused external file. Server allowlist and CSP were not weakened. Local click/keyboard/timer tests passed after this correction; the first candidate was not promoted.

## Functional checks

- Reading/Listening/Progress tab clicks; selected ARIA state and panel visibility.
- ArrowRight and Home keyboard tab navigation with roving focus.
- Native answer radio selection visibly checks the chosen answer.
- Listening answer field accepts text; full audio is explicitly outside this preview and linked to existing tests.
- Mobile menu opens/closes; primary CTA navigates to the existing signup form.
- Demo progress and score are explicitly illustrative, not real student outcomes.
- Console captured no warnings/errors in the local homepage checks.
- Inline scripts compile through `vm.Script`; click/keyboard/timer transitions pass `../check-precision-inline.cjs`. Existing `npm run check` also passed after the inline correction.

## Boundaries

Production follow-through (2026-09-10): fixed candidate `dpl_J8TrXt8aF5RMiNy4LHEJonWoGNVi` passed authenticated candidate-browser smoke checks and was promoted to `ieltscore.org`. Public homepage, signup/login, practice, materials, predictions, pricing and new assets returned 200; guest auth returned the expected 401. The live Listening demo worked and the fresh browser console contained no warnings/errors. The post-deploy error-log scan returned no logs. Health reported healthy with database status connecting, so successful database access and registration remain unverified by this pass. See `PRECISION_DEPLOYMENT_20260909.md` for source preservation, rollback and observability details.

Story: visitor opens the redesigned homepage, explores the interactive sample, then follows the existing practice/signup route. Demo interactions are client-only; no database writes, credentials or server configuration changed. Successful Google signup, real exam submission and load testing were not repeated in this design-only pass.

Deployment must preserve all current production source references and replace only `english.html`, adding `english-precision.css` and `assets/precision-hero-backdrop.png`. Never deploy this checkout wholesale: its backend baseline is older than production. See the deployment handoff for final status.
