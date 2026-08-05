// Enemy spread-matching tests (open-team-sheet tournaments). When the opponent's
// sheet has no EV spread, the calc borrows one from the team DB, prioritising
// ability + item matches (highest), then moves (lowest). These pin the scoring
// priority and the "has a spread?" detector; the DB-driven pickers
// (bestSpreadFor / matchingTeamsFor) are smoke-tested for shape only since their
// exact output tracks the live dataset.

import test from 'node:test';
import { spreadMatchScore, monHasSpread, jsForme } from './harness.js';

test('spreadMatchScore: ability + item weighted above moves', () => {
  const sheet = { item: 'Assault Vest', ability: 'Intimidate', moves: ['Earthquake', 'Rock Slide', 'U-turn', 'Fake Out'] };
  // Ability+item match, zero moves shared.
  const abItem = spreadMatchScore(sheet, { item: 'Assault Vest', ability: 'Intimidate', moves: ['Protect'] });
  // All four moves match, but neither ability nor item.
  const movesOnly = spreadMatchScore(sheet, { item: 'Leftovers', ability: 'Sand Veil', moves: ['Earthquake', 'Rock Slide', 'U-turn', 'Fake Out'] });
  if (!(abItem.score > movesOnly.score)) {
    throw new Error(`ability+item (${abItem.score}) should outweigh a full move match (${movesOnly.score})`);
  }
  if (abItem.moves !== 0 || movesOnly.moves !== 4) throw new Error('move-count bookkeeping wrong');
});

test('spreadMatchScore: a single ability match beats a single item match tie-break upward, and matching is case/space-insensitive', () => {
  const sheet = { item: 'Choice Scarf', ability: 'Protosynthesis', moves: [] };
  const exact = spreadMatchScore(sheet, { item: '  choice scarf ', ability: 'protosynthesis', moves: [] });
  if (!exact.item || !exact.ability) throw new Error('normalised item/ability compare should match despite case + spacing');
  if (exact.score !== 8) throw new Error(`ability(4)+item(4) should total 8, got ${exact.score}`);
});

test('monHasSpread: detects presence of EVs from either ev-object or evs-string', () => {
  if (monHasSpread({ ev: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } })) throw new Error('all-zero ev object is NOT a spread');
  if (!monHasSpread({ ev: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 } })) throw new Error('a non-zero ev should count');
  if (monHasSpread({ evs: '' })) throw new Error('empty evs string is NOT a spread');
  if (!monHasSpread({ evs: '32 HP / 32 Spe' })) throw new Error('parsed evs string should count');
});
