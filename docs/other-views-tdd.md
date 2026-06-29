# VGC Companion — Other Views — Technical Design Document

> Implementation-neutral spec for the **non-damage-calc** parts of the app:
> the Pokémon meta browser, the Find Team workflow, the Teams view, and the
> cross-cutting state every view shares (navigation, regulation selector,
> the user's saved team, the "Fight this team" handoff). Layout, controls,
> interaction patterns, and visual treatment are intentionally **not**
> specified — design those from scratch.
>
> Companion document: `damage-calc-tdd.md` covers the Damage Calculator
> view in full; this doc assumes that exists alongside.

---

## 1. Purpose

A VGC player playing the **Champions** competitive format (regulations
**M-A** and **M-B**, gen-9 based) needs more than a damage calculator. They
also need to:

- Study the current meta (which Pokémon are popular, what sets they run,
  how fast they are, what tends to be paired with them).
- Recognize an opponent's team during the team-preview phase, where you
  see all six of your opponent's Pokémon for ~90 seconds before lead choice.
- Look up specific tournament teams and the actual sets they ran.

This doc covers those views and how they interact with the damage calc.

---

## 2. Shared Champions ruleset context

Same constants as the damage calc:

- All Pokémon are level 50 / max IVs.
- Stat Points (SP) instead of EVs: 0–32 per stat, ~66 total.
- Mega evolutions are official in Champions; a Pokémon holding its mega
  stone is treated as the mega forme.
- No Terastallization.
- Format is doubles by default; singles is also supported.

---

## 3. The data the app holds

The app ships with a bundled dataset extracted from a community team
repository (the VGCPastes Champions sheet) and PokeAPI. At app load time
the following data is available:

| Data | Approximate scale | Purpose |
|---|---|---|
| Teams | ~1400 (split across M-A and M-B regulations) | Real tournament/ladder teams; each carries description, creator, event, date, rank, source link, pokepaste link, and the six mons' full Showdown sets |
| Per-team Pokémon sets | ~8400 (1400 × 6) | Each set has forme, item, ability, nature, SP spread, moves |
| Pokémon formes | ~260 | Each forme (including each mega variant) carries base stats and types |
| Moves | ~360 | Each move carries base power, type, category, target, hit-count range, and a set of flags (contact, punch, pulse, bite, sound, slicing, bullet) |
| Type chart | 18 × 18 | Standard gen-9 effectiveness |

Each team is tagged with its regulation: `M-A` or `M-B`. Each Pokémon set
on the team is the canonical Showdown export form for that mon.

The app also persists, in the browser:

- The user's saved team (a multi-mon Showdown text export the user pastes
  once and reuses across sessions).

---

## 4. Cross-cutting concerns

These features apply across multiple views and must remain consistent
between them.

### 4.1 Regulation selector

The user is always **in one of two regulation scopes** at any time:

- **M-A**: only M-A teams are visible / counted.
- **M-B**: both M-A and M-B teams are visible (M-A's Pokémon are still
  legal under M-B, so the M-B scope is additive). Default scope.

Switching scope must recompute:

- Which teams appear in the Teams view, the Find Team results, the Fight
  this team browser, and the build picker in the Damage Calc.
- The per-Pokémon usage counts and rankings in the Pokémon view.
- The "new in M-B" flag (see §5.3).

The scope is a single global control reachable from any view.

### 4.2 User's saved team (the "my team")

The user can paste a **multi-mon Showdown text export** (six mons separated
by blank lines, each in canonical `Name @ Item / Ability: X / EVs: ... /
Nature / Moves` form) into a dedicated input. On save:

- The text is parsed into structured mons (mega-aware: a mon written with a
  mega stone resolves to that mega's forme with the mega's stats / types /
  ability — see §5.2 for X/Y mega disambiguation).
- The team is persisted in the browser (must survive page reload).
- Each of the saved mons becomes a one-action quick-fill source for **either
  combatant slot in the Damage Calc**.

The saved team is **not** restricted to six mons (the user may paste any
number, but six is the typical case). Empty / unparseable blocks are
silently dropped.

### 4.3 "Fight this team" handoff

