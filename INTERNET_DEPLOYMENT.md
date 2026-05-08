# Qouter X Internet Deployment

This is the production setup for signing in from any phone, tablet, laptop, or desktop.

## Target URLs

Use two HTTPS URLs:

```text
Web app: https://app.your-domain.com
API:     https://api.your-domain.com
```

The browser app is built from `apps/desktop` so the hosted site matches the main Qouter X app. The backend is `apps/api`.

## Option A: Render Blueprint

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Render will read `render.yaml` and create:
   - `qouterx-api`
   - `qouterx-web`
   - a persistent disk mounted at `/var/qouterx/data`
4. Set these environment variables on `qouterx-api`:

```text
HOST=0.0.0.0
CLIENT_ORIGIN=https://app.your-domain.com,file://,null
APP_URL=https://app.your-domain.com
API_PUBLIC_URL=https://api.your-domain.com
QOUTERX_DATA_DIR=/var/qouterx/data
ENABLE_FILE_ACTIVITY_WATCHER=0
APP_OWNER_EMAIL=your-admin-email@example.com
```

5. Set these environment variables on `qouterx-web`:

```text
VITE_API_URL=https://api.your-domain.com
VITE_APP_URL=https://app.your-domain.com
```

6. Add custom domains:
   - `api.your-domain.com` to `qouterx-api`
   - `app.your-domain.com` to `qouterx-web`

7. Verify:

```bash
curl https://api.your-domain.com/health
```

Expected:

```json
{"ok":true}
```

## Option B: Docker API + Static Web

Build the API container:

```bash
docker build -f Dockerfile.api -t qouterx-api .
```

Run it:

```bash
docker run -p 3001:3001 \
  -e HOST=0.0.0.0 \
  -e CLIENT_ORIGIN=https://app.your-domain.com,file://,null \
  -e APP_URL=https://app.your-domain.com \
  -e API_PUBLIC_URL=https://api.your-domain.com \
  -e QOUTERX_DATA_DIR=/var/qouterx/data \
  -e ENABLE_FILE_ACTIVITY_WATCHER=0 \
  -v qouterx-data:/var/qouterx/data \
  qouterx-api
```

Build the web app:

```bash
VITE_API_URL=https://api.your-domain.com \
VITE_APP_URL=https://app.your-domain.com \
npm run build:web
```

Host `apps/desktop/dist` on any static host.

## Desktop App Gateway

After the hosted API is live, each desktop app can use it too:

1. Open Qouter X desktop.
2. Go to Settings.
3. Enter `https://api.your-domain.com` under Internet API Gateway.
4. Save.
5. Restart the app.

After that, desktop apps and browser users sign in to the same backend.

## Important Production Notes

- Use HTTPS only.
- Keep `QOUTERX_DATA_DIR` on persistent storage. The app stores runtime data there.
- Do not use `localhost` in production env vars.
- If using Stripe, also set:

```text
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID=...
```

- The API must expose `/health`, `/api/*`, and Socket.IO on the same host.
