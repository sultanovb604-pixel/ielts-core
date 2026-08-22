# Google registration and sign-in setup

1. Open Google Cloud Console and create or select a project.
2. Configure the OAuth consent screen.
3. Create an **OAuth client ID** with application type **Web application**.
4. Add the exact redirect URI:
   - Local: `http://127.0.0.1:4173/api/auth/google/callback`
   - Production: `https://YOUR-DOMAIN/api/auth/google/callback`
5. Copy `.env.example` to `.env`, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a strong `SESSION_SECRET`. On production hosting, configure the same values as protected environment variables instead of uploading `.env`.
6. Restart the Node server.

The same Google button handles both registration and sign-in. A verified Google email creates a Free student account on first use and opens the existing account on later visits. Vortex stores access separately as `plan: "free"` or `plan: "premium"`; signing in with Google does not automatically grant Premium.

The Google button remains visible but reports a clear configuration error until both Google credentials are present. Never commit `.env` or expose the client secret in frontend code.
