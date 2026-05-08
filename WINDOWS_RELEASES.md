## Windows Releases

This project now includes a GitHub Actions workflow that builds the Windows installer on a real Windows runner.

Workflow file:
- [.github/workflows/windows-installer.yml](/Users/shaunknight/Desktop/reimec-flow/.github/workflows/windows-installer.yml)

### What it does

- installs the repo on `windows-latest`
- installs the desktop shell dependencies separately
- builds `Qouter X Setup.exe` on Windows
- uploads the installer as a workflow artifact
- publishes to GitHub Releases on `v*` tags

### Why this matters

The Windows installer should be built on Windows, not on macOS, because this app includes platform-sensitive Electron/native dependencies. Building on a Windows runner avoids the “this app can’t run on your PC” class of packaging failures.

### Before first release

1. Push this repo to GitHub.
2. Make sure the GitHub repository name is the one you want your updater to use.
3. The Electron publish config reads:
   - `GH_OWNER`
   - `GH_REPO`
4. The workflow sets those automatically from the GitHub repo context.

### Build a test installer manually from GitHub

1. Open GitHub.
2. Go to `Actions`.
3. Open `Windows Installer`.
4. Click `Run workflow`.
5. Leave `Publish build to GitHub Releases` unchecked if you only want an artifact.
6. Download the artifact from the workflow run.

### Publish a release for auto-updates

Use a Git tag like:

```bash
git tag v1.0.1
git push origin v1.0.1
```

That will:
- build on Windows
- upload the installer to a GitHub Release
- publish the update metadata used by `electron-updater`

### Files produced

Expected release outputs include:
- `Qouter X Setup.exe`
- `latest.yml`
- blockmap files

These are required for GitHub-based Electron auto-updates.
