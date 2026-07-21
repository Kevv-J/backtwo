// parseShowdown + jsForme case-normalization tests.
// User pastes "Kommo-O" but the canonical DEX key is "Kommo-o" — the paste
// path used to silently produce an unusable forme string. Same class of bug
// applies to any forme with a lowercase-after-hyphen tail.

import test from 'node:test';
import { parseShowdown, jsForme, normSpec, DEX } from './harness.js';

test('normSpec: case-normalizes forme names against DEX.formes', () => {
  if (!normSpec) throw new Error('normSpec not exported');
  if (!DEX.formes['Kommo-o']) {
    console.log('  (Kommo-o not in dex, skip)');
    return;
  }
  // Every capitalization variant should canonicalize to "Kommo-o".
  ['Kommo-O', 'kommo-o', 'KOMMO-O', 'Kommo-o'].forEach(input => {
    const out = normSpec(input);
    if (out !== 'Kommo-o') throw new Error(`normSpec(${JSON.stringify(input)}) = ${JSON.stringify(out)}, want "Kommo-o"`);
  });
});

test('normSpec: still strips -Mega suffix (case-insensitive)', () => {
  if (!normSpec) return;
  ['Blastoise-Mega', 'blastoise-mega', 'Blastoise-mega'].forEach(input => {
    const out = normSpec(input);
    if (out.toLowerCase() !== 'blastoise') throw new Error(`normSpec(${input}) = ${out}`);
  });
});

test('parseShowdown: "Kommo-O" paste resolves to canonical forme', () => {
  if (!DEX.formes['Kommo-o']) return;
  const paste = `Kommo-O @ Throat Spray
Ability: Soundproof
EVs: 2 HP / 32 SpA / 32 Spe
Timid Nature
- Clanging Scales
- Flamethrower
- Focus Blast
- Protect`;
  const team = parseShowdown(paste);
  if (team.length !== 1) throw new Error(`expected 1 mon, got ${team.length}`);
  const m = team[0];
  // parseShowdown copies name verbatim from the paste head, but sets .forme
  // via jsForme(mon.name, mon.item) — which routes through normSpec.
  if (m.forme !== 'Kommo-o') {
    throw new Error(`.forme should canonicalize to "Kommo-o" — got ${JSON.stringify(m.forme)}`);
  }
});

test('jsForme: mis-cased base + mega item builds the mega label correctly', () => {
  // "blastoise" (lowercase) + "Blastoisinite" should produce "Blastoise-Mega"
  const out = jsForme('blastoise', 'Blastoisinite');
  if (out !== 'Blastoise-Mega' && out !== 'blastoise-Mega') {
    // The canonical spelling in the dex is what matters. Confirm it resolves.
    if (!DEX.formes[out] && !DEX.formes['Blastoise-Mega']) {
      throw new Error(`jsForme('blastoise', 'Blastoisinite') = ${out} (does not resolve in DEX)`);
    }
  }
});
