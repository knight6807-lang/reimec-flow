# Qouter X Mac Installer And Sync

## Build Commands

```bash
npm install
npm run build
npm run dist:mac
```

Optional packaged-app prep without creating the DMG:

```bash
npm run build:mac
```

The macOS installer is written to:

```text
apps/desktop-shell/dist/Qouter X.dmg
```

## What The DMG Installs

- App name: `Qouter X`
- App ID: `com.qouterx.app`
- Installer type: `.dmg`
- Icon source: `apps/desktop-shell/build/icon.icns`

After opening the DMG, drag `Qouter X.app` into `Applications`.

## How The API Starts Automatically

The installed macOS app does not require `npm`, `node`, or a terminal.

On launch, the Electron main process:

1. Finds a free local port starting from `127.0.0.1:3001`
2. Starts the bundled backend automatically
3. Waits for `GET /health`
4. Sends the real API base URL to the renderer through IPC

Renderer APIs:

- `window.qouterx.getApiBaseUrl()`
- `window.qouterx.restartApi()`
- `window.qouterx.onApiStatusChange()`

If startup fails, the app shows:

- current API URL
- `Restart API`
- `Open Logs`

## Where User Data Is Stored

Qouter X stores runtime data under macOS user data, not inside the app bundle:

```text
~/Library/Application Support/Qouter X/
```

Important paths:

- API runtime data: `~/Library/Application Support/Qouter X/backend/`
- Logs: `~/Library/Application Support/Qouter X/logs/`
- Secure store: `~/Library/Application Support/Qouter X/secure-store.json`
- API config: `~/Library/Application Support/Qouter X/api-config.json`
- Database backups: `~/Library/Application Support/Qouter X/backups/`

SQLite-backed module data is stored under the backend data root, including:

- email cache
- stock/material tracking
- smart queue
- part DNA
- cloud sync queue

## Database Backups

Before SQLite migrations run, Qouter X creates a backup copy in:

```text
~/Library/Application Support/Qouter X/backups/
```

Backup format:

```text
app-YYYY-MM-DD-HHMM-<database-name>.db
```

Updates and reinstalls do not overwrite the user data folder.

## Cloud Sync / Reporting

Each installed laptop runs independently:

- Electron UI
- local backend
- local SQLite data

Cloud reporting is optional and offline-first.

Current flow:

1. Device registers itself
2. Heartbeats update last-seen time
3. App events are queued locally
4. Pending events sync later when network is available

Supported event categories include:

- app started
- quote created
- job created / started / completed
- DXF imported
- Part DNA detected
- purchase order detected
- email quote request detected
- stock reserved / used
- error report

## Main/Admin User Reporting

Use **Settings → Company Sync Settings** to configure:

- Enable cloud sync
- Company ID
- Device name
- Device role
- Main/admin mode
- Sync now

Use **Live Company Dashboard** to view:

- connected devices
- device last seen
- jobs completed today
- quotes created today
- recent DXF imports
- purchase orders detected
- recent activity feed
- error reports

## Cloud Provider Modes

Current provider implementations:

- `MockCloudProvider` for local/offline testing
- `SupabaseCloudProvider` placeholder for production wiring

Provider env vars:

```text
QOUTERX_CLOUD_PROVIDER=mock|supabase
QOUTERX_CLOUD_URL=https://your-cloud-endpoint
```

## Testing On Another MacBook

1. Build the DMG with `npm run dist:mac`
2. Copy `Qouter X.dmg` to the other MacBook
3. Install by dragging into `Applications`
4. Open the app
5. Confirm the login screen loads without `Unable to reach API`
6. Open `Settings`
7. Configure `Company Sync Settings`
8. Click `Sync Now`
9. Check `Live Company Dashboard`

If the backend fails to start, inspect:

```text
~/Library/Application Support/Qouter X/logs/api.log
```

## Releasing Updates

1. Bump the app version in `apps/desktop-shell/package.json`
2. Build the packaged app
3. Publish the release artifacts
4. Installed apps check for updates through `electron-updater`

For GitHub Releases, make sure these env vars are available:

```text
GH_OWNER
GH_REPO
GH_TOKEN
```
