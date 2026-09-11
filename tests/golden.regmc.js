// Regulation M-C additions (2026-09-09): the 6 new mega formes, Z-Mega stone
// parsing (a species with two mega stones), and the new Aura Guard ability.
// Stats/types/abilities were sourced + adversarially verified against the
// community Champions dex pages; these tests pin the values into the dex build
// and the calc so a future rebuild can't silently drop or corrupt them.
import test from 'node:test';
import { calcDmg, setState, jsForme, DEX } from './harness.js';
import { mkMon, mkSide, mkField } from './fixtures.js';

function hiDmg(atk, def, move) {
  const sA = mkSide(), sB = mkSide();
  setState({ atk, def, sA, sB, w: 'none', f: mkField() });
  const r = calcDmg(atk, move, def, sA, sB);
  if (!r) throw new Error(`calc returned null for ${move}`);
  return r.hi;
}

test('Reg M-C megas carry their verified types + abilities', () => {
  const want = {
    'Salamence-Mega':  { types: ['dragon', 'flying'], ability: 'Aerilate' },
    'Baxcalibur-Mega': { types: ['dragon', 'ice'],    ability: 'Thermal Exchange' },
    'Golisopod-Mega':  { types: ['bug', 'steel'],     ability: 'Tough Claws' },   // base is Bug/Water
    'Absol-Mega-Z':    { types: ['dark', 'ghost'],    ability: 'Sharpness' },     // base is pure Dark
    'Garchomp-Mega-Z': { types: ['dragon'],           ability: 'Levitate' },      // base is Dragon/Ground
    'Lucario-Mega-Z':  { types: ['fighting', 'steel'], ability: 'Aura Guard' },
  };
  for (const [forme, exp] of Object.entries(want)) {
    const f = DEX.formes[forme];
    if (!f) throw new Error(`${forme} missing from the dex — MEGA_OVERRIDES seed not applied?`);
    if (JSON.stringify(f.types) !== JSON.stringify(exp.types))
      throw new Error(`${forme} types = ${JSON.stringify(f.types)}, want ${JSON.stringify(exp.types)}`);
    const abils = (f.abilities || []).map(a => (a && a.name) || a);
    if (!abils.includes(exp.ability))
      throw new Error(`${forme} abilities ${JSON.stringify(abils)} lack ${exp.ability}`);
  }
});

test('Z-Mega stones resolve to the -Mega-Z forme (jsForme)', () => {
  const cases = [
    ['Absol', 'Absolite Z', 'Absol-Mega-Z'],
    ['Garchomp', 'Garchompite Z', 'Garchomp-Mega-Z'],
    ['Lucario', 'Lucarionite Z', 'Lucario-Mega-Z'],
    ['Salamence', 'Salamencite', 'Salamence-Mega'],   // no suffix → the plain new Mega
  ];
  for (const [name, item, exp] of cases) {
    const got = jsForme(name, item);
    if (got !== exp) throw new Error(`jsForme(${name}, "${item}") = ${got}, want ${exp}`);
  }
});

test('Aura Guard halves contact damage, leaves non-contact alone', () => {
  // Garchomp attacking Tyranitar (Rock/Dark). Close Combat is a contact move;
  // Earthquake is not. Aura Guard should cut only the contact hit in half.
  const atk = mkMon({ forme: 'Garchomp', nature: 'Adamant', ev: { atk: 32 }, moves: ['Close Combat', 'Earthquake'] });
  const guard = mkMon({ forme: 'Tyranitar', ability: 'Aura Guard' });
  const plain = mkMon({ forme: 'Tyranitar', ability: 'Pressure' });  // no damage-calc effect

  const ratio = hiDmg(atk, guard, 'Close Combat') / hiDmg(atk, plain, 'Close Combat');
  if (ratio < 0.47 || ratio > 0.53) throw new Error(`contact damage ratio ${ratio.toFixed(3)}, expected ~0.5`);

  const eqGuard = hiDmg(atk, guard, 'Earthquake'), eqPlain = hiDmg(atk, plain, 'Earthquake');
  if (eqGuard !== eqPlain) throw new Error(`non-contact damage changed under Aura Guard: ${eqGuard} vs ${eqPlain}`);
});
