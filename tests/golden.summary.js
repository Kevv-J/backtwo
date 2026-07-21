// calcSummary tests — the Showdown-style summary line.
// Ability inlining must fire ONLY when the ability actually moves the roll.
// Water Spout via a Mega Launcher user is the canary — pulse-gated ability
// on a non-pulse move must NOT appear in the summary.

import test from 'node:test';
import { calc, calcDmg, calcSummary, DEX, setState } from './harness.js';
import { mkMon, mkSide, mkField } from './fixtures.js';

// Helper: run a full calc and build the summary in one go.
function summarize({ atk, def, w = 'none', f = mkField(), sA = mkSide(), sB = mkSide(), move }) {
  setState({ atk, def, sA, sB, w, f });
  const info = DEX.moves[move];
  const r = calcDmg(atk, move, def, sA, sB);
  if (!r) return null;
  return calcSummary(atk, def, move, info, r, sA, sB);
}

test('summary: Mega Launcher does NOT inline on Water Spout (non-pulse move)', () => {
  const atk = mkMon({ forme: 'Blastoise-Mega', ability: 'Mega Launcher', nature: 'Modest',
                      ev: { hp: 32, spa: 32 }, moves: ['Water Spout'] });
  const def = mkMon({ forme: 'Charizard', nature: 'Modest', ev: { hp: 32 } });
  const s = summarize({ atk, def, move: 'Water Spout' });
  if (!s) throw new Error('summary was null');
  if (s.includes('Mega Launcher')) {
    throw new Error(`Mega Launcher should NOT appear in Water Spout summary — got: ${s}`);
  }
});

test('summary: Mega Launcher DOES inline on Aura Sphere (pulse move)', () => {
  const atk = mkMon({ forme: 'Blastoise-Mega', ability: 'Mega Launcher', nature: 'Modest',
                      ev: { hp: 32, spa: 32 }, moves: ['Aura Sphere'] });
  const def = mkMon({ forme: 'Charizard', nature: 'Modest', ev: { hp: 32 } });
  const s = summarize({ atk, def, move: 'Aura Sphere' });
  if (!s) return; // not in dex, skip
  if (!s.includes('Mega Launcher')) {
    throw new Error(`Mega Launcher should appear in Aura Sphere summary — got: ${s}`);
  }
});

test('summary: Multiscale inlines only when defender is at full HP', () => {
  const atk = mkMon({ forme: 'Charizard-Mega-Y', ability: 'Drought', nature: 'Modest',
                      ev: { spa: 32 }, moves: ['Flamethrower'] });
  const defFull = mkMon({ forme: 'Dragonite', ability: 'Multiscale', nature: 'Adamant',
                          ev: { hp: 32 }, hpPct: 100 });
  const defHurt = mkMon({ forme: 'Dragonite', ability: 'Multiscale', nature: 'Adamant',
                          ev: { hp: 32 }, hpPct: 50 });
  const sFull = summarize({ atk, def: defFull, w: 'sun', move: 'Flamethrower' });
  const sHurt = summarize({ atk, def: defHurt, w: 'sun', move: 'Flamethrower' });
  if (!sFull || !sHurt) return;
  if (!sFull.includes('Multiscale')) throw new Error(`Multiscale should appear at 100% HP — got: ${sFull}`);
  if (sHurt.includes('Multiscale'))   throw new Error(`Multiscale should NOT appear below 100% HP — got: ${sHurt}`);
});

test('summary: Psyshock label reads "Def" not "SpD"', () => {
  if (!DEX.moves['Psyshock']) return;
  const atk = mkMon({ forme: 'Delphox-Mega', nature: 'Modest', ev: { spa: 32 }, moves: ['Psyshock'] });
  const def = mkMon({ forme: 'Basculegion', nature: 'Adamant', ev: { hp: 32, def: 32 } });   // Water/Ghost — neutral to Psychic
  const s = summarize({ atk, def, move: 'Psyshock' });
  if (!s) return;
  // Must mention Def, must NOT mention SpD (in the defender slot).
  const defSlot = s.split(' vs. ')[1] || '';
  if (defSlot.includes('SpD')) throw new Error(`Psyshock summary should say "Def" not "SpD" — got: ${s}`);
  if (!defSlot.includes('Def')) throw new Error(`Psyshock summary should mention "Def" — got: ${s}`);
});

test('summary: Iron Fist inlines on a punch-flag move, NOT on non-punch (Sucker Punch is not a punch move)', () => {
  // Ice Punch has the punch flag; Sucker Punch does NOT (name is misleading).
  const atkA = mkMon({ forme: 'Kingambit', ability: 'Iron Fist', nature: 'Adamant',
                       ev: { atk: 32 }, moves: ['Ice Punch','Sucker Punch'] });
  const def = mkMon({ forme: 'Basculegion', nature: 'Adamant', ev: { hp: 32 } });
  const sPunch = summarize({ atk: atkA, def, move: 'Ice Punch' });
  const sSucker = summarize({ atk: atkA, def, move: 'Sucker Punch' });
  if (sPunch && !sPunch.includes('Iron Fist')) throw new Error(`Iron Fist should appear on Ice Punch — got: ${sPunch}`);
  if (sSucker && sSucker.includes('Iron Fist')) throw new Error(`Iron Fist should NOT appear on Sucker Punch (no punch flag) — got: ${sSucker}`);
});

test('summary: Adaptability inlines only when the move is STAB', () => {
  // Basculegion is Water/Ghost; Wave Crash is Water (STAB → Adaptability applies)
  const atkStab = mkMon({ forme: 'Basculegion', ability: 'Adaptability', nature: 'Adamant',
                          ev: { atk: 32 }, moves: ['Wave Crash'] });
  const atkNonStab = mkMon({ forme: 'Basculegion', ability: 'Adaptability', nature: 'Adamant',
                             ev: { atk: 32 }, moves: ['Zen Headbutt'] });   // Psychic, non-STAB
  const def = mkMon({ forme: 'Sneasler', nature: 'Adamant', ev: { hp: 32 } });
  const sStab = summarize({ atk: atkStab, def, move: 'Wave Crash' });
  const sNon  = summarize({ atk: atkNonStab, def, move: 'Zen Headbutt' });
  if (!sStab || !sNon) return;
  if (!sStab.includes('Adaptability')) throw new Error(`Adaptability should appear on STAB — got: ${sStab}`);
  if (sNon.includes('Adaptability')) throw new Error(`Adaptability should NOT appear on non-STAB — got: ${sNon}`);
});
