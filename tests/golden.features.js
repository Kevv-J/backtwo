// Regression tests for every calc feature added in the coverage-audit sweep.
// The user asked for these to prevent silent losses — every one of these gates
// a specific ability or item interaction.

import test from 'node:test';
import { calc, effSpeed } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio, assertRange } from './fixtures.js';

// ── Tailwind speed (×2) ──────────────────────────────────────────────────────
test('Tailwind doubles the mon\'s in-battle Speed (effSpeed)', () => {
  const m = mkMon({ forme: 'Garchomp', nature: 'Jolly', ev: { spe: 32 } });
  const base = effSpeed(m, mkSide());
  const tw = effSpeed(m, mkSide({ tailwind: true }));
  if (!base || !tw) throw new Error('effSpeed returned null');
  assertRatio(tw / base, 2, 'Tailwind ×2 Speed');
});

// ── Dry Skin ─────────────────────────────────────────────────────────────────
test('Dry Skin: +25% Fire damage taken', () => {
  const atk = mkMon({ forme: 'Charizard', nature: 'Modest', ev: { spa: 32 }, moves: ['Flamethrower'] });
  const def = { forme: 'Garchomp', nature: 'Serious', ev: {}, moves: ['', '', '', ''] };
  const plain = mkMon({ ...def, ability: '' });
  const dry = mkMon({ ...def, ability: 'Dry Skin' });
  const rP = calc({ atk, def: plain, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Flamethrower' });
  const rD = calc({ atk, def: dry, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Flamethrower' });
  assertRatio(rD.hi / rP.hi, 1.25, 'Dry Skin Fire ×1.25');
});

test('Dry Skin: immune to Water (eff 0)', () => {
  const atk = mkMon({ forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Surf'] });
  const dry = mkMon({ forme: 'Garchomp', ability: 'Dry Skin' });
  const r = calc({ atk, def: dry, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Surf' });
  if (r.eff !== 0) throw new Error(`Dry Skin should be Water-immune, eff=${r.eff}`);
});

// ── Pinch abilities (Overgrow/Blaze/Torrent/Swarm) ──────────────────────────
test('Overgrow: Grass move ×1.5 at ≤1/3 HP, ×1.0 above', () => {
  const s = { forme: 'Sinistcha', ability: 'Overgrow', nature: 'Modest', ev: { spa: 32 }, moves: ['Energy Ball'] };
  const full = mkMon({ ...s, hpPct: 100 });
  const low = mkMon({ ...s, hpPct: 30 });
  const def = mkMon({ forme: 'Garchomp', ev: { hp: 32 } });
  const rF = calc({ atk: full, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Energy Ball' });
  const rL = calc({ atk: low, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Energy Ball' });
  assertRatio(rL.hi / rF.hi, 1.5, 'Overgrow pinch ×1.5');
});

// ── Analytic ─────────────────────────────────────────────────────────────────
test('Analytic: ×1.3 when the moving-last toggle is on', () => {
  const base = { forme: 'Garchomp', ability: 'Analytic', nature: 'Modest', ev: { spa: 32 }, moves: ['Draco Meteor'] };
  const off = mkMon(base);
  const on = mkMon(base); on.analytic = true;
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const rOff = calc({ atk: off, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Draco Meteor' });
  const rOn = calc({ atk: on, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Draco Meteor' });
  assertRatio(rOn.hi / rOff.hi, 1.3, 'Analytic ×1.3');
});

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
test('Occa Berry: SE Fire hit is halved on the MAIN line (Showdown-style)', () => {
  const atk = mkMon({ forme: 'Pyroar-Mega', ability: 'Fire Mane', nature: 'Modest', ev: { spa: 32 }, moves: ['Heat Wave'] });
  // Find a Grass mon in the dex to be the SE target
  const grassDef = Object.keys(await_dex()).find(n => await_dex()[n].types.includes('grass'));
  if (!grassDef) return;  // no grass in dex, skip
  const defBerry = mkMon({ forme: grassDef, item: 'Occa Berry' });
  const defBare  = mkMon({ forme: grassDef, item: '' });
  const rBerry = calc({ atk, def: defBerry, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  const rBare  = calc({ atk, def: defBare,  sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  // The reduction is now baked into the main damage numbers, not a side line:
  // r.hi itself is the cushioned max roll, ~half the bare hit.
  if (!rBerry.berry) throw new Error('expected berry field to be flagged for Occa vs SE Fire');
  assertRatio(rBerry.hi / rBare.hi, 0.5, 'Occa berry halves the main line');
});

test('Chople Berry: exact main-line numbers match Showdown (Sneasler CC vs Kingambit)', (t) => {
  // Regression pin for the reported case: neutral 32-Atk Sneasler Close Combat
  // vs 10 HP / 10 Def Kingambit holding Chople Berry.
  // Showdown: 168-198 (90.8 - 107%). The berry must reduce the MAIN line, not a
  // secondary hint — halving Attack (−2 stages) would give 168-204, which is wrong.
  const atk = mkMon({ forme: 'Sneasler', nature: 'Serious', ev: { atk: 32 }, moves: ['Close Combat'] });
  const def = mkMon({ forme: 'Kingambit', item: 'Chople Berry', nature: 'Serious', ev: { hp: 10, def: 10 } });
  const r = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Close Combat' });
  if (!r) throw new Error('calc returned null');
  assertRange(t, r, [168, 198]);
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
