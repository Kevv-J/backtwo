#!/usr/bin/env python3
"""Fetch base stats / types / move data from PokeAPI for everything in the
teams DB, mega-aware, and write data/dex.json.

PokeAPI carries the Champions megas (verified), so each held mega stone resolves
to the mega forme's stats. Output feeds the Speed Tier view and Damage Calc.

  dex.json = {
    "formes": { "Charizard-Mega-Y": {"types": [...], "stats": {hp,atk,def,spa,spd,spe}}, ... },
    "moves":  { "Flower Trick": {"power": 70, "type": "grass", "category": "physical"}, ... },
    "typechart": { "fire": {"grass": 2, "water": 0.5, ...}, ... }
  }
"""
from __future__ import annotations

import datetime as _dt
import html
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests


def _build_stamp():
    """Return (short_sha, iso_date) for the current commit; falls back to 'dev'."""
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(ROOT), stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        sha = "dev"
    return sha, _dt.date.today().isoformat()

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CACHE = DATA / "api_cache"
TEAMS_JSON = DATA / "teams.json"
DEX_JSON = DATA / "dex.json"
TEMPLATE = ROOT / "viewer_template.html"
HTML_OUT = ROOT / "index.html"

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "vgc-team-db/1.0 (personal study tool)"

# Base-species name (our canonical) -> PokeAPI slug, for formes the naive
# lowercase-hyphenate rule gets wrong.
SLUG_OVERRIDES = {
    "Basculegion": "basculegion-male",
    "Pyroar": "pyroar-male",
    "Basculegion-F": "basculegion-female",
    "Aegislash": "aegislash-shield",
    # Aegislash-Blade is Aegislash's offensive stance (Stance Change swaps
    # into it when using a damaging move). Not present in VGCPastes teams
    # (players write "Aegislash"), but we surface it in the calc so users
    # can toggle to the Blade stat spread for offensive calcs.
    "Aegislash-Blade": "aegislash-blade",
    "Lycanroc": "lycanroc-midday",
    "Meowstic": "meowstic-male",
    "Mimikyu": "mimikyu-disguised",
    "Morpeko": "morpeko-full-belly",
    "Palafin": "palafin-zero",
    "Tauros-Paldea-Aqua": "tauros-paldea-aqua-breed",
    "Tauros-Paldea-Blaze": "tauros-paldea-blaze-breed",
    "Tauros-Paldea-Combat": "tauros-paldea-combat-breed",
    "Maushold": "maushold-family-of-four",
    "Maushold-Four": "maushold-family-of-four",
    "Maushold-Three": "maushold-family-of-three",
    "Indeedee-F": "indeedee-female",
    "Indeedee-M": "indeedee",
    "Urshifu-Rapid-Strike": "urshifu-rapid-strike",
    "Oinkologne-F": "oinkologne-female",
    "Toxtricity-Low-Key": "toxtricity-low-key",
    # cosmetic-only formes: same stats as the base species
    "Vivillon-Fancy": "vivillon",
    "Vivillon-Pokeball": "vivillon",
    "Sinistcha-Masterpiece": "sinistcha",
    "Poltchageist-Artisan": "poltchageist",
}

# items ending in -ite that are NOT mega stones
NOT_A_STONE = {"Eviolite"}

# Pokémon Champions (April 2026) introduces NEW Mega Evolutions that don't
# exist in prior games. PokéAPI has no data for these, so fetch_pokemon falls
# back to the base-species entry — which leaves the ability, stats, and types
# wrong. Patch them here.
#
# Any field omitted below keeps its PokéAPI/base-fallback value. `types` is
# optional (only set when the Mega changes typing).
MEGA_OVERRIDES: dict[str, dict] = {
    # Values cross-checked against Game8 / Pikalytics / Serebii / Pokémon Zone
    # Champions dex pages (all agreed).
    "Pyroar-Mega": {
        "ability": "Fire Mane",   # Mega-exclusive; unconditional +50% Fire moves
        "stats": {"hp": 86, "atk": 88, "def": 92, "spa": 129, "spd": 86, "spe": 126},
    },
    "Chimecho-Mega": {
        "ability": "Levitate",    # base ability retained on the Mega
        "stats": {"hp": 75, "atk": 50, "def": 110, "spa": 135, "spd": 120, "spe": 65},
        "types": ["psychic", "steel"],
    },
    "Floette-Eternal-Mega": {
        "ability": "Fairy Aura",  # boosts all Fairy moves on the field
        "stats": {"hp": 74, "atk": 85, "def": 87, "spa": 155, "spd": 148, "spe": 102},
    },
    # Meowstic-Mega splits — M and F are stat-identical and share Trace on the
    # Mega; the M/F difference at the base form (Prankster vs Competitive) is
    # cosmetic in the Mega. Not in PokéAPI as of 2026-07-03.
    "Meowstic-Mega": {
        "ability": "Trace",
        "stats": {"hp": 74, "atk": 48, "def": 76, "spa": 143, "spd": 101, "spe": 124},
    },
    "Meowstic-Mega-F": {
        "ability": "Trace",
        "stats": {"hp": 74, "atk": 48, "def": 76, "spa": 143, "spd": 101, "spe": 124},
    },
}


# Pokémon Champions rebalances a handful of pre-existing moves (BP, accuracy,
# flag corrections) and adds a few new signatures. PokéAPI reflects gen 9,
# not the Champions patches — patch them here after the fetch.
#
# Fields: any subset of {power, accuracy, type, category, spread, contact,
# slicing, punch, sound, bullet, bite, pulse}. Omitted fields keep the
# PokéAPI value.
MOVE_OVERRIDES: dict[str, dict] = {
    # ── BP shifts (Champions rebalance, per Serebii Champions updated moves) ──
    "Trop Kick":        {"power": 85},   # was 70
    "Psyshield Bash":   {"power": 90},   # was 70
    "First Impression": {"power": 100},  # was 90
    "Infernal Parade":  {"power": 65},   # was 60
    "Bone Rush":        {"power": 30},   # per-hit; was 25
    # ── Slicing-flag corrections (were missing in PokéAPI's flag set) ──
    "Dragon Claw":  {"slicing": True},
    "Shadow Claw":  {"slicing": True},
    "Crush Claw":   {"slicing": True},
    # ── Type correction (Growth was miscategorized as Normal in old data) ──
    "Growth":       {"type": "grass"},
    # ── Sound-flag correction (Dragon Cheer's sound flag was missing) ──
    "Dragon Cheer": {"sound": True},
    # ── Reg-B (June 2026 patch) — Gholdengo/Annihilape nerfs ──
    # Make It Rain: accuracy 100 → 95, SpA drop -1 → -2 (drop is secondary
    # effect, not modeled in single-turn calc — surface via tooltip only).
    "Make It Rain": {"accuracy": 95},
    # ── Scripted-boost + HP-cost backfills ──
    # Showdown's onHit-scripted stat moves carry no `boosts` object, so our
    # Use button ignored them. Synthesize the boosts + optional hpCost so
    # applyMoveEffects can apply them. hpCost is a % of max HP (Belly Drum
    # halves HP; Clangorous Soul takes a third; Fillet Away halves).
    "Belly Drum":       {"boosts": {"atk": 6}, "mvTarget": "self", "hpCost": 50},
    "Fillet Away":      {"boosts": {"atk": 2, "spa": 2, "spe": 2}, "mvTarget": "self", "hpCost": 50},
    "Clangorous Soul":  {"hpCost": 33},   # boosts already in the dex; only add the tax
    # Curse (non-Ghost): +1 Atk / +1 Def / -1 Spe on self. Ghost-Curse's
    # HP-halving self-hit variant isn't modeled — user shouldn't press Use
    # on a Ghost caster's Curse expecting -50% HP.
    "Curse":            {"boosts": {"atk": 1, "def": 1, "spe": -1}, "mvTarget": "self"},
    # Rock Polish / Autotomize / Shift Gear are onHit-scripted; add explicitly
    # (dex will only carry these if they land on a scraped team).
    "Rock Polish":      {"boosts": {"spe": 2}, "mvTarget": "self"},
    "Autotomize":       {"boosts": {"spe": 2}, "mvTarget": "self"},
    "Shift Gear":       {"boosts": {"atk": 1, "spe": 2}, "mvTarget": "self"},
}


def apply_move_overrides(dex_moves: dict[str, dict]) -> None:
    for name, patch in MOVE_OVERRIDES.items():
        if name not in dex_moves:
            continue
        dex_moves[name].update(patch)


def apply_mega_overrides(dex_formes: dict[str, dict]) -> None:
    """Patch Champions-invented Megas whose PokéAPI slug doesn't exist —
    fetch_pokemon has fallen back to the base species, so we correct ability,
    stats, and optionally typing here."""
    for label, patch in MEGA_OVERRIDES.items():
        if label not in dex_formes:
            continue
        rec = dex_formes[label]
        if "ability" in patch:
            # Overwrite the ability list with a single-entry canonical ability
            # so DEX.formes[label].abilities[0].name — which correctMegaAbility
            # reads in the viewer — returns the correct Mega ability.
            rec["abilities"] = [{"name": patch["ability"], "hidden": False, "slot": 1}]
        if "stats" in patch:
            rec["stats"] = {**rec.get("stats", {}), **patch["stats"]}
        if "types" in patch:
            rec["types"] = list(patch["types"])
        if "weight_kg" in patch:
            rec["weight_kg"] = patch["weight_kg"]


