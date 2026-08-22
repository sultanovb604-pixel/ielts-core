# Vortex English — Product, UX & Technical Audit

**Audit Date:** August 11, 2026  
**Auditor:** Antigravity Parallel Product-Audit Assistant  
**Source of Truth:** `C:\Users\user\Desktop\vortex english`  
**Scope:** Audit & Content Inventory Only (Read-Only Mode)

---

## Executive Audit Summary

| Severity | Count | Primary Impact Areas |
| :--- | :---: | :--- |
| **Critical** | **2** | Unauthenticated user lock-out from library, Fake listening exam & lost answer submission |
| **High** | **6** | Unusable PDF/DOCX files in exam folder, Hardcoded band score calculation bug, Missing core content categories (Audio/Speaking/Books), Third-party branding/Telegram leaks, Mobile layout overflow |
| **Medium** | **4** | Legacy Uzbek language strings & orphan scripts, Legacy Math/Olympiad backend code & admin fields, Unhandled Google OAuth UI errors, Accessibility & contrast deficits |
| **Low** | **1** | Uncompressed asset images & unminified redundant CSS |
| **Total Findings** | **13** |  |

---

## Detailed Audit Findings

## [AUDIT-01] Guest Users Completely Blocked from Viewing Materials Library
- Severity: Critical
- Area: `/english/materials`, `english-materials.html` (L9), `english-materials.js` (L100-106), `server.js` (L610-611)
- Evidence: 
  In `english-materials.html` (line 9):
  ```html
  <script>if(!localStorage.getItem('vortex-english-token'))location.replace('/english/login?next='+encodeURIComponent(location.pathname+location.search))</script>
  ```
  In `server.js` (lines 610-611):
  ```javascript
  const user = studentFromRequest(req, data);
  if (!user) return json(res, 401, { error: "Sign in to open the learning library." });
  ```
  Public landing page CTAs ("Explore real IELTS materials", "Library") direct guest visitors to `/english/materials`, which immediately forces a 302/JS redirect to `/english/login`.
- User impact: Destroys top-of-funnel conversion. Visitors wanting to explore available IELTS tests and free articles cannot view the catalog before registering.
- Recommendation: Allow `/api/resources` to serve public catalog metadata (with `locked: true` or `locked: false` flags) to unauthenticated requests. Remove the forced inline script redirect on `english-materials.html` and allow guest browsing of free and premium item cards.
- Acceptance criteria: Unauthenticated guest visitors can open `/english/materials`, filter free and premium items, search by title, and see "Sign in to start" on test cards.

## [AUDIT-02] IELTS Listening Practice Test Has No Audio & Answers Are Never Saved
- Severity: Critical
- Area: `/english/exam`, `english-exam.html`, `english-exam.js` (L56-61, L103-107), `server.js` (L1138-1142)
- Evidence: 
  `english-exam.js` (lines 56-59) uses `requestAnimationFrame` to increment a fake timer on `<input data-audio-range>`. There is no `<audio>` HTML element or audio media file served.
  In `english-exam.js` (lines 103-107):
  ```javascript
  reviewDialog.addEventListener('close',() => {
    if(reviewDialog.returnValue!=='submit') return;
    document.querySelector('[data-review]').textContent='Practice submitted';
    document.querySelector('[data-review]').disabled=true;
  });
  ```
  Submitting the listening test modal only disables the button locally. No API request is made to save student answers, score the test, or record progress in `server.js`.
- User impact: Severe breach of trust. Students encounter a fake audio player and lose all completed answers upon leaving the page.
- Recommendation: Connect a real HTML5 `<audio>` element with actual listening MP3 assets, and implement a dedicated backend submission endpoint `/api/listening-attempts` (or reuse `/api/results`) to grade responses, calculate IELTS Listening Band scores, and persist results to the student dashboard.
- Acceptance criteria: Listening test plays real audio tracks, POSTs student responses to `/api/listening-attempts`, grades answers against a key, and records the score on the student dashboard.

