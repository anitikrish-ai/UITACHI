// Custom UI Welcome — Webview client script.
// No network calls, no eval/new Function, no remote imports.
// Talks to the extension host only via acquireVsCodeApi().postMessage,
// and only ever reads structured fields off messages it receives back.

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  /** @type {{imageUri: string|null, opacity: number, blur: number, brightness: number, contrast: number, overlayOpacity: number, position: string, fit: string}} */
  const initialState = window.__CUSTOM_UI_INITIAL_STATE__ || {
    imageUri: null,
    opacity: 100,
    blur: 0,
    brightness: 100,
    contrast: 100,
    overlayOpacity: 35,
    position: 'center',
    fit: 'cover'
  };

  const backgroundEl = document.getElementById('background');
  const overlayEl = document.getElementById('overlay');

  const controls = {
    opacity: document.getElementById('opacity'),
    blur: document.getElementById('blur'),
    brightness: document.getElementById('brightness'),
    contrast: document.getElementById('contrast'),
    overlay: document.getElementById('overlay'),
    position: document.getElementById('position'),
    fit: document.getElementById('fit')
  };
  const outputs = {
    opacity: document.getElementById('opacity-value'),
    blur: document.getElementById('blur-value'),
    brightness: document.getElementById('brightness-value'),
    contrast: document.getElementById('contrast-value'),
    overlay: document.getElementById('overlay-value')
  };

  let state = { ...initialState };

  function applyBackgroundImage(uri) {
    if (uri) {
      // uri always comes from webview.asWebviewUri() on the extension side.
      backgroundEl.style.backgroundImage = `url("${uri}")`;
    } else {
      backgroundEl.style.backgroundImage = 'none';
    }
  }

  function applyStyles() {
    backgroundEl.style.opacity = String(clamp01(state.opacity / 100));
    backgroundEl.style.filter = `blur(${state.blur}px) brightness(${state.brightness}%) contrast(${state.contrast}%)`;
    backgroundEl.style.backgroundPosition = state.position;
    backgroundEl.style.backgroundSize = state.fit;
    overlayEl.style.opacity = String(clamp01(state.overlayOpacity / 100));
  }

  function syncControls() {
    controls.opacity.value = String(state.opacity);
    controls.blur.value = String(state.blur);
    controls.brightness.value = String(state.brightness);
    controls.contrast.value = String(state.contrast);
    controls.overlay.value = String(state.overlayOpacity);
    controls.position.value = state.position;
    controls.fit.value = state.fit;
    outputs.opacity.textContent = `${state.opacity}%`;
    outputs.blur.textContent = `${state.blur}px`;
    outputs.brightness.textContent = `${state.brightness}%`;
    outputs.contrast.textContent = `${state.contrast}%`;
    outputs.overlay.textContent = `${state.overlayOpacity}%`;
  }

  function clamp01(n) {
    return Math.min(1, Math.max(0, n));
  }

  function sendUpdate(partial) {
    vscode.postMessage({ command: 'updateBackground', value: partial });
  }

  // --- Wire up controls -------------------------------------------------

  controls.opacity.addEventListener('input', () => {
    state.opacity = Number(controls.opacity.value);
    applyStyles();
    syncControls();
    sendUpdate({ opacity: state.opacity });
  });

  controls.blur.addEventListener('input', () => {
    state.blur = Number(controls.blur.value);
    applyStyles();
    syncControls();
    sendUpdate({ blur: state.blur });
  });

  controls.brightness.addEventListener('input', () => {
    state.brightness = Number(controls.brightness.value);
    applyStyles();
    syncControls();
    sendUpdate({ brightness: state.brightness });
  });

  controls.contrast.addEventListener('input', () => {
    state.contrast = Number(controls.contrast.value);
    applyStyles();
    syncControls();
    sendUpdate({ contrast: state.contrast });
  });

  controls.overlay.addEventListener('input', () => {
    state.overlayOpacity = Number(controls.overlay.value);
    applyStyles();
    syncControls();
    sendUpdate({ overlayOpacity: state.overlayOpacity });
  });

  controls.position.addEventListener('change', () => {
    state.position = controls.position.value;
    applyStyles();
    sendUpdate({ position: state.position });
  });

  controls.fit.addEventListener('change', () => {
    state.fit = controls.fit.value;
    applyStyles();
    sendUpdate({ fit: state.fit });
  });

  document.getElementById('select-image').addEventListener('click', () => {
    vscode.postMessage({ command: 'selectImage' });
  });

  document.getElementById('reset-background').addEventListener('click', () => {
    vscode.postMessage({ command: 'resetBackground' });
  });

  document.querySelectorAll('.action[data-action]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.getAttribute('data-action');
      if (action) {
        vscode.postMessage({ command: 'runAction', value: action });
      }
    });
  });

  // --- Handle messages from the extension host ---------------------------

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.command !== 'string') {
      return;
    }
    switch (message.command) {
      case 'backgroundImageSet':
        if (typeof message.value === 'string') {
          applyBackgroundImage(message.value);
        }
        break;
      case 'backgroundReset':
        state = {
          imageUri: null,
          opacity: 100,
          blur: 0,
          brightness: 100,
          contrast: 100,
          overlayOpacity: 35,
          position: 'center',
          fit: 'cover'
        };
        applyBackgroundImage(null);
        applyStyles();
        syncControls();
        break;
      default:
        // Unknown command from host: ignored.
        break;
    }
  });

  // --- Initial paint ------------------------------------------------------

  applyBackgroundImage(state.imageUri);
  applyStyles();
  syncControls();

  vscode.postMessage({ command: 'ready' });
})();
