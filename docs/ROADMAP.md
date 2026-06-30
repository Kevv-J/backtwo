# backtwo — Roadmap

> Living document. Synthesized from a 5-angle workflow brainstorm
> (features, mobile/perf, sharing/virality, data automation, community)
> after the v1.0 launch.

## Currently shipped

- v1.0 launch (Jun 2026): wordmark, favicon, OG card, footer + About + LICENSE + NOTICE + README
- Quick wins: freshness badge, hotkey toast, QR + share buttons, touch targets, ROADMAP.md
- Self-sustaining cron: weekly Tue 09:00 UTC rebuild + scrape validator + `data_lock.json` + size budget + auto-issue on failure
- Ally slot phase 1: My Team quick-pick + dataset search + auto-wire (Power Spot / Battery / Steely Spirit / Flower Gift / Helping Hand) + transparency badge

## User-curated next (priority order)

Maintainer's call: focus on what HE will use on laptop until there's
evidence others are using the tool. Mobile deferred until we have signal.

| Order | Item | Effort | Why now |
|---|---|---|---|
| 1 | **GoatCounter telemetry** (5 events, no PII) | trivial | Answers the "is anyone using this?" question. Required input for every other decision. |
| 2 | **Team finder overhaul** | small-medium | Maintainer uses this for opponent scouting. UI is currently primitive — needs autocomplete-with-sprite, autoselect-first-match, click-to-add, "+" icon styling. |
| 3 | **Color theme** | small | Maintainer's design ask. *(Clarify scope first — see below.)* |
| 4 | **Casual-friendly team builder** | large | A modal team builder for users who don't know pokepaste. 6 slots, mon + item + ability + moves + nature + EVs picker. Bidirectional convert: builder ↔ pokepaste text. Defer until the team finder + telemetry land — we'll know whether casuals are even arriving. |
| ⏸ | **Mobile view** | medium | Deferred — most-wanted but no signal yet. Push past 100 weekly visitors before designing for it. |

---

## Executive call

backtwo's edge over Pikalytics, Showdown calc, and VGCPastes is that it's
the **only tool that fuses a live team dataset, a real doubles calc, and
a meta browser in one shareable surface**. The next sprint must:

1. **Protect that fusion** — automate the data so it stays fresh
2. **Exploit it** — make every artifact a first-class shareable link
3. **Deepen the calc** — close the doubles-specific gaps Showdown leaves open

Refuse: Discord, accounts, newsletters, OCR, any backend dependency,
out-Showdown-ing the team builder, out-Pikalytics-ing the stats page.

Win on: integrated workflow (calc-aware-of-team, dataset-aware-of-calc),
tournament-day mobile usability, instant share — the gaps nobody else can close.

---

## Roadmap themes

| Theme | One-liner |
|---|---|
| **Make it self-sustaining** | Cron + validator + regression suite → the tool doesn't quietly rot when Kevin gets busy |
| **Make every artifact shareable** | Deep links + per-matchup OG cards + screenshot button → every WhatsApp convo becomes distribution |
| **Deepen the calc** | Ally slot + auto-wire + roll histogram → the only real VGC doubles calc |
| **Tournament-day mobile** | Bundle split + PWA + 375px layout → be the tool players open at the table |
| **Mine the dataset (the moat)** | Counter finder + Team Preview helper → things only a tool with 1,400+ teams + a calc can build |

---

## Next 3 to ship (in order)

### 1. Self-sustaining build pipeline

**Effort**: 1 focused weekend · **Impact**: transformative (gates every future feature)

- **GitHub Actions weekly cron** (Tue 09:00 UTC) — runs `build_db.py` + `build_dex.py` + `build_og.py`, commits regenerated artifacts to main
- **Pydantic schema validator** on the VGCPastes scrape — fails closed if row count drops >10%, columns vanish, or unknown-mon rate jumps. Keeps last good build, opens an issue with the diff
- **Pytest calc regression suite** — ~30 golden matchups (Miraidon→Calyrex-S, Urshifu→Rilla, Kingambit→Iron Hands, etc.) asserted against Showdown calc. Blocks deploy on regression
- **Artifact size budget** (index.html <7MB, gzip <1.5MB) as a workflow gate
- **`data_lock.json`** capturing PokéAPI / Showdown SHAs + sheet revision

Why first: everything else rests on the dataset staying fresh + the calc staying correct. One VGCPastes column rename away from silently corrupting in front of the launch audience. Also earns the right to ship the ally slot without anxiety.

### 2. Shared "My Team" + deep-linkable URLs + per-matchup OG cards

**Effort**: ~5 days (URL encoding + state ~3 days; edge-function OG ~2 days) · **Impact**: transformative (virality + spine for later features)

- Promote `Shift+1-6` "My Team" set to a **first-class object** in localStorage + URL hash
- Every view reads it: Find Team scores against it, Calc shows quick-picks, Pokémon view badges "on your team", Teams view sorts by overlap
- **Encode full calc state in the URL** (attacker/defender/move/EVs/item/ability/field/Tera/ally), versioned (`v=1`) so links never break
- **"Copy matchup link"** button next to the damage result
- **Per-matchup OG cards** via a tiny Cloudflare Worker / Vercel edge function — recipient sees the damage range in the WhatsApp unfurl before they even click
- **"Screenshot this calc"** button — branded PNG with a short URL stamped at the bottom

