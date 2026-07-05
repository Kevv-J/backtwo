// Champions-invented mechanics — pinned as current truth (there's no external
// oracle for these). Any change to the calc that shifts these numbers is a
// regression worth catching before it ships.

import test from 'node:test';
import { calc } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio } from './fixtures.js';

test('Fire Mane (Mega Pyroar): Fire moves ×1.5 unconditional', () => {
  const atk = mkMon({ forme: 'Pyroar-Mega', ability: 'Fire Mane', nature: 'Modest', ev: { spa: 32 }, moves: ['Heat Wave'] });
  const def = mkMon({ forme: 'Kingambit' });
  const bare = calc({ atk: mkMon({ ...atk, ability: '' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  const fm = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  assertRatio(fm.hi / bare.hi, 1.5, 'Fire Mane');
});

test('Fairy Aura toggle: Fairy moves ×1.33 field-wide', () => {
  const atk = mkMon({ forme: 'Floette-Eternal-Mega', ability: 'Fairy Aura', nature: 'Modest', ev: { spa: 32 }, moves: ['Dazzling Gleam'] });
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const off = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Dazzling Gleam' });
  const on = calc({ atk, def, sA: mkSide({ fairyAura: true }), sB: mkSide(), w: 'none', f: mkField(), move: 'Dazzling Gleam' });
  assertRatio(on.hi / off.hi, 1.33, 'Fairy Aura toggle');
});

test('Eelevate (Mega Eelektross): Ground immunity → eff=0', () => {
  const atk = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] });
  const def = mkMon({ forme: 'Eelektross-Mega', ability: 'Eelevate' });
  const r = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  if (r.eff !== 0) throw new Error(`expected eff=0, got eff=${r.eff}`);
});

test('Mega Sol (Mega Meganium): own Fire moves ×1.5 in no weather', () => {
  const atk = mkMon({ forme: 'Meganium-Mega', ability: 'Mega Sol', nature: 'Modest', ev: { spa: 32 }, moves: ['Overheat'] });
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const off = calc({ atk: mkMon({ ...atk, ability: '' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Overheat' });
  const on = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Overheat' });
  assertRatio(on.hi / off.hi, 1.5, 'Mega Sol Fire boost');
});

test('Dragonize (Mega Feraligatr): Normal moves become Dragon-type with ×1.2', () => {
  const atk = mkMon({ forme: 'Feraligatr-Mega', ability: 'Dragonize', nature: 'Adamant', ev: { atk: 32 }, moves: ['Body Slam'] });
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const r = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Slam' });
  if (r.moveType !== 'dragon') throw new Error(`expected dragon-type after -ate, got ${r.moveType}`);
});
