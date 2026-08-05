// Marvel Scale tests — defender ability that raises the *physical* Defense stat
// by ×1.5 while the holder has a major status. Gated in the calc by the
// `marvelScale` flag (the on-screen toggle, auto-enabled from status). Never
// touches Special Defense. Verified vs Bulbapedia.

import test from 'node:test';
import { calc } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio } from './fixtures.js';

test('Marvel Scale: physical Def ×1.5 when the toggle is on (statused)', () => {
  const atk    = mkMon({ forme: 'Garchomp', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] });
  const defOff = mkMon({ forme: 'Milotic', ability: 'Marvel Scale', nature: 'Bold', ev: { hp: 32, def: 32 }, status: 'brn' });
  const defOn  = mkMon({ forme: 'Milotic', ability: 'Marvel Scale', nature: 'Bold', ev: { hp: 32, def: 32 }, status: 'brn' });
  defOn.marvelScale = true;   // toggle on (auto-enabled by status in the UI)
  const rOff = calc({ atk, def: defOff, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  const rOn  = calc({ atk, def: defOn,  sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  // ×1.5 Def → damage taken drops to ~2/3.
  assertRatio(rOn.hi / rOff.hi, 2 / 3, 'Marvel Scale should cut physical damage to ~2/3');
});

test('Marvel Scale: does NOT boost Special Defense', () => {
  const atk    = mkMon({ forme: 'Garchomp', nature: 'Modest', ev: { spa: 32 }, moves: ['Ice Beam'] });
  const defOff = mkMon({ forme: 'Milotic', ability: 'Marvel Scale', nature: 'Bold', ev: { hp: 32, spd: 32 }, status: 'brn' });
  const defOn  = mkMon({ forme: 'Milotic', ability: 'Marvel Scale', nature: 'Bold', ev: { hp: 32, spd: 32 }, status: 'brn' });
  defOn.marvelScale = true;
  const rOff = calc({ atk, def: defOff, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Ice Beam' });
  const rOn  = calc({ atk, def: defOn,  sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Ice Beam' });
  if (rOn.hi !== rOff.hi) throw new Error(`Marvel Scale must not affect special damage — off=${rOff.hi} on=${rOn.hi}`);
});

test('Marvel Scale: no boost when the toggle is off (even if statused)', () => {
  // The toggle is the single gate. A statused Milotic with the flag unset takes
  // full physical damage (models the user turning Marvel Scale off to compare).
  const atk     = mkMon({ forme: 'Garchomp', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] });
  const defPar  = mkMon({ forme: 'Milotic', ability: 'Marvel Scale', nature: 'Bold', ev: { hp: 32, def: 32 }, status: 'par' });
  const defNone = mkMon({ forme: 'Milotic', ability: 'Marvel Scale', nature: 'Bold', ev: { hp: 32, def: 32 }, status: 'ok' });
  const rPar  = calc({ atk, def: defPar,  sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  const rNone = calc({ atk, def: defNone, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  if (rPar.hi !== rNone.hi) throw new Error(`Toggle off → no Marvel Scale boost — statused=${rPar.hi} clean=${rNone.hi}`);
});
