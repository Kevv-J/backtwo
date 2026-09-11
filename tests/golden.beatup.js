// Beat Up — one strike per HEALTHY participant; each strike's BP = 5+floor(that
// member's BASE Attack/10), with the attack stat + Dark STAB coming from the
// on-screen user (Gen V+, per Showdown's data/moves.ts basePowerCallback +
// Bulbapedia). Champions is bring-of-4, so the strike count caps at 4 and is
// driven by atk.beatup — a manual 1–4 counter (like the Rage Fist stepper),
// default 4, since teammates' live status/faint isn't simulated.
//
// Bug-first pin: Beat Up stores power:null (it uses a basePowerCallback in
// Showdown), so before the fix calcDmg tripped the `!mv.power` guard and returned
// null (the UI rendered "status move, no damage"). These went RED against that
// and GREEN once the per-hit party-Attack path landed. Numbers were reproduced
// against the engine's own baseFor()/oneRoll() multi-hit summation.
import { test } from 'node:test';
import { calcDmg, setState } from './harness.js';
import { mkMon, mkSide, mkField, assertRange } from './fixtures.js';

const T = { diagnostic() {} };

function beatUp(partyAtks, healthy) {
  // Kingambit (Dark/Steel, base Atk 135), Adamant, 32 SP Atk -> live Atk 205.
  const atk = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Beat Up'] });
  if (healthy != null) atk.beatup = healthy;
  // Garchomp (Dragon/Ground), 0 EV Serious -> Def 115, HP 183. Dark is neutral.
  const def = mkMon({ forme: 'Garchomp', nature: 'Serious' });
  const sA = mkSide(), sB = mkSide();
  setState({ atk, def, sA, sB, w: 'none', f: mkField() });
  return calcDmg(atk, 'Beat Up', def, sA, sB, partyAtks ? { partyAtks } : undefined);
}

test('Beat Up caps at 4 strikes (bring-of-4), using the first 4 party base Atks', () => {
  // Six base Atks passed, but the default healthy-ally counter is 4 -> the first
  // four [135,130,120,110] -> per-hit BP [18,18,17,16].
  const r = beatUp([135, 130, 120, 110, 100, 90]);
  if (!r) throw new Error('Beat Up returned null (still tripping the !mv.power guard?)');
  if (r.hits !== 4) throw new Error(`expected 4 strikes (bring-of-4 cap), got ${r.hits}`);
  assertRange(T, r, [72, 91]);   // 39.3%–49.7% of Garchomp's 183 HP
});

test('Beat Up: the healthy-ally counter reduces the strike count', () => {
  const r = beatUp([135, 130, 120, 110, 100, 90], 2);   // only 2 healthy -> BP [18,18]
  if (r.hits !== 2) throw new Error(`expected 2 strikes, got ${r.hits}`);
  assertRange(T, r, [38, 48]);   // 19–24 + 19–24
});

test('Beat Up: lone Pokémon (counter 1, no party) is a single strike off its own base Atk', () => {
  const r = beatUp(null, 1);     // Kingambit base Atk 135 -> BP 18
  if (r.hits !== 1) throw new Error(`expected 1 strike, got ${r.hits}`);
  assertRange(T, r, [19, 24]);
});
