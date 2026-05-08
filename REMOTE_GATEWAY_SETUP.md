## Qouter X Internet Gateway

Use this when you want desktop apps on different networks to connect to one hosted API.

### 1. Host the API

Run `apps/api` on a public server behind HTTPS.

Example env:

```bash
PORT=3001
HOST=0.0.0.0
CLIENT_ORIGIN=https://app.qouterx.com,file://,null
APP_URL=https://app.qouterx.com
API_PUBLIC_URL=https://api.qouterx.com
QOUTERX_DATA_DIR=/var/qouterx/data
ENABLE_FILE_ACTIVITY_WATCHER=0
```

If you use Stripe, also set:

```bash
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID=...
```

### 2. Expose the API

Your server must expose:

- `/health`
- `/api/*`
- Socket.IO on the same domain

Recommended public URL:

```text
https://api.qouterx.com
```

### 3. Point desktop apps at the gateway

In the desktop app:

1. Open `Settings`
2. Find `Internet API Gateway`
3. Enter your public API URL
4. Click `Save Gateway`
5. Restart the app

### 4. What happens after that

- the app stops depending on the local bundled API
- all machines can use the same hosted backend
- machines on different Wi‑Fi networks can connect to the same server

### 5. Important

- the public API must be reachable over the internet
- use HTTPS
- open the firewall / reverse proxy for your API host
- use a real domain if you want stable installs and updates
