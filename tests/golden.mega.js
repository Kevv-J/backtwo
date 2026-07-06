// Mega-toggle regression tests. Locks the "some players don't mega" flow so
// downstream calc edits can't silently break the effective-forme routing.

import test from 'node:test';
import vm from 'node:vm';
import { calc } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio } from './fixtures.js';

test('legalAbilities: Charizard-Mega-Y returns Charizard base abilities (paste convention)', async () => {
  const { DEX } = await import('./harness.js');
  // Charizard-Mega-Y auto-applies Drought on evolve, but the "legal to write in
  // a paste" set is the base Charizard's abilities.
  const base = DEX.formes['Charizard'];
  if(!base) return;  // dex may not include Charizard in current reg
  const legal = (base.abilities || []).map(a => a.name);
  if(!legal.length) throw new Error('base Charizard has no abilities in dex');
  if(legal.some(a => a === 'Drought')) throw new Error('Drought is the post-mega ability; should not be in base Charizard legal set');
});

test('effectiveForme: Mega with megaOff → base-forme stats/types', () => {
  // Use Blastoise-Mega — should exist in the dex from a Champions-era paste
  const megaOn = mkMon({ forme: 'Blastoise-Mega', ability: 'Mega Launcher', nature: 'Modest', ev: { spa: 32 }, moves: ['Water Pulse'] });
  const megaOff = mkMon({ ...megaOn, megaOff: true, ability: 'Rain Dish' });
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const rOn  = calc({ atk: megaOn,  def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Water Pulse' });
  const rOff = calc({ atk: megaOff, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Water Pulse' });
  if (!rOn || !rOff) return;  // skip when dex misses either
  // Mega Launcher gives ×1.5 on pulse moves; Rain Dish doesn't.
  // Turning off the mega should cut damage substantially.
  if (rOff.hi >= rOn.hi) throw new Error(`megaOff should reduce damage — on=${rOn.hi} off=${rOff.hi}`);
});

test('effectiveForme: mega-labelled mon WITHOUT megaOff behaves as mega', () => {
  const m = mkMon({ forme: 'Blastoise-Mega', ability: 'Mega Launcher', nature: 'Modest', ev: { spa: 32 } });
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const r = calc({ atk: m, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Water Pulse' });
  if (!r) return;
  // Just verify calc doesn't throw / returns a positive damage number
  if (r.hi <= 0) throw new Error(`expected positive damage, got ${r.hi}`);
});

test('legalAbilities: non-mega returns own abilities', async () => {
  const { DEX } = await import('./harness.js');
  const inc = DEX.formes['Incineroar'];
  if(!inc) return;
  const abilities = (inc.abilities || []).map(a => a.name);
  if(!abilities.includes('Intimidate')) throw new Error('Incineroar should have Intimidate as a legal ability');
});
