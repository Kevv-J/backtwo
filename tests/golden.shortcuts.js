// Calc keyboard-shortcut gating.
//
// Design: shortcuts are opt-in (default OFF), flipped by a niche Shift+K master
// toggle. Ctrl/Cmd combos ALWAYS pass through to the browser/OS. Alt is an APP
// modifier ONLY in power-mode (bare key = my team / side A, Alt+key = enemy /
// side B), so it's handed back to the OS whenever power-mode is off.
// classifyCalcKey is the pure decision the keydown handler delegates to; it
// reads e.code (physical key), so Shift/Alt-produced characters resolve right.

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCalcKey, setShortcutsEnabled, getState } from './harness.js';

// Minimal keydown-event shape classifyCalcKey reads (code + modifier flags).
const ev = (code, mods = {}) => ({
  code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

test('Ctrl/Cmd combos always pass through (never hijacked), in either mode', () => {
  for (const enabled of [false, true]) {
    assert.equal(classifyCalcKey(ev('KeyC', { ctrlKey: true }), enabled), 'pass', 'Ctrl+C copies');
    assert.equal(classifyCalcKey(ev('KeyC', { metaKey: true }), enabled), 'pass', 'Cmd+C copies');
    assert.equal(classifyCalcKey(ev('KeyR', { ctrlKey: true }), enabled), 'pass', 'Ctrl+R reloads');
    assert.equal(classifyCalcKey(ev('Digit1', { metaKey: true }), enabled), 'pass', 'Cmd+1 switches tab');
  }
});

test('Shift+K is the master toggle — works whether shortcuts are on or off', () => {
  assert.equal(classifyCalcKey(ev('KeyK', { shiftKey: true }), false), 'toggle');
  assert.equal(classifyCalcKey(ev('KeyK', { shiftKey: true }), true), 'toggle');
});

test('Ctrl+Shift+K is a Ctrl combo, NOT the toggle (pass wins)', () => {
  assert.equal(classifyCalcKey(ev('KeyK', { shiftKey: true, ctrlKey: true }), true), 'pass');
});

test('Alt is an APP modifier in power-mode, but passes to the OS when off', () => {
  // OFF: Alt+1 (and any Alt combo) is handed back to the OS (e.g. tab switch).
  assert.equal(classifyCalcKey(ev('Digit1', { altKey: true }), false), 'off');
  assert.equal(classifyCalcKey(ev('KeyC', { altKey: true }), false), 'off');
  // ON: Alt+key is a live shortcut (enemy-side action).
  assert.equal(classifyCalcKey(ev('Digit1', { altKey: true }), true), 'fire');
  assert.equal(classifyCalcKey(ev('KeyC', { altKey: true }), true), 'fire');
});

test('when OFF, bare keys are inert; when ON, they fire', () => {
  assert.equal(classifyCalcKey(ev('KeyC'), false), 'off', 'bare c inert when off');
  assert.equal(classifyCalcKey(ev('Digit1'), false), 'off', 'bare 1 inert when off');
  assert.equal(classifyCalcKey(ev('KeyC'), true), 'fire', 'bare c fires when on');
  assert.equal(classifyCalcKey(ev('Digit1'), true), 'fire', 'bare 1 fires when on');
});

test('setShortcutsEnabled flips the persisted state both directions', () => {
  setShortcutsEnabled(true);
  assert.equal(getState().shortcutsEnabled, true, 'enabled after on');
  setShortcutsEnabled(false);
  assert.equal(getState().shortcutsEnabled, false, 'disabled after off');
});
