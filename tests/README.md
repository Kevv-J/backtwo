# backtwo calc — golden regression tests

`node --test tests/golden.*.js` runs the whole suite in ~330ms. No deps, no
framework — just Node 20's built-in `node:test` runner + a VM sandbox that
loads `viewer_template.html` with a stubbed DOM.

## Layout

- `harness.js` — sandboxes the viewer JS, exposes `calc()`, `setState()`,
  `DEX`. Not a test file.
- `fixtures.js` — `mkMon()`, `mkSide()`, `mkField()`, `assertRatio()`. Not a
  test file.
- `golden.weather.js` — sand / snow / weather-ball / Sand Force.
- `golden.champions.js` — Fire Mane, Fairy Aura, Eelevate, Mega Sol, Dragonize.
- `golden.features.js` — Supreme Overlord, Water Bubble, Parental Bond,
  Sheer Force, Steelworker/Transistor, Loaded Dice, Occa Berry, Beads of Ruin.
- `golden.tricky.js` — Foul Play, Multiscale, Sniper crit, Life Orb, Intimidate
  + Defiant, stacked-mods sanity (4096 fixed-point).

## Adding a test

Copy the closest existing test as a template. Every test is one function using
`calc({...})` with the state block. Assert either a ratio (`assertRatio(actual,
expected, hint)`) or a specific field on the result (`r.eff`, `r.hits`,
`r.moveType`).

```js
test('Rillaboom Wood Hammer vs Chi-Yu under Grassy Terrain', () => {
  const r = calc({
    atk: mkMon({ forme: 'Rillaboom', ability: 'Grassy Surge', ev: { atk: 32 } }),
    def: mkMon({ forme: 'Chi-Yu', ev: { hp: 32 } }),
    sA: mkSide(), sB: mkSide(),
    w: 'none',
    f: mkField({ terrain: 'grassy' }),
    move: 'Wood Hammer',
  });
  // Assert against ratio, exact range, or a field on the result.
  assertRatio(r.hi / bare.hi, 1.3, 'Grassy Terrain boost');
});
```

## Bug-first workflow

When someone reports a wrong calc:

1. Add a **failing** test that pins the wrong output ("this is what we do
   today"). Push a PR with just that test — CI turns red, documenting the bug.
2. Fix the calc in a follow-up commit on the same PR.
3. Flip the expected value in the same commit. CI turns green.

The red → green transition on the PR documents the fix. The test now guards
against regression forever.

## CI

`.github/workflows/calc-tests.yml` runs this suite on every PR + push to main
that touches `viewer_template.html`, `data/dex.json`, or `tests/`. Timeout: 3
minutes. The weekly cron rebuild also runs the suite before pushing, so a
regenerated dex can't silently break the calc.