def species_slug(name: str) -> str:
    if name in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[name]
    s = name.lower()
    s = s.replace("♀", "-f").replace("♂", "-m")
    s = re.sub(r"[.'’:%]", "", s)
    s = s.replace(" ", "-")
    return s


def is_stone(item: str) -> bool:
    return bool(item) and item not in NOT_A_STONE and re.search(r"ite( [XY])?$", item)


def forme(name: str, item: str) -> tuple[str, list[str]]:
    """Return (canonical label, list of pokeapi slugs to try in order).

    Handles X/Y mega splits generically: any stone ending in " X" or " Y"
    (Charizardite X/Y, Mewtwonite X/Y, Raichunite X/Y, ...) produces
    "{Name}-Mega-X"/"{Name}-Mega-Y" with its own pokeapi slug.
    """
    if not is_stone(item):
        return name, [species_slug(name)]
    base = species_slug(name)
    m = re.search(r" ([XY])$", item)
    if m:
        sfx = m.group(1)
        label = f"{name}-Mega-{sfx}"
        return label, [f"{base}-mega-{sfx.lower()}", f"{base}-mega", base]
    return f"{name}-Mega", [f"{base}-mega", base]


def get_json(url: str, cache_key: str) -> dict | None:
    cf = CACHE / f"{cache_key}.json"
    if cf.exists():
        try:
            return json.loads(cf.read_text())
        except json.JSONDecodeError:
            pass
    try:
        r = SESSION.get(url, timeout=30)
        if r.status_code != 200:
            return None
        data = r.json()
    except (requests.RequestException, json.JSONDecodeError):
        return None
    cf.write_text(json.dumps(data))
    time.sleep(0.03)
    return data


