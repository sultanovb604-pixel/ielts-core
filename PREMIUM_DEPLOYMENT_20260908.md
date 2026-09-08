# Premium public-page refinement — 2026-09-08

Production: https://ieltscore.org
Deployment: dpl_EoF2yR5G5R9QJCuA6ABs2FYcZzRs (Node.js 24, READY).

## Source safety

GitHub main was older than the live deployment. This branch contains the public-page changes, with the newer shared preloader and Predictions navigation preserved. **Do not deploy this checkout wholesale:** its unchanged backend files are not the latest production source.

The deployed artifact was constructed from all 576 source-file references in production deployment `dpl_7v4suNA88pnUTMWz6t3J4xgVAsDF`, replacing only 11 public HTML/JS files and adding `english-refinement.css`. The server, routing, assets, data catalogs and exam files were retained by their original SHA references. The new deployment has 577 source files and no missing original files. No application environment variables or database records were changed.

## Verification

- Six public pages checked at mobile width; no horizontal overflow. Home and pricing checked at desktop width.
- Login/signup destination links, mobile navigation, Speaking filter and home demo tab switching checked in the browser.
- Production candidate built with production environment and no custom-domain assignment, then promoted after checks.
- Production public pages and stylesheet return HTTP 200; Predictions retained.
- Health reports `healthy`, authentication `ready`, database provider `supabase`; health alone reports connection startup, not a full database integrity test.
- Unauthenticated account lookup returns 401; empty login returns 401; empty signup returns 400, not a server crash.
- No error-level entries returned for this deployment in the one-hour log query after promotion.
- Real Google OAuth, successful account creation, payments, and authenticated exam/dashboard flows were not exercised in this design task.

Previous production deployment remains available for rollback. The isolated preview without production secrets is not suitable for promotion.
