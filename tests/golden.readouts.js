// Result-panel readout tests — effective accuracy (Wide Lens / Compound Eyes /
// Hustle / No Guard / Bright Powder / Sand Veil-Snow Cloak) and heal-back
// (Shell Bell 1/8, drain moves + Big Root). These drive secondary lines in the
// calc result; they don't change the damage numbers themselves.

import test from 'node:test';
import { calc, setState, accuracyInfo, healInfo } from './harness.js';
import { mkMon, mkSide, mkField } from './fixtures.js';

// accuracyInfo reads the `weather`/`field` globals — seed them to a clean state.
function seed(w = 'none', f = mkField()) {
  setState({ atk: mkMon(), def: mkMon(), sA: mkSide(), sB: mkSide(), w, f });
}

test('accuracyInfo: Wide Lens takes Population Bomb 90% → 99%', () => {
  seed();
  const a = accuracyInfo('Population Bomb', mkMon({ item: 'Wide Lens' }), mkMon());
  if (!a || a.base !== 90 || a.eff !== 99) throw new Error('expected 90→99, got ' + JSON.stringify(a));
});

test('accuracyInfo: Compound Eyes caps at 100% (90×1.3=117)', () => {
  seed();
  const a = accuracyInfo('Population Bomb', mkMon({ ability: 'Compound Eyes' }), mkMon());
  if (!a || a.eff !== 100) throw new Error('expected cap at 100, got ' + JSON.stringify(a));
});

test('accuracyInfo: No Guard → always hits', () => {
  seed();
  const a = accuracyInfo('Hydro Pump', mkMon({ ability: 'No Guard' }), mkMon());
  if (!a || !a.always) throw new Error('No Guard should always hit, got ' + JSON.stringify(a));
  // No Guard on the DEFENDER also makes the attack always land.
  const b = accuracyInfo('Hydro Pump', mkMon(), mkMon({ ability: 'No Guard' }));
  if (!b || !b.always) throw new Error('defender No Guard should also always hit');
});

test('accuracyInfo: Hustle lowers physical accuracy ×0.8 (Dynamic Punch 50→40)', () => {
  seed();
  const a = accuracyInfo('Dynamic Punch', mkMon({ ability: 'Hustle' }), mkMon());
  if (!a || a.eff !== 40) throw new Error('Hustle should give 50→40, got ' + JSON.stringify(a));
});

test('accuracyInfo: defender Bright Powder lowers accuracy ×0.9 (90→81)', () => {
  seed();
  const a = accuracyInfo('Population Bomb', mkMon(), mkMon({ item: 'Bright Powder' }));
  if (!a || a.eff !== 81) throw new Error('Bright Powder should give 90→81, got ' + JSON.stringify(a));
});

test('accuracyInfo: no modifier and full-accuracy move → nothing to show', () => {
  seed();
  if (accuracyInfo('Earthquake', mkMon(), mkMon()) !== null) throw new Error('100%-acc no-modifier move should return null');
  // A positive modifier on a 100%-acc move stays 100% → also nothing to show.
  if (accuracyInfo('Earthquake', mkMon({ item: 'Wide Lens' }), mkMon()) !== null) throw new Error('100→100 should return null');
});

test('accuracyInfo: Sand Veil only applies in sand', () => {
  seed('none');
  if (accuracyInfo('Population Bomb', mkMon(), mkMon({ ability: 'Sand Veil' })) !== null) throw new Error('Sand Veil should be inert outside sand');
  seed('sand');
  const a = accuracyInfo('Population Bomb', mkMon(), mkMon({ ability: 'Sand Veil' }));
  if (!a || a.eff !== 72) throw new Error('Sand Veil in sand should give 90→72, got ' + JSON.stringify(a));
});

test('healInfo: Shell Bell heals 1/8 of damage dealt', () => {
  const atk = mkMon({ forme: 'Garchomp', item: 'Shell Bell', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] });
  const def = mkMon({ forme: 'Milotic', nature: 'Bold', ev: { hp: 32, def: 32 } });
  const r = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  const rows = healInfo('Earthquake', atk, r);
  const shell = rows && rows.find(x => x.label === 'Shell Bell');
  if (!shell || shell.hi !== Math.floor(r.hi / 8) || shell.lo !== Math.floor(r.lo / 8)) {
    throw new Error(`Shell Bell should heal floor(dmg/8): dmg ${r.lo}-${r.hi}, heal ${shell && shell.lo}-${shell && shell.hi}`);
  }
});

test('healInfo: drain move heals 1/2, Big Root boosts to 0.65', () => {
  const def = mkMon({ forme: 'Milotic', nature: 'Bold', ev: { hp: 32, def: 32 } });
  const plain = mkMon({ forme: 'Garchomp', item: '', nature: 'Modest', ev: { spa: 32 }, moves: ['Giga Drain'] });
  const root  = mkMon({ forme: 'Garchomp', item: 'Big Root', nature: 'Modest', ev: { spa: 32 }, moves: ['Giga Drain'] });
  const rP = calc({ atk: plain, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Giga Drain' });
  const hP = healInfo('Giga Drain', plain, rP).find(x => x.label.startsWith('Drain'));
  const hR = healInfo('Giga Drain', root,  rP).find(x => x.label.startsWith('Drain'));
  if (hP.hi !== Math.floor(rP.hi * 0.5)) throw new Error('drain should heal 1/2 of damage');
  if (hR.hi !== Math.floor(rP.hi * 0.65)) throw new Error('Big Root drain should heal 0.65 of damage');
  if (!hR.label.includes('Big Root')) throw new Error('Big Root drain should be labelled');
});

test('healInfo: no Shell Bell / non-drain move → null', () => {
  const atk = mkMon({ forme: 'Garchomp', item: 'Leftovers', nature: 'Adamant', ev: { atk: 32 }, moves: ['Earthquake'] });
  const def = mkMon({ forme: 'Milotic', nature: 'Bold', ev: { hp: 32, def: 32 } });
  const r = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Earthquake' });
  if (healInfo('Earthquake', atk, r) !== null) throw new Error('non-drain move w/o Shell Bell should heal nothing');
});
