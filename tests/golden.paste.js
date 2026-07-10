// parseShowdown lenient-parse tests. Users often paste move lists without the
// canonical "- " prefix — copy from Discord / Google Doc / OCR / screenshot —
// and the old parser silently dropped those lines, so saved teams came back
// with empty movesets. Both formats must now round-trip.

import test from 'node:test';
import { parseShowdown } from './harness.js';

test('parseShowdown: canonical "- Move" format still works', () => {
  const paste = `Garchomp @ Life Orb
Ability: Rough Skin
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Dragon Claw
- Rock Slide
- Protect
- Stomping Tantrum`;
  const team = parseShowdown(paste);
  if (team.length !== 1) throw new Error(`expected 1 mon, got ${team.length}`);
  const m = team[0];
  if (m.name !== 'Garchomp') throw new Error(`name: ${m.name}`);
  if (m.item !== 'Life Orb') throw new Error(`item: ${m.item}`);
  if (m.ability !== 'Rough Skin') throw new Error(`ability: ${m.ability}`);
  if (m.nature !== 'Jolly') throw new Error(`nature: ${m.nature}`);
  const expectedMoves = ['Dragon Claw','Rock Slide','Protect','Stomping Tantrum'];
  if (JSON.stringify(m.moves) !== JSON.stringify(expectedMoves))
    throw new Error(`moves: ${JSON.stringify(m.moves)}`);
});

test('parseShowdown: lenient — accept move lines without leading "- "', () => {
  // Real-world paste from a user (Discord copy) — no dashes on move lines.
  const paste = `Garchomp @ Quick Claw
Ability: Rough Skin
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
Dragon Claw
Rock Slide
Protect
Stomping Tantrum`;
  const [m] = parseShowdown(paste);
  const expected = ['Dragon Claw','Rock Slide','Protect','Stomping Tantrum'];
  if (JSON.stringify(m.moves) !== JSON.stringify(expected))
    throw new Error(`dash-less moves not recovered — got ${JSON.stringify(m.moves)}`);
  if (m.nature !== 'Jolly') throw new Error(`nature clobbered: ${m.nature}`);
});

test('parseShowdown: mixed dashed + dashless in same block', () => {
  const paste = `Sneasler @ Focus Sash
Ability: Unburden
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Dire Claw
Protect
- Close Combat
Fake Out`;
  const [m] = parseShowdown(paste);
  if (JSON.stringify(m.moves) !== JSON.stringify(['Dire Claw','Protect','Close Combat','Fake Out']))
    throw new Error(`mixed dashes not handled — got ${JSON.stringify(m.moves)}`);
});

test('parseShowdown: no Nature line (defaults to Serious), dashless moves', () => {
  // Gholdengo variant from the same user paste — no explicit Nature line.
  const paste = `Gholdengo @ Life Orb
Ability: Good As Gold
EVs: 32 SpA / 2 SpD / 32 Spe
Protect
Shadow Ball
Make It Rain
Nasty Plot`;
  const [m] = parseShowdown(paste);
  if (m.nature !== 'Serious') throw new Error(`nature: ${m.nature}`);
  if (JSON.stringify(m.moves) !== JSON.stringify(['Protect','Shadow Ball','Make It Rain','Nasty Plot']))
    throw new Error(`moves: ${JSON.stringify(m.moves)}`);
});

test('parseShowdown: metadata lines (IVs / Level / Tera Type / Shiny) do NOT become moves', () => {
  const paste = `Meganium-Mega @ Meganiumite
Ability: Mega Sol
Level: 50
Shiny: Yes
IVs: 31 HP / 31 Atk / 31 Def / 31 SpA / 31 SpD / 31 Spe
Tera Type: Grass
Happiness: 255
EVs: 32 HP / 27 SpA / 7 SpD
Modest Nature
Solar Beam
Protect
Weather Ball
Dazzling Gleam`;
  const [m] = parseShowdown(paste);
  if (m.ability !== 'Mega Sol') throw new Error(`ability: ${m.ability}`);
  const expected = ['Solar Beam','Protect','Weather Ball','Dazzling Gleam'];
  if (JSON.stringify(m.moves) !== JSON.stringify(expected))
    throw new Error(`metadata leaked into moves — got ${JSON.stringify(m.moves)}`);
  if (m.nature !== 'Modest') throw new Error(`nature: ${m.nature}`);
});

test('parseShowdown: full 6-mon dashless team from real user paste', () => {
  const paste = `Garchomp @ Quick Claw
Ability: Rough Skin
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
Dragon Claw
Rock Slide
Protect
Stomping Tantrum

Sneasler @ Focus Sash
Ability: Unburden
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
Dire Claw
Protect
Close Combat
Fake Out

Gholdengo @ Life Orb
Ability: Good As Gold
EVs: 32 SpA / 2 SpD / 32 Spe
Protect
Shadow Ball
Make It Rain
Nasty Plot

Basculegion @ Choice Scarf
Ability: Adaptability
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
Last Respects
Wave Crash
Flip Turn
Psychic Fangs

Meganium-Mega @ Meganiumite
Ability: Mega Sol
EVs: 32 HP / 27 SpA / 7 SpD
Modest Nature
Solar Beam
Protect
Weather Ball
Dazzling Gleam

Raichu-Mega-Y @ Raichunite Y
Ability: No Guard
EVs: 32 HP / 10 Def / 24 Spe
Timid Nature
Zap Cannon
Focus Blast
Grass Knot
Protect`;
  const team = parseShowdown(paste);
  if (team.length !== 6) throw new Error(`expected 6 mons, got ${team.length}`);
  team.forEach((m, i) => {
    const nonEmpty = m.moves.filter(mv => mv && mv.trim()).length;
    if (nonEmpty !== 4) throw new Error(`slot ${i} (${m.name}) has ${nonEmpty} moves: ${JSON.stringify(m.moves)}`);
  });
});
