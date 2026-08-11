/**
 * Pure validation/sanitization logic for Custom UI Welcome.
 * Deliberately has zero imports (including no `vscode`) so it can be
 * unit-tested with plain Node, without an Extension Development Host.
 */

export const VALID_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const;
export const VALID_FITS = ['cover', 'contain'] as const;
export const VALID_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

export type Position = (typeof VALID_POSITIONS)[number];
export type Fit = (typeof VALID_FITS)[number];

export const RUNNABLE_ACTIONS: Record<string, string> = {
  openFolder: 'workbench.action.files.openFolder',
  newFile: 'workbench.action.files.newUntitledFile',
  openRecent: 'workbench.action.openRecent',
  openSettings: 'workbench.action.openSettings',
  commandPalette: 'workbench.action.showCommands'
};

export type RunnableAction = 'openFolder' | 'newFile' | 'openRecent' | 'openSettings' | 'commandPalette';

export interface UpdateBackgroundValue {
  opacity?: number;
  blur?: number;
  brightness?: number;
  contrast?: number;
  overlayOpacity?: number;
  position?: string;
  fit?: string;
}

export type InboundMessage =
  | { command: 'selectImage' }
  | { command: 'resetBackground' }
  | { command: 'updateBackground'; value: UpdateBackgroundValue }
  | { command: 'runAction'; value: RunnableAction }
  | { command: 'ready' };

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidPosition(value: unknown): value is Position {
  return typeof value === 'string' && (VALID_POSITIONS as readonly string[]).includes(value);
}

export function isValidFit(value: unknown): value is Fit {
  return typeof value === 'string' && (VALID_FITS as readonly string[]).includes(value);
}

export function hasValidImageExtension(fsPath: string): boolean {
  const lower = fsPath.toLowerCase();
  return VALID_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Strict whitelist validator for messages arriving from the Webview.
 * Rejects unknown commands, unexpected properties, and wrong types.
 * Returns null (never throws) on anything invalid.
 */
export function validateInboundMessage(raw: unknown): InboundMessage | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const msg = raw as Record<string, unknown>;
  if (typeof msg.command !== 'string') {
    return null;
  }

  switch (msg.command) {
    case 'ready':
    case 'selectImage':
    case 'resetBackground':
      return { command: msg.command } as InboundMessage;

    case 'runAction': {
      const value = msg.value;
      if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(RUNNABLE_ACTIONS, value)) {
        return { command: 'runAction', value: value as RunnableAction };
      }
      return null;
    }

    case 'updateBackground': {
      const value = msg.value;
      if (typeof value !== 'object' || value === null) {
        return null;
      }
      const v = value as Record<string, unknown>;
      const allowedKeys = ['opacity', 'blur', 'brightness', 'contrast', 'overlayOpacity', 'position', 'fit'];
      const keys = Object.keys(v);
      if (!keys.every((k) => allowedKeys.includes(k))) {
        return null; // reject unexpected properties
      }
      const sanitized: UpdateBackgroundValue = {};
      if ('opacity' in v) {
        if (!isFiniteNumber(v.opacity)) return null;
        sanitized.opacity = v.opacity;
      }
      if ('blur' in v) {
        if (!isFiniteNumber(v.blur)) return null;
        sanitized.blur = v.blur;
      }
      if ('brightness' in v) {
        if (!isFiniteNumber(v.brightness)) return null;
        sanitized.brightness = v.brightness;
      }
      if ('contrast' in v) {
        if (!isFiniteNumber(v.contrast)) return null;
        sanitized.contrast = v.contrast;
      }
      if ('overlayOpacity' in v) {
        if (!isFiniteNumber(v.overlayOpacity)) return null;
        sanitized.overlayOpacity = v.overlayOpacity;
      }
      if ('position' in v) {
        if (typeof v.position !== 'string' || v.position.length > 20) return null;
        sanitized.position = v.position;
      }
      if ('fit' in v) {
        if (typeof v.fit !== 'string' || v.fit.length > 20) return null;
        sanitized.fit = v.fit;
      }
      return { command: 'updateBackground', value: sanitized };
    }

    default:
      return null;
  }
}
