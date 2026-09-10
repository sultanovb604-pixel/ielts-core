# Precision Studio deployment handoff

## Deploy Result (updated 2026-09-10)

- URL: https://ieltscore.org/english (redirects to www).
- Target: production; promoted 2026-09-10.
- Status: READY. Deployment: `dpl_J8TrXt8aF5RMiNy4LHEJonWoGNVi`.
- Deployment URL: https://ielts-core-1hwd97xdv-sultanovb604-8180s-projects.vercel.app/english
- Source: preserved production manifest plus homepage patch; design commit `7f1ee01` and subsequent inline-script correction in branch history, NOT a wholesale checkout deployment.
- Framework: Node.js; configured runtime Node 24. Build duration: 75.664 seconds.
- Rollback target: `dpl_EoF2yR5G5R9QJCuA6ABs2FYcZzRs`.

All release gates below were completed with the corrected candidate. The owner completed normal browser authentication. No temporary bypass credential was created and no bypass proxy was started.

The first candidate below was NEVER promoted: its external demo JavaScript was blocked by the existing server allowlist. The corrected candidate embeds the same code inline, following the existing page pattern, without changing CSP or the server allowlist. The unused external file was removed and remains recoverable in Git history.

## Historical first-candidate status (superseded)

- Candidate: `dpl_9oYzwciVcXzKTkH8psWvntdHTvMG`, READY.
- URL: https://ielts-core-fim4r5e6s-sultanovb604-8180s-projects.vercel.app/english
- Production domain remains on `dpl_EoF2yR5G5R9QJCuA6ABs2FYcZzRs`.
- Candidate uses the production environment but was created with `autoAssignCustomDomains: false` (skip-domain). It has NOT been promoted.
- Pending gate: authenticated browser access to the protected candidate for runtime smoke checks. Normal browser navigation reaches the Vercel login form; the owner has been asked to sign in.
- A proposed temporary automation-bypass QA credential was denied by the approval system. The proxy was NOT started and no credential was created by that attempt. Do not retry that mechanism without the user's explicit informed approval.

## Verified source safety

The released candidate was constructed from the production source manifest, not from the older backend in this Git checkout. All 577 existing paths remain present; the released candidate has 579 files. A fresh SHA comparison immediately before promotion found exactly:

- Changed: `english.html`.
- Added: `english-precision.css`, `assets/precision-hero-backdrop.png`.
- Missing: none.
- Unchanged: server, configuration, auth scripts, other pages, existing assets, data catalogs and exam materials.

No database records, application credentials or environment variables were changed. Never deploy this checkout wholesale or merge its old backend into production.

## Local verification

See `design-qa.md` for desktop/reference comparison, responsive screenshots, interactions, console and syntax checks. The local preview at http://127.0.0.1:4196/english is a read-only overlay of the three changed/added files on public assets. It intentionally rejects POST and is not a substitute for successful authentication testing.

## Completed release verification

1. Owner completed normal authentication; corrected candidate passed Listening, ArrowRight-to-Progress, Home-to-Reading, radio selection and practice navigation checks.
2. Confirmed production still matched the expected baseline immediately before promotion.
3. Promoted the exact corrected READY candidate. Domain inspection confirmed it is production; apex and www serve the new design.
4. HTTP 200: health, homepage, signup, login, practice, materials, predictions, pricing, new CSS and background. Guest `/api/auth/me` returned the expected 401.
5. Live browser: new homepage and Listening answer sheet worked; no warnings/errors captured in the fresh tab.

Health reported `healthy` but database status `connecting`. This does NOT establish a successful Supabase connection or successful registration. Google signup, authenticated exam submission and load testing were not repeated in this design-only release.

## Post-Deploy Observability

- Error scan: `vercel logs --level error --since 1h --limit 30` returned "No logs found" after live checks. This limited scan is not proof of absence of all runtime errors.
- Drains: none returned by the team's drains API.
- Monitoring: external log-drain coverage gap identified; no recurring monitor was created.
- Live verification artifact: `../precision-qa/production-verification.json`.

Source verification artifact: `../precision-qa/source-verification.json`. Deployment preparation tool: `../precision-deployment.cjs` (prepare/create/verify); do not run create again for this existing candidate.
