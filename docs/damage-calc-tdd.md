# Damage Calculator — Technical Design Document

> Implementation-neutral spec. Describes only **what** the calculator does and
> the rules it must obey. Layout, controls, visual hierarchy, and interaction
> patterns are intentionally **not specified** — design those from scratch
> based on the user goals below.

---

## 1. Purpose

The Damage Calculator helps a competitive Pokémon player playing the
**Champions** game's VGC ruleset (regulations **M-A** and **M-B**, gen-9
based) answer the question "what will this attack do?" — quickly, accurately,
in both directions of a matchup, under any field condition the player chooses.

Functionally analogous to `calc.pokemonshowdown.com` for Showdown gen-9 OU,
but scoped to the Champions format and its mega evolutions / Stat Point system.

---

## 2. Champions ruleset constraints (always-on assumptions)

All calculations assume:

- Every Pokémon is **level 50**.
- Every Pokémon's **IVs = 31** in all stats.
- "EVs" do not exist; **Stat Points (SP)** replace them. Each Pokémon has up
  to **66 SP total**, capped at **32 SP per stat**. 1 SP ≈ 8 old-format EVs,
  so 32 SP per stat is equivalent to a fully-invested 252-EV stat.
- **Mega evolutions** are official in Champions. A Pokémon holding its mega
  stone uses the mega forme's base stats, types, and ability.
- **Terastallization does not exist** in Champions. No Tera input.
- Battles are typically **doubles** (VGC), but **singles** is also supported.

---

## 3. User goals (jobs to be done)

The calculator must enable a user to accomplish each of the following without
hand-doing damage math:

1. Determine whether a given move from Pokémon A will KO Pokémon B (damage
   range, KO odds, hits-to-KO).
