// Variable-BP moves (Low Kick / Grass Knot / Heavy Slam / Heat Crash / Reversal
// / Flail) carry power:null in the dex — Showdown computes them via a
// basePowerCallback. effectiveBP() has the formulas, but the null-power guards in
// calcDmg / moveListHTML / moveDetailHTML / bestDmgIdx used to reject them first,
// so they rendered as "status move (no damage)". COMPUTED_BP_MOVES now lets this
// set through. This pins the fix and guards against real status moves leaking in.
import test from 'node:test';
import { calcDmg, setState, DEX } from './harness.js';
import { mkMon, mkSide, mkField } from './fixtures.js';

// Low Kick / Grass Knot BP by target weight (kg): 20/40/60/80/100/120.
function weightTier(w) {
  if (w <= 10) return 20;
  if (w <= 25) return 40;
  if (w <= 50) return 60;
  if (w <= 100) return 80;
  if (w <= 200) return 100;
  return 120;
}

function calcMove(move, defForme) {
  const atk = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: [move] });
  const def = mkMon({ forme: defForme, nature: 'Serious' });
  const sA = mkSide(), sB = mkSide();
  setState({ atk, def, sA, sB, w: 'none', f: mkField() });
  return calcDmg(atk, move, def, sA, sB);
}

test('Low Kick / Grass Knot compute weight-based BP (not rendered as status)', () => {
  for (const move of ['Low Kick', 'Grass Knot']) {
    const forme = 'Tyranitar';
    const w = DEX.formes[forme]?.weight_kg;
    if (!w) throw new Error(`${forme} has no weight_kg in the dex`);
    const r = calcMove(move, forme);
    if (!r) throw new Error(`${move} returned null (still tripping the null-power guard?)`);
    if (r.hits !== 1) throw new Error(`${move}: expected 1 hit, got ${r.hits}`);
    const exp = weightTier(w);
    if (r.bp !== exp) throw new Error(`${move} vs ${forme} (${w}kg): bp ${r.bp}, expected ${exp}`);
  }
});

test('Reversal computes an HP-based BP (not status)', () => {
  const r = calcMove('Reversal', 'Garchomp');   // full HP (hpPct 100) -> lowest tier, 20 BP
  if (!r) throw new Error('Reversal returned null');
  if (r.bp !== 20) throw new Error(`Reversal at full HP: bp ${r.bp}, expected 20`);
});

test('genuine status moves still return null (not treated as damaging)', () => {
  const r = calcMove('Swords Dance', 'Garchomp');
  if (r !== null) throw new Error(`Swords Dance must be null (status), got ${r && ('bp ' + r.bp)}`);
});
