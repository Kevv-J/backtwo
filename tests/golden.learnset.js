// Move-legality tests — Champions Reg M-B learnsets pulled from Showdown's
// `champions` mod (DEX.learnsets). Drives the move picker's legal/illegal tag and
// legal-first ordering. Verified against real cases (Charizard can't learn Giga
// Drain; Mega Staraptor inherits base Staraptor).

import test from 'node:test';
import { legalMoveIds, toId, descFor, DEX } from './harness.js';

test('toId strips to Showdown-style id', () => {
  if (toId('Charizard-Mega-Y') !== 'charizardmegay') throw new Error('mega id');
  if (toId('Giga Drain') !== 'gigadrain') throw new Error('space/case');
  if (toId("Farfetch'd") !== 'farfetchd') throw new Error('apostrophe');
});

test('legalMoveIds: Charizard learns Flamethrower/Air Slash, not Giga Drain', () => {
  const L = legalMoveIds('Charizard');
  if (!L) throw new Error('Charizard should have a learnset');
  if (!L.has('flamethrower')) throw new Error('should learn Flamethrower');
  if (!L.has('airslash')) throw new Error('should learn Air Slash');
  if (L.has('gigadrain')) throw new Error('Charizard must NOT learn Giga Drain');
});

test('legalMoveIds: mega inherits the base species learnset', () => {
  const base = legalMoveIds('Staraptor');
  const mega = legalMoveIds('Staraptor-Mega');   // no own learnset → falls back to base
  if (!base || !mega) throw new Error('both should resolve');
  if (mega.size !== base.size) throw new Error(`mega should mirror base: ${mega.size} vs ${base.size}`);
  // Spot the same signature move on both.
  if (base.has('closecombat') !== mega.has('closecombat')) throw new Error('mega/base learnset mismatch');
});

test('legalMoveIds: Garchomp learns Earthquake', () => {
  const L = legalMoveIds('Garchomp');
  if (!L || !L.has('earthquake')) throw new Error('Garchomp should learn Earthquake');
});

test('legalMoveIds: unknown/absent learnset returns null (picker shows untagged)', () => {
  if (legalMoveIds('') !== null) throw new Error('empty forme → null');
  if (legalMoveIds('NotARealMon-Xyz') !== null) throw new Error('unknown forme → null');
});

test('DEX.learnsets is present and non-trivial', () => {
  if (!DEX.learnsets || Object.keys(DEX.learnsets).length < 100) throw new Error('learnsets missing/too small');
});

test('move pool is expanded past team data to the full legal set', () => {
  // The build pulls every learnset move into DEX.moves, not just team-used ones.
  if (Object.keys(DEX.moves).length < 450) throw new Error('move pool should be expanded (~500 moves)');
});

test('DEX carries Showdown item/ability effect text + the M-B roster', () => {
  if (!DEX.itemDesc || !DEX.itemDesc.lifeorb) throw new Error('itemDesc missing Life Orb');
  if (!DEX.abilityDesc || !DEX.abilityDesc.intimidate) throw new Error('abilityDesc missing Intimidate');
  if (!Array.isArray(DEX.legalSpecies) || DEX.legalSpecies.length < 100) throw new Error('legalSpecies roster missing');
});

test('descFor falls back to Showdown text for entries we do not hand-write', () => {
  // Overgrow has no hand-written ABILITY_DESC entry → comes from DEX.abilityDesc.
  const d = descFor('ability', 'Overgrow');
  if (!d || !/grass/i.test(d)) throw new Error('expected Showdown Overgrow text, got: ' + JSON.stringify(d));
  // Our hand-tuned entry still wins when present (keeps the "(not modeled)" notes).
  if (descFor('ability', 'Intimidate') !== 'Lowers opposing Atk by 1 stage on switch-in')
    throw new Error('hand-written ABILITY_DESC should take precedence');
});
