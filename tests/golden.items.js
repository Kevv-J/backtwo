// Item interaction tests — Champions M-B held items whose effect the calc
// models. Metronome (item) ramps +20%/consecutive use to a ×2.0 cap; Light Ball
// doubles Pikachu's Atk and SpA. Expert Belt (×1.2 super-effective) is covered
// in golden.champions/features; these pin the two added here.

import test from 'node:test';
import { calc } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio } from './fixtures.js';

test('Metronome (item): +20% per use (1=first, ×1.0), capped at ×2.0 from use 6', () => {
  const def = mkMon({ forme: 'Milotic', nature: 'Bold', ev: { hp: 32, def: 32 } });
  // atk.metronome is the USE NUMBER: use 1 → ×1.0, use 3 → ×1.4, use 6 → ×2.0.
  const mk = uses => { const a = mkMon({ forme: 'Garchomp', item: 'Metronome', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] }); a.metronome = uses; return a; };
  const dmg = uses => calc({ atk: mk(uses), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' }).hi;
  const r1 = dmg(1), r3 = dmg(3), r6 = dmg(6), r9 = dmg(9);
  assertRatio(r3 / r1, 1.4, 'use 3 → ×1.4');
  assertRatio(r6 / r1, 2.0, 'use 6 → ×2.0');
  if (r9 !== r6) throw new Error(`Metronome should cap at use 6 (×2.0): use6 ${r6} vs use9 ${r9}`);
  // Use 1 is the un-boosted baseline (defaults to ×1.0 when unset too).
  const rUnset = calc({ atk: mk(undefined), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' }).hi;
  if (r1 !== rUnset) throw new Error(`use 1 must equal the unset baseline: ${r1} vs ${rUnset}`);
});

test('Light Ball: doubles Pikachu physical damage', () => {
  const def = mkMon({ forme: 'Garchomp', nature: 'Careful', ev: { hp: 32, spd: 32 } });
  const off = mkMon({ forme: 'Pikachu', item: '', nature: 'Jolly', ev: { atk: 32, spe: 32 }, moves: ['Body Slam'] });
  const on  = mkMon({ forme: 'Pikachu', item: 'Light Ball', nature: 'Jolly', ev: { atk: 32, spe: 32 }, moves: ['Body Slam'] });
  const rOff = calc({ atk: off, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Slam' });
  const rOn  = calc({ atk: on,  def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Slam' });
  assertRatio(rOn.hi / rOff.hi, 2.0, 'Light Ball should ~double Pikachu physical damage');
});

test('Light Ball: doubles Pikachu special damage', () => {
  const def = mkMon({ forme: 'Garchomp', nature: 'Careful', ev: { hp: 32, spd: 32 } });
  const off = mkMon({ forme: 'Pikachu', item: '', nature: 'Modest', ev: { spa: 32, spe: 32 }, moves: ['Thunderbolt'] });
  const on  = mkMon({ forme: 'Pikachu', item: 'Light Ball', nature: 'Modest', ev: { spa: 32, spe: 32 }, moves: ['Thunderbolt'] });
  const rOff = calc({ atk: off, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  const rOn  = calc({ atk: on,  def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  assertRatio(rOn.hi / rOff.hi, 2.0, 'Light Ball should ~double Pikachu special damage');
});

test('Light Ball does nothing for a non-Pikachu holder', () => {
  const def = mkMon({ forme: 'Milotic', nature: 'Bold', ev: { hp: 32, def: 32 } });
  const off = mkMon({ forme: 'Garchomp', item: '', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] });
  const on  = mkMon({ forme: 'Garchomp', item: 'Light Ball', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] });
  const rOff = calc({ atk: off, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  const rOn  = calc({ atk: on,  def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  if (rOn.hi !== rOff.hi) throw new Error(`Light Ball must not affect a non-Pikachu holder — off=${rOff.hi} on=${rOn.hi}`);
});