def _slug_to_ability(slug: str) -> str:
    """PokeAPI ability slug → display name (Showdown-style).
    'lightning-rod' -> 'Lightning Rod', 'rks-system' -> 'RKS System'."""
    SPECIALS = {"rks-system": "RKS System", "as-one-glastrier": "As One (Glastrier)",
                "as-one-spectrier": "As One (Spectrier)"}
    if slug in SPECIALS:
        return SPECIALS[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def fetch_pokemon(slugs: list[str]) -> dict | None:
    for slug in slugs:
        d = get_json(f"https://pokeapi.co/api/v2/pokemon/{slug}", f"mon_{slug}")
        if d:
            st = {s["stat"]["name"]: s["base_stat"] for s in d["stats"]}
            sprites = d.get("sprites") or {}
            # Prefer the small 96×96 front_default (~1KB); fall back to the larger
            # PokéHome render (512×512, ~140KB) when front_default is null —
            # Champions-new megas don't have classic 2D sprites yet.
            sprite_url = sprites.get("front_default")
            if not sprite_url:
                other = sprites.get("other") or {}
                home = other.get("home") or {}
                sprite_url = home.get("front_default")
            # PokeAPI abilities — used by the viewer to set the correct ability
            # for mega formes (player pastes list the pre-mega ability since the
            # mega ability auto-applies on evolve in-game; we need the post-mega).
            abilities = []
            for ab_entry in d.get("abilities", []):
                slug_ab = (ab_entry.get("ability") or {}).get("name")
                if not slug_ab:
                    continue
                abilities.append({
                    "name": _slug_to_ability(slug_ab),
                    "hidden": bool(ab_entry.get("is_hidden")),
                    "slot": ab_entry.get("slot", 0),
                })
            # PokeAPI weight is in hectograms (1 hg = 0.1 kg). Round to 1 decimal
            # to match Bulbapedia's canonical weight; the calc uses this for
            # Low Kick, Grass Knot (target weight) and Heavy Slam, Heat Crash
            # (weight ratio).
            weight_hg = d.get("weight") or 0
            weight_kg = round(weight_hg / 10.0, 1)
            return {
                "types": [t["type"]["name"] for t in d["types"]],
                "stats": {
                    "hp": st["hp"], "atk": st["attack"], "def": st["defense"],
                    "spa": st["special-attack"], "spd": st["special-defense"],
                    "spe": st["speed"],
                },
                "sprite_url": sprite_url,
                "abilities": abilities,
                "weight_kg": weight_kg,
            }
    return None


# Local store for downloaded sprites — bundled with the app for offline use.
SPRITE_DIR = DATA / "sprites"


def sprite_slug(forme_label: str) -> str:
    """Filename-safe slug derived from the forme label.
    'Charizard-Mega-Y' -> 'charizard-mega-y', 'Floette-Eternal' -> 'floette-eternal'."""
    return forme_label.lower().replace(" ", "-")


def download_sprite(slug: str, url: str | None) -> bool:
    """Save `url` -> data/sprites/{slug}.png if not already cached. Returns True
    if a usable file ended up on disk."""
    if not url:
        return False
    SPRITE_DIR.mkdir(parents=True, exist_ok=True)
    out = SPRITE_DIR / f"{slug}.png"
    if out.exists() and out.stat().st_size > 0:
        return True
    try:
        r = SESSION.get(url, timeout=30)
        if r.status_code != 200:
            return False
        out.write_bytes(r.content)
        time.sleep(0.02)
        return True
    except requests.RequestException:
        return False


def move_slug(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[.'’]", "", s)
    s = s.replace(" ", "-")
    return s


# ---------------------------------------------------------------------------
# Item icons. The viewer's item picker shows a small PokéAPI item sprite next to
# each item name. We fetch them for the Champions Regulation M-B legal pool
# (mirrors CHAMPIONS_ITEMS in viewer_template.html) plus any mega stone that
# shows up in the team data. Champions-new mega stones have no upstream art and
# just fall back to a generic dot in the UI.
# ---------------------------------------------------------------------------
ITEM_SPRITE_DIR = SPRITE_DIR / "items"
ITEM_SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items"

# Champions Reg M-B legal items (official / RotomPicks). KEEP IN SYNC with
# CHAMPIONS_ITEMS in viewer_template.html.
CHAMPIONS_ITEM_NAMES = [
    # Held items
    "Big Root", "Black Belt", "Black Glasses", "Bright Powder", "Charcoal", "Choice Scarf",
    "Damp Rock", "Dragon Fang", "Expert Belt", "Fairy Feather", "Focus Band", "Focus Sash",
    "Hard Stone", "Heat Rock", "Icy Rock", "Iron Ball", "King's Rock", "Leftovers", "Life Orb",
    "Light Ball", "Light Clay", "Magnet", "Mental Herb", "Metal Coat", "Metronome", "Miracle Seed",
    "Muscle Band", "Mystic Water", "Never-Melt Ice", "Poison Barb", "Quick Claw", "Scope Lens",
    "Sharp Beak", "Shed Shell", "Shell Bell", "Silk Scarf", "Silver Powder", "Smooth Rock",
    "Soft Sand", "Spell Tag", "Twisted Spoon", "White Herb", "Wide Lens", "Wise Glasses", "Zoom Lens",
    # Berries
    "Aspear Berry", "Babiri Berry", "Charti Berry", "Cheri Berry", "Chesto Berry", "Chilan Berry",
    "Chople Berry", "Coba Berry", "Colbur Berry", "Haban Berry", "Kasib Berry", "Kebia Berry",
    "Leppa Berry", "Lum Berry", "Occa Berry", "Oran Berry", "Passho Berry", "Payapa Berry",
    "Pecha Berry", "Persim Berry", "Rawst Berry", "Rindo Berry", "Roseli Berry", "Shuca Berry",
    "Sitrus Berry", "Tanga Berry", "Wacan Berry", "Yache Berry",
    # Mega stones
    "Abomasite", "Absolite", "Aerodactylite", "Aggronite", "Alakazite", "Altarianite", "Ampharosite",
    "Audinite", "Banettite", "Barbaracite", "Beedrillite", "Blastoisinite", "Blazikenite", "Cameruptite",
    "Chandelurite", "Charizardite X", "Charizardite Y", "Chesnaughtite", "Chimechite", "Clefablite",
    "Crabominite", "Delphoxite", "Dragalgite", "Dragoninite", "Drampanite", "Eelektrossite", "Emboarite",
    "Excadrite", "Falinksite", "Feraligite", "Floettite", "Froslassite", "Galladite", "Garchompite",
    "Gardevoirite", "Gengarite", "Glalitite", "Glimmoranite", "Golurkite", "Greninjite", "Gyaradosite",
    "Hawluchanite", "Heracronite", "Houndoominite", "Kangaskhanite", "Lopunnite", "Lucarionite",
    "Malamarite", "Manectite", "Mawilite", "Medichamite", "Meganiumite", "Meowsticite", "Metagrossite",
    "Pidgeotite", "Pinsirite", "Pyroarite", "Raichunite X", "Raichunite Y", "Sablenite", "Sceptilite",
    "Scizorite", "Scolipite", "Scovillainite", "Scraftinite", "Sharpedonite", "Skarmorite", "Slowbronite",
    "Staraptite", "Starminite", "Steelixite", "Swampertite", "Tyranitarite", "Venusaurite", "Victreebelite",
]


def item_slug(name: str) -> str:
    """PokeAPI item sprite filename slug. 'King's Rock' -> 'kings-rock',
    'Charizardite X' -> 'charizardite-x', 'Never-Melt Ice' -> 'never-melt-ice'."""
    s = name.lower()
    s = re.sub(r"[.'’]", "", s)
    s = s.replace(" ", "-")
    return s


def download_item_sprite(name: str) -> str | None:
    """Save the PokéAPI item sprite -> data/sprites/items/{slug}.png. Returns the
    slug if a usable file ended up on disk, else None (Champions-new items 404)."""
    slug = item_slug(name)
    ITEM_SPRITE_DIR.mkdir(parents=True, exist_ok=True)
    out = ITEM_SPRITE_DIR / f"{slug}.png"
    if out.exists() and out.stat().st_size > 0:
        return slug
    url = f"{ITEM_SPRITE_BASE}/{slug}.png"
    try:
        r = SESSION.get(url, timeout=30)
        if r.status_code != 200 or not r.content:
            return None
        out.write_bytes(r.content)
        time.sleep(0.02)
        return slug
    except requests.RequestException:
        return None


# move targets that hit more than one mon in doubles (-> 0.75x spread reduction)
SPREAD_TARGETS = {"all-other-pokemon", "all-opponents", "all-pokemon"}

# move flags we care about for ability calcs. Pokemon Showdown's moves.js
# exposes these but PokeAPI does not.
FLAG_KEYS = ("contact", "punch", "pulse", "bite", "sound", "slicing", "bullet")
_MOVE_FLAGS: dict[str, dict] = {}


def _to_id(name: str) -> str:
    """Showdown's toID: lowercase, alphanumeric only."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def fetch_move_flags() -> dict:
    """One-shot: pull Showdown's moves.js and extract per-move flag dicts.
    Uses node to eval the JS file (~450KB), then JSON-encodes the flags map.
    """
    import subprocess
    cache_file = CACHE / "showdown_moves_flags.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text())
        except json.JSONDecodeError:
            pass
    print("Fetching Showdown moves.js for move flags ...", flush=True)
    try:
        r = SESSION.get("https://play.pokemonshowdown.com/data/moves.js", timeout=60)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"  WARNING: could not fetch moves.js ({e}); flag-dependent abilities will be no-ops.")
        return {}
    js = r.text
    try:
        p = subprocess.run(
            ["node", "-e",
             "let exports={};const fs=require('fs');const code=fs.readFileSync('/dev/stdin','utf8');"
             "eval(code);const out={};for(const [k,v] of Object.entries(exports.BattleMovedex||{}))"
             "{if(!v)continue;const e={};if(v.flags)e.flags=v.flags;"
             "if(v.multihit!==undefined)e.multihit=v.multihit;"
             "if(v.basePower!==undefined)e.basePower=v.basePower;"
             "if(v.priority!==undefined)e.priority=v.priority;"
             "if(v.accuracy!==undefined)e.accuracy=v.accuracy;"
             "if(v.self)e.self=v.self;"
             "if(v.boosts)e.boosts=v.boosts;"
             "if(v.secondary)e.secondary=v.secondary;"
             "if(v.secondaries)e.secondaries=v.secondaries;"
             "if(v.target)e.target=v.target;"
             "if(v.pp!==undefined)e.pp=v.pp;"
             "if(v.shortDesc)e.shortDesc=v.shortDesc;"
             "if(Object.keys(e).length)out[k]=e;}"
             "process.stdout.write(JSON.stringify(out));"],
            input=js, capture_output=True, text=True, timeout=30,
        )
        if p.returncode != 0:
            print(f"  WARNING: node eval failed ({p.stderr[:120]}); flags unavailable.")
            return {}
        flags = json.loads(p.stdout)
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError) as e:
        print(f"  WARNING: flag extraction failed ({e}); flags unavailable.")
        return {}
    cache_file.write_text(json.dumps(flags))
    print(f"  parsed flags for {len(flags)} moves.")
    return flags


def fetch_move(name: str) -> dict:
    d = get_json(f"https://pokeapi.co/api/v2/move/{move_slug(name)}", f"mv_{move_slug(name)}")
    sd = _MOVE_FLAGS.get(_to_id(name), {})
    sd_flags = sd.get("flags", {}) if isinstance(sd, dict) else {}
    extra = {k: bool(sd_flags.get(k)) for k in FLAG_KEYS}
    # Extra Showdown-sourced fields for the calc's "Use" button and tooltip.
    detail: dict = {}
    if isinstance(sd, dict):
        if "priority" in sd: detail["priority"] = sd["priority"]
        if "accuracy" in sd: detail["accuracy"] = sd["accuracy"]  # int or True (never misses)
        if "pp" in sd: detail["pp"] = sd["pp"]
        if sd.get("self"): detail["self"] = sd["self"]           # {boosts:{...}} for Close Combat / Draco Meteor / ...
        if sd.get("boosts"): detail["boosts"] = sd["boosts"]     # status-move primary boosts; target is dictated by `mvTarget`
        if sd.get("secondary"): detail["secondary"] = sd["secondary"]
        if sd.get("secondaries"): detail["secondaries"] = sd["secondaries"]
        # Showdown's ~40-char one-liner used in the calc's move picker + tooltip.
        # Skip the longer `desc` (150+ chars, ~4× cost) — the shortDesc + our
        # existing structured tooltip already convey the essentials.
        if sd.get("shortDesc"): detail["shortDesc"] = sd["shortDesc"]
        # Showdown's target string ('self' / 'normal' / 'allAdjacentFoes' / ...).
        # For status moves with top-level `boosts`, this decides whether the effect lands on user or opponent.
        # Emitted as `mvTarget` to avoid colliding with PokéAPI's `target` (already reduced to bool `spread`).
        if sd.get("target"): detail["mvTarget"] = sd["target"]
    if not d:
        return {"power": None, "type": "normal", "category": "status", "spread": False,
                "minHits": 1, "maxHits": 1, **extra, **detail}
    meta = d.get("meta") or {}
    # Hits: prefer PokeAPI; fall back to Showdown's `multihit` (int for fixed, list for variable).
    min_hits = meta.get("min_hits")
    max_hits = meta.get("max_hits")
    if (not min_hits or not max_hits) and "multihit" in sd:
        mh = sd["multihit"]
        if isinstance(mh, int):
            min_hits = max_hits = mh
        elif isinstance(mh, list) and len(mh) == 2:
            min_hits, max_hits = mh[0], mh[1]
    # PokéAPI fallback for priority/accuracy when Showdown is missing them.
    if "priority" not in detail and d.get("priority") is not None:
        detail["priority"] = d["priority"]
    if "accuracy" not in detail and d.get("accuracy") is not None:
        detail["accuracy"] = d["accuracy"]
    return {
        "power": d.get("power"),
        "type": d["type"]["name"],
        "category": d["damage_class"]["name"],  # physical / special / status
        "spread": d["target"]["name"] in SPREAD_TARGETS,
        "minHits": min_hits or 1,
        "maxHits": max_hits or 1,
        **extra,
        **detail,
    }


TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
         "ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"]


def build_typechart() -> dict:
    chart = {a: {} for a in TYPES}
    for atk in TYPES:
        d = get_json(f"https://pokeapi.co/api/v2/type/{atk}", f"type_{atk}")
        rel = d["damage_relations"]
        for t in rel["double_damage_to"]:
            chart[atk][t["name"]] = 2
        for t in rel["half_damage_to"]:
            chart[atk][t["name"]] = 0.5
        for t in rel["no_damage_to"]:
            chart[atk][t["name"]] = 0
    return chart


# ---------------------------------------------------------------------------
# Static pre-rendered pages.
#
# The SPA is one 5.6 MB hash-routed URL, which means search engines see exactly
# one page and have to execute JS to see anything at all. Google's guidance is
# explicit that URL fragments are not indexed as separate pages, so #/pokemon/x
# can never rank on its own.
#
# So we emit a small, fully-static HTML page per Pokemon alongside index.html.
# Each is a few KB, needs no JS, carries only its own data, and links to its
# teammates -- giving crawlers ~170 real URLs and an internal link graph instead
# of one opaque blob. GitHub Pages serves pokemon/<slug>/index.html at the clean
# URL /backtwo/pokemon/<slug>/ with no config.
# ---------------------------------------------------------------------------

SITE_BASE = "https://kevv-j.github.io/backtwo"
PAGES_DIR = ROOT / "pokemon"

# Below this many teams a page has nothing substantive to say (no meaningful
# item/move spread, no teammate signal). Auto-generated thin pages hurt more
# than they help, so those formes stay in the SPA only.
MIN_TEAMS_FOR_PAGE = 3

# Teams listed inline on a mon page. Enough to be useful, not so many that the
# page becomes a wall of near-duplicate rows.
MAX_TEAMS_LISTED = 12

PAGE_CSS = """
:root{--bg:#08090d;--pan:#12141c;--ln:#232735;--fg:#e8ecf5;--dim:#8b93a7;--ac:#22d3ee;--ac2:#a78bfa}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--ac);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:900px;margin:0 auto;padding:20px 18px 60px}
header.sh{display:flex;align-items:center;gap:10px;padding:14px 0;border-bottom:1px solid var(--ln);margin-bottom:22px;flex-wrap:wrap}
.brand{font-weight:800;font-size:19px;letter-spacing:-.5px}.brand .b{color:var(--ac)}.brand .t{color:var(--ac2)}
.crumb{color:var(--dim);font-size:13px}
h1{font-size:27px;margin:0 0 6px;letter-spacing:-.5px}
h2{font-size:16px;margin:26px 0 10px;text-transform:uppercase;letter-spacing:.7px;color:var(--dim)}
.hero{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.hero img{width:84px;height:84px;image-rendering:pixelated}
.lede{color:var(--dim);margin:10px 0 0;max-width:68ch}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.chip{padding:2px 9px;border-radius:99px;font-size:12px;font-weight:700;background:#1b1f2b;border:1px solid var(--ln);text-transform:capitalize}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{background:var(--pan);border:1px solid var(--ln);border-radius:10px;padding:13px 15px}
.card h3{margin:0 0 9px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--dim)}
.row{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:14px}
.row .n{color:var(--dim);font-variant-numeric:tabular-nums;white-space:nowrap}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--ln);vertical-align:top}
th{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.tw{overflow-x:auto}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px;margin-top:12px}
.st{background:var(--pan);border:1px solid var(--ln);border-radius:8px;padding:7px 9px;text-align:center}
.st b{display:block;font-size:19px;font-variant-numeric:tabular-nums}
.st span{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px}
.idx{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:8px}
.idx a{display:flex;align-items:center;gap:8px;background:var(--pan);border:1px solid var(--ln);border-radius:8px;padding:7px 10px;color:var(--fg)}
.idx a:hover{border-color:var(--ac);text-decoration:none}
.idx img{width:32px;height:32px;image-rendering:pixelated}
.idx .n{margin-left:auto;color:var(--dim);font-size:12px;font-variant-numeric:tabular-nums}
.cta{display:inline-block;margin-top:16px;background:var(--ac);color:#06232a;font-weight:700;padding:9px 16px;border-radius:8px}
.cta:hover{text-decoration:none;filter:brightness(1.08)}
footer.sf{margin-top:40px;padding-top:16px;border-top:1px solid var(--ln);color:var(--dim);font-size:13px}
"""


def page_slug(forme_label: str) -> str:
    """URL slug for a forme label. 'Mr. Rime' -> 'mr-rime'."""
    s = forme_label.lower().replace("'", "").replace("’", "").replace(".", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _pct(n: int, total: int) -> str:
    return f"{round(100 * n / total)}%" if total else "0%"


def aggregate_usage(teams: list[dict]) -> dict[str, dict]:
    """Per-forme usage rollup across every scraped team."""
    from collections import Counter

    agg: dict[str, dict] = {}
    for t in teams:
        mons = t.get("mons") or []
        labels = [m.get("forme") or m.get("name") for m in mons]
        labels = [x for x in labels if x]
        for m in mons:
            label = m.get("forme") or m.get("name")
            if not label:
                continue
            a = agg.setdefault(label, {
                "count": 0, "items": Counter(), "abilities": Counter(),
                "moves": Counter(), "natures": Counter(), "teammates": Counter(),
                "teams": [], "regs": Counter(),
            })
            a["count"] += 1
            if m.get("item"):
                a["items"][m["item"]] += 1
            if m.get("ability"):
                a["abilities"][m["ability"]] += 1
            if m.get("nature"):
                a["natures"][m["nature"]] += 1
            for mv in (m.get("moves") or []):
                if mv:
                    a["moves"][mv] += 1
            for other in labels:
                if other != label:
                    a["teammates"][other] += 1
            if t.get("reg"):
                a["regs"][t["reg"]] += 1
            a["teams"].append(t)
    return agg


def _bars(counter, total: int, limit: int = 6) -> str:
    rows = counter.most_common(limit)
    if not rows:
        return '<div class="row"><span>—</span></div>'
    return "".join(
        f'<div class="row"><span>{html.escape(str(k))}</span>'
        f'<span class="n">{v} · {_pct(v, total)}</span></div>'
        for k, v in rows
    )


def _page_shell(title: str, desc: str, canonical: str, body: str,
                extra_ld: str = "", depth: int = 2) -> str:
    """Wrap page body in the shared static-page chrome.

    `depth` is how many directory levels deep the page sits, so asset links
    stay relative and survive a move to a custom domain.
    """
    up = "../" * depth
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#08090d">
<meta property="og:type" content="article">
<meta property="og:site_name" content="backtwo">
<meta property="og:url" content="{canonical}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{SITE_BASE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<style>{PAGE_CSS}</style>
{extra_ld}
</head>
<body>
<div class="wrap">
<header class="sh">
  <a class="brand" href="{up}"><span class="b">back</span><span class="t">two</span></a>
  <span class="crumb">· <a href="{up}pokemon/">Pokédex index</a> · Pokémon Champions VGC</span>
</header>
{body}
<footer class="sf">
  <a href="{up}">backtwo</a> — a free, open-source Pokémon Champions VGC doubles companion by
  <a href="https://github.com/Kevv-J" rel="noopener">Kevin John</a>.
  Source on <a href="https://github.com/Kevv-J/backtwo" rel="noopener">GitHub</a>.
  Team data from <a href="https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw" rel="noopener">VGCPastes</a>,
  dex data from <a href="https://pokeapi.co" rel="noopener">PokéAPI</a>.
  Fan project — not affiliated with Nintendo, The Pokémon Company or Game Freak.
</footer>
</div>
</body>
</html>
"""


def _mate_link(label: str, linkable: set[str]) -> str:
    """Teammate name, linked only if that forme actually got its own page.

    Teammates below MIN_TEAMS_FOR_PAGE have no page, so linking them would emit
    a 404 -- worse for crawling than plain text.
    """
    esc = html.escape(label)
    return f'<a href="../{page_slug(label)}/">{esc}</a>' if label in linkable else esc


def _render_mon_page(label: str, a: dict, dex_formes: dict, total_teams: int,
                     linkable: set[str]) -> str:
    info = dex_formes.get(label, {})
    n = a["count"]
    esc = html.escape(label)
    slug = page_slug(label)
    canonical = f"{SITE_BASE}/pokemon/{slug}/"
    types = info.get("types") or []
    stats = info.get("stats") or {}
    sprite = info.get("sprite")

    top_item = a["items"].most_common(1)
    top_abil = a["abilities"].most_common(1)
    top_mate = a["teammates"].most_common(1)
    regs = " and ".join(f"Reg {r}" for r, _ in a["regs"].most_common())

    # Real prose. This is the part a crawler actually reads -- the bars and
    # tables below are supporting data, not sentences.
    lede = (
        f"{esc} appears on <strong>{n}</strong> of {total_teams} Pokémon Champions "
        f"VGC tournament teams in the backtwo archive ({_pct(n, total_teams)} usage"
        f"{', ' + regs if regs else ''})."
    )
    if top_item:
        lede += (f" The most common item is <strong>{html.escape(top_item[0][0])}</strong> "
                 f"({_pct(top_item[0][1], n)} of {esc} sets)")
        if top_abil:
            lede += f" and the most common ability is <strong>{html.escape(top_abil[0][0])}</strong>"
        lede += "."
    if top_mate:
        lede += (f" Its most frequent teammate is {_mate_link(top_mate[0][0], linkable)}"
                 f" ({_pct(top_mate[0][1], n)} of its teams).")

    title = f"{esc} — Pokémon Champions VGC Usage, Items, Spreads &amp; Teams | backtwo"
    desc = (f"{label} usage in Pokémon Champions VGC: appears on {n} of {total_teams} "
            f"tournament teams. Common items, abilities, moves, natures, teammates, "
            f"and the real Reg M-A/M-B teams running it.")
    desc = html.escape(desc, quote=True)

    img = (f'<img src="../../data/sprites/{sprite}.png" width="84" height="84" '
           f'alt="{esc} sprite" loading="lazy">' if sprite else "")
    chips = "".join(f'<span class="chip">{html.escape(t)}</span>' for t in types)
    statblock = "".join(
        f'<div class="st"><b>{stats.get(k, "—")}</b><span>{lbl}</span></div>'
        for k, lbl in (("hp", "HP"), ("atk", "Atk"), ("def", "Def"),
                       ("spa", "SpA"), ("spd", "SpD"), ("spe", "Spe"))
    ) if stats else ""

    mates = "".join(
        f'<div class="row"><span>{_mate_link(k, linkable)}</span>'
        f'<span class="n">{v} · {_pct(v, n)}</span></div>'
        for k, v in a["teammates"].most_common(8)
    ) or '<div class="row"><span>—</span></div>'

    rows = []
    for t in a["teams"][:MAX_TEAMS_LISTED]:
        paste = t.get("pokepaste") or ""
        d = html.escape(t.get("description") or t.get("event") or "Team")
        link = (f'<a href="{html.escape(paste, quote=True)}" rel="noopener nofollow">{d}</a>'
                if paste else d)
        rows.append(
            f"<tr><td>{link}</td><td>{html.escape(t.get('creator') or '—')}</td>"
            f"<td>{html.escape(t.get('event') or '—')}</td>"
            f"<td>{html.escape(str(t.get('rank') or '—'))}</td>"
            f"<td>{html.escape(t.get('reg') or '—')}</td>"
            f"<td>{html.escape(t.get('date') or '—')}</td></tr>"
        )
    more = ""
    if n > MAX_TEAMS_LISTED:
        more = (f'<p class="lede">Showing {MAX_TEAMS_LISTED} of {n} teams. '
                f'<a href="../../#/pokemon/{html.escape(label, quote=True)}">'
                f'See all {n} in the full app →</a></p>')

    ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": f"{label} — Pokémon Champions VGC usage and teams",
        "description": (f"{label} usage statistics across {n} Pokémon Champions VGC "
                        f"tournament teams, with items, abilities, moves and teammates."),
        "url": canonical,
        "isPartOf": {"@type": "WebSite", "name": "backtwo", "url": f"{SITE_BASE}/"},
        "author": {"@type": "Person", "name": "Kevin John", "url": "https://github.com/Kevv-J"},
        "about": {"@type": "Thing", "name": label},
    }, ensure_ascii=False)
    extra_ld = f'<script type="application/ld+json">{ld}</script>'

    body = f"""
<div class="hero">{img}
  <div>
    <h1>{esc}</h1>
    <div class="crumb">Pokémon Champions VGC · doubles usage</div>
    <div class="chips">{chips}</div>
  </div>
</div>
<p class="lede">{lede}</p>
<a class="cta" href="../../#/pokemon/{html.escape(label, quote=True)}">Open {esc} in the full app →</a>

<h2>Base stats</h2>
<div class="stats">{statblock}</div>

<h2>What {esc} runs</h2>
<div class="grid">
  <div class="card"><h3>Items</h3>{_bars(a['items'], n)}</div>
  <div class="card"><h3>Abilities</h3>{_bars(a['abilities'], n, 4)}</div>
  <div class="card"><h3>Moves</h3>{_bars(a['moves'], n, 10)}</div>
  <div class="card"><h3>Natures</h3>{_bars(a['natures'], n, 4)}</div>
  <div class="card"><h3>Common teammates</h3>{mates}</div>
</div>

<h2>Tournament teams running {esc}</h2>
<div class="tw"><table>
<thead><tr><th>Team</th><th>Player</th><th>Event</th><th>Result</th><th>Reg</th><th>Date</th></tr></thead>
<tbody>{''.join(rows) or '<tr><td colspan="6">—</td></tr>'}</tbody>
</table></div>
{more}

<h2>Build around it</h2>
<p class="lede">Already running {esc} and want the rest of the six? The
<a href="../../#/find">team finder</a> takes the Pokémon you have and ranks every
tournament team by how many of your picks it matches. Or run the numbers in the
<a href="../../#/dmg">damage calculator</a> — Champions-accurate, with Mega
Evolution, Stat Points, weather, terrain and spread reduction.</p>
"""
    return _page_shell(title, desc, canonical, body, extra_ld, depth=2)


def _render_hub_page(pages: list[tuple[str, dict]], dex_formes: dict,
                     total_teams: int) -> str:
    canonical = f"{SITE_BASE}/pokemon/"
    title = "Pokémon Champions VGC Usage — Every Pokémon in the Meta | backtwo"
    desc = html.escape(
        f"Per-Pokémon usage across {total_teams} Pokémon Champions VGC tournament teams. "
        f"Items, abilities, moves, spreads and teammates for {len(pages)} Pokémon in "
        f"Regulation M-A and M-B.", quote=True)

    cards = []
    for label, a in pages:
        sprite = (dex_formes.get(label) or {}).get("sprite")
        img = (f'<img src="../data/sprites/{sprite}.png" width="32" height="32" '
               f'alt="" loading="lazy">' if sprite else "")
        cards.append(
            f'<a href="{page_slug(label)}/">{img}<span>{html.escape(label)}</span>'
            f'<span class="n">{a["count"]}</span></a>'
        )

    ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Pokémon Champions VGC usage index",
        "description": f"Usage pages for {len(pages)} Pokémon across {total_teams} "
                       f"Champions VGC tournament teams.",
        "url": canonical,
        "isPartOf": {"@type": "WebSite", "name": "backtwo", "url": f"{SITE_BASE}/"},
    }, ensure_ascii=False)

    body = f"""
<h1>Pokémon Champions VGC usage index</h1>
<p class="lede">Every Pokémon appearing on at least {MIN_TEAMS_FOR_PAGE} of the
{total_teams} Pokémon Champions VGC tournament teams in the backtwo archive,
sorted by usage. Each page shows the items, abilities, moves, natures and
teammates that Pokémon actually runs in Regulation M-A and M-B, plus the real
teams it appears on.</p>
<a class="cta" href="../">Open the full app →</a>
<h2>{len(pages)} Pokémon</h2>
<div class="idx">{''.join(cards)}</div>
"""
    return _page_shell(title, desc, canonical, body,
                       f'<script type="application/ld+json">{ld}</script>', depth=1)