## [AUDIT-03] Raw PDF and DOCX Files in Reading Folder Ignored by Server
- Severity: High
- Area: `english-reading-materials/`, `server.js` (L115-145)
- Evidence: 
  `english-reading-materials/` contains 4 raw PDF files (`Reading Day54.pdf`, `Reading Day56 (2).pdf`, `Reading Day58 (2).pdf`, `Related Passage 3.pdf`) and 1 MS Word document (`Reading test passage 2 and 3 (2).docx`).
  In `server.js` (lines 115-117):
  ```javascript
  const catalog = fs.readdirSync(READING_MATERIALS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.html?$/i.test(entry.name))
  ```
  The server filters exclusively for `.html` / `.htm` files. Non-HTML files are ignored, causing orphaned files and potential broken download links.
- User impact: Dead material files consume disk space without being accessible; `.docx` files trigger file downloads instead of web exam rendering.
- Recommendation: Convert `Reading test passage 2 and 3 (2).docx` and reading PDFs into valid computer-delivered HTML test formats, or rehome non-exam PDFs to `data/english-content/` with entries in `catalog.json`.
- Acceptance criteria: All files residing in `english-reading-materials/` are valid HTML test files indexed and served by `readReadingCatalog()`.

## [AUDIT-04] Reading Band Calculations Return Null for Single-Passage Practice
- Severity: High
- Area: `server.js` (L568-585, `readingBand` function), `english-account.js` (L41, L204)
- Evidence: 
  In `server.js` (line 568):
  ```javascript
  function readingBand(correct, total) {
    if (total !== 40) return null;
    ...
  }
  ```
  Any single-passage practice test (13 or 14 questions) receives `band: null`. On the student dashboard, completed passage attempts render as "Band null" or fallback to generic "Practice", leaving students with incomplete feedback.
- User impact: Distorts student progress analytics. Completing 14/14 questions on a focused passage test yields `band: null`, breaking the band score trend chart.
- Recommendation: Implement proportional band score scaling for passage-level practice (e.g. 13-14 questions mapped to an estimated band equivalent) or clearly separate full-test official Bands from passage accuracy percentages.
- Acceptance criteria: Single-passage practice attempts return a scaled band estimate or accuracy percentage without returning `band: null`.

## [AUDIT-05] Orphaned Stale Legacy Code Containing Uzbek Language Strings
- Severity: Medium
- Area: `english.js` (L11-27), `english-admin.js` (L6-10), `server.js` (L565, L1022, L1124, L1139, L1170)
- Evidence: 
  - `english.js` contains hardcoded Uzbek text (`"Kirish →"`, `"Ingliz tilini his qilib o'rganing."`, `"BEPUL BOSHLASH"`, `"Barchasi"`).
  - `english-admin.js` contains `"Darajani tanlang"`, `"SINF"`, `"DARAJA"`.
  - `server.js` contains Uzbek error messages: `Reading material topilmadi` (L1124), `Exam template topilmadi` (L1139), `Olimpiada nomi...` (L1022), and Uzbek locale sorting `localeCompare(b.name, "uz")` (L565).
  - Boot message in `server.js` (L1170): `Vortex Math: http://127.0.0.1:4173`.
- User impact: Violates the mandatory project requirement ("User-facing language must be English only. No Math/Olympiad/legacy content"). Causes broken UX if legacy scripts run.
- Recommendation: Remove `english.js` and `english-admin.js`. Replace all Uzbek strings in `server.js` API error responses with clear English text. Change locale sorting to `"en"`. Remove "Vortex Math" boot message.
- Acceptance criteria: Grepping the codebase for Uzbek strings or Math references returns 0 results in active code paths and user responses.

