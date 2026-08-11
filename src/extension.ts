import * as vscode from 'vscode';
import {
  Position,
  Fit,
  UpdateBackgroundValue,
  RUNNABLE_ACTIONS,
  MAX_IMAGE_BYTES,
  clamp,
  isFiniteNumber,
  isValidPosition,
  isValidFit,
  hasValidImageExtension,
  validateInboundMessage
} from './validation';

/**
 * Custom UI Welcome — a local-only, network-free Webview extension.
 *
 * Security properties (see SECURITY.md for the full model):
 * - No network requests anywhere in this file or the Webview assets.
 * - No child_process / shell execution.
 * - No eval / new Function / dynamic code execution.
 * - Webview CSP is deny-by-default; only local, nonce-authorized scripts and
 *   local styles/images are allowed.
 * - localResourceRoots is restricted to the extension's `media/` directory,
 *   plus (only after explicit user selection) the single directory holding
 *   the chosen background image.
 * - All inbound Webview messages are validated (src/validation.ts) against a
 *   strict whitelist before being acted on. Nothing from the Webview is ever
 *   executed as code.
 */

interface BackgroundSettings {
  imageUri: string | null; // Webview-safe URI string, or null
  opacity: number;
  blur: number;
  brightness: number;
  contrast: number;
  overlayOpacity: number;
  position: Position;
  fit: Fit;
}

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('customUI.open', () => {
    openCustomUiPanel(context);
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  currentPanel?.dispose();
  currentPanel = undefined;
}

function openCustomUiPanel(context: vscode.ExtensionContext): void {
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'customUIWelcome',
    'Custom UI',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      // Deliberately narrow: only the extension's own media directory.
      // Widened (never to a drive root or the workspace root) only when the
      // user explicitly picks a background image, and only to that image's
      // own directory.
      localResourceRoots: [mediaRoot],
      retainContextWhenHidden: false
    }
  );
  currentPanel = panel;

  panel.onDidDispose(
    () => {
      currentPanel = undefined;
    },
    null,
    context.subscriptions
  );

  // Resolve any previously-selected background image (if it still exists)
  // and, if present, extend localResourceRoots to just its directory.
  void renderWebview(panel, mediaRoot);

  panel.webview.onDidReceiveMessage(
    (raw: unknown) => handleInboundMessage(raw, panel, mediaRoot),
    undefined,
    context.subscriptions
  );
}

async function renderWebview(panel: vscode.WebviewPanel, mediaRoot: vscode.Uri): Promise<void> {
  const settings = readStoredBackgroundSettings();
  const imageWebviewUri = await resolveStoredImage(panel, mediaRoot, settings.imagePath);

  panel.webview.html = buildHtml(panel.webview, mediaRoot, {
    imageUri: imageWebviewUri,
    opacity: settings.opacity,
    blur: settings.blur,
    brightness: settings.brightness,
    contrast: settings.contrast,
    overlayOpacity: settings.overlayOpacity,
    position: settings.position,
    fit: settings.fit
  });
}

/** Reads persisted, non-secret display preferences via the official configuration API. */
function readStoredBackgroundSettings(): {
  imagePath: string | null;
  opacity: number;
  blur: number;
  brightness: number;
  contrast: number;
  overlayOpacity: number;
  position: Position;
  fit: Fit;
} {
  const cfg = vscode.workspace.getConfiguration('customUI');
  const rawPosition = cfg.get<string>('backgroundPosition', 'center');
  const rawFit = cfg.get<string>('backgroundFit', 'cover');
  return {
    imagePath: cfg.get<string | null>('backgroundImagePath', null),
    opacity: clamp(cfg.get<number>('backgroundOpacity', 100), 0, 100),
    blur: clamp(cfg.get<number>('backgroundBlur', 0), 0, 40),
    brightness: clamp(cfg.get<number>('backgroundBrightness', 100), 40, 160),
    contrast: clamp(cfg.get<number>('backgroundContrast', 100), 40, 160),
    overlayOpacity: clamp(cfg.get<number>('overlayOpacity', 35), 0, 100),
    position: isValidPosition(rawPosition) ? rawPosition : 'center',
    fit: isValidFit(rawFit) ? rawFit : 'cover'
  };
}

/**
 * If a background image path was previously stored, validate it still exists
 * and is a supported format, widen localResourceRoots to its single parent
 * directory, and return a Webview-safe URI. Fails closed (returns null) on
 * any problem — a missing file must never crash the panel.
 */