def _mon_link(label: str, linkable: set[str], depth_prefix: str = "../pokemon/") -> str:
    esc = html.escape(label)
    return (f'<a href="{depth_prefix}{page_slug(label)}/">{esc}</a>'
            if label in linkable else esc)


def _render_teams_page(teams: list[dict], linkable: set[str]) -> str:
    """Landing page for the team archive. Targets 'pokemon champions vgc teams'."""
    from collections import Counter
    canonical = f"{SITE_BASE}/teams/"
    by_reg = Counter(t.get("reg") or "?" for t in teams)
    events = Counter(t.get("event") for t in teams if t.get("event") and t["event"] != "-")

    # Ranked teams first -- a placement is the strongest signal a team is worth
    # showing, and it keeps this page from being an arbitrary slice.
    ranked = [t for t in teams if t.get("rank") and t["rank"] != "-"]
    ranked.sort(key=lambda t: (t.get("date") or ""), reverse=True)

    rows = []
    for t in ranked[:60]:
        labels = [lbl for m in (t.get("mons") or [])
                  if (lbl := (m.get("forme") or m.get("name")))]
        mons = " · ".join(_mon_link(lbl, linkable) for lbl in labels)
        paste = t.get("pokepaste") or ""
        name = html.escape(t.get("description") or t.get("team_id") or "Team")
        name = (f'<a href="{html.escape(paste, quote=True)}" rel="noopener nofollow">{name}</a>'
                if paste else name)
        rows.append(
            f"<tr><td>{name}<div class=\"crumb\">{mons}</div></td>"
            f"<td>{html.escape(t.get('creator') or '—')}</td>"
            f"<td>{html.escape(t.get('event') or '—')}</td>"
            f"<td>{html.escape(str(t.get('rank') or '—'))}</td>"
            f"<td>{html.escape(t.get('reg') or '—')}</td></tr>"
        )

    regline = " · ".join(f"Reg {html.escape(r)}: <strong>{c}</strong>"
                         for r, c in sorted(by_reg.items()) if r != "?")
    toplist = ", ".join(html.escape(str(e)) for e, _ in events.most_common(8))

    title = ("Pokémon Champions VGC Teams — Reg M-A &amp; M-B Tournament Archive | backtwo")
    desc = html.escape(
        f"An archive of {len(teams)} Pokémon Champions VGC tournament teams across "
        f"Regulation M-A and M-B, with full Showdown pastes, spreads, items and moves. "
        f"Free and open source.", quote=True)

    body = f"""
<h1>Pokémon Champions VGC team archive</h1>
<p class="lede"><strong>{len(teams)}</strong> Pokémon Champions VGC doubles teams
scraped from tournament results and ladder reports, each with the full Showdown
paste — items, abilities, natures, Stat Point spreads and moves. {regline}.</p>
<p class="lede">Sources include {toplist}.</p>
<a class="cta" href="../#/team">Browse the full archive in the app →</a>

<h2>Recent teams with a placement</h2>
<p class="lede">The {min(60, len(ranked))} most recent teams that finished with a
recorded result. Every Pokémon links to its usage page.</p>
<div class="tw"><table>
<thead><tr><th>Team</th><th>Player</th><th>Event</th><th>Result</th><th>Reg</th></tr></thead>
<tbody>{''.join(rows) or '<tr><td colspan="5">—</td></tr>'}</tbody>
</table></div>

<h2>Find the team behind a core</h2>
<p class="lede">If you already know two or three Pokémon you want to run, the
<a href="../find/">team finder</a> takes your picks and ranks every team in this
archive by how many of them it matches — so you can see how real players filled
the remaining slots. Or browse
<a href="../pokemon/">per-Pokémon usage</a> to see what each mon actually runs.</p>
"""
    return _page_shell(title, desc, canonical, body, depth=1)