## [AUDIT-06] Missing Core Content Types Advertised in Courses, Practice, and Library Nav
- Severity: High
- Area: `/english/courses`, `/english/practice`, `/english/materials`, `english-courses.html`, `english-practice.html`, `english-materials.html`
- Evidence: 
  `english-courses.html` advertises "Round Up and foundation books" and "Elementary course books".
  `english-practice.html` advertises "Listening (Audio)" and "Speaking (Daily questions, model answers)".
  `english-materials.html` includes filter buttons for `Speaking samples`, `Speaking questions`, `Books`, `Listening`.
  Repository scan reveals 0 `.mp3`/`.wav` audio files, 0 speaking sample/question files, and 0 beginner/elementary books. Filtering by these categories produces empty lists.
- User impact: Misleads students into expecting speaking, listening audio, and course books, damaging platform credibility upon encountering empty categories.
- Recommendation: Either upload initial seed content for Books, Speaking, and Listening, or hide/disable these filter categories with a "Coming Soon" badge until content is populated.
- Acceptance criteria: Every filter category in the Materials Library returns at least 1 working resource or clearly indicates "Coming Soon" without broken filters.

## [AUDIT-07] Admin Panel Features Legacy Math "Olympiads" and Lacks Direct File Uploads
- Severity: Medium
- Area: `/admin.html`, `admin.js`, `server.js` (L958-1033)
- Evidence: 
  `server.js` contains `/api/admin/olympiads` endpoints and data structures (`data.olympiads`).
  Admin resource creation form (`admin.html` L48-63) requires entering an external "Secure URL" (`https://...`). It does NOT support direct file upload for PDFs or audio tracks, nor does it edit `catalog.json` or `english-reading-materials/`.
- User impact: Administrators cannot manage or upload real platform materials directly through the admin interface without manual filesystem access. Stale Olympiad code clutters backend state.
- Recommendation: Remove `/api/admin/olympiads` routes and backend state. Upgrade the Admin panel to support actual material file uploads and catalog metadata editing.
- Acceptance criteria: Admin panel allows uploading PDF/audio materials directly and editing English catalog entries without legacy Olympiad fields.

## [AUDIT-08] Google OAuth Configuration Flow Returns Unhandled UI Error when Credentials Missing
- Severity: Medium
- Area: `server.js` (L734-738), `english-auth.js` (L17-25), `/english/login`, `/english/signup`
- Evidence: Google Sign-in buttons are visible on `/english/login` and `/english/signup`. Clicking the button when `GOOGLE_CLIENT_ID` is unconfigured triggers a redirect to `/english/login?google_error=Google%20sign-in%20is%20not%20configured...`. While error handling exists, the button remains prominent for users even though Google Auth requires production credentials.
- User impact: User attempts to sign in with Google, gets redirected back with an error toast, causing confusion.
- Recommendation: Query `/api/auth/google/config` on login/signup page load; if `enabled: false`, disable or hide the "Continue with Google" button or show a clear tooltip "Google sign-in available in production".
- Acceptance criteria: Google auth button dynamically disables/hides when `enabled: false` is returned by `/api/auth/google/config`.

## [AUDIT-09] Unsanitized Third-Party Telegram Links, Watermarks, and Brand Leaks in Reading Files
- Severity: High
- Area: `english-reading-materials/` (21 files including `R (3) (2).html`, `R (36).html`, `R (46).html`, `R (49).html`, `Reading (7).html`), `server.js` (L250-262)
- Evidence: 21 HTML reading material files contain embedded Telegram links (`t.me/...`), channel handles (`@ielts_material_full`, `@mindless_writer`, `@fozilbek_ielts`), and text watermarks ("For More Authentic tests you need to buy Premium Service"). `server.js` sanitizes some of these dynamically in `sanitizeReadingHtml()` on output, but several unhandled variations exist in raw files (e.g. inline styles, external fonts, telegram tracking scripts).
- User impact: Looks unedited and unprofessional, leaks competing Telegram channels, and undermines product identity.
- Recommendation: Run a clean batch sanitization script directly on `english-reading-materials/*.html` files to permanently strip all third-party branding, Telegram links, and watermarks from the source files.
- Acceptance criteria: Raw HTML source files in `english-reading-materials` contain zero references to third-party Telegram channels or watermarks.