async function resolveStoredImage(
  panel: vscode.WebviewPanel,
  mediaRoot: vscode.Uri,
  storedPath: string | null
): Promise<string | null> {
  if (!storedPath) {
    return null;
  }
  try {
    const uri = vscode.Uri.file(storedPath);
    if (!hasValidImageExtension(uri.fsPath)) {
      return null;
    }
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type !== vscode.FileType.File || stat.size > MAX_IMAGE_BYTES) {
      return null;
    }
    const parentDir = vscode.Uri.joinPath(uri, '..');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot, parentDir]
    };
    return panel.webview.asWebviewUri(uri).toString();
  } catch {
    // File missing / inaccessible / stat failed — fail closed, no background.
    return null;
  }
}

async function handleInboundMessage(
  raw: unknown,
  panel: vscode.WebviewPanel,
  mediaRoot: vscode.Uri
): Promise<void> {
  const message = validateInboundMessage(raw);
  if (!message) {
    // Unknown/malformed message: silently ignored. Never executed as code.
    return;
  }

  switch (message.command) {
    case 'ready':
      return;

    case 'selectImage':
      await onSelectImage(panel, mediaRoot);
      return;

    case 'resetBackground':
      await onResetBackground(panel, mediaRoot);
      return;

    case 'updateBackground':
      await onUpdateBackground(message.value);
      return;

    case 'runAction': {
      const commandId = RUNNABLE_ACTIONS[message.value];
      if (commandId) {
        await vscode.commands.executeCommand(commandId);
      }
      return;
    }
  }
}

async function onSelectImage(panel: vscode.WebviewPanel, mediaRoot: vscode.Uri): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Set as background',
    filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] }
  });
  if (!picked || picked.length === 0) {
    return;
  }
  const fileUri = picked[0];

  if (!hasValidImageExtension(fileUri.fsPath)) {
    void vscode.window.showErrorMessage('Unsupported image format. Use PNG, JPG, or WebP.');
    return;
  }

  let stat: vscode.FileStat;
  try {
    stat = await vscode.workspace.fs.stat(fileUri);
  } catch {
    void vscode.window.showErrorMessage('Could not read the selected image.');
    return;
  }
  if (stat.size > MAX_IMAGE_BYTES) {
    void vscode.window.showErrorMessage('Image is too large (25 MB limit).');
    return;
  }

  // Widen resource roots to only this image's parent directory — never a drive
  // root, home directory, or the workspace root.
  const parentDir = vscode.Uri.joinPath(fileUri, '..');
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [mediaRoot, parentDir]
  };

  const cfg = vscode.workspace.getConfiguration('customUI');
  await cfg.update('backgroundImagePath', fileUri.fsPath, vscode.ConfigurationTarget.Global);

  const webviewUri = panel.webview.asWebviewUri(fileUri).toString();
  void panel.webview.postMessage({ command: 'backgroundImageSet', value: webviewUri });
}

async function onResetBackground(panel: vscode.WebviewPanel, mediaRoot: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('customUI');
  await Promise.all([
    cfg.update('backgroundImagePath', null, vscode.ConfigurationTarget.Global),
    cfg.update('backgroundOpacity', 100, vscode.ConfigurationTarget.Global),
    cfg.update('backgroundBlur', 0, vscode.ConfigurationTarget.Global),
    cfg.update('backgroundBrightness', 100, vscode.ConfigurationTarget.Global),
    cfg.update('backgroundContrast', 100, vscode.ConfigurationTarget.Global),
    cfg.update('overlayOpacity', 35, vscode.ConfigurationTarget.Global),
    cfg.update('backgroundPosition', 'center', vscode.ConfigurationTarget.Global),
    cfg.update('backgroundFit', 'cover', vscode.ConfigurationTarget.Global)
  ]);
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [mediaRoot]
  };
  void panel.webview.postMessage({ command: 'backgroundReset' });
}