def _render_find_page(teams: list[dict], linkable: set[str]) -> str:
    """Landing page for the reverse team finder -- the genuinely differentiated
    feature, so it gets real computed content (the most common cores)."""
    from collections import Counter
    from itertools import combinations
    canonical = f"{SITE_BASE}/find/"

    pairs: Counter = Counter()
    for t in teams:
        labels = sorted({(m.get("forme") or m.get("name"))
                         for m in (t.get("mons") or [])
                         if (m.get("forme") or m.get("name"))})
        for a, b in combinations(labels, 2):
            pairs[(a, b)] += 1

    rows = "".join(
        f'<div class="row"><span>{_mon_link(a, linkable)} + {_mon_link(b, linkable)}</span>'
        f'<span class="n">{c} teams</span></div>'
        for (a, b), c in pairs.most_common(20)
    )

    title = "Pokémon Champions VGC Team Finder — Build Around Your Core | backtwo"
    desc = html.escape(
        f"Enter the Pokémon you already run and find the Pokémon Champions VGC "
        f"tournament teams built around that core, ranked by how many of your picks "
        f"they match. Searches {len(teams)} real teams. Free and open source.", quote=True)

    body = f"""
<h1>Pokémon Champions VGC team finder</h1>
<p class="lede">Most tools ask what Pokémon are strong. This one works backwards:
type in the Pokémon you already want to run, and it searches <strong>{len(teams)}</strong>
Pokémon Champions tournament teams for the ones built around that core — ranked by
how many of your picks each team matches, with the missing slots shown so you can
see how real players finished the six.</p>
<a class="cta" href="../#/find">Open the team finder →</a>

<h2>How it works</h2>
<p class="lede">Give it anywhere from one Pokémon to five. Exact matches come
first, then partial matches grouped by how many of your picks they contain, each
listing which of your Pokémon that team is missing. Every team shows the full
paste, so you can lift a spread directly or import it into Showdown.</p>

<h2>The most common cores in Champions VGC</h2>
<p class="lede">The Pokémon pairs that appear together most often across the
archive — a reasonable place to start if you are looking for a core.</p>
<div class="card">{rows or '<div class="row"><span>—</span></div>'}</div>

<h2>Then run the numbers</h2>
<p class="lede">Once you have six, the <a href="../calc/">damage calculator</a>
checks whether your spreads actually survive what the meta throws at them, and
<a href="../pokemon/">per-Pokémon usage</a> shows what items and moves each pick
tends to run.</p>
"""
    return _page_shell(title, desc, canonical, body, depth=1)


