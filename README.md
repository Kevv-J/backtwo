# backtwo

**Read the back two.**
A VGC doubles companion for Pokémon Champions — built for the climb.

→ Live: [kevv-j.github.io/backtwo](https://kevv-j.github.io/backtwo/)

---

## What it does

- **Pokémon view** — meta browser cut from 1,400+ tournament teams: usage,
  sets, abilities, items, common moves, teammates, speed tiers (incl. +Tailwind
  ribbon).
- **Find Team** — paste or type the six opposing mons from team preview;
  identify the closest archetype + flag missing-piece guesses.
- **Damage Calc** — Showdown-style, Gen-9-accurate, doubles-only. Spread
  default, Champions SP system (1 SP = 8 EV; max 32 per stat, ~66 total),
  field state, side effects, status, multi-hit moves, Intimidate auto-apply,
  contact-flag abilities, the full chain.
- **Teams** — every team in the dataset, searchable, with pokepaste links and
  "Fight this team" handoff into the calc.

Built for VGC doubles. Works across every Champions regulation — the reg pills
at the top filter the data; the rest of the tool is regulation-agnostic.

## How it's built

Pure static site. No backend.

```
build_db.py    -- scrapes the VGCPastes Google Sheet, resolves pokepastes
build_dex.py   -- fetches PokéAPI + Showdown move data, injects into template
viewer_template.html  -- the source-of-truth viewer (vanilla JS, one file)
index.html     -- the built artifact (~5MB, self-contained, served as-is)
```

To rebuild locally:

```bash
python3.11 -m venv venv && source venv/bin/activate && pip install requests
python build_db.py     # scrape teams (caches in data/cache/)
python build_dex.py    # fetch dex + emit index.html
```

## Data sources

- **[VGCPastes](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw)** —
  the team archive. None of this exists without Logan and the contributors who
  keep it updated.
- **[PokéAPI](https://pokeapi.co)** — base stats, types, abilities, sprites.
- **[Pokémon Showdown](https://play.pokemonshowdown.com/data/moves.js)** —
  move flags, multi-hit data, edge-case metadata.

## Found a bug?

Open an issue on this repo. Solo maintainer — I don't promise an SLA, but I do
read every issue.

## License

Code: MIT (see [LICENSE](./LICENSE)).
Pokémon names, sprites, and game data belong to their respective owners — see
[NOTICE.md](./NOTICE.md).

## Disclaimer

backtwo is an unofficial fan project. It is not affiliated with, endorsed by,
or sponsored by Nintendo, The Pokémon Company, Game Freak, or the publishers
of Pokémon Champions.

---

*Built by [Kevin John](https://github.com/Kevv-J).*