From any team card anywhere in the app (Pokémon detail's "teams using this
mon" list, Teams view, Find Team results), the user can issue a "fight this
team" intent. The app must:

- Switch the active view to the **Damage Calculator**.
- Pass the chosen team's six mons to the calc as an "opposing team
  reference" (see damage-calc-tdd.md §13.11).
- Pre-load the first of the six into the defender slot using that mon's
  actual set.

The opposing-team reference persists across calc interactions until the
user clears it. Switching scope (§4.1) does not implicitly clear it.

### 4.4 Top-level navigation

The app exposes four primary destinations:

| View | Purpose |
|---|---|
| **Pokémon** | Browse / look up individual Pokémon in the meta |
| **Find Team** | Identify the opponent's team from team-preview lineup |
| **Damage Calculator** | 1v1 damage simulation (see damage-calc-tdd.md) |
| **Teams** | Browse / search all teams in the dataset |

The user should be able to reach any of these from any other view in **one
action**. The regulation selector (§4.1) is always visible.

---

## 5. Pokémon view

### 5.1 Purpose

A reference catalogue of every Pokémon forme that appears in the current
regulation scope, sorted by usage (most-used first), with everything a
player needs to know about a given mon's role in the meta one click away.

### 5.2 Forme identity and mega disambiguation

Pokémon are **indexed by forme, not by base species**:

- A mon holding a mega stone is its mega forme (e.g. `Aerodactyl-Mega`).
- The same species without its stone is the base forme (e.g. `Aerodactyl`).
- Species with multiple mega stones (e.g. `Charizard-Mega-X` /
  `Charizard-Mega-Y`, `Raichu-Mega-X` / `Raichu-Mega-Y`) are listed as
  separate formes — they have different stats, types, and abilities and
  must never be collapsed.

A base forme (e.g. `Garchomp`) that *has* a mega variant present in the
data must be marked with a "has Mega" indicator, so the user can see at a
glance that they're looking at the *un-megaed* version. Conversely, a
forme that only appears in regulation M-B (i.e. did not exist in M-A
teams) must be marked "new in M-B".

### 5.3 Functional inputs

| Input | Domain |
|---|---|
| Free-text search filter | Substring match against forme name |
| Selected Pokémon | One forme from the indexed list, or none |
| Regulation scope | Inherited from §4.1 |

### 5.4 The Pokémon list

For the current scope, the view must produce a list of every forme with
≥1 appearance, sorted by usage count descending. Each list entry carries:

- Forme name.
- Usage count in the current scope.
- "Has Mega" indicator when applicable.
- "New M-B" indicator when applicable.
- A way to filter live as the user types in the search input.

### 5.5 Per-Pokémon detail

When the user selects a forme, the app produces the following for that
forme using only teams in the current scope:

| Output | Notes |
|---|---|
| **Forme identity** | Name, types, "has Mega" / "new M-B" indicators where applicable |
| **Usage** | Team count in scope, percentage of scope's teams that ran it, and a **per-regulation breakdown** (M-A: X · M-B: Y) when the current scope is M-B |
| **Base stats** | All six stats (HP/Atk/Def/SpA/SpD/Spe) for the selected forme, plus BST |
| **Base ↔ mega compare toggle** | When viewing a base mon that has a mega (or vice versa), the user can compare the two stat lines side by side to see what megaing buys |
| **Held items** | Top items used on this forme, with usage counts |
| **Abilities** | Top abilities used on this forme, with usage counts |
| **Moves** | Top moves run on this forme, with usage counts |
| **Common teammates** | Other formes that most often appear on the same team as this one, with co-occurrence counts |
| **Natures** | Top natures used |
| **Speed context** | (see §5.6) |
| **Teams running this forme** | The full list of in-scope teams that include this forme, sorted with tournament-placing teams first then by recency |

Every team in the "teams running this forme" list is rendered as a team
card (see §8) and must support the "Fight this team" handoff (§4.3).

### 5.6 Speed context (per Pokémon)

For the selected forme, the view must provide a speed-tier reference:

- The forme's **most-common in-battle Speed** — derived from its
  most-frequently-used SP spread + nature in the dataset.
- The forme's **maximum Speed** at the format's investment cap (32 SP +
  speed-boosting nature).
- Speed under **Choice Scarf** (×1.5).
- Speed under **Tailwind** (×2).
- A short **faster-than-you** list (other formes whose most-common Speed
  outpaces this one's, ordered closest first).
- A short **slower-than-you** list (the reverse).

These lists let the user place the selected mon in the broader speed tier
at a glance.

### 5.7 Selection workflow

- Search is live (no submit button).
- Selecting an entry from the list updates the detail surface.
- Switching the regulation scope while a Pokémon is selected must re-key
  the detail surface against the new scope (usage counts, teams running
  it, neighbours).

### 5.8 Edge cases

- A forme with `0` in-scope usage must not appear in the list at all
  (it would have no meaningful detail).
- A forme that has only the base or only a mega variant in scope must
  still show its data; the "has Mega" / "new M-B" indicators reflect what
  actually exists in the data.
- A forme with no recorded Speed-bearing sets (e.g. only base-name-only
  fallback entries) should omit the speed context section gracefully.

---

## 6. Find Team view

### 6.1 Purpose

When a competitive match begins, the user sees the opponent's six Pokémon
in **team preview** for ~90 seconds. The Find Team view lets the user type
those names in and identify the opponent's team — either exactly, or
narrow it down to one of a small set of partial matches when nothing in
the dataset matches all six.

This is the single most time-sensitive task in the app: it must work
quickly and tolerate imprecise typing.

### 6.2 Functional inputs

| Input | Domain |
|---|---|
| 2–6 Pokémon-name slots | Each is free text resolved against the forme catalogue |
| Regulation scope | Inherited from §4.1; results are restricted to in-scope teams |

Empty slots are ignored. Duplicates (e.g. user types "Garchomp" twice)
collapse to a single match contribution.

### 6.3 Name resolution

Each typed name is resolved to a canonical forme using the priority:

1. Exact case-sensitive forme match.
2. Case-insensitive exact forme match.
3. Prefix match — among all formes whose name starts with the typed
   string, return the one with the **highest usage count** in the current
   scope.
4. Substring match — same usage-sorted tiebreak.

After resolution, the forme is **collapsed to its base species** (e.g.
`Charizard-Mega-Y` → `Charizard`, `Aerodactyl-Mega` → `Aerodactyl`).
Matching is base-species-based because team preview hides whether a mon
megas — the user sees `Aerodactyl` regardless of whether it has its
stone. The view must communicate this base-species rule explicitly so
users don't try to over-specify their picks.

### 6.4 Matching logic

For each in-scope team, compute the **score** = number of unique picks
whose base species is present on that team. A team with `score == 0`
is excluded from results.

Results are partitioned and ordered:

1. **Exact matches**: `score == total picks`. These come first.
2. **Partial matches**: `score < total picks`. Grouped by score, descending.

Within each group, secondary sort:

- Teams with a non-empty tournament/event field rank above teams without.
- Then by recency (newer first).

### 6.5 Functional outputs

Per result:

- The full team card (see §8) for the matched team.
- For partial matches: an explicit list of **which picks the team is
  missing** (e.g. "missing: Whimsicott, Kingambit"). This lets the user
  glance at a 5/6 partial and decide whether the missing mon is a
  deal-breaker or just a flexible slot.
- Visual emphasis on the **mons in the team that actually matched** the
  picks (so the user can scan partial matches and see which mons differ
  from what they expected).

Summary outputs (above the result list):

- Resolved canonical names for what was typed (so the user can confirm
  "char" became "Charizard-Mega-Y" base = "Charizard").
- Number of exact matches.
- Number of partial matches.

### 6.6 Result-list pagination

The view must remain usable when a query matches many teams:

- Exact matches: show up to ~40 with a "+ N more — refine your picks"
  hint if more exist.
- Partial matches: show up to ~15 per score group with the same hint.

### 6.7 Selection workflow

- The user can resolve and search either by clicking a Find action or by
  pressing Enter inside any of the input slots.
- A Clear action resets all slots in one step.
- Each result team's card must support the "Fight this team" handoff
  (§4.3), so the user can go from "this is probably their team" to
  "let me calc my mons against theirs" in one click.

### 6.8 Edge cases

- No picks → empty state with a hint about what to type.
- All picks unresolvable → "no matches" with the unresolved tokens
  surfaced so the user can correct typos.
- The user's regulation scope is M-A and they type a Pokémon that only
  appears in M-B teams → no match in scope; the view should *not*
  silently fall back to M-B (the user explicitly chose M-A).

---

## 7. Teams view

### 7.1 Purpose

A browseable index of every team in the current regulation scope, with
search across the team's textual fields and its Pokémon. Lower priority
than the Pokémon view and Find Team view, but the canonical "give me all
teams matching this query" surface.

### 7.2 Functional inputs

| Input | Domain |
|---|---|
| Free-text search | Substring match against team description, creator, owner handle, event, and the names of any of its six mons |
| Regulation scope | Inherited from §4.1 |

### 7.3 Functional outputs

A list of every in-scope team (filtered by the search query). Each entry
is a team card (see §8). The list must be capped at a sensible upper
bound (~250) with a hint to refine when the cap is hit.

A summary count above the list ("X teams in scope") and, if relevant,
"X of Y match" when a search query is active.

### 7.4 Edge cases

- No teams match the query → empty state.
- Scope switch resets the visible list to the new scope (the search
  query carries over).

---

## 8. Team card (shared component)

Anywhere a team is rendered (Pokémon detail, Find Team results, Teams
view), the team card must surface the following information:

- **Description** (e.g. "Wolfe Glick's Knoxville Regional Champion Team").
- **Creator** name and **owner handle** when present.
- **Regulation indicator** (M-A or M-B).
- **Tournament / event** name when present.
- **Rank** within that event when present (e.g. "Champion", "Top 4").
- **Date shared**.
- **Pokepaste link** (external) when present.
- **Source link** (external; original Twitter / forum post) when present.
- The **six mons** of the team, each showing:
  - Forme name (mega-aware).
  - Held item.
  - Ability.
  - Up to four moves.
  - SP spread and nature.
- A **"Fight this team"** affordance that triggers the §4.3 handoff.

When the card is rendered as part of a Find Team result, additional
context may be attached:

- A "missing: X · Y" annotation for partial matches (§6.5).
- Visual emphasis on the mons that matched the user's picks (§6.5).
- When rendered inside a Pokémon detail page, the mon the user is
  currently viewing may be visually emphasized.

The mons' moves should be visually distinguishable by type (e.g. type
colours), to support quick scanning of "what threats does this team
project at me?" — but this is a UX recommendation, not a constraint on
the type chart itself.

---

## 9. Data sources and persistence

- **Bundled data**: teams (with full sets), forme stats and types from
  PokeAPI, move data and flags from a Pokémon Showdown export, and the
  type chart — all packaged with the app, no live network calls.
- **User-supplied data**: the user's saved team (paste-once, persists in
  the browser).