def _render_calc_page(dex_formes: dict, linkable: set[str]) -> str:
    """Landing page for the damage calc. Competitive query, so the content leans
    on what is Champions-specific rather than competing on 'damage calculator'."""
    canonical = f"{SITE_BASE}/calc/"
    megas = sorted(
        (label, str(patch["ability"]))
        for label, patch in MEGA_OVERRIDES.items()
        if patch.get("ability") and label in dex_formes
    )
    mrows = "".join(
        f'<div class="row"><span>{_mon_link(l, linkable)}</span>'
        f'<span class="n">{html.escape(ab)}</span></div>'
        for l, ab in megas
    )

    title = "Pokémon Champions VGC Damage Calculator — Doubles, Megas, Stat Points | backtwo"
    desc = html.escape(
        "A doubles damage calculator built for Pokémon Champions: Stat Points instead "
        "of EVs, Mega Evolution, weather, terrain, spread reduction and Intimidate. "
        "Free and open source.", quote=True)

    body = f"""
<h1>Pokémon Champions VGC damage calculator</h1>
<p class="lede">A doubles-first damage calculator built specifically for Pokémon
Champions, not retrofitted from Scarlet &amp; Violet. It models the things that
actually differ in this format.</p>
<a class="cta" href="../#/dmg">Open the damage calculator →</a>

<h2>What Champions changes</h2>
<div class="grid">
  <div class="card"><h3>Stat Points, not EVs</h3>
    <p>Champions replaces EVs with Stat Points: <strong>66 total</strong>, at most
    <strong>32 in any one stat</strong>. 32 SP is a fully invested stat, equivalent
    to the old 252 EVs. Every Pokémon is Level 50 with maximum IVs, so a spread is
    purely how you divide those 66 points.</p></div>
  <div class="card"><h3>Mega Evolution is back</h3>
    <p>Megas are legal, and only one can be active per battle even if you bring
    several stones. The calculator applies the Mega's ability and stats, and lets
    you toggle back to the base form without losing the ability from your paste.</p></div>
  <div class="card"><h3>No Terastallization</h3>
    <p>There is no Tera mechanic in Champions, so defensive typing is fixed and
    a resist stays a resist. Status is limited to burn, freeze, paralysis, sleep,
    poison and toxic.</p></div>
  <div class="card"><h3>Doubles by default</h3>
    <p>Spread moves take the 0.75× reduction, and Intimidate, Friend Guard,
    weather, terrain, Trick Room, Gravity and Fairy Aura are all modelled as
    field state you can toggle.</p></div>
</div>

<h2>Champions-exclusive Mega abilities</h2>
<p class="lede">Several Megas in Champions carry abilities that do not exist
elsewhere. These are implemented in the calculator.</p>
<div class="card">{mrows or '<div class="row"><span>—</span></div>'}</div>

<h2>Calc against what people actually run</h2>
<p class="lede">Spreads are only useful against real sets. Pull an opposing
Pokémon's common item, ability and moves from its
<a href="../pokemon/">usage page</a>, or find a whole team to test against with
the <a href="../find/">team finder</a>.</p>
"""
    return _page_shell(title, desc, canonical, body, depth=1)


# ---------------------------------------------------------------------------
# Blog. Long-form posts (tournament reports etc.) authored in Markdown under
# blog/<slug>/post.md, rendered to a static, crawlable HTML page with the same
# site chrome. Heavy GIFs are pre-transcoded to muted looping <video> offline
# and committed under blog/<slug>/media/, so a .mp4/.webm reference emits a
# <video> and everything else an <img>. No Markdown library dependency -- the
# renderer only handles the constructs these posts actually use.
# ---------------------------------------------------------------------------

BLOG_DIR = ROOT / "blog"

BLOG_CSS = """
.wrap:has(.post){max-width:820px}
/* The post sits on a contained reading card, like the rest of the site. */
.post{max-width:760px;margin:0 auto;background:var(--pan);border:1px solid var(--ln);
  border-radius:16px;padding:40px 46px 46px;box-shadow:0 1px 3px rgba(0,0,0,.4);
  font-size:16.5px;line-height:1.75;color:#d8ddec}
@media(max-width:640px){.post{padding:24px 18px 30px;border-radius:12px;font-size:15.5px}}
.post-meta{color:var(--ac);font-size:12px;letter-spacing:.12em;text-transform:uppercase;
  font-weight:700;margin:0 0 14px}
.post h1{font-family:'Rajdhani','Inter',system-ui,sans-serif;font-weight:700;
  font-size:clamp(29px,5.2vw,42px);line-height:1.08;letter-spacing:-.5px;margin:0;color:var(--fg)}
@supports((-webkit-background-clip:text) or (background-clip:text)){
  .post h1{background:linear-gradient(115deg,var(--ac) 15%,var(--ac2));-webkit-background-clip:text;
    background-clip:text;-webkit-text-fill-color:transparent}}
/* Deck / subtitle — the italic line right under the title. */
.post h1 + p{font-size:19px;line-height:1.55;color:var(--dim);margin:16px 0 4px}
.post h2{font-family:'Rajdhani','Inter',system-ui,sans-serif;font-weight:700;font-size:26px;
  letter-spacing:-.2px;color:var(--fg);margin:42px 0 14px;text-transform:none;display:flex;
  align-items:center;gap:11px}
.post h2::before{content:'';flex:0 0 auto;width:22px;height:3px;border-radius:2px;
  background:linear-gradient(90deg,var(--ac),var(--ac2))}
.post p{margin:0 0 18px}
.post a{color:var(--ac);text-decoration:none;border-bottom:1px solid rgba(34,211,238,.35)}
.post a:hover{border-bottom-color:var(--ac)}
.post strong{color:var(--fg);font-weight:700}
.post ul{margin:0 0 18px;padding:0;list-style:none}
.post li{position:relative;padding-left:22px;margin:9px 0}
.post li::before{content:'▸';position:absolute;left:2px;color:var(--ac)}
.post hr{border:none;height:1px;margin:36px 0;
  background:linear-gradient(90deg,transparent,var(--ln) 20%,var(--ln) 80%,transparent)}
.post figure{margin:30px 0;text-align:center}
.post figure img,.post figure video{width:100%;height:auto;border:1px solid var(--ln);
  border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.4);background:#000}
.post figcaption{color:var(--dim);font-size:13.5px;line-height:1.55;margin:11px auto 0;
  max-width:56ch;font-style:italic}
/* Callout boxes — the teachable tech sidebars. Recessed against the card. */
.post blockquote{margin:26px 0;padding:16px 20px;background:var(--bg);border:1px solid var(--ln);
  border-left:4px solid var(--ac);border-radius:0 12px 12px 0}
.post blockquote p{margin:0 0 10px}
.post blockquote p:last-child{margin:0}
.post blockquote strong:first-child{color:var(--ac);font-size:16px;letter-spacing:.2px}
"""