## [AUDIT-10] Mobile & Tablet Navigation / Sidebar Layout Overflow & Modals
- Severity: High
- Area: Mobile viewport (< 768px), `member-sidebar`, IELTS Reading side-by-side exam view
- Evidence: 
  On mobile screens (<640px), the computer-delivered Reading test layout side-by-side passage and question container overflows horizontally.
  In `english-site.js`, `mountMemberSidebar` adds `.member-sidebar`, but on tablet/mobile devices, switching tabs or clicking outside leaves the overlay backdrop visible if touch events fire twice.
  Sticky result navigation modal bar (`.vortex-result-nav`) overlaps question inputs on small mobile screens.
- User impact: Students on phones/tablets struggle to read passages while answering questions; buttons get cut off or hidden behind overlays.
- Recommendation: Implement a responsive single-column tabbed view (Passage / Questions toggle) for IELTS Reading on mobile viewports (<768px), and improve backdrop overlay touch handlers.
- Acceptance criteria: Full reading test works seamlessly on mobile devices with a toggle button between Passage and Question pane without horizontal scroll overflow.

## [AUDIT-11] Missing Accessibility Basics: Color Contrast, ARIA Labels, and Keyboard Focus Traps
- Severity: Medium
- Area: `english-materials.html`, `english-account.html`, `english-exam.html`, `english-lesson.html`
- Evidence: 
  Filter tags on `english-materials.html` use light blue text on light gray background (`#63738e` on `#f1f5f9`), failing WCAG 2.1 AA 4.5:1 contrast ratio.
  Canvas charts (`scoreTrendChart` and `answerOutcomeChart`) lack accessible text equivalents for screen readers beyond basic `aria-label`.
  Interactive article reader selection toolbar (`readerSelectionTools`) cannot be focused or operated via keyboard navigation (mouse/touch events only).
- User impact: Excludes users relying on screen readers or keyboard navigation; hard to read for visually impaired learners.
- Recommendation: Fix color contrast to meet 4.5:1 minimum ratio, add fallback text tables for canvas charts, and enable keyboard shortcuts for article highlighting.
- Acceptance criteria: All interactive controls are reachable via keyboard, contrast ratios pass WCAG AA, and screen readers can read progress data.

## [AUDIT-12] Inconsistent Access-Control Enforcement Between PDF Scan Articles and Interactive Premium Reader
- Severity: High
- Area: `/api/article-reader`, `/english/content-file`, `server.js` (L629-645, L1110-1121), `english-lesson.js` (L165-179)
- Evidence: In `server.js`, `/api/article-reader` requires `user.plan === 'premium'`. However, for articles with `access: "free"` in `catalog.json` (e.g. `article-01-happiness-and-longevity`), if a Free user opens the article on `english-lesson.html`, it falls back to serving the raw PDF file via `/english/content-file`. But if a Premium user opens the same article, it loads the interactive mode. This creates an unstated dual-experience where Free users get raw PDF and Premium users get interactive text, without clear UI badges explaining why.
- User impact: Confuses learners when free articles appear as plain PDFs without interactive features, while catalog calls them "Article + practice".
- Recommendation: Clearly badge materials in the Library as "Free PDF Edition" vs "Premium Interactive Edition", and ensure access control is explicit.
- Acceptance criteria: Catalog and library cards explicitly state whether an item includes the Free PDF or Premium Interactive Reader.