2. See both directions of a matchup at the same time (A's moves vs. B, and
   B's moves vs. A), so trades can be reasoned about.
3. Try "what-if" variations along any single axis: stat boosts, status
   condition, current HP, field condition, side effect, ability change.
4. Reproduce a real tournament team's set without typing every detail —
   pick a known recent build for the chosen Pokémon and have its item,
   spread, nature, and moves populated.
5. Plan vs. a specific opposing team: choose a six-Pokémon team to "fight"
   and quickly cycle through which of its six is the current defender.
6. Calc with the user's own team: paste a Showdown-format team export once
   and quickly load any of its Pokémon into either combatant slot.

---

## 4. Functional inputs

Three groups: per-combatant state (two of them, Attacker and Defender; each
may attack the other), a shared field state, and per-side battlefield
effects (an independent set on each combatant's side).

### 4.1 Per-Pokémon state (×2)

| Input | Domain | Notes |
|---|---|---|
| Forme | One of ~263 species/forme labels | Megas listed as their own formes; species that mega into multiple formes (e.g. Charizard-Mega-X vs Charizard-Mega-Y, Raichu-Mega-X vs Raichu-Mega-Y) are distinct entries |
| Held item | Free text drawn from a known list (~100 entries) | Choice Band/Specs/Scarf, Life Orb, Assault Vest, Eviolite, type-boosting items, mega stones, Focus Sash, etc. |
| Ability | Free text from a known list (~150 abilities) | Drives many damage modifiers |
| Nature | One of 21 (15 ±10% combos + 6 neutral) | Affects one stat ×1.1 and another ×0.9 |
| SP per stat | Integer 0–32 for HP, Atk, Def, SpA, SpD, Spe | Total normally ≤ 66 (calculator does not need to enforce the total cap) |
| Boost stage per stat | Integer −6 to +6 for Atk, Def, SpA, SpD, Spe (HP has no boost) | Standard Pokémon stat-stage multipliers |
| Status condition | One of: healthy, burn, frostbite, paralysis, sleep, freeze, poison, toxic | Only burn and frostbite affect damage directly |
| Current HP percentage | Integer 0–100 | Affects abilities that gate on full HP (e.g. Multiscale) |
| Moves | Up to 4 selections from a known move list (~363 moves) | Mix of damaging moves and status moves |

### 4.2 Shared field state

A single set of field conditions applies to both sides:

| Input | Domain |
|---|---|
| Format | Singles or Doubles |
| Weather | None / Sun / Rain / Sand / Snow / Harsh Sunlight / Heavy Rain / Strong Winds |
| Terrain | None / Electric / Grassy / Misty / Psychic |
| Trick Room | Boolean (informational only — no damage effect) |
| Gravity | Boolean |
| Magic Room | Boolean (disables held-item effects globally; mega stones still drive forme) |
| Wonder Room | Boolean (swaps Def and SpD on damage calc) |

### 4.3 Per-side effects (×2 — one set per combatant's side)

Each side independently carries the following boolean toggles:

- Reflect, Light Screen, Aurora Veil (screens)
- Tailwind (informational only — affects speed, not damage)
- Helping Hand (this side's outgoing damage ×1.5)
- Friend Guard (this side's incoming damage ×0.75; doubles only)
- Flower Gift (Sun-conditional Atk + SpD boost on this side)
- Power Spot (this side's outgoing damage ×1.3)
- Battery (this side's outgoing special damage ×1.3)
- Steely Spirit (this side's outgoing Steel moves ×1.5)
- Crit (this side's attacks land as critical hits)

---

## 5. Functional outputs

For every damaging move on each combatant, against the other combatant, the
calculator produces:

- **Damage range** — integer minimum and maximum raw damage.
- **Damage percentage** — same range as % of defender's max HP.
- **KO classification** — one of `immune`, `guaranteed OHKO`, `possible OHKO`,
  or `NHKO` (e.g. `2HKO`, `2–3HKO`).
- **Effective base power** as currently in effect (e.g. Triple Axel shows
  three escalating powers; a Technician-boosted 60 BP move still shows 60).
- **Effective move type** as currently in effect (e.g. a Normal move under
  Pixilate becomes Fairy).
- **Type effectiveness multiplier** (e.g. 0×, 0.5×, 2×, 4×).
- **Spread classification** — whether the move is a spread move in doubles,
  along with the alternative damage if it had hit only one target.
- **Multi-hit detail** — total hit count, and per-hit damage breakdown when
  applicable.
- **Active modifiers** — which weather, terrain, side effects, abilities,
  status conditions, and stat boosts contributed to this calc, so the user
  understands *why* the number is what it is.
- **All 16 individual damage roll values** (game-internal random rolls 85–100%
  in 1% steps) for inspection.

Both directions of the matchup (A → B and B → A) must be produced
simultaneously. Status moves (BP = 0) should not produce damage output but
must still be recognizable in the output.

---

## 6. Preset / selection workflows

These are not damage-math tasks but are functionality the calculator must
support to be usable in practice.

### 6.1 User's saved team

- Accept a multi-mon **Showdown-format team export** as a single text block.
- Parse it into structured Pokémon, including mega-aware forme detection
  (e.g. an entry written as `Charizard @ Charizardite Y` resolves to the
  forme `Charizard-Mega-Y` with the mega's base stats).
- Persist it in the browser (localStorage). It must survive page reloads.
- Make each parsed Pokémon a valid one-step source for filling either
  combatant slot (forme, item, ability, nature, SP, moves).

### 6.2 "Fight this team" mode

The calculator must accept, from elsewhere in the app, a chosen six-Pokémon
opposing team as a temporary reference:

- Show the team's identity (description, creator, event if known).
- Auto-fill the Defender slot with the team's first Pokémon, set and all.
- Make all six Pokémon available as one-step swaps into the Defender slot,
  each carrying its actual set.
- Allow the user to clear the opposing-team reference.

### 6.3 Per-forme build picker

For any chosen forme, the calculator must offer up to ~10 **distinct
recent real builds** drawn from the dataset (deduplicated by
item + SP spread + nature + move list, ordered by recency of the source
team's date). The user picks one to overwrite the current combatant's set.
Each presented build must carry enough identifying info that the user can
tell them apart (at minimum: SP spread, nature, item, source date).

---

## 7. Stat math (Champions formula)

For each non-HP stat at level 50:

```
inner   = floor((2 × base + 31 + floor(SP × 8 / 4)) × 0.5)
stat    = floor((inner + 5) × nature)        // nature ∈ {1.1, 1.0, 0.9}
```

For HP at level 50:

```
inner = floor((2 × baseHP + 31 + floor(SP × 8 / 4)) × 0.5)
HP    = inner + 60
```

(Cap `SP × 8` at 252 internally to match the classic max-investment value.)

Stat boosts applied during damage calc:

```
positive stage n: stat × (2 + n) / 2, floored
negative stage n: stat × 2 / (2 − n), floored
```

---

## 8. Damage formula

For one damage roll `r` ∈ {85, 86, …, 100}, applying modifiers in
Pokémon Showdown's gen-9 chain order with `pokeRound` (round-half-down) at
the marked steps:

```
baseDamage = floor(floor(floor(22 × BP × A / D) / 50) + 2)

d = baseDamage
d = pokeRound(d × spreadMod)        // ×0.75 when spread move + doubles
d = floor(d × r / 100)              // random roll
d = pokeRound(d × stab)             // ×1.5; ×2 with Adaptability
d = floor(d × typeEff)              // type-chart product (0/0.25/0.5/1/2/4)
d = pokeRound(d × otherMod)         // chained: items, abilities, terrain,
                                     //          screens, side effects,
                                     //          weather move-type boost,
                                     //          burn/frostbite halving,
                                     //          crit ×1.5
d = max(1, d)                        // 0 only when type-immune
```

- `pokeRound(x)` = `floor(x)` if `x − floor(x) ≤ 0.5`, else `ceil(x)`.
- `A` = relevant offensive stat (Atk or SpA per move category), with stat
  stages applied and stat-level modifiers from items / abilities / weather.
- `D` = analogous defensive stat (Def or SpD), with Wonder Room swapping
  the **underlying value** (boost slot names stay tied to the original
  stat name).

The reported damage range is `(d at r=85, d at r=100)`.

### 8.1 Critical hits

A critical hit:

- Multiplies damage ×1.5.
- Ignores any **positive** Def/SpD boost on the defender.
- Ignores any **negative** Atk/SpA boost on the attacker.
- Bypasses Reflect, Light Screen, and Aurora Veil.
- Sniper ability multiplies by an additional ×1.5 (total ×2.25 with crit).
- Defender abilities **Shell Armor** and **Battle Armor** prevent crits.

---

## 9. Modeled mechanics (complete list)

### 9.1 Type and move

- 18-type effectiveness chart.
- STAB ×1.5 (×2 with Adaptability).
- Type-changing "-ate" abilities (Pixilate / Aerilate / Refrigerate /
  Galvanize): Normal moves become Fairy / Flying / Ice / Electric and gain
  ×1.2. STAB applies to the post-conversion type if the user is that type.
- Multi-hit moves: per-hit damage summed.
  - Escalating-BP moves use a fixed per-hit BP sequence
    (Triple Axel = 20/40/60, Triple Kick = 10/20/30).
  - Variable-hit moves (e.g. 2–5) default to 3 hits; **Skill Link** raises
    to max hits.
  - Fixed multi-hit (e.g. Dual Wingbeat 2-2, Population Bomb 10-10) use
    the exact count.

### 9.2 Weather

- **Sun**: Fire ×1.5, Water ×0.5
- **Rain**: Water ×1.5, Fire ×0.5
- **Sand**: Rock-type defenders gain SpD ×1.5 (stat-level)
- **Snow**: Ice-type defenders gain Def ×1.5 (stat-level)
- **Harsh Sunlight**: Fire ×1.5; Water moves deal 0 damage
- **Heavy Rain**: Water ×1.5; Fire moves deal 0 damage
- **Strong Winds**: super-effective moves vs. Flying defenders are reduced
  to neutral (4× → 2×, 2× → 1×)

### 9.3 Terrain (only affects grounded users / targets)

- **Electric Terrain**: Electric moves ×1.3 (user must be grounded)
- **Grassy Terrain**: Grass moves ×1.3 (user grounded); Earthquake / Magnitude
  / Bulldoze ×0.5 vs. grounded targets
- **Psychic Terrain**: Psychic moves ×1.3 (user grounded)
- **Misty Terrain**: Dragon moves ×0.5 vs. grounded targets

**Grounded** = not Flying-type AND not Levitate ability AND not Air Balloon
item — unless **Gravity** is active, which forces every Pokémon grounded.

### 9.4 Field rooms

- **Trick Room**: no damage effect (speed inversion is informational).
- **Magic Room**: held-item damage effects disabled; mega stones still drive
  forme change.
- **Gravity**: Ground hits Flying (immunity cancelled), Levitate suppressed,
  Air Balloon and Magnet Rise no longer prevent grounding.
- **Wonder Room**: Def ↔ SpD swap on damage calc; boost slot names stay
  tied to the original stat.

### 9.5 Status

- **Burn**: physical damage ×0.5. **Guts** ability instead grants Atk ×1.5
  (stat-level) and ignores the damage drop.
- **Frostbite**: special damage ×0.5.
- Paralysis: speed cut only (informational).
- Sleep, freeze, poison, toxic: no direct damage effect.

### 9.6 Side effects

- **Reflect**: ×0.5 incoming physical (×2/3 in doubles); bypassed by crit.
- **Light Screen**: same for special.
- **Aurora Veil**: same for both; only effective when current weather is Snow.
- **Helping Hand**: outgoing damage ×1.5.
- **Friend Guard**: incoming damage ×0.75 (doubles only).
- **Flower Gift** (when weather is Sun): side's Atk ×1.5 and ally SpD ×1.5
  (stat-level).
- **Power Spot**: outgoing damage ×1.3.
- **Battery**: outgoing special damage ×1.3.
- **Steely Spirit**: outgoing Steel-type damage ×1.5.

### 9.7 Abilities — attacker-side

Adaptability, Technician (BP ≤ 60), Tinted Lens (not-very-effective),
Huge Power / Pure Power (Atk ×2 stat-level), Solar Power (SpA ×1.5 in Sun,
stat-level), Sand Force (×1.3 Rock/Ground/Steel in Sand), Sniper (crit ×1.5
extra), Neuroforce (×1.25 on super-effective), Tough Claws (×1.3 contact),
Iron Fist (×1.2 punch), Mega Launcher (×1.5 pulse), Strong Jaw (×1.5 bite),
Sharpness (×1.5 slicing), Punk Rock (×1.3 outgoing sound).

### 9.8 Abilities — defender-side

Type immunities: Levitate (Ground, unless Gravity), Flash Fire (Fire),
Water Absorb, Dry Skin, Storm Drain (Water), Volt Absorb, Lightning Rod,
Motor Drive (Electric), Sap Sipper (Grass), Earth Eater (Ground),
Well-Baked Body (Fire).

Damage reduction:
- Multiscale / Shadow Shield (×0.5 at full HP only).
- Filter / Solid Rock / Prism Armor (×0.75 on super-effective).
- Thick Fat (×0.5 Fire/Ice).
- Heatproof (×0.5 Fire).
- Purifying Salt (×0.5 Ghost).
- Fluffy (×0.5 contact, ×2 Fire — combine multiplicatively, so a
  fire+contact move nets ×1).
- Fur Coat (Def ×2 stat-level).
- Ice Scales (SpD ×2 stat-level).
- Punk Rock (×0.5 incoming sound).
- Soundproof (immune to sound moves).
- Bulletproof (immune to bullet moves).

### 9.9 Intimidate (special)

When defender's ability is **Intimidate**, the attacker's Atk is auto-dropped
by one stage before the calc, unless the attacker has one of: Clear Body,
Full Metal Body, White Smoke, Hyper Cutter, Inner Focus, Scrappy, Own Tempo,
Oblivious. If the attacker has **Defiant**, the net result is Atk +1 (the
Defiant counter-boost overrides the drop). If the attacker has **Competitive**
and the move is special, SpA +2 applies instead.

### 9.10 Items affecting damage

- Choice Band: Atk ×1.5 (stat-level)
- Choice Specs: SpA ×1.5 (stat-level)
- Choice Scarf: Speed ×1.5 (stat-level, informational only)
- Life Orb: damage ×1.3 (chained)
- Assault Vest: SpD ×1.5 (stat-level)
- Eviolite: Def ×1.5 and SpD ×1.5 (stat-level)
- Type-boosting items (Charcoal → Fire, Mystic Water → Water, Sharp Beak →
  Flying, Fairy Feather → Fairy, etc.): ×1.2 on matching type (chained)
- Mega stones: change the user's forme to the matching mega forme (with that
  forme's base stats, types, and ability). Mega stones ending in `" X"` or
  `" Y"` resolve to the matching X or Y mega forme (e.g. Charizardite X →
  Charizard-Mega-X, Raichunite Y → Raichu-Mega-Y).

---

## 10. Data sources

- **Pokémon base stats and types** (all Champions formes, including megas):
  PokeAPI (`pokeapi.co/api/v2/pokemon/{slug}`).
- **Type effectiveness chart**: PokeAPI type endpoints (18 × 18).
- **Move base power / category / type / target / hit count**: PokeAPI move
  endpoints.
- **Move flags** (contact, punch, pulse, bite, sound, slicing, bullet) and
  fallback multi-hit data: Pokémon Showdown's
  `play.pokemonshowdown.com/data/moves.js`.
- **Real team sets** (for the build-picker feature): VGCPastes Google Sheet,
  ~1400 teams across Champions M-A and M-B, each linking to a pokepaste
  carrying its full sets.
- **User's saved team**: localStorage in the browser.

All upstream data is pulled at build time and bundled with the calculator;
no live network calls are required during use.

---

## 11. Edge cases and constraints

- Status moves (BP = 0) must not produce damage output but must still be
  representable on the move list.
- Type immunity (effectiveness 0) must be a distinct output state, not just
  "very low damage".
- Either combatant slot may be empty until the user picks a forme — the
  calculator must handle the unpopulated state.
- Pokémon not present in the Champions dataset (e.g. the user types in an
  exotic species) may have no real-set presets — calculation must still
  proceed with the user's manual values.
- Forme disambiguation: when a species has multiple megas (e.g. Charizard X
  vs. Charizard Y, Raichu X vs. Raichu Y), each mega is a separate forme
  with its own stats, types, and ability — never collapsed.
- The two combatants are not constrained to be from the user's team; either
  may be any forme from the dataset.

---

## 12. Non-functional requirements

- **Real-time recompute**: every input change recomputes all outputs
  immediately. There is no manual "calculate" trigger.
- **Numerical accuracy**: damage numbers must match Pokémon Showdown's calc
  (`calc.pokemonshowdown.com`) for matching inputs and gen-9 mechanics.
- **Offline / self-contained**: all data is bundled; no live network calls
  during use.
- **State persistence**: the user's saved team persists across reloads.
  The currently-selected combatant configurations and field state may
  persist within a session but do not have to survive reload.
- **Explainability**: when a damage number is unexpected, the calculator
  must surface which active modifiers contributed (which abilities, status,
  weather, terrain, screens, boosts), so the user can reconcile it with
  their mental model.

---

## 13. Battle-time UX additions

These are functional behaviours that exist on top of the core calculation
machinery. Their purpose is to reduce the number of clicks and the amount of
screen-scanning a player has to do inside a 45-second VGC turn timer. They
are required functionality, but the visual treatment is **not** prescribed —
the designer decides how each piece of information appears.

### 13.1 Move-row enrichment

Every damaging move row produced for a matchup must additionally carry:

- A **KO classification** label distinguishable at a glance — one of
  `guaranteed OHKO`, `possible OHKO N%`, `2HKO`, `3HKO`, `4HKO+`, or `immune`.
  For `possible OHKO`, the percentage = portion of the 16 damage rolls that
  reach or exceed the defender's max HP.
- A **type-effectiveness** indicator (one of `0×`, `¼×`, `½×`, `1×`, `2×`,
  `4×`) — visually distinct from the damage range. `1×` may be hidden.
  Rows where effectiveness is `0` should be visibly de-emphasized (they are
  meaningless to act on).
- A **survival callout** that fires when a move that would otherwise be a
  guaranteed OHKO is blocked by:
  - Defender holding **Focus Sash** at full HP (survives at 1 HP)
  - Defender's ability is **Sturdy** at full HP (survives at 1 HP)
  - Defender's ability is **Disguise** (relevant species only)

  This callout exists separately from the KO classification so the user
  sees "this would OHKO but doesn't because of X" — not just "didn't OHKO".

- An **HP-after-attack** estimate (defender's remaining HP percent range)
  available passively (e.g. on hover / focus) without requiring the user to
  recompute by changing the HP slider.

### 13.2 Move-row ordering and best-move emphasis

Within each direction (A → B and B → A) the damaging moves should be **sorted
by maximum damage descending** — so the top row is always the user's strongest
move into the current defender. Status moves come after damaging moves.

The first damaging row must be visually marked as the best move. When a slot
is filled or a set is loaded, the **default-selected move** for the expanded
detail view is this best move, not the first move in the user's listed order.

### 13.3 Speed-tier ribbon

A single derived display, prominent in the calc, must show who moves first
between the two combatants. Inputs to the computation:

- Each combatant's Speed stat (with stat boosts applied).
- **Tailwind** on each side (×2).
- **Paralysis** status (×0.5, unless attacker's ability is Quick Feet).
- **Choice Scarf** held item (×1.5), **Iron Ball** (×0.5) — disabled under
  Magic Room.
- **Chlorophyll** in Sun (×2), **Swift Swim** in Rain (×2), **Sand Rush** in
  Sand (×2), **Slush Rush** in Snow (×2), **Surge Surfer** on Electric
  Terrain when grounded (×2).
- **Quick Feet** when statused (×1.5).
- **Unburden** when not holding an item (×2).
- **Trick Room**: inverts the ordering (slower combatant moves first).

Output: each combatant's effective Speed, who moves first, and the gap.

### 13.4 Pin / lock pattern

The user can mark one of the two combatant slots as **pinned**. While pinned,
any subsequent quick-pick action (from "my team", "fight this team", or any
other team-derived quick-fill) loads into the **other** slot rather than the
pinned one. This lets the user audit one chosen attacker against many
defenders (or the reverse) without re-selecting their attacker each time.
Only one slot can be pinned at a time. Pin state can be cleared explicitly.

### 13.5 Lead matchup matrix

When both the user's saved team and an "opposing team" (set via the
"Fight this team" handoff described in the other-views TDD) are present, an
additional functional surface must offer a **per-pair best-damage grid**:

- One row per user team mon (typically 4–6).
- One column per opponent team mon (typically 6).
- Each cell shows the best damage % the row-attacker can deal to the
  column-defender (using each mon's loaded set, current field, and current
  side effects).
- KO state (`OHKO` / `OHKO?`) is annotated on cells where applicable.
- Clicking a cell loads the corresponding A / B combatants in the main
  calculator so the user can drill in.

The grid recomputes on any field/side-effect change.

### 13.6 Keyboard / power-user layer

Damage-calc operations that get repeated during a battle turn must also be
reachable from the keyboard, without the user needing to mouse to controls.
The following input intents must be exposed as hotkeys (binding choices are
the designer's, but the *behaviours* below are required):

- Quick-load the *i*-th opponent-team mon into the defender slot.
- Quick-load the *i*-th user-team mon into the attacker slot.
- Cycle the defender forward / backward through the current opposing team.
- Swap attacker ↔ defender entirely (including their per-side effects and
  the currently-selected move on each side).
- Cycle weather forward.
- Cycle terrain forward.
- Toggle Trick Room.
- Toggle Doubles / Singles.
- Toggle the attacker's Crit on the side effects.
- Clear the opposing team.
- Open a discoverable **help overlay** that lists every keyboard binding.

While a text input has focus, hotkeys must not fire — typing wins.

### 13.7 Set picker and most-common default

When the user picks a Pokémon in either slot, the calculator must **pre-fill**
the slot from the dataset's most-common-spread real build for that species
(item + ability + nature + SP spread + moves) so the slot is immediately
usable for "what would the average X do here?" reasoning.

Separately, the user must be able to choose any of the **top ~10 most recent
distinct builds** for that species — recency-sorted, distinct on the
combination of item + spread + nature + move list. Selecting a build
overwrites the slot's set in one action.

For Pokémon that have no real-team data (e.g. an unusual user-typed entry),
the slot pre-fills with sensible defaults (zero SP, neutral nature, no item,
no ability, empty moves) and remains fully editable.

### 13.8 Stat-stage input

Stat boosts must be settable in **one action** to any value in `-6..+6`. Step
controls (one click = ±1) are *not* sufficient on their own — a player
applying a Belly Drum (+6) or reacting to Intimidate (−1) should not need
six or two presses respectively. The designer should provide a control that
makes any single-stage selection reachable directly.

### 13.9 Explainability and modifier audit

When the user expands a move's detail, the visible information must include:

- The full damage roll list (16 values) when the move is single-hit.
  For multi-hit moves, per-hit damage breakdown and total hit count instead.
- The exact base power used (post-scaling — e.g. Water Spout at 40% HP shows
  the scaled BP, not the raw 150).
- The exact effective move type used (post-Pixilate / Aerilate etc.).
- Whether this is a critical hit.
- A short, deduplicated list of every modifier that affected this result —
  e.g. `Adaptability · Sun · Helping Hand · Friend Guard · Light Screen ·
  Intimidate −1 Atk · Multiscale`. This list is the user's "why is the
  number this?" answer; it must include everything contributing.

### 13.10 Showdown-style move-list affordance

The damaging-move list for each direction is the **primary read surface** of
the calculator. It should support:

- A passive, always-visible scan: every move's % range + KO state visible
  without expanding anything.
- A click-to-drill on any move row to reveal §13.9 detail for that move.
- The detail must be reachable from either direction's list; it does not
  belong inside the combatant configuration panels.

### 13.11 "Fight this team" / matchmaking handoff

The calc must accept an "opposing team" reference from elsewhere in the app
(see the other-views TDD). When such a reference is set, the calc must:

- Surface the team's identity (description / creator / event) somewhere
  persistent until cleared.
- Make all six of that team's mons one-action-loadable into the defender
  (or attacker, if reversed via §13.4 pin).
- Auto-load the first of the six into the defender slot the moment the
  reference arrives.
- Provide a way to clear the reference.

---

## 14. Explicitly out of scope

- Match flow, turn order, switch sequencing.
- Move accuracy / hit-or-miss simulation.
- End-of-turn residual damage (recoil, Leftovers, weather chip, status tick).
- Z-Moves, Dynamax, Tera (none exist in Champions).
- Entry hazards (Stealth Rock, Spikes, etc.).
- Choice-item move-locking simulation (only the stat multiplier is applied).
- Sheer Force, Facade burn-ignore, status-triggered Atk/SpD boosters
  (Toxic Boost / Flare Boost / Marvel Scale beyond Guts).