def _md_inline(s: str) -> str:
    """Inline Markdown: links, **bold**, *italic*. Links are pulled out before
    escaping so their generated tags survive, then restored last."""
    links: list[str] = []

    def _stash(m):
        txt = html.escape(m.group(1))
        url = html.escape(m.group(2).strip(), quote=True)
        rel = ' rel="noopener"' if url.startswith("http") else ""
        links.append(f'<a href="{url}"{rel}>{txt}</a>')
        return f"\x00L{len(links) - 1}\x00"

    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", _stash, s)
    s = html.escape(s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
    s = re.sub(r"\x00L(\d+)\x00", lambda m: links[int(m.group(1))], s)
    return s


def _md_figure(alt: str, url: str, caption: str) -> str:
    a = html.escape(alt, quote=True)
    u = html.escape(url.strip(), quote=True)
    cap = f"<figcaption>{_md_inline(caption)}</figcaption>" if caption else ""
    if url.lower().endswith((".mp4", ".webm")):
        return (f'<figure><video src="{u}" autoplay loop muted playsinline '
                f'preload="metadata" aria-label="{a}"></video>{cap}</figure>')
    return f'<figure><img src="{u}" alt="{a}" loading="lazy">{cap}</figure>'


def _render_markdown_post(md: str) -> str:
    lines = md.split("\n")
    out: list[str] = []
    para: list[str] = []
    n = len(lines)

    def flush():
        if para:
            txt = " ".join(para).strip()
            if txt:
                out.append(f"<p>{_md_inline(txt)}</p>")
            para.clear()

    i = 0
    while i < n:
        raw = lines[i]
        line = raw.strip()
        if not line:
            flush(); i += 1; continue

        m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)$", line)
        if m:
            flush()
            # an image may be followed (after blanks) by a *caption* line
            cap, j = "", i + 1
            while j < n and not lines[j].strip():
                j += 1
            if j < n:
                cl = lines[j].strip()
                if (cl.startswith("*") and cl.endswith("*") and not cl.startswith("**")
                        and len(cl) > 2):
                    cap = cl[1:-1]
                    i = j
            out.append(_md_figure(m.group(1), m.group(2), cap))
            i += 1; continue

        if line.startswith("# "):
            flush(); out.append(f"<h1>{_md_inline(line[2:].strip())}</h1>"); i += 1; continue
        if line.startswith("## "):
            flush(); out.append(f"<h2>{_md_inline(line[3:].strip())}</h2>"); i += 1; continue
        if line in ("---", "***"):
            flush(); out.append("<hr>"); i += 1; continue

        if line.startswith(">"):
            flush()
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            inner, pbuf = [], []
            for bl in buf:
                if bl.strip():
                    pbuf.append(bl.strip())
                elif pbuf:
                    inner.append(f"<p>{_md_inline(' '.join(pbuf))}</p>"); pbuf = []
            if pbuf:
                inner.append(f"<p>{_md_inline(' '.join(pbuf))}</p>")
            out.append("<blockquote>" + "".join(inner) + "</blockquote>")
            continue

        if line.startswith("- "):
            flush()
            items = []
            while i < n and lines[i].strip().startswith("- "):
                items.append(f"<li>{_md_inline(lines[i].strip()[2:].strip())}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue

        para.append(line)
        i += 1

    flush()
    return "\n".join(out)


def write_blog() -> list[tuple[str, str]]:
    """Render every blog/<slug>/post.md to blog/<slug>/index.html. Returns
    (url, priority) tuples for the sitemap."""
    if not BLOG_DIR.exists():
        return []
    entries: list[tuple[str, str]] = []
    for src in sorted(BLOG_DIR.glob("*/post.md")):
        slug = src.parent.name
        md = src.read_text(encoding="utf-8")
        mt = re.search(r"^#\s+(.+)$", md, flags=re.M)
        title = re.sub(r"[*_`]", "", mt.group(1).strip()) if mt else slug
        canonical = f"{SITE_BASE}/blog/{slug}/"
        desc = html.escape(
            "How I entered my first Pokémon Champions VGC tournament — Rising Stars S1 — "
            "and won it: the team, the losses, the 2am tech that locked down an undefeated "
            "Last Resort Kangaskhan, and a grand final against my best friend.", quote=True)
        ld = json.dumps({
            "@context": "https://schema.org", "@type": "Article",
            "headline": title,
            "description": ("A first-timer's run through the Rising Stars S1 Pokémon "
                            "Champions VGC tournament — team, losses, tech, and a grand final."),
            "url": canonical,
            "image": f"{SITE_BASE}/blog/{slug}/media/standings.png",
            "datePublished": "2026-07-24",
            "author": {"@type": "Person", "name": "Kevin John", "url": "https://github.com/Kevv-J"},
            "publisher": {"@type": "Person", "name": "Kevin John"},
            "mainEntityOfPage": canonical,
            "isPartOf": {"@type": "WebSite", "name": "backtwo", "url": f"{SITE_BASE}/"},
        }, ensure_ascii=False)
        extra = (f"<style>{BLOG_CSS}</style>"
                 f'<script type="application/ld+json">{ld}</script>')
        body = (f'<article class="post">'
                f'<p class="post-meta">Kevin John · Pokémon Champions VGC · Rising Stars S1</p>'
                f'{_render_markdown_post(md)}</article>')
        page = _page_shell(f"{html.escape(title)} | backtwo", desc, canonical, body,
                           extra, depth=2)
        (src.parent / "index.html").write_text(page, encoding="utf-8")
        entries.append((canonical, "0.6"))
    return entries


def write_static_pages(teams: list[dict], dex_formes: dict) -> int:
    """Emit pokemon/<slug>/index.html, the hub, sitemap.xml and .nojekyll."""
    total = len(teams)
    agg = aggregate_usage(teams)
    pages = sorted(
        ((k, v) for k, v in agg.items()
         if v["count"] >= MIN_TEAMS_FOR_PAGE and k in dex_formes),
        key=lambda kv: -kv[1]["count"],
    )

    linkable = {label for label, _ in pages}

    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    for label, a in pages:
        d = PAGES_DIR / page_slug(label)
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(
            _render_mon_page(label, a, dex_formes, total, linkable), encoding="utf-8")

    (PAGES_DIR / "index.html").write_text(
        _render_hub_page(pages, dex_formes, total), encoding="utf-8")

    # One landing page per surface. Each carries content that only this dataset
    # can produce (placements, co-occurrence cores, the Champions mega table) --
    # a page that only restates the feature would be a doorway page.
    surfaces = {
        "teams": _render_teams_page(teams, linkable),
        "find": _render_find_page(teams, linkable),
        "calc": _render_calc_page(dex_formes, linkable),
    }
    for name, page_html in surfaces.items():
        d = ROOT / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page_html, encoding="utf-8")

    # Sitemap. Fragment URLs are deliberately absent -- Google does not index
    # them, so listing #/dmg etc. would just be noise.
    urls = [(f"{SITE_BASE}/", "1.0"), (f"{SITE_BASE}/pokemon/", "0.9")]
    urls += [(f"{SITE_BASE}/{s}/", "0.9") for s in surfaces]
    urls += write_blog()
    urls += [(f"{SITE_BASE}/pokemon/{page_slug(l)}/", "0.7") for l, _ in pages]
    today = _dt.date.today().isoformat()
    entries = "\n".join(
        f"  <url><loc>{u}</loc><lastmod>{today}</lastmod>"
        f"<changefreq>weekly</changefreq><priority>{p}</priority></url>"
        for u, p in urls
    )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n</urlset>\n", encoding="utf-8")

    # GitHub Pages runs Jekyll by default, which silently drops _-prefixed
    # paths. We have none today, but this makes that impossible to regress
    # and skips a pointless build step on every deploy.
    (ROOT / ".nojekyll").write_text("", encoding="utf-8")

    return len(pages)


