// Psyshock / Psystrike / Secret Sword: Special-category moves that hit the
// TARGET's Def stat instead of SpD. Attacker side is unchanged (still SpA).
// Before the fix these were silently treated as ordinary Special moves.

import test from 'node:test';
import { calc, calcDmg, DEX, PSYSHOCK_MOVES } from './harness.js';
import { mkMon, mkSide, mkField } from './fixtures.js';

test('PSYSHOCK_MOVES: set exists and covers the three canonical moves', () => {
  if (!PSYSHOCK_MOVES) throw new Error('PSYSHOCK_MOVES not exported');
  ['Psyshock','Psystrike','Secret Sword'].forEach(mv => {
    if (!PSYSHOCK_MOVES.has(mv)) throw new Error(`${mv} missing from PSYSHOCK_MOVES`);
  });
});

test('Psyshock: reads defender Def, not SpD (bulky-SpD target)', () => {
  if (!DEX.moves['Psyshock']) { console.log('  (Psyshock not in dex, skip)'); return; }
  // Attacker: neutral special. Defender: two variants — Def-invested vs. SpD-invested.
  const atk = mkMon({ forme: 'Delphox-Mega', nature: 'Modest', ev: { spa: 32 }, moves: ['Psyshock'] });
  // Use Basculegion — Water/Ghost, neutral to Psychic. (Kingambit is Dark → immune.)
  const defBulkySpD = mkMon({ forme: 'Basculegion', nature: 'Careful', ev: { hp: 32, spd: 32 } });
  const defBulkyDef = mkMon({ forme: 'Basculegion', nature: 'Impish',  ev: { hp: 32, def: 32 } });
  const rDef = calc({ atk, def: defBulkyDef, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  const rSpD = calc({ atk, def: defBulkySpD, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  if (!rDef || !rSpD) throw new Error('calc returned null');
  // Psyshock hits Def — the Def-invested defender should take LESS damage than the SpD-invested one.
  // Wait — I set it up backwards. Def-invested MON should take less damage.
  // rDef = Def-invested defender, should be LESS damage than rSpD (SpD-invested).
  if (rDef.hi >= rSpD.hi) {
    throw new Error(`Psyshock should reduce damage on the Def-invested defender — Def-invested took ${rDef.hi}, SpD-invested took ${rSpD.hi}`);
  }
});

test('Psyshock: Assault Vest (SpD ×1.5) does NOT reduce damage', () => {
  if (!DEX.moves['Psyshock']) return;
  const atk = mkMon({ forme: 'Delphox-Mega', nature: 'Modest', ev: { spa: 32 }, moves: ['Psyshock'] });
  const defNoItem = mkMon({ forme: 'Basculegion', nature: 'Adamant', ev: { hp: 32, spd: 32 } });
  const defAV     = mkMon({ forme: 'Basculegion', item: 'Assault Vest', nature: 'Adamant', ev: { hp: 32, spd: 32 } });
  const rBare = calc({ atk, def: defNoItem, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  const rAV   = calc({ atk, def: defAV, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  if (!rBare || !rAV) return;
  if (rBare.hi !== rAV.hi) {
    throw new Error(`Psyshock should ignore Assault Vest (Def-read, not SpD) — bare=${rBare.hi} AV=${rAV.hi}`);
  }
});

test('Psyshock: Ice Scales (SpD ×2 defender ability) does NOT halve damage', () => {
  if (!DEX.moves['Psyshock']) return;
  const atk = mkMon({ forme: 'Delphox-Mega', nature: 'Modest', ev: { spa: 32 }, moves: ['Psyshock'] });
  const defBare  = mkMon({ forme: 'Basculegion', ability: 'Adaptability', nature: 'Careful', ev: { hp: 32, spd: 32 } });
  const defScale = mkMon({ forme: 'Basculegion', ability: 'Ice Scales',   nature: 'Careful', ev: { hp: 32, spd: 32 } });
  const rBare  = calc({ atk, def: defBare,  sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  const rScale = calc({ atk, def: defScale, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  if (!rBare || !rScale) return;
  if (rScale.hi !== rBare.hi) {
    throw new Error(`Psyshock should bypass Ice Scales — bare=${rBare.hi} scaled=${rScale.hi}`);
  }
});

test('Psyshock: Fur Coat (Def ×2 defender ability) DOES halve damage', () => {
  if (!DEX.moves['Psyshock']) return;
  const atk = mkMon({ forme: 'Delphox-Mega', nature: 'Modest', ev: { spa: 32 }, moves: ['Psyshock'] });
  const defBare = mkMon({ forme: 'Furfrou', ability: 'Overcoat', nature: 'Bold', ev: { hp: 32, def: 32 } });
  const defFC   = mkMon({ forme: 'Furfrou', ability: 'Fur Coat', nature: 'Bold', ev: { hp: 32, def: 32 } });
  const rBare = calc({ atk, def: defBare, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  const rFC   = calc({ atk, def: defFC,   sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  if (!rBare || !rFC) return;
  // Fur Coat halves damage (D×2 → damage ~×0.5)
  const ratio = rFC.hi / rBare.hi;
  if (ratio > 0.6 || ratio < 0.4) {
    throw new Error(`Psyshock should be halved by Fur Coat — got ratio ${ratio.toFixed(3)} (${rBare.hi} → ${rFC.hi})`);
  }
});

test('Psyshock: defender +2 Def cuts damage; +2 SpD does NOT', () => {
  if (!DEX.moves['Psyshock']) return;
  const atk = mkMon({ forme: 'Delphox-Mega', nature: 'Modest', ev: { spa: 32 }, moves: ['Psyshock'] });
  const defPlusDef = mkMon({ forme: 'Basculegion', nature: 'Adamant', ev: { hp: 32 }, boost: { def: 2 } });
  const defPlusSpD = mkMon({ forme: 'Basculegion', nature: 'Adamant', ev: { hp: 32 }, boost: { spd: 2 } });
  const rDef = calc({ atk, def: defPlusDef, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  const rSpD = calc({ atk, def: defPlusSpD, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Psyshock' });
  if (!rDef || !rSpD) return;
  if (rDef.hi >= rSpD.hi) throw new Error(`+2 Def should cut Psyshock more than +2 SpD — Def=${rDef.hi} SpD=${rSpD.hi}`);
});

test('Psyshock: Wonder Room swaps defender slot — reads target SpD stat', () => {
  if (!DEX.moves['Psyshock']) return;
  const atk = mkMon({ forme: 'Delphox-Mega', nature: 'Modest', ev: { spa: 32 }, moves: ['Psyshock'] });
  // Under Wonder Room, Def and SpD stats swap. Psyshock still "reads the Def slot"
  // but the value that lands there is the target's SpD stat. Effective damage
  // should differ from non-WR when Def and SpD differ substantially.
  const def = mkMon({ forme: 'Basculegion', nature: 'Careful', ev: { hp: 32, spd: 32 } });   // heavy SpD, no Def
  const rNoWR = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField({}), move: 'Psyshock' });
  const rWR   = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField({ wonderRoom: true }), move: 'Psyshock' });
  if (!rNoWR || !rWR) return;
  if (rNoWR.hi === rWR.hi) {
    throw new Error(`Wonder Room should change Psyshock's roll when Def ≠ SpD — noWR=${rNoWR.hi} WR=${rWR.hi}`);
  }
});
