# Auto Updates

This app uses:

- `electron-builder`
- `electron-updater`
- GitHub Releases as the update source

The Electron shell configuration lives in:

- `/Users/shaunknight/Desktop/reimec-flow/apps/desktop-shell/main.cjs`
- `/Users/shaunknight/Desktop/reimec-flow/apps/desktop-shell/preload.cjs`
- `/Users/shaunknight/Desktop/reimec-flow/apps/desktop-shell/package.json`

## Setup

Set these environment variables before building or publishing:

```bash
export GH_OWNER=YOUR_GITHUB_USERNAME
export GH_REPO=YOUR_REPO_NAME
export GH_TOKEN=YOUR_GITHUB_PERSONAL_ACCESS_TOKEN
```

`GH_TOKEN` needs permission to create and upload GitHub Releases.

## Build Commands

From the repo root:

```bash
npm --workspace=apps/desktop-shell run build
npm --workspace=apps/desktop-shell run dist
npm --workspace=apps/desktop-shell run publish
```

What they do:

- `build`: creates an unpacked build
- `dist`: creates installable artifacts
- `publish`: creates artifacts and publishes them to GitHub Releases

## How To Publish A New Version

1. Update the app version in `/Users/shaunknight/Desktop/reimec-flow/apps/desktop-shell/package.json`.
2. Commit the version change.
3. Build and publish:

```bash
npm --workspace=apps/desktop-shell run publish
```

4. `electron-builder` uploads the new release files to GitHub Releases.

## How Users Receive Updates

1. The packaged app checks GitHub Releases on startup.
2. The app can also check manually from:
   - the app menu
   - the update panel in Settings
3. If a newer release exists:
   - the app downloads it automatically
   - the React UI shows download progress
   - once ready, the UI shows `Restart and Install`
4. The update is only installed when the user clicks that button.

## Renderer Update Events

The renderer receives update state changes from the Electron main process:

- `checking-for-update`
- `update-available`
- `update-not-available`
- `download-progress`
- `update-downloaded`
- `error`

These are sent through the preload bridge as `desktop:update-status`.

## Local Testing

Auto updates do not run in normal dev mode.

To test updates locally:

1. Create a packaged build with `dist`.
2. Install that packaged build.
3. Publish a newer version to GitHub Releases.
4. Launch the installed older version.
5. Use the Settings update panel or app menu to check for updates.

You can also verify the UI wiring in development, but actual update download/install behavior only works in packaged builds.

## Notes

- Mac and Windows are both supported through the existing Electron builder targets.
- The app does not force-close when an update is ready.
- Install only happens after the user clicks `Restart and Install`.
