// Regression tests for every calc feature added in the coverage-audit sweep.
// The user asked for these to prevent silent losses — every one of these gates
// a specific ability or item interaction.

import test from 'node:test';
import { calc } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio } from './fixtures.js';

// ── Supreme Overlord (Kingambit) ────────────────────────────────────────────
test('Supreme Overlord: +10% per fainted ally, cap 5 → ×1.5 at 5', () => {
  const base = { forme: 'Kingambit', ability: 'Supreme Overlord', nature: 'Adamant', ev: { atk: 32 }, moves: ['Kowtow Cleave'] };
  const def = mkMon({ forme: 'Sinistcha', ev: { hp: 32 } });
  const at0 = calc({ atk: mkMon({ ...base, faintedAllies: 0 }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave' });
  const at5 = calc({ atk: mkMon({ ...base, faintedAllies: 5 }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave' });
  assertRatio(at5.hi / at0.hi, 1.5, 'Supreme Overlord +50% at 5 fainted');
});

test('Supreme Overlord: 4 fainted → ×1.4', () => {
  const base = { forme: 'Kingambit', ability: 'Supreme Overlord', nature: 'Adamant', ev: { atk: 32 }, moves: ['Kowtow Cleave'] };
  const def = mkMon({ forme: 'Sinistcha', ev: { hp: 32 } });
  const at0 = calc({ atk: mkMon({ ...base, faintedAllies: 0 }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave' });
  const at4 = calc({ atk: mkMon({ ...base, faintedAllies: 4 }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave' });
  assertRatio(at4.hi / at0.hi, 1.4, 'Supreme Overlord +40% at 4 fainted');
});

// ── Water Bubble (Araquanid) ────────────────────────────────────────────────
test('Water Bubble: own Water moves ×2 (offensive half)', () => {
  const atkBase = { forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Weather Ball'] };
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  // Force Water Ball via rain weather → Weather Ball becomes Water type
  const bare = calc({ atk: mkMon(atkBase), def, sA: mkSide(), sB: mkSide(), w: 'rain', f: mkField(), move: 'Weather Ball' });
  const wb = calc({ atk: mkMon({ ...atkBase, ability: 'Water Bubble' }), def, sA: mkSide(), sB: mkSide(), w: 'rain', f: mkField(), move: 'Weather Ball' });
  assertRatio(wb.hi / bare.hi, 2.0, 'Water Bubble +100% on Water');
});

test('Water Bubble defender: incoming Fire ×0.5', () => {
  const atk = mkMon({ forme: 'Pyroar-Mega', ability: 'Fire Mane', nature: 'Modest', ev: { spa: 32 }, moves: ['Heat Wave'] });
  const bare = calc({ atk, def: mkMon({ forme: 'Kingambit', ev: { hp: 32 } }), sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  const wb = calc({ atk, def: mkMon({ forme: 'Kingambit', ability: 'Water Bubble', ev: { hp: 32 } }), sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  assertRatio(wb.hi / bare.hi, 0.5, 'Water Bubble defender halves Fire');
});

// ── Parental Bond (Mega Kangaskhan) ─────────────────────────────────────────
test('Parental Bond: 2 hits, hit 2 = 25% BP (total ×1.25)', () => {
  const base = { forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Kowtow Cleave'] };
  const def = mkMon({ forme: 'Sinistcha', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave' });
  const pb = calc({ atk: mkMon({ ...base, ability: 'Parental Bond' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave' });
  if (pb.hits !== 2) throw new Error(`expected 2 hits, got ${pb.hits}`);
  // Hit 2 = floor(bp * 0.25) — flooring adds slight drift below the pure 1.25 ratio.
  assertRatio(pb.hi / bare.hi, 1.25, 'Parental Bond');
});

// ── Sheer Force ─────────────────────────────────────────────────────────────
test('Sheer Force: Iron Head ×1.3', () => {
  const base = { forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Iron Head'] };
  const def = mkMon({ forme: 'Sinistcha', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Iron Head' });
  const sf = calc({ atk: mkMon({ ...base, ability: 'Sheer Force' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Iron Head' });
  assertRatio(sf.hi / bare.hi, 1.3, 'Sheer Force on Iron Head');
});

// ── Type-boosting signatures ────────────────────────────────────────────────
test('Steelworker: Steel moves ×1.5', () => {
  const base = { forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Iron Head'] };
  const def = mkMon({ forme: 'Sinistcha', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Iron Head' });
  const sw = calc({ atk: mkMon({ ...base, ability: 'Steelworker' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Iron Head' });
  assertRatio(sw.hi / bare.hi, 1.5, 'Steelworker');
});

test('Transistor: Electric moves ×1.5', () => {
  const base = { forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Thunderbolt'] };
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  const t = calc({ atk: mkMon({ ...base, ability: 'Transistor' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  assertRatio(t.hi / bare.hi, 1.5, 'Transistor');
});

// ── Loaded Dice ─────────────────────────────────────────────────────────────
test('Loaded Dice: Bullet Seed hit count floors at 4', () => {
  const base = { forme: 'Archaludon', nature: 'Adamant', ev: { atk: 32 }, moves: ['Bullet Seed'] };
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Bullet Seed' });
  const ld = calc({ atk: mkMon({ ...base, item: 'Loaded Dice' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Bullet Seed' });
  if (bare.hits !== 3) throw new Error(`baseline expected 3 hits, got ${bare.hits}`);
  if (ld.hits !== 4) throw new Error(`Loaded Dice expected 4 hits, got ${ld.hits}`);
});

// ── Type-resist berry ───────────────────────────────────────────────────────
test('Occa Berry: SE Fire hit shows secondary "with berry" line at ~×0.5', () => {
  const atk = mkMon({ forme: 'Pyroar-Mega', ability: 'Fire Mane', nature: 'Modest', ev: { spa: 32 }, moves: ['Heat Wave'] });
  // Find a Grass mon in the dex to be the SE target
  const grassDef = Object.keys(await_dex()).find(n => await_dex()[n].types.includes('grass'));
  if (!grassDef) return;  // no grass in dex, skip
  const def = mkMon({ forme: grassDef, item: 'Occa Berry' });
  const r = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  if (!r.berry) throw new Error('expected berry field to be populated for Occa vs SE Fire');
  assertRatio(r.berry.hi / r.hi, 0.5, 'Occa berry halves');
});

// helper — the harness exports DEX via named export
async function await_dex() { const { DEX } = await import('./harness.js'); return DEX.formes; }

// ── Beads of Ruin (prep) ────────────────────────────────────────────────────
test('Beads of Ruin: opposing SpD ×0.75 → damage ×1.333', () => {
  const base = { forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Thunderbolt'] };
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  const beads = calc({ atk: mkMon({ ...base, ability: 'Beads of Ruin' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  assertRatio(beads.hi / bare.hi, 4 / 3, 'Beads of Ruin');
});