## [AUDIT-13] Performance & Bundle Assets: Uncompressed Large Image Files and Duplicate CSS Files
- Severity: Low
- Area: `/assets/` directory (`english-hero-books.png` 1.7MB, `vortex-option3-reference.png` 1.5MB, `vortex-design-qa-comparison.png` 2.1MB), CSS files (`styles.css`, `atlas.css`, `english-pages.css`, `english-product-v4.css`)
- Evidence: Multiple PNG files in `/assets/` exceed 1.5MB - 2.1MB. Total CSS footprint across 14 separate CSS files exceeds 260KB of un-minified styles with overlapping rules.
- User impact: Slow initial page load speeds on mobile networks.
- Recommendation: Compress hero PNGs to WebP/AVIF (<150KB), consolidate redundant CSS files (`german-inspired.css`, `magic-vortex.css`, `vortex-signature.css`, `english-v2.css`).
- Acceptance criteria: Assets directory image sizes reduced by >80%, CSS footprint consolidated.

---

## Top 10 Fixes Before Production Launch

1. **[AUDIT-01] Open Library Catalog to Unauthenticated Visitors**: Remove forced redirect on `english-materials.html` and update `/api/resources` to allow public browsing of free/premium cards.
2. **[AUDIT-02] Connect Real Audio & Answer Submission for IELTS Listening**: Wire actual MP3 audio files to `<audio>` elements and persist submissions to `/api/listening-attempts`.
3. **[AUDIT-03] Clean & Convert Raw Reading Materials**: Convert `Reading test passage 2 and 3 (2).docx` to HTML and resolve raw PDF files in `english-reading-materials/`.
4. **[AUDIT-04] Fix Reading Band Calculations for Single Passages**: Implement proportional band scaling for 13-14 question passage practice to prevent `band: null` bugs.
5. **[AUDIT-05] Purge Legacy Uzbek Strings & Math Code**: Delete `english.js` and `english-admin.js`, update `server.js` API error responses to English, and remove "Vortex Math" references.
6. **[AUDIT-06] Reconcile Advertised Content vs Available Repository Content**: Add seed content or add "Coming Soon" badges to Listening, Speaking, and Books filters.
7. **[AUDIT-07] Permanently Sanitize Third-Party Telegram Branding**: Run a batch script on raw HTML reading files to strip Telegram handles, watermarks, and tracking scripts.
8. **[AUDIT-08] Dynamic Google OAuth UI State**: Hide or gracefully disable Google Auth buttons when `GOOGLE_CLIENT_ID` is unconfigured.
9. **[AUDIT-09] Responsive IELTS Reading Split View for Mobile**: Add a tabbed Passage / Questions toggle for viewports under 768px to eliminate horizontal scrolling.
10. **[AUDIT-10] Upgrade Admin Panel to Manage Native English Materials**: Remove legacy Olympiads management and implement direct file uploads for PDF/audio files.

---

## Questions / Decisions Required from Product Owner

1. **Library Access for Guest Visitors**: Should guest users be able to view the entire Materials Library catalog (with Premium locks clearly marked) before registering, or should they only see a curated subset on the homepage? *(Recommended: Allow full guest browsing of catalog; require sign-in only to start tests/lessons).*
2. **Listening Test Audio Assets**: Does the team have MP3 audio recordings ready for IELTS Listening Test 01 (and subsequent tests), or should Listening be marked as "Coming Soon in Beta"? *(Recommended: Attach actual MP3s before launching Listening).*
3. **Single-Passage Band Scores**: Should completing a 13 or 14-question passage practice return an estimated Band score (e.g. Band 7.0), or only a percentage accuracy score (e.g. 85%)? *(Recommended: Show percentage accuracy + estimated Band equivalency).*
4. **Mature Content Warning Strategy**: Articles #07 and #08 (`article-07-hunting-missys-killer.pdf` and `article-08-a-stolen-life.pdf`) contain investigative crime content marked "Mature crime content". Should these remain Premium articles with explicit content warning modals, or be replaced with general academic topics?
5. **Beginner / Elementary Curriculum Scope**: Since the repository currently contains mostly IELTS-level materials, should Beginner (A1) and Elementary (A2) paths show curated foundation articles and reading passages, or be labeled as "Phase 2 Roadmap"?
