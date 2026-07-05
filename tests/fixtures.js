// Concise builders for damage-calc test inputs.
// Every field defaults to a sane VGC-standard baseline so tests only spell out
// what's interesting (attacker forme + move + defender + one modifier).

export function mkMon(opts = {}) {
  return {
    forme: opts.forme || '',
    ability: opts.ability || '',
    item: opts.item || '',
    nature: opts.nature || 'Serious',
    ev: {
      hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0,
      ...(opts.ev || opts.evs || {}),
    },
    boost: {
      atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0,
      ...(opts.boost || opts.boosts || {}),
    },
    moves: opts.moves || ['', '', '', ''],
    status: opts.status || 'ok',
    hpPct: opts.hpPct ?? 100,
    faintedAllies: opts.faintedAllies ?? 0,
    timesHit: opts.timesHit ?? 0,
  };
}

export function mkSide(opts = {}) {
  return {
    reflect: opts.reflect ? 1 : 0,
    lightScreen: opts.lightScreen ? 1 : 0,
    auroraVeil: opts.auroraVeil ? 1 : 0,
    tailwind: opts.tailwind ? 1 : 0,
    helpingHand: opts.helpingHand ? 1 : 0,
    friendGuard: opts.friendGuard ? 1 : 0,
    flowerGift: opts.flowerGift ? 1 : 0,
    powerSpot: opts.powerSpot ? 1 : 0,
    battery: opts.battery ? 1 : 0,
    steelySpirit: opts.steelySpirit ? 1 : 0,
    fairyAura: opts.fairyAura ? 1 : 0,
    crit: opts.crit ? 1 : 0,
  };
}

export function mkField(opts = {}) {
  return {
    terrain: opts.terrain || 'none',
    trickRoom: opts.trickRoom ? 1 : 0,
    gravity: opts.gravity ? 1 : 0,
    magicRoom: opts.magicRoom ? 1 : 0,
    wonderRoom: opts.wonderRoom ? 1 : 0,
  };
}

/** Assert that a calc result's (lo, hi) matches [expectedLo, expectedHi] within ±tolerance. */
export function assertRange(t, result, [lo, hi], tolerance = 0) {
  if (!result) {
    t.diagnostic(`  → calc returned null (mon or move missing from dex?)`);
    throw new Error('calc returned null');
  }
  const okLo = Math.abs(result.lo - lo) <= tolerance;
  const okHi = Math.abs(result.hi - hi) <= tolerance;
  if (!okLo || !okHi) {
    throw new Error(
      `expected ${lo}-${hi}, got ${result.lo}-${result.hi}` +
      ` (drift: min ${result.lo - lo >= 0 ? '+' : ''}${result.lo - lo},` +
      ` max ${result.hi - hi >= 0 ? '+' : ''}${result.hi - hi})`
    );
  }
}

/** Assert a ratio between two results is within ±5% of expected. */
export function assertRatio(actual, expected, hint = '') {
  const tol = 0.05;
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${hint} ratio ${actual.toFixed(3)}, expected ~${expected.toFixed(3)}`);
  }
}
