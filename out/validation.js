"use strict";
/**
 * Pure validation/sanitization logic for Custom UI Welcome.
 * Deliberately has zero imports (including no `vscode`) so it can be
 * unit-tested with plain Node, without an Extension Development Host.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNNABLE_ACTIONS = exports.MAX_IMAGE_BYTES = exports.VALID_IMAGE_EXTENSIONS = exports.VALID_FITS = exports.VALID_POSITIONS = void 0;
exports.clamp = clamp;
exports.isFiniteNumber = isFiniteNumber;
exports.isValidPosition = isValidPosition;
exports.isValidFit = isValidFit;
exports.hasValidImageExtension = hasValidImageExtension;
exports.validateInboundMessage = validateInboundMessage;
exports.VALID_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'];
exports.VALID_FITS = ['cover', 'contain'];
exports.VALID_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
exports.MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
exports.RUNNABLE_ACTIONS = {
    openFolder: 'workbench.action.files.openFolder',
    newFile: 'workbench.action.files.newUntitledFile',
    openRecent: 'workbench.action.openRecent',
    openSettings: 'workbench.action.openSettings',
    commandPalette: 'workbench.action.showCommands'
};
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function isValidPosition(value) {
    return typeof value === 'string' && exports.VALID_POSITIONS.includes(value);
}
function isValidFit(value) {
    return typeof value === 'string' && exports.VALID_FITS.includes(value);
}
function hasValidImageExtension(fsPath) {
    const lower = fsPath.toLowerCase();
    return exports.VALID_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
/**
 * Strict whitelist validator for messages arriving from the Webview.
 * Rejects unknown commands, unexpected properties, and wrong types.
 * Returns null (never throws) on anything invalid.
 */
function validateInboundMessage(raw) {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const msg = raw;
    if (typeof msg.command !== 'string') {
        return null;
    }
    switch (msg.command) {
        case 'ready':
        case 'selectImage':
        case 'resetBackground':
            return { command: msg.command };
        case 'runAction': {
            const value = msg.value;
            if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(exports.RUNNABLE_ACTIONS, value)) {
                return { command: 'runAction', value: value };
            }
            return null;
        }
        case 'updateBackground': {
            const value = msg.value;
            if (typeof value !== 'object' || value === null) {
                return null;
            }
            const v = value;
            const allowedKeys = ['opacity', 'blur', 'brightness', 'contrast', 'overlayOpacity', 'position', 'fit'];
            const keys = Object.keys(v);
            if (!keys.every((k) => allowedKeys.includes(k))) {
                return null; // reject unexpected properties
            }
            const sanitized = {};
            if ('opacity' in v) {
                if (!isFiniteNumber(v.opacity))
                    return null;
                sanitized.opacity = v.opacity;
            }
            if ('blur' in v) {
                if (!isFiniteNumber(v.blur))
                    return null;
                sanitized.blur = v.blur;
            }
            if ('brightness' in v) {
                if (!isFiniteNumber(v.brightness))
                    return null;
                sanitized.brightness = v.brightness;
            }
            if ('contrast' in v) {
                if (!isFiniteNumber(v.contrast))
                    return null;
                sanitized.contrast = v.contrast;
            }
            if ('overlayOpacity' in v) {
                if (!isFiniteNumber(v.overlayOpacity))
                    return null;
                sanitized.overlayOpacity = v.overlayOpacity;
            }
            if ('position' in v) {
                if (typeof v.position !== 'string' || v.position.length > 20)
                    return null;
                sanitized.position = v.position;
            }
            if ('fit' in v) {
                if (typeof v.fit !== 'string' || v.fit.length > 20)
                    return null;
                sanitized.fit = v.fit;
            }
            return { command: 'updateBackground', value: sanitized };
        }
        default:
            return null;
    }
}
//# sourceMappingURL=validation.js.map