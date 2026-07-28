// Tricky-interaction tests — Foul Play, Multiscale, spread mod, crit + Sniper,
// modifier chain sanity (the 4096 fixed-point path). Every one has been the
// subject of a real-world calc bug at some point.

import test from 'node:test';
import { calc } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio } from './fixtures.js';

test('Foul Play: reads defender Atk EV/boost, not attacker', () => {
  // Attacker is weak (Timid, 0 Atk), defender is +2 with 32 Atk EV. Foul Play's
  // damage should reflect the defender's Atk stats, not the attacker's.
  const atk = mkMon({ forme: 'Zoroark-Hisui', nature: 'Timid', ev: { spa: 32, spe: 32 }, moves: ['Foul Play'] });
  const weakDef = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 0 } });
  const strongDef = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, boost: { atk: 2 } });
  const rW = calc({ atk, def: weakDef, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  const rS = calc({ atk, def: strongDef, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  if (rS.hi <= rW.hi) throw new Error(`Foul Play should scale with defender Atk — rW=${rW.hi} rS=${rS.hi}`);
});

test("Foul Play: attacker's Choice Band does NOT boost, defender's DOES", () => {
  // Foul Play reads the defender's Attack modifiers (per Bulbapedia). A Choice
  // Band on the attacker (Oranguru) should be a no-op; a Choice Band on the
  // defender (Lycanroc-Dusk) should boost by 1.5×.
  const atkPlain = mkMon({ forme: 'Oranguru', item: '', nature: 'Serious', ev: {}, moves: ['Foul Play'] });
  const atkCB    = mkMon({ forme: 'Oranguru', item: 'Choice Band', nature: 'Serious', ev: {}, moves: ['Foul Play'] });
  const defPlain = mkMon({ forme: 'Lycanroc-Dusk', item: '', nature: 'Adamant', ev: { atk: 32, spe: 32 } });
  const defCB    = mkMon({ forme: 'Lycanroc-Dusk', item: 'Choice Band', nature: 'Adamant', ev: { atk: 32, spe: 32 } });
  const rAttackerCB = calc({ atk: atkCB, def: defPlain, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  const rBaseline   = calc({ atk: atkPlain, def: defPlain, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  const rDefenderCB = calc({ atk: atkPlain, def: defCB, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  if (!rBaseline || !rAttackerCB || !rDefenderCB) return;
  if (rAttackerCB.hi !== rBaseline.hi) throw new Error(`Attacker's Choice Band leaked into Foul Play — baseline=${rBaseline.hi} attackerCB=${rAttackerCB.hi}`);
  if (rDefenderCB.hi <= rBaseline.hi) throw new Error(`Defender's Choice Band should boost Foul Play — baseline=${rBaseline.hi} defenderCB=${rDefenderCB.hi}`);
});

test("Foul Play: attacker's burn does NOT halve, defender's DOES", () => {
  // Same principle — burn's ×0.5 physical debuff follows the Atk-owner.
  const atkClean  = mkMon({ forme: 'Oranguru', nature: 'Serious', ev: {}, moves: ['Foul Play'] });
  const atkBurned = mkMon({ forme: 'Oranguru', nature: 'Serious', ev: {}, status: 'brn', moves: ['Foul Play'] });
  const defClean  = mkMon({ forme: 'Lycanroc-Dusk', nature: 'Adamant', ev: { atk: 32, spe: 32 } });
  const defBurned = mkMon({ forme: 'Lycanroc-Dusk', nature: 'Adamant', ev: { atk: 32, spe: 32 }, status: 'brn' });
  const rAttackerBurn = calc({ atk: atkBurned, def: defClean, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  const rBaseline     = calc({ atk: atkClean, def: defClean, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  const rDefenderBurn = calc({ atk: atkClean, def: defBurned, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Foul Play' });
  if (!rBaseline || !rAttackerBurn || !rDefenderBurn) return;
  if (rAttackerBurn.hi !== rBaseline.hi) throw new Error(`Attacker's burn leaked into Foul Play — baseline=${rBaseline.hi} attackerBurn=${rAttackerBurn.hi}`);
  if (rDefenderBurn.hi >= rBaseline.hi) throw new Error(`Defender's burn should halve Foul Play — baseline=${rBaseline.hi} defenderBurn=${rDefenderBurn.hi}`);
});

test('Multiscale: full HP → ×0.5, sub-100% → no reduction', () => {
  const atk = mkMon({ forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Draco Meteor'] });
  const full = mkMon({ forme: 'Kingambit', ability: 'Multiscale', hpPct: 100 });
  const almost = mkMon({ forme: 'Kingambit', ability: 'Multiscale', hpPct: 99 });
  const rF = calc({ atk, def: full, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Draco Meteor' });
  const rA = calc({ atk, def: almost, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Draco Meteor' });
  assertRatio(rF.hi / rA.hi, 0.5, 'Multiscale full-HP halving');
});

test('Sniper crit: ×1.5 crit × ×1.5 Sniper = ×2.25', () => {
  const base = { forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Draco Meteor'] };
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const noCrit = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Draco Meteor' });
  const critSniper = calc({ atk: mkMon({ ...base, ability: 'Sniper' }), def, sA: mkSide({ crit: true }), sB: mkSide(), w: 'none', f: mkField(), move: 'Draco Meteor' });
  assertRatio(critSniper.hi / noCrit.hi, 2.25, 'Sniper crit');
});

test('Life Orb: ×1.3 exact via 4096-fixed-point (not float 1.29-drift)', () => {
  const base = { forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Thunderbolt'] };
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon(base), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  const lo = calc({ atk: mkMon({ ...base, item: 'Life Orb' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  assertRatio(lo.hi / bare.hi, 1.3, 'Life Orb');
});

test('Sun + Fire Mane stacked: 1.5 × 1.5 = 2.25 exact', () => {
  const atk = mkMon({ forme: 'Pyroar-Mega', ability: 'Fire Mane', nature: 'Modest', ev: { spa: 32 }, moves: ['Heat Wave'] });
  const bareAtk = mkMon({ ...atk, ability: '' });
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const bare = calc({ atk: bareAtk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Heat Wave' });
  const stacked = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'sun', f: mkField(), move: 'Heat Wave' });
  assertRatio(stacked.hi / bare.hi, 2.25, 'Sun × Fire Mane');
});

test('Intimidate + Defiant: net +1 Atk (not -1)', () => {
  const withIntim = calc({
    atk: mkMon({ forme: 'Kingambit', ability: 'Defiant', nature: 'Adamant', ev: { atk: 32 }, moves: ['Kowtow Cleave'] }),
    def: mkMon({ forme: 'Incineroar', ability: 'Intimidate', nature: 'Careful', ev: { hp: 32, spd: 32 } }),
    sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave',
  });
  const withoutIntim = calc({
    atk: mkMon({ forme: 'Kingambit', ability: '', nature: 'Adamant', ev: { atk: 32 }, moves: ['Kowtow Cleave'] }),
    def: mkMon({ forme: 'Incineroar', ability: '', nature: 'Careful', ev: { hp: 32, spd: 32 } }),
    sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Kowtow Cleave',
  });
  // Net +1 Atk boost = ×1.5 damage
  assertRatio(withIntim.hi / withoutIntim.hi, 1.5, 'Defiant nets +1 vs Intimidate');
});

test('Body Press: damage scales with user Def (and Def stage), not Atk', () => {
  const base = mkMon({ forme: 'Avalugg', nature: 'Impish', ev: { def: 32 }, moves: ['Body Press'] });
  const def = mkMon({ forme: 'Milotic', ev: { hp: 32 } });
  const plain    = calc({ atk: base, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Press' });
  const plusDef  = calc({ atk: mkMon({ ...base, boost: { def: 2 } }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Press' });
  const plusAtk  = calc({ atk: mkMon({ ...base, boost: { atk: 2 } }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Press' });
  assertRatio(plusDef.hi / plain.hi, 2.0, '+2 Def stage doubles Body Press');
  assertRatio(plusAtk.hi / plain.hi, 1.0, '+2 Atk stage does NOT affect Body Press');
});

test('Body Press: Intimidate is ignored (uses Def, not Atk)', () => {
  const base = mkMon({ forme: 'Avalugg', nature: 'Impish', ev: { def: 32 }, moves: ['Body Press'] });
  const def = mkMon({ forme: 'Incineroar', ev: { hp: 32 } });   // same defender, toggle only the ability
  const noIntim = calc({ atk: base, def: mkMon({ ...def, ability: '' }),          sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Press' });
  const vsIntim = calc({ atk: base, def: mkMon({ ...def, ability: 'Intimidate' }), sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Press' });
  // Intimidate lowers Atk; Body Press reads Def, so damage must be identical.
  assertRatio(vsIntim.hi / noIntim.hi, 1.0, 'Intimidate does not weaken Body Press');
});

test('Body Press: Choice Band still boosts it (Atk modifier, not a stage)', () => {
  const bare = mkMon({ forme: 'Avalugg', nature: 'Impish', ev: { def: 32 }, moves: ['Body Press'] });
  const band = mkMon({ ...bare, item: 'Choice Band' });
  const def = mkMon({ forme: 'Milotic', ev: { hp: 32 } });
  const rBare = calc({ atk: bare, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Press' });
  const rBand = calc({ atk: band, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Body Press' });
  assertRatio(rBand.hi / rBare.hi, 1.5, 'Choice Band ×1.5 applies to Body Press');
});

test('Facade: burned nets 2× (BP doubled AND burn Atk-cut ignored)', () => {
  const atk = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Facade'] });
  const def = mkMon({ forme: 'Milotic', ev: { hp: 32 } });   // Water → neutral vs Normal
  const healthy = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Facade' });
  const burned  = calc({ atk: mkMon({ ...atk, status: 'brn' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Facade' });
  // Without the fix this was 0.5× (no BP doubling + burn halving). Correct = 2×.
  assertRatio(burned.hi / healthy.hi, 2.0, 'Facade burned = 2×, not 0.5×');
});

test('Facade: paralysis doubles BP (no Atk cut) = 2×', () => {
  const atk = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Facade'] });
  const def = mkMon({ forme: 'Milotic', ev: { hp: 32 } });
  const healthy = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Facade' });
  const para    = calc({ atk: mkMon({ ...atk, status: 'par' }), def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Facade' });
  assertRatio(para.hi / healthy.hi, 2.0, 'Facade paralysed = 2× BP');
});

test('Competitive vs Intimidate: +2 SpA on a special move', () => {
  const withIntim = calc({
    atk: mkMon({ forme: 'Milotic', ability: 'Competitive', nature: 'Modest', ev: { spa: 32 }, moves: ['Scald'] }),
    def: mkMon({ forme: 'Incineroar', ability: 'Intimidate', nature: 'Careful', ev: { hp: 32, spd: 20 } }),
    sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Scald',
  });
  const withoutIntim = calc({
    atk: mkMon({ forme: 'Milotic', ability: '', nature: 'Modest', ev: { spa: 32 }, moves: ['Scald'] }),
    def: mkMon({ forme: 'Incineroar', ability: '', nature: 'Careful', ev: { hp: 32, spd: 20 } }),
    sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Scald',
  });
  // +2 SpA = ×(2+2)/2 = ×2.0 on the special stat -> ~2× damage
  assertRatio(withIntim.hi / withoutIntim.hi, 2.0, 'Competitive +2 SpA vs Intimidate');
});

test('Competitive override: SpA boost -2 nets to +0 (Milotic brought in later)', () => {
  // The UI stores boost.spa = -2 when the user clicks the SpA "0" chip on a
  // Competitive mon facing Intimidate; that must net to the same damage as a
  // mon with no Competitive at all (Competitive never triggered — switched in
  // after the Intimidate already resolved).
  const netZero = calc({
    atk: mkMon({ forme: 'Milotic', ability: 'Competitive', nature: 'Modest', ev: { spa: 32 }, boost: { spa: -2 }, moves: ['Scald'] }),
    def: mkMon({ forme: 'Incineroar', ability: 'Intimidate', nature: 'Careful', ev: { hp: 32, spd: 20 } }),
    sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Scald',
  });
  const baseline = calc({
    atk: mkMon({ forme: 'Milotic', ability: '', nature: 'Modest', ev: { spa: 32 }, moves: ['Scald'] }),
    def: mkMon({ forme: 'Incineroar', ability: '', nature: 'Careful', ev: { hp: 32, spd: 20 } }),
    sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Scald',
  });
  assertRatio(netZero.hi / baseline.hi, 1.0, 'Competitive +2 backed out by -2 boost = no boost');
});