Why second: spine for every later feature AND the growth engine. Today the 4 views are siloed; shares are generic logo unfurls. After this, every share IS the answer. Compounds — every share recruits, every recruit shares.

### 3. Ally slot in damage calc + auto-wire + transparency badge

**Effort**: ~1 week (boost matrix + UI + new golden matchups) · **Impact**: transformative (biggest functional gap vs Showdown calc for doubles)

- 1-line chip-row **Ally panel** above the attacker block (preserves side-by-side atk/def rhythm)
- **Quick-pick from "My Team"** (from #2); searchable dropdown as fallback
- **Auto-wire** picks the implied checkboxes:
  - Helping Hand (move present)
  - Friend Guard (ability)
  - Power Spot (ability)
  - Battery (ability, special only)
  - Steely Spirit (ability, Steel moves only)
  - Flower Gift (Sun present)
  - Tatsugiri preset → Dondozo Commander
  - Weather setter → "apply weather" nudge (not auto)
  - Stellar Tera shield → one-time flag
- **"Boosts applied:"** transparency badge with one-click override per modifier — non-negotiable; silent auto-wire that miscomputes Friend Guard is worse than no auto-wire
- Ally sticky across calcs in the session

Why third: needs #2's shared "My Team" so quick-pick is one tap. Single biggest functional gap vs Showdown calc for doubles. The feature people tell their friends about.

---

## v1.5 pile (after the next-3)

| | Effort | Impact |
|---|---|---|
| Split inline JSON out of `viewer_template.html` (separate `dex.json` / `teams.json` / `moves.json`) | medium | high |
| Service worker + PWA manifest (offline at the venue) | small (after bundle split) | transformative for tournament-day |
| 375px damage-calc layout + 44px touch targets | small | high |
| Speed tier overlay wired into calc field state | small-medium | high |
| **Counter finder** (beta) from the team dataset — *only backtwo can build this* | medium | transformative |
| GoatCounter telemetry on 5 events | trivial | high (unlocks data-driven decisions) |
| Damage roll histogram + KO% (replace min/max bar) | small | high |
| Prefilled GitHub issue deep-links + Pokepaste export | small | high |
| Auto-changelog + webhook digest on meaningful builds | small | useful |
| "Updated X days ago" + new-dot on nav items | trivial | useful |

---

## v2 horizon (design first, build later)

| Title | Design question to resolve first |
|---|---|
| **Team Preview helper** (tournament-day lead-call view) | How tappable is 6-mon input under tournament-clock stress? Test with real players first — if input takes >20s, feature is unusable |
| **EV spread planner** (solve-for-benchmark) | Calc side-panel toggle, or third top-level view? How do saved spreads flow into the calc — auto-apply, or chip-suggestion? |
| **Team builder** with paste import/export | What's the meta-aware layer that justifies building this? If can't articulate 3 things Showdown's builder lacks, defer indefinitely |
| Replay link import (Showdown / VGC.gg) | What fraction of replays parse cleanly? Client-side or edge function? |
| Tournament import (Limitless / VGC.gg) | API stability + rate limits + ToS — can pull this server-side without violating their terms? |
| Embeddable calc widget (iframe) | Wait for inbound demand. Read-only or interactive embed? |

---

## Quick wins (sub-1-hour, knock off whenever)

- `viewport-fit=cover` + `env(safe-area-inset-*)` on sticky elements (iPhone notch fix)
- `theme-color` meta matching the cyan brand
- Self-host the wordmark font + preload + `font-display: swap`
- WhatsApp + Twitter share-intent buttons with pre-composed copy
- QR code in About modal (encodes current URL — IRL share at locals)
- Copy-as-Markdown calc summary for Discord
- First-visit hotkey toast (gated by localStorage)
- Touch-target sweep on opt-buttons + reg pills
- "Updated X days ago" freshness badge
- Tag every successful cron build as a GitHub Release
- Brotli precompress in the build
- `repository_dispatch` trigger for tournament-ended rebuilds

---

## Explicit "not now"

| Skip | Why |
|---|---|
| Any backend / database / accounts | Static + localStorage + URL hashes is a *feature*. The moment you add auth or a DB, you have ops, costs, privacy posture, deploy story — breaks the "works forever, free, no maintenance" pitch |
| Discord server | Taxes solo maintainers daily, dies loudly when neglected. WhatsApp + GitHub issues cover it; GitHub issues self-archive, Discord chat evaporates |
| Newsletter | Demands cadence + long-form. WhatsApp + changelog page already cover the update need. A dormant newsletter is worse than no newsletter |
| Screenshot OCR for opponent team | Tarpit. 70% accuracy ceiling, eats a month. Manual tap of 6 mons is fast enough — invest in Team Preview helper instead |
| Framework rewrite (React / Vue / Svelte) | Vanilla-JS architecture IS why backtwo deploys to GitHub Pages with zero ops. None of the roadmap needs a framework — needs shared state, hash routing, CSS layer |
| Out-Showdown-ing the team builder | Showdown's builder is mature, Pokepaste is the lingua franca. Compete on the meta-aware layer or don't build |
| Weekly passcode gate | Every shareable URL is a recruitment funnel; a gate is the one thing that kills the WhatsApp loop |
| Paid services | A surprise $40/mo bill kills the project. Stay free-forever — it's part of the brand |

---

*Synthesized after launch. Re-visit whenever priorities shift.*
