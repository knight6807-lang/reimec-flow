# Qouter X Installer Build

This project packages the Electron desktop app with `electron-builder`.

## Branding

- App name: `Qouter X`
- Package name: `qouter-x`
- Version: `1.0.0`
- Master icon: [apps/desktop-shell/build/icon.png](/Users/shaunknight/Desktop/reimec-flow/apps/desktop-shell/build/icon.png)
- Windows icon: [apps/desktop-shell/build/icon.ico](/Users/shaunknight/Desktop/reimec-flow/apps/desktop-shell/build/icon.ico)
- macOS icon: [apps/desktop-shell/build/icon.icns](/Users/shaunknight/Desktop/reimec-flow/apps/desktop-shell/build/icon.icns)

## Install Dependencies

```bash
npm install
```

## Build The Renderer

```bash
npm run build
```

This builds the React app and copies the production renderer into `apps/desktop-shell/renderer/` so the packaged Electron app does not depend on a local Vite server.

## Build Installers

Windows installer:

```bash
npm run dist:win
```

macOS installer:

```bash
npm run dist:mac
```

Build both with the default target selection:

```bash
npm run dist
```

Installer output goes to:

```text
apps/desktop-shell/dist/
```

## Installer Targets

- Windows: `nsis` installer
  - output name: `Qouter X Setup.exe`
  - desktop shortcut enabled
  - start menu shortcut enabled
  - one-click install disabled
  - install path selection enabled
- macOS: `dmg`
  - output name: `Qouter X.dmg`
  - category: `public.app-category.business`
  - target arch: `universal`

## Replacing The App Icon

If you replace the master icon, copy the new source image to:

```text
apps/desktop-shell/build/icon.png
```

Then regenerate the platform icons.

Windows `.ico`:

```bash
python3 - <<'PY'
from PIL import Image
img = Image.open('apps/desktop-shell/build/icon.png').convert('RGBA')
img.save(
    'apps/desktop-shell/build/icon.ico',
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],
)
PY
```

macOS `.icns`:

```bash
python3 - <<'PY'
from PIL import Image
img = Image.open('apps/desktop-shell/build/icon.png').convert('RGBA')
img.save('apps/desktop-shell/build/icon.icns')
PY
```

If Pillow is not installed locally:

```bash
python3 -m pip install pillow
```

## Notes

- Dev mode is unchanged. Use `npm run dev:electron` or `npm run dev:desktop:app` as before.
- Packaged builds load the local `renderer/index.html` file instead of `http://localhost:5173`, which avoids a blank packaged app window.
