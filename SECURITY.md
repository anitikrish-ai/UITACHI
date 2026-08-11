# Security Model

This document describes the threat model and security architecture of the
Custom UI Welcome extension. Every claim below is verifiable directly from
the source in `src/extension.ts` and `media/`.

## Summary

- No network requests are intentionally made anywhere in this extension.
- No analytics or telemetry are included by this extension.
- No remote assets (scripts, styles, fonts, images) are required or loaded.
- User-selected background images remain on the local filesystem; they are
  never uploaded, copied elsewhere, or sent through any API.
- No API keys, tokens, or secrets are required, stored, or embedded.
- No external services are required for any feature to function.

These are statements about what *this extension's own code* does. They do
not (and cannot) make claims about VS Code itself, other installed
extensions, or the underlying OS/network stack.

## Threat Model

**In scope / mitigated:**
- A malicious or buggy Webview page attempting to load remote content,
  execute arbitrary script, or exfiltrate data over the network.
- A malformed or adversarial message arriving from the Webview attempting to
  make the extension host read/write unintended files or run unintended
  commands.
- A corrupted, oversized, or non-image file being selected as a background.

**Out of scope:**
- Compromise of VS Code itself, the OS, or the machine's network stack.
- Supply-chain compromise of `npm`/the TypeScript compiler used only at
  development/build time (these never ship into the running extension).
- A user manually disabling the CSP or installing a modified build.

## Trust Boundaries

```
┌─────────────────────────────┐        postMessage        ┌───────────────────────────┐
│   Extension Host (Node.js)  │ <------------------------> │   Webview (Chromium page)  │
│   src/extension.ts          │   validated, whitelisted   │   media/index HTML + app.js │
│   - file system access      │        messages only       │   - no fs access            │
│   - VS Code command exec    │                             │   - no network access       │
└─────────────────────────────┘                             └───────────────────────────┘
```

The Webview is treated as an **untrusted boundary**, even though its HTML/JS
ship with the extension. Every message it sends is validated before the
extension host acts on it (`validateInboundMessage` in `src/extension.ts`).

## Local-Only Architecture

- The extension activates only on `customUI.open` (see `activationEvents` in
  `package.json`) — never on VS Code startup.
- All HTML/CSS/JS the Webview loads are bundled in `media/` and resolved
  through `webview.asWebviewUri()`. Nothing is fetched at runtime.
- `index.html` is generated at panel-creation time in `extension.ts` rather
  than shipped as a static file. This is a deliberate, documented deviation
  from the reference folder layout: a per-panel CSP nonce and the panel's
  `webview.cspSource` are only known once the panel exists, and VS Code's
  own Webview guidance recommends assembling HTML in the extension host for
  exactly this reason. No other file's authority changes as a result — the
  actual page markup is still static and auditable, just parameterized by
  the nonce/URIs at open-time instead of hard-coded.

## Webview Security

- `enableScripts: true` is the only elevated Webview option enabled — no
  `enableCommandUris`, no `enableForms` reliance.
- **Content Security Policy** (see `buildHtml` in `src/extension.ts`):
  ```
  default-src 'none';
  img-src <webview.cspSource>;
  style-src <webview.cspSource> 'unsafe-inline';
  script-src 'nonce-<random-per-load>';
  font-src <webview.cspSource>;
  ```
  - `default-src 'none'` denies everything not explicitly listed.
  - No `connect-src` is granted at all, so `fetch`/`XMLHttpRequest`/
    `WebSocket`/`EventSource` cannot reach any origin, local or remote, even
    if such a call were added by mistake in the future.
  - `script-src` only allows the single nonce-tagged `<script>` tags
    generated per panel load; no inline event handlers, no `unsafe-eval`.
  - `style-src` allows `unsafe-inline` only for a small number of inline
    `style.xxx =` assignments driven by validated numeric slider values
    (opacity/blur/brightness/contrast/position) — never third-party or
    user-supplied markup.
- A fresh cryptographically-unnecessary-but-sufficient nonce is generated
  per panel load (`getNonce()`); it is not reused across sessions.

## Resource Restrictions

- `localResourceRoots` starts as `[media/]` only.
- It is widened **only** when the user explicitly picks a background image
  via the native file picker, and only to that single image's **parent
  directory** — never to a drive root, the user's home directory, or the
  workspace root.
- On reset, `localResourceRoots` is narrowed back to `[media/]`.
- All local resource URIs are produced with `webview.asWebviewUri()`; no
  `vscode-resource://` URLs are hand-constructed.

## Webview Message Validation

Every inbound message is passed through `validateInboundMessage()`, which:
- Rejects anything that isn't a plain object with a known `command` string.
- Whitelists exactly five commands: `ready`, `selectImage`,
  `resetBackground`, `updateBackground`, `runAction`.
- For `updateBackground`, rejects any property not in the fixed allow-list
  (`opacity`, `blur`, `brightness`, `contrast`, `overlayOpacity`,
  `position`, `fit`), rejects non-finite numbers, and rejects strings over
  20 characters (position/fit are further checked against an enum before
  being applied).
- For `runAction`, only accepts one of five fixed VS Code command IDs — the
  Webview cannot send an arbitrary command string for execution.
- Never passes any part of a message to `eval`, `new Function`, or any code
  execution path. Messages are data, never code.

## Dependency Policy

Zero runtime dependencies. `devDependencies` are build/type-only and never
ship inside the running extension:

| Package | Purpose | Runtime? | Network at build? |
|---|---|---|---|
| `typescript` | Compiles `.ts` → `.js` | No | No (already installed) |
| `@types/vscode` | Type definitions for the VS Code API | No | No |
| `@types/node` | Type definitions for Node built-ins | No | No |

No UI framework, animation library, HTTP client, or icon library is used.

## Network Policy

No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or Node HTTP/HTTPS
module appears anywhere in `src/` or `media/`. The Webview CSP additionally
blocks any such call at the browser level via the absence of `connect-src`.

## File Access Policy

- The extension never scans the filesystem or a drive root.
- The only filesystem operations are: `vscode.workspace.fs.stat()` on a
  single, user-selected or previously-stored image path (to validate it
  exists, is a file, and is under the size limit), and reads of the
  extension's own bundled `media/` files by VS Code's Webview machinery.
- Image path validation: extension must be `.png`, `.jpg`, `.jpeg`, or
  `.webp`; size must be ≤ 25 MB; the path must resolve via `fs.stat` to a
  regular file. Anything else fails closed (no background is shown), never
  throws an unhandled exception into the UI.

## Process Execution Policy

No `child_process`, `exec`, `execFile`, `spawn`, `spawnSync`, `fork`, or
shell/PowerShell/cmd invocation exists anywhere in this codebase. The only
"execution" performed is `vscode.commands.executeCommand()` against a fixed
whitelist of five built-in VS Code command IDs (open folder, new file, open
recent, open settings, show command palette) — standard, documented,
in-process VS Code API calls, not OS processes.

## Storage Policy

Only non-secret display preferences are persisted, via the official
`vscode.workspace.getConfiguration('customUI')` API (backed by VS Code's own
settings storage): background image **path** (a string, not the image
bytes), opacity, blur, brightness, contrast, overlay opacity, position, fit.
No passwords, tokens, API keys, file contents, or browsing history are ever
stored.

## Reporting

This is a local, unpublished sample extension. If you fork or ship it,
replace this section with your project's real vulnerability-reporting
contact before distribution.