- **Session-only**: current regulation scope, current view, current
  Pokémon selection, current Find Team query, current Damage Calc
  combatant configuration. None of this is required to survive reload,
  but doing so is acceptable.

---

## 10. Non-functional requirements

- **Offline-first**: the app must work without any network connection
  once loaded. All upstream data is bundled at build time.
- **Real-time**: every input must update its dependent views immediately;
  there is never a "calculate / refresh / submit" gate (with the
  exception of the Find Team workflow, which may run on Enter / explicit
  Find for clarity — but live update is also acceptable).
- **Numerical accuracy** (for any computations rendered in these views,
  e.g. speed tiers and usage percentages): correct to the integer.
- **State persistence**: only the user's saved team is required to
  persist across reloads.

---

## 11. Explicitly out of scope

- Account / login / multi-device sync.
- Real-time data refresh from the upstream sheet (data is bundled at
  build time).
- Match simulation, turn order, switch sequencing — that's the damage
  calc's territory (and out of scope there too).
- Pricing / monetization concerns.
- Team-building helper / suggester (the app **reads** the meta; it does
  not **propose** new teams).

---

## 12. View interplay summary (cross-reference)

For Figma's convenience, the surface-to-surface interactions in one place:

| From | Action | Lands at |
|---|---|---|
| Pokémon detail | Click any team card's "Fight this team" | Damage Calc, with that team loaded as the opposing team reference |
| Find Team result | Click any team card's "Fight this team" | Damage Calc, same |
| Teams view | Click any team card's "Fight this team" | Damage Calc, same |
| Damage Calc | The "My team" panel is sourced from the persistent saved team described in §4.2 | n/a |
| Any view | Switch regulation scope | All in-scope counts / lists update; opposing-team reference is preserved |
| Any view | Open the navigation | Reach any of the four primary views in one action |
