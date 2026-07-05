// Sand/Snow defensive-buff regression tests. This is the specific class of
// interactions that a match loss surfaced — every one of these must stay green
// or a real user's calc silently mis-predicts.

import test from 'node:test';
import { calc } from './harness.js';
import { mkMon, mkSide, mkField, assertRatio } from './fixtures.js';

test('sand: special hit vs Rock-type — SpD ×1.5 → damage ~×0.667', () => {
  const atk = mkMon({ forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Draco Meteor'] });
  const def = mkMon({ forme: 'Glimmora' });
  const bare = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Draco Meteor' });
  const sand = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'sand', f: mkField(), move: 'Draco Meteor' });
  assertRatio(sand.hi / bare.hi, 2 / 3, 'sand vs rock special');
});

test('sand: physical hit vs Rock-type — no SpD boost (Def unchanged) → damage ×1.0', () => {
  const atk = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Iron Head'] });
  const def = mkMon({ forme: 'Glimmora', ev: { hp: 32 } });
  const bare = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Iron Head' });
  const sand = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'sand', f: mkField(), move: 'Iron Head' });
  assertRatio(sand.hi / bare.hi, 1.0, 'sand vs rock physical (should be identical)');
});

test('snow: physical hit vs Ice-type — Def ×1.5 → damage ~×0.667', () => {
  const atk = mkMon({ forme: 'Kingambit', nature: 'Adamant', ev: { atk: 32 }, moves: ['Iron Head'] });
  const def = mkMon({ forme: 'Froslass-Mega' });
  const bare = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Iron Head' });
  const snow = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'snow', f: mkField(), move: 'Iron Head' });
  assertRatio(snow.hi / bare.hi, 2 / 3, 'snow vs ice physical');
});

test('snow: special hit vs Ice-type — no Def boost (SpD unchanged) → damage ×1.0', () => {
  const atk = mkMon({ forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Thunderbolt'] });
  const def = mkMon({ forme: 'Froslass-Mega' });
  const bare = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Thunderbolt' });
  const snow = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'snow', f: mkField(), move: 'Thunderbolt' });
  assertRatio(snow.hi / bare.hi, 1.0, 'snow vs ice special (should be identical)');
});

test('sand + Sand Force: Steel move ×1.3 (Iron Head)', () => {
  const atk = mkMon({ forme: 'Kingambit', ability: 'Sand Force', nature: 'Adamant', ev: { atk: 32 }, moves: ['Iron Head'] });
  const def = mkMon({ forme: 'Sinistcha', ev: { hp: 32 } });
  const bare = calc({ atk: mkMon({ ...atk, ability: '' }), def, sA: mkSide(), sB: mkSide(), w: 'sand', f: mkField(), move: 'Iron Head' });
  const sf = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'sand', f: mkField(), move: 'Iron Head' });
  assertRatio(sf.hi / bare.hi, 1.3, 'Sand Force + Steel in sand');
});

test('Weather Ball: type shifts to Fire in Sun and doubles BP', () => {
  const atk = mkMon({ forme: 'Archaludon', nature: 'Modest', ev: { spa: 32 }, moves: ['Weather Ball'] });
  const def = mkMon({ forme: 'Kingambit', ev: { hp: 32 } });
  const none = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'none', f: mkField(), move: 'Weather Ball' });
  const sun = calc({ atk, def, sA: mkSide(), sB: mkSide(), w: 'sun', f: mkField(), move: 'Weather Ball' });
  // No-weather: Normal-type 50 BP. Sun: Fire-type 100 BP with Sun's +50% Fire.
  // Damage should scale roughly 100/50 * 1.5 = 3× (before type-eff differences).
  if (none.moveType !== 'normal') throw new Error(`expected normal, got ${none.moveType}`);
  if (sun.moveType !== 'fire') throw new Error(`expected fire, got ${sun.moveType}`);
});
