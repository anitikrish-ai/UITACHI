# Custom UI Welcome

A local-only, network-free, Apple-inspired Welcome-style panel for VS Code.

## 1. Overview

VS Code's extension API does not let extensions modify the built-in Welcome
page or Workbench DOM directly. This extension instead provides its own
panel, opened on demand via a command, built entirely on the official
[Webview API](https://code.visualstudio.com/api/extension-guides/webview).
It never touches VS Code's installation files.

## 2. Features

- Calm, spacious, Apple-inspired visual language (not a copy of Apple's UI —
  see [Design](#apple-inspired-design)).
- Quick actions: Open Folder, New File, Open Recent, Settings, Command
  Palette — each a thin wrapper over a built-in VS Code command.
- Optional local background image with live controls for opacity, blur,
  brightness, contrast, dark overlay, position, and fit.
- Light, dark, and high-contrast appearance; VS Code theme tokens are used
  where available.
- Respects `prefers-reduced-motion`, `prefers-reduced-transparency`, and
  `prefers-contrast`.
- Fully keyboard operable; visible focus states throughout.
- Zero runtime dependencies. Works fully offline.

## 3. Architecture

```
customUI.open (command)
    │
    ▼
activate() registers command, does no other startup work
    │
    ▼
createWebviewPanel()  — localResourceRoots: [media/] only
    │
    ▼
buildHtml()  — CSP + nonce generated per panel open, asWebviewUri() for assets
    │
    ▼
media/app.js  — client script: reads sliders, posts validated messages
    │
    ▼
onDidReceiveMessage()  — validateInboundMessage() whitelist, then act
```

`media/index.html` is not a static file in this project — see
[SECURITY.md § Local-Only Architecture](./SECURITY.md#local-only-architecture)
for why the HTML is assembled in `extension.ts` instead, and why that's
still within the supported, documented Webview pattern.

## 4. Folder Structure

```
vscode-custom-ui/
├── package.json          Extension manifest — one command, no extra permissions
├── tsconfig.json
├── README.md
├── SECURITY.md
├── CHANGELOG.md
├── .gitignore
├── src/
│   └── extension.ts       All extension-host logic
├── media/
│   ├── styles.css          Design system + component styles
│   ├── app.js               Webview client script
│   └── images/, icons/      (empty — reserved for any bundled assets you add)
└── test/
    └── extension.test.js   Unit tests for validation logic
```

## 5. Installation

This is source you build and run locally — it is not published to the
Marketplace.

```bash
npm install
npm run compile
```

## 6. Development

```bash
npm run watch
```

Keeps `out/extension.js` rebuilding on save.

## 7. Running with F5

1. Open this folder in VS Code.
2. Press `F5` (or Run → Start Debugging). This launches an Extension
   Development Host window with the extension loaded.
3. In the new window, open the Command Palette and run **Custom UI: Open**.

## 8. Building

```bash
npm run compile
```

Output goes to `out/`.

## 9. Packaging

Packaging into a `.vsix` requires `@vscode/vsce` (not included by default,
to keep dependencies at zero until you actually need to package):

```bash
npm install --no-save @vscode/vsce
npx vsce package
```

## 10. Configuration

All settings live under the `customUI.*` namespace (Settings UI or
`settings.json`):

| Setting | Type | Default | Notes |
|---|---|---|---|
| `customUI.backgroundImagePath` | string \| null | `null` | Local path only, never a URL |
| `customUI.backgroundOpacity` | number | `100` | 0–100 |
| `customUI.backgroundBlur` | number | `0` | 0–40 (px) |
| `customUI.backgroundBrightness` | number | `100` | 40–160 (%) |
| `customUI.backgroundContrast` | number | `100` | 40–160 (%) |
| `customUI.overlayOpacity` | number | `35` | 0–100 |
| `customUI.backgroundPosition` | string | `center` | center/top/bottom/left/right |
| `customUI.backgroundFit` | string | `cover` | cover/contain |

## 11. Background Image Usage

Click **Select local image** inside the panel to open VS Code's native file
picker (PNG/JPG/WebP only). The chosen path is stored in your settings; the
image itself is never copied, uploaded, or sent anywhere. Click **Reset
Background** to clear it and restore all defaults.

## 12. Security Model

See [SECURITY.md](./SECURITY.md) for the full threat model, CSP, and policy
breakdown. Summary: no network requests, no shell execution, no dynamic code
execution, no unnecessary permissions, strict CSP, and validated Webview
messaging.

## 13. Privacy Model

No data leaves your machine. No analytics, telemetry, or crash reporting are
included. The only persisted data is the small set of display preferences
listed in [§10](#10-configuration), stored via VS Code's own settings.

## 14. Limitations

- Cannot modify VS Code's actual built-in Welcome page — this is a
  deliberate, supported-API-only substitute (see [§3](#3-architecture)).
- Background images are capped at 25 MB to keep the panel responsive.
- Settings are stored globally (`ConfigurationTarget.Global`), not
  per-workspace.

## 15. Troubleshooting

- **Panel is blank / background missing**: the stored image path may no
  longer exist. Reopen the panel — it fails closed to "no background"
  rather than erroring.
- **"Unsupported image format"**: only PNG, JPG/JPEG, and WebP are accepted.
- **Command not found**: make sure you ran `npm run compile` before `F5`.

## 16. Uninstall

If installed as a `.vsix`, remove it from the Extensions view like any other
extension. No files are written outside VS Code's normal extension/settings
storage, so no manual cleanup is required.

## 17. Development Commands

| Command | Effect |
|---|---|
| `npm run compile` | One-off TypeScript build |
| `npm run watch` | Incremental rebuild on save |
| `npm test` | Compile, then run unit tests |

## 18. Dependency Explanation

Zero runtime dependencies. Dev-only: `typescript` (compiler),
`@types/vscode`, `@types/node` (type definitions only — no code from these
ships in the built extension). Full rationale in
[SECURITY.md § Dependency Policy](./SECURITY.md#dependency-policy).

## Apple-Inspired Design

"Apple-inspired" here means the *principles* — generous spacing, rounded
surfaces, restrained translucency, clean system typography, smooth
short-lived transitions, strong hierarchy — not a literal copy of any Apple
product's UI, logo, or proprietary asset. See `media/styles.css` for the
concrete design-token implementation.