def _static_links_block(teams: list[dict], dex_formes: dict, top: int = 24) -> str:
    """Crawlable <a href> list injected into index.html's <noscript>.

    Non-JS crawlers otherwise see an empty <main>; this gives them real prose
    links into the pre-rendered pages.
    """
    agg = aggregate_usage(teams)
    ranked = sorted(
        ((k, v["count"]) for k, v in agg.items()
         if v["count"] >= MIN_TEAMS_FOR_PAGE and k in dex_formes),
        key=lambda kv: -kv[1],
    )[:top]
    links = " · ".join(
        f'<a href="pokemon/{page_slug(k)}/">{html.escape(k)}</a>' for k, _ in ranked
    )
    return (f'<p class="nojs-links">{links}</p>'
            f'<p><a href="pokemon/"><strong>See all Pokémon →</strong></a></p>'
            f'<p><a href="teams/">Tournament team archive</a> · '
            f'<a href="find/">Team finder</a> · '
            f'<a href="calc/">Damage calculator</a> · '
            f'<a href="blog/rising-stars-s1/">Tournament report</a></p>')


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    teams = json.loads(TEAMS_JSON.read_text())

    # unique formes + moves
    formes: dict[str, list[str]] = {}
    moves: set[str] = set()
    for t in teams:
        for m in t["mons"]:
            if not m["name"]:
                continue
            label, slugs = forme(m["name"], m["item"])
            m["forme"] = label  # annotate for the viewer (mega-aware name)
            formes.setdefault(label, slugs)
            # also fetch the non-mega base species, so the viewer can show a
            # base<->mega stat comparison
            formes.setdefault(m["name"], [species_slug(m["name"])])
            for mv in m.get("moves", []):
                moves.add(mv)

    # Extra calc-only formes — stance / mode variants that never appear in
    # paste text (players write "Aegislash" not "Aegislash-Blade"). Surfacing
    # them here lets the calc offer a Shield ⇄ Blade toggle without polluting
    # the meta-browser (they won't appear in team lists since no paste has them).
    EXTRA_CALC_FORMES = {
        "Aegislash-Blade": "aegislash-blade",
        # Reg-M-B classics that VGCPastes teams haven't picked up yet but the
        # calc should still support. Houndoom-Mega is a returning gen-VI Mega
        # legal in M-B and has PokéAPI data. Meowstic-Mega-M/-F are Champions-
        # new gendered splits — since PokéAPI likely lacks them, the labels
        # are seeded here with the CLOSEST PokéAPI slug for a fallback (base
        # Meowstic-male / -female) and MEGA_OVERRIDES patches ability/stats.
        "Houndoom-Mega":   "houndoom-mega",
        "Meowstic-Mega":   "meowstic-male",     # fallback; overridden below
        "Meowstic-Mega-F": "meowstic-female",   # fallback; overridden below
        # Champions-new base species missing from earlier meta scrapes.
        # Add any legal mon the VGCPastes scrape hasn't picked up yet here;
        # PokeAPI slugs are lowercase-hyphenated species names.
        "Qwilfish":              "qwilfish",
        "Musharna":               "musharna",
        "Houndstone":             "houndstone",
        "Tyrantrum":              "tyrantrum",
        "Tauros":                 "tauros",
        "Tauros-Paldea-Combat":   "tauros-paldea-combat-breed",
        "Stunfisk":               "stunfisk",
        "Stunfisk-Galar":         "stunfisk-galar",
        # Full Reg-B backfill — cross-checked against Pikalytics + Game8/Serebii
        "Raichu-Alola":           "raichu-alola",
        "Vaporeon":               "vaporeon",
        "Flareon":                "flareon",
        "Leafeon":                "leafeon",
        "Forretress":             "forretress",
        "Castform":               "castform",
        "Roserade":               "roserade",
        "Rampardos":              "rampardos",
        "Bastiodon":              "bastiodon",
        "Rotom":                  "rotom",
        "Rotom-Fan":              "rotom-fan",
        "Samurott":               "samurott",
        "Garbodor":               "garbodor",
        "Zoroark":                "zoroark",
        "Emolga":                 "emolga",
        "Beartic":                "beartic",
        "Diggersby":              "diggersby",
        "Pangoro":                "pangoro",
        "Furfrou":                "furfrou",
        "Meowstic-F":             "meowstic-female",
        "Aromatisse":             "aromatisse",
        "Slurpuff":               "slurpuff",
        "Clawitzer":              "clawitzer",
        "Goodra":                 "goodra",
        "Trevenant":              "trevenant",
        "Gourgeist":              "gourgeist-average",
        "Avalugg":                "avalugg",
        "Avalugg-Hisui":          "avalugg-hisui",
        "Decidueye":              "decidueye",
        "Toucannon":              "toucannon",
        "Lycanroc-Midnight":      "lycanroc-midnight",
        "Flapple":                "flapple",
        "Appletun":               "appletun",
        "Polteageist":            "polteageist",
        "Mr. Rime":               "mr-rime",
        "Skeledirge":             "skeledirge",
        "Quaquaval":              "quaquaval",
        "Palafin-Hero":           "palafin-hero",
    }
    for label, slug in EXTRA_CALC_FORMES.items():
        formes.setdefault(label, [slug])

    # populate move-flags map once before the threadpool needs it
    global _MOVE_FLAGS
    _MOVE_FLAGS = fetch_move_flags()

    print(f"Resolving {len(formes)} formes and {len(moves)} moves from PokeAPI ...", flush=True)

    dex_formes: dict[str, dict] = {}
    unresolved = []
    def do_forme(item):
        label, slugs = item
        res = fetch_pokemon(slugs)
        return label, res
    with ThreadPoolExecutor(max_workers=6) as pool:
        for label, res in pool.map(do_forme, formes.items()):
            if res:
                dex_formes[label] = res
            else:
                unresolved.append(label)

    # Patch Champions-invented Megas (PokéAPI has no entries; base-species
    # fallback leaves ability/stats wrong). Do this after fetch, before sprites.
    apply_mega_overrides(dex_formes)

    # Download front-default sprites for every forme. After downloading,
    # remap each forme's `sprite` field to the slug of the file that ended
    # up on disk — falling back to the base species when the forme itself
    # has no upstream sprite (e.g. Champions-new megas like Drampa-Mega).
    print(f"Downloading sprites for {len(dex_formes)} formes ...", flush=True)
    SPRITE_DIR.mkdir(parents=True, exist_ok=True)

    def _dl_one(label: str):
        info = dex_formes[label]
        slug = sprite_slug(label)
        ok = download_sprite(slug, info.get("sprite_url"))
        return label, slug if ok else None

    with ThreadPoolExecutor(max_workers=6) as pool:
        for label, slug in pool.map(_dl_one, list(dex_formes.keys())):
            info = dex_formes[label]
            if slug:
                info["sprite"] = slug
            info.pop("sprite_url", None)

    # Second pass: any forme that didn't get a sprite (Drampa-Mega etc.)
    # borrows its base species's slug.
    for label, info in dex_formes.items():
        if info.get("sprite"):
            continue
        base = re.sub(r"-Mega(-[XY])?$", "", label)
        if base != label and base in dex_formes and dex_formes[base].get("sprite"):
            info["sprite"] = dex_formes[base]["sprite"]
    missing = [k for k, v in dex_formes.items() if not v.get("sprite")]
    print(f"  ✓ {len(dex_formes) - len(missing)} sprites available, {len(missing)} without:"
          f" {', '.join(missing[:10]) + (' …' if len(missing) > 10 else '')}", flush=True)

    dex_moves: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for name, res in zip(moves, pool.map(fetch_move, moves)):
            dex_moves[name] = res
    apply_move_overrides(dex_moves)

    print("Building type chart ...", flush=True)
    typechart = build_typechart()

    # Item icons + registry. Champions M-B legal pool plus any mega stone that
    # appears in the team data (all stones are legal). DEX.items maps a name to
    # its sprite slug so the viewer can show an icon (falls back to a dot when
    # absent — e.g. Champions-new stones PokéAPI has no art for).
    item_names = set(CHAMPIONS_ITEM_NAMES)
    for t in teams:
        for m in t.get("mons", []):
            it = (m.get("item") or "").strip()
            if it and re.search(r"ite( [XY])?$", it) and it != "Eviolite":
                item_names.add(it)
    print(f"Downloading item icons for {len(item_names)} items ...", flush=True)
    dex_items: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for name, slug in pool.map(lambda n: (n, download_item_sprite(n)), sorted(item_names)):
            if slug:
                dex_items[name] = {"sprite": slug}
    print(f"  ✓ {len(dex_items)}/{len(item_names)} item icons available", flush=True)

    dex = {"formes": dex_formes, "moves": dex_moves, "typechart": typechart, "items": dex_items}
    DEX_JSON.write_text(json.dumps(dex, ensure_ascii=False, indent=2))
    # re-save teams.json with the forme annotations
    TEAMS_JSON.write_text(json.dumps(teams, ensure_ascii=False, indent=2))

    print(f"Wrote {DEX_JSON}: {len(dex_formes)} formes, {len(dex_moves)} moves.", flush=True)
    if unresolved:
        print(f"UNRESOLVED formes ({len(unresolved)}): {', '.join(sorted(unresolved))}", flush=True)

    # Static pre-rendered pages + sitemap. Runs before the SPA build so the
    # crawlable link list can be injected into index.html.
    print("Pre-rendering static Pokémon pages ...", flush=True)
    page_labels = write_static_pages(teams, dex_formes)
    print(f"  ✓ {page_labels} pages under {PAGES_DIR}, plus sitemap.xml", flush=True)

    # build the self-contained viewer (data + dex injected) -- runs last
    build_sha, build_date = _build_stamp()
    template = TEMPLATE.read_text()
    doc = template.replace("/*__DATA__*/null", json.dumps(teams, ensure_ascii=False))
    doc = doc.replace("/*__DEX__*/null", json.dumps(dex, ensure_ascii=False))
    doc = doc.replace("{{BUILD_SHA}}", build_sha)
    doc = doc.replace("{{BUILD_DATE}}", build_date)
    doc = doc.replace("{{TEAM_COUNT}}", f"{len(teams):,}")
    doc = doc.replace("{{STATIC_LINKS}}", _static_links_block(teams, dex_formes))
    HTML_OUT.write_text(doc)
    print(f"Wrote {HTML_OUT} (v{build_sha} · {build_date}). Open it in your browser.", flush=True)

    # data_lock.json: build metadata, committed alongside index.html.
    # Lets anyone (incl. future you) inspect what the data shape was at any
    # given build sha. Also serves as the changelog primitive for the cron.
    by_reg = {}
    for t in teams:
        r = t.get("reg") or "?"
        by_reg[r] = by_reg.get(r, 0) + 1
    resolved = sum(1 for t in teams if t.get("raw_paste"))
    lock = {
        "generated_at_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "build_sha": build_sha,
        "build_date": build_date,
        "scrape": {
            "team_total": len(teams),
            "by_reg": by_reg,
            "resolved_pastes": resolved,
            "resolve_rate": round(resolved / len(teams), 4) if teams else 0,
        },
        "dex": {
            "forme_count": len(dex.get("formes", {})),
            "move_count": len(dex.get("moves", {})),
            "type_count": len(dex.get("typechart", {})),
            "item_icon_count": len(dex.get("items", {})),
        },
        "sources": {
            "vgcpastes_sheet_id": "1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw",
            "pokeapi_base": "https://pokeapi.co/api/v2",
            "showdown_moves_url": "https://play.pokemonshowdown.com/data/moves.js",
        },
    }
    lock_path = ROOT / "data_lock.json"
    lock_path.write_text(json.dumps(lock, indent=2) + "\n")
    print(f"Wrote {lock_path}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
