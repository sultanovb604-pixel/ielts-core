# Precision Studio deployment handoff

## Current status

- Candidate: `dpl_9oYzwciVcXzKTkH8psWvntdHTvMG`, READY.
- URL: https://ielts-core-fim4r5e6s-sultanovb604-8180s-projects.vercel.app/english
- Production domain remains on `dpl_EoF2yR5G5R9QJCuA6ABs2FYcZzRs`.
- Candidate uses the production environment but was created with `autoAssignCustomDomains: false` (skip-domain). It has NOT been promoted.
- Pending gate: authenticated browser access to the protected candidate for runtime smoke checks. Normal browser navigation reaches the Vercel login form; the owner has been asked to sign in.
- A proposed temporary automation-bypass QA credential was denied by the approval system. The proxy was NOT started and no credential was created by that attempt. Do not retry that mechanism without the user's explicit informed approval.

## Verified source safety

The candidate was constructed from the current production source manifest, not from the older backend in this Git checkout. All 577 existing paths remain present; the candidate has 580 files. SHA comparison found exactly:

- Changed: `english.html`.
- Added: `english-precision.css`, `english-precision.js`, `assets/precision-hero-backdrop.png`.
- Missing: none.
- Unchanged: server, configuration, auth scripts, other pages, existing assets, data catalogs and exam materials.

No database records, application credentials or environment variables were changed. Never deploy this checkout wholesale or merge its old backend into production.

## Local verification

See `design-qa.md` for desktop/reference comparison, responsive screenshots, interactions, console and syntax checks. The local preview at http://127.0.0.1:4196/english is a read-only overlay of the four changed files on current public assets. It intentionally rejects POST and is not a substitute for successful authentication testing.

## Remaining release steps

1. Sign in normally to Vercel in the protected-candidate browser tab.
2. Verify candidate homepage, new assets, tab/radio interactions and health; do not create real accounts just for this design pass.
3. Recheck that the live domain still points to the expected baseline.
4. Promote this exact READY candidate, then verify the live domain and scan runtime error logs.
5. Record final production status here. The previous deployment remains the rollback target.

Source verification artifact: `../precision-qa/source-verification.json`. Deployment preparation tool: `../precision-deployment.cjs` (prepare/create/verify); do not run create again for this existing candidate.