async function onUpdateBackground(value: UpdateBackgroundValue): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('customUI');
  const updates: Array<Thenable<void>> = [];

  if (isFiniteNumber(value.opacity)) {
    updates.push(cfg.update('backgroundOpacity', clamp(value.opacity, 0, 100), vscode.ConfigurationTarget.Global));
  }
  if (isFiniteNumber(value.blur)) {
    updates.push(cfg.update('backgroundBlur', clamp(value.blur, 0, 40), vscode.ConfigurationTarget.Global));
  }
  if (isFiniteNumber(value.brightness)) {
    updates.push(cfg.update('backgroundBrightness', clamp(value.brightness, 40, 160), vscode.ConfigurationTarget.Global));
  }
  if (isFiniteNumber(value.contrast)) {
    updates.push(cfg.update('backgroundContrast', clamp(value.contrast, 40, 160), vscode.ConfigurationTarget.Global));
  }
  if (isFiniteNumber(value.overlayOpacity)) {
    updates.push(cfg.update('overlayOpacity', clamp(value.overlayOpacity, 0, 100), vscode.ConfigurationTarget.Global));
  }
  if (typeof value.position === 'string' && isValidPosition(value.position)) {
    updates.push(cfg.update('backgroundPosition', value.position, vscode.ConfigurationTarget.Global));
  }
  if (typeof value.fit === 'string' && isValidFit(value.fit)) {
    updates.push(cfg.update('backgroundFit', value.fit, vscode.ConfigurationTarget.Global));
  }

  await Promise.all(updates);
}

// ---------------------------------------------------------------------------
// HTML assembly
// ---------------------------------------------------------------------------

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function buildHtml(webview: vscode.Webview, mediaRoot: vscode.Uri, bg: BackgroundSettings): string {
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'styles.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'app.js'));
  const nonce = getNonce();

  // Deny-by-default CSP: only this Webview's own origin for images (covers
  // both bundled media/ assets and the one user-selected image directory,
  // since both are only ever exposed via asWebviewUri), local nonce'd
  // scripts, and local styles. No network origin appears anywhere, and no
  // connect-src is granted at all.
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`
  ].join('; ');

  const initialState = JSON.stringify(bg).replace(/</g, '\\u003c');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Custom UI</title>
</head>
<body>
  <div id="background" class="background" aria-hidden="true"></div>
  <div id="overlay" class="overlay" aria-hidden="true"></div>

  <main class="content">
    <header class="hero">
      <h1 class="hero-title">Welcome</h1>
      <p class="hero-subtitle">A calm place to start working.</p>
    </header>

    <nav class="actions" aria-label="Quick actions">
      <button class="action action-primary" data-action="openFolder">
        <span class="action-label">Open Folder</span>
      </button>
      <button class="action" data-action="newFile">
        <span class="action-label">New File</span>
      </button>
      <button class="action" data-action="openRecent">
        <span class="action-label">Open Recent</span>
      </button>
      <button class="action" data-action="openSettings">
        <span class="action-label">Settings</span>
      </button>
      <button class="action" data-action="commandPalette">
        <span class="action-label">Command Palette</span>
      </button>
    </nav>

    <section class="panel" aria-labelledby="bg-panel-heading">
      <h2 id="bg-panel-heading" class="panel-heading">Background</h2>

      <div class="field-row">
        <button id="select-image" class="button-secondary">Select local image</button>
        <button id="reset-background" class="button-secondary">Reset Background</button>
      </div>

      <div class="field">
        <label for="opacity">Opacity</label>
        <input type="range" id="opacity" min="0" max="100" step="1" aria-describedby="opacity-value" />
        <output id="opacity-value" for="opacity"></output>
      </div>

      <div class="field">
        <label for="blur">Blur</label>
        <input type="range" id="blur" min="0" max="40" step="1" aria-describedby="blur-value" />
        <output id="blur-value" for="blur"></output>
      </div>

      <div class="field">
        <label for="brightness">Brightness</label>
        <input type="range" id="brightness" min="40" max="160" step="1" aria-describedby="brightness-value" />
        <output id="brightness-value" for="brightness"></output>
      </div>

      <div class="field">
        <label for="contrast">Contrast</label>
        <input type="range" id="contrast" min="40" max="160" step="1" aria-describedby="contrast-value" />
        <output id="contrast-value" for="contrast"></output>
      </div>

      <div class="field">
        <label for="overlay">Dark overlay</label>
        <input type="range" id="overlay" min="0" max="100" step="1" aria-describedby="overlay-value" />
        <output id="overlay-value" for="overlay"></output>
      </div>

      <div class="field">
        <label for="position">Position</label>
        <select id="position">
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      <div class="field">
        <label for="fit">Fit</label>
        <select id="fit">
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
        </select>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">window.__CUSTOM_UI_INITIAL_STATE__ = ${initialState};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
