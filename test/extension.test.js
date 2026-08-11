// Zero-dependency unit tests for src/validation.ts (compiled to out/validation.js).
// Run with: npm test  (compiles, then runs this file with plain `node`).
'use strict';

const assert = require('assert');
const path = require('path');
const {
  clamp,
  isFiniteNumber,
  isValidPosition,
  isValidFit,
  hasValidImageExtension,
  validateInboundMessage
} = require(path.join(__dirname, '..', 'out', 'validation.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('clamp()');
test('clamps below min', () => assert.strictEqual(clamp(-5, 0, 100), 0));
test('clamps above max', () => assert.strictEqual(clamp(500, 0, 100), 100));
test('passes through in-range', () => assert.strictEqual(clamp(42, 0, 100), 42));
test('non-finite falls back to min', () => assert.strictEqual(clamp(NaN, 0, 100), 0));
test('Infinity falls back to min', () => assert.strictEqual(clamp(Infinity, 10, 100), 10));

console.log('isFiniteNumber()');
test('accepts finite number', () => assert.strictEqual(isFiniteNumber(3), true));
test('rejects string', () => assert.strictEqual(isFiniteNumber('3'), false));
test('rejects NaN', () => assert.strictEqual(isFiniteNumber(NaN), false));
test('rejects null', () => assert.strictEqual(isFiniteNumber(null), false));

console.log('isValidPosition() / isValidFit()');
test('accepts known position', () => assert.strictEqual(isValidPosition('center'), true));
test('rejects unknown position', () => assert.strictEqual(isValidPosition('diagonal'), false));
test('rejects non-string position', () => assert.strictEqual(isValidPosition(1), false));
test('accepts known fit', () => assert.strictEqual(isValidFit('cover'), true));
test('rejects unknown fit', () => assert.strictEqual(isValidFit('stretch'), false));

console.log('hasValidImageExtension()');
test('accepts .png', () => assert.strictEqual(hasValidImageExtension('/tmp/a.png'), true));
test('accepts .JPG (case-insensitive)', () => assert.strictEqual(hasValidImageExtension('/tmp/a.JPG'), true));
test('rejects .exe', () => assert.strictEqual(hasValidImageExtension('/tmp/a.exe'), false));
test('rejects .svg (not in allow-list)', () => assert.strictEqual(hasValidImageExtension('/tmp/a.svg'), false));
test('rejects double extension trick', () => assert.strictEqual(hasValidImageExtension('/tmp/a.png.exe'), false));

console.log('validateInboundMessage() — well-formed messages');
test('accepts ready', () => {
  assert.deepStrictEqual(validateInboundMessage({ command: 'ready' }), { command: 'ready' });
});
test('accepts selectImage', () => {
  assert.deepStrictEqual(validateInboundMessage({ command: 'selectImage' }), { command: 'selectImage' });
});
test('accepts resetBackground', () => {
  assert.deepStrictEqual(validateInboundMessage({ command: 'resetBackground' }), { command: 'resetBackground' });
});
test('accepts valid runAction', () => {
  const result = validateInboundMessage({ command: 'runAction', value: 'openFolder' });
  assert.deepStrictEqual(result, { command: 'runAction', value: 'openFolder' });
});
test('accepts valid updateBackground with numeric fields', () => {
  const result = validateInboundMessage({ command: 'updateBackground', value: { opacity: 50, blur: 10 } });
  assert.deepStrictEqual(result, { command: 'updateBackground', value: { opacity: 50, blur: 10 } });
});
test('accepts valid updateBackground with position/fit', () => {
  const result = validateInboundMessage({ command: 'updateBackground', value: { position: 'top', fit: 'contain' } });
  assert.deepStrictEqual(result, { command: 'updateBackground', value: { position: 'top', fit: 'contain' } });
});

console.log('validateInboundMessage() — rejections (must never throw, must return null)');
test('rejects null', () => assert.strictEqual(validateInboundMessage(null), null));
test('rejects array', () => assert.strictEqual(validateInboundMessage([1, 2, 3]), null));
test('rejects string payload', () => assert.strictEqual(validateInboundMessage('hello'), null));
test('rejects missing command', () => assert.strictEqual(validateInboundMessage({ value: 1 }), null));
test('rejects unknown command', () => assert.strictEqual(validateInboundMessage({ command: 'deleteEverything' }), null));
test('rejects runAction with unknown action', () => {
  assert.strictEqual(validateInboundMessage({ command: 'runAction', value: 'runShellCommand' }), null);
});
test('rejects runAction with non-string value', () => {
  assert.strictEqual(validateInboundMessage({ command: 'runAction', value: 123 }), null);
});
test('rejects updateBackground with unexpected property', () => {
  assert.strictEqual(
    validateInboundMessage({ command: 'updateBackground', value: { opacity: 10, evil: '<script>' } }),
    null
  );
});
test('rejects updateBackground with non-numeric opacity', () => {
  assert.strictEqual(validateInboundMessage({ command: 'updateBackground', value: { opacity: '100' } }), null);
});
test('rejects updateBackground with NaN', () => {
  assert.strictEqual(validateInboundMessage({ command: 'updateBackground', value: { opacity: NaN } }), null);
});
test('rejects updateBackground with oversized position string', () => {
  assert.strictEqual(
    validateInboundMessage({ command: 'updateBackground', value: { position: 'x'.repeat(50) } }),
    null
  );
});
test('rejects updateBackground with HTML payload as fit', () => {
  assert.strictEqual(
    validateInboundMessage({ command: 'updateBackground', value: { fit: '<img src=x onerror=alert(1)>' } }),
    null
  );
});
test('rejects updateBackground with non-object value', () => {
  assert.strictEqual(validateInboundMessage({ command: 'updateBackground', value: 'not-an-object' }), null);
});
test('rejects message that is not an object at all (number)', () => {
  assert.strictEqual(validateInboundMessage(42), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
