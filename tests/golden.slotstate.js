// Slot-switch state reset — a brand-new Pokémon in a slot is a fresh scenario.
//
// Bug report: after checking a calc with crit / Helping Hand / screens, those
// (plus manual weather/terrain/Trick Room) persisted onto the next mon when the
// user switched Pokémon. Expected: the shared field (weather/terrain/field
// toggles) resets on any switch, and the SWITCHED side's battle effects reset,
// while the non-switched side keeps its own. Ability-intrinsic weather/terrain
// re-derives so a standing weather-setter keeps its weather.
//
// afterSlotSwitch(p, m) is the hook both switch paths (species pick +
// quick-pick load) route through. These tests drive it directly via the harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { setState, getState, afterSlotSwitch, newSide, newField } from './harness.js';
import { mkMon } from './fixtures.js';

// Load `m` into slot p (A or B) and fire the switch hook, keeping the other
// slot + both sides + field as given. Returns the engine's post-switch state.
function doSwitch({ A, B, sideA, sideB, weather, field }, p, m) {
  const nA = p === 'a' ? m : A, nB = p === 'b' ? m : B;
  setState({ atk: nA, def: nB, sA: sideA, sB: sideB, w: weather, f: field });
  afterSlotSwitch(p, m);
  return getState();
}

test('switch resets the switched side battle effects (crit / HH / screens / tailwind)', () => {
  const s = doSwitch({
    A: mkMon({ forme: 'Garchomp' }), B: mkMon({ forme: 'Kingambit' }),
    sideA: { ...newSide(), crit: 1, helpingHand: 1, reflect: 1, lightScreen: 1, auroraVeil: 1, tailwind: 1 },
    sideB: newSide(), weather: 'none', field: newField(),
  }, 'a', mkMon({ forme: 'Sneasler' }));
  for (const k of ['crit', 'helpingHand', 'reflect', 'lightScreen', 'auroraVeil', 'tailwind']) {
    assert.equal(s.sideA[k], 0, `sideA.${k} should reset on switch`);
  }
});

test('switch resets the shared field: weather, terrain, Trick Room, Gravity, Fairy Aura', () => {
  const s = doSwitch({
    A: mkMon({ forme: 'Garchomp' }), B: mkMon({ forme: 'Kingambit' }),
    sideA: newSide(), sideB: newSide(),
    weather: 'rain',
    field: { ...newField(), terrain: 'electric', trickRoom: 1, gravity: 1, magicRoom: 1, wonderRoom: 1, fairyAura: 1 },
  }, 'a', mkMon({ forme: 'Sneasler' }));
  assert.equal(s.weather, 'none', 'weather should reset');
  assert.equal(s.field.terrain, 'none', 'terrain should reset');
  for (const k of ['trickRoom', 'gravity', 'magicRoom', 'wonderRoom', 'fairyAura']) {
    assert.equal(s.field[k], 0, `field.${k} should reset on switch`);
  }
});

test('switch does NOT touch the non-switched side battle effects', () => {
  const s = doSwitch({
    A: mkMon({ forme: 'Garchomp' }), B: mkMon({ forme: 'Kingambit' }),
    sideA: { ...newSide(), crit: 1 },
    sideB: { ...newSide(), helpingHand: 1, reflect: 1 },
    weather: 'none', field: newField(),
  }, 'a', mkMon({ forme: 'Sneasler' }));
  assert.equal(s.sideA.crit, 0, 'switched side clears');
  assert.equal(s.sideB.helpingHand, 1, 'non-switched side keeps Helping Hand');
  assert.equal(s.sideB.reflect, 1, 'non-switched side keeps Reflect');
});

test('standing weather-setter re-derives its weather after an unrelated switch', () => {
  // B is Torkoal (Drought). Switching A to a no-weather mon wipes the field to
  // none, then Torkoal re-claims the sun — the weather belongs to who's present.
  const s = doSwitch({
    A: mkMon({ forme: 'Garchomp' }), B: mkMon({ forme: 'Torkoal', ability: 'Drought' }),
    sideA: newSide(), sideB: newSide(), weather: 'sun', field: newField(),
  }, 'a', mkMon({ forme: 'Sneasler' }));
  assert.equal(s.weather, 'sun', 'standing Torkoal keeps sun');
});

test('a just-switched-in weather-setter wins the field over a standing one', () => {
  // Switch A to Pelipper (Drizzle) while Torkoal (Drought) stands in B. The
  // incoming setter claims the field first → rain, not sun.
  const s = doSwitch({
    A: mkMon({ forme: 'Garchomp' }), B: mkMon({ forme: 'Torkoal', ability: 'Drought' }),
    sideA: newSide(), sideB: newSide(), weather: 'sun', field: newField(),
  }, 'a', mkMon({ forme: 'Pelipper', ability: 'Drizzle' }));
  assert.equal(s.weather, 'rain', 'incoming Drizzle overrides standing sun');
});

test('switching to a plain mon with no standing setter leaves the field clear', () => {
  const s = doSwitch({
    A: mkMon({ forme: 'Garchomp' }), B: mkMon({ forme: 'Kingambit' }),
    sideA: newSide(), sideB: newSide(), weather: 'sand', field: { ...newField(), terrain: 'grassy' },
  }, 'b', mkMon({ forme: 'Archaludon' }));
  assert.equal(s.weather, 'none', 'no setter → weather stays cleared');
  assert.equal(s.field.terrain, 'none', 'no setter → terrain stays cleared');
});
