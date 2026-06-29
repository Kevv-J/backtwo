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
            return {
                "types": [t["type"]["name"] for t in d["types"]],
                "stats": {
                    "hp": st["hp"], "atk": st["attack"], "def": st["defense"],
                    "spa": st["special-attack"], "spd": st["special-defense"],
                    "spe": st["speed"],
                },
                "sprite_url": sprite_url,
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
    if not d:
        return {"power": None, "type": "normal", "category": "status", "spread": False,
                "minHits": 1, "maxHits": 1, **extra}
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
    return {
        "power": d.get("power"),
        "type": d["type"]["name"],
        "category": d["damage_class"]["name"],  # physical / special / status
        "spread": d["target"]["name"] in SPREAD_TARGETS,
        "minHits": min_hits or 1,
        "maxHits": max_hits or 1,
        **extra,
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

    print("Building type chart ...", flush=True)
    typechart = build_typechart()

    dex = {"formes": dex_formes, "moves": dex_moves, "typechart": typechart}
    DEX_JSON.write_text(json.dumps(dex, ensure_ascii=False, indent=2))
    # re-save teams.json with the forme annotations
    TEAMS_JSON.write_text(json.dumps(teams, ensure_ascii=False, indent=2))

    print(f"Wrote {DEX_JSON}: {len(dex_formes)} formes, {len(dex_moves)} moves.", flush=True)
    if unresolved:
        print(f"UNRESOLVED formes ({len(unresolved)}): {', '.join(sorted(unresolved))}", flush=True)

    # build the self-contained viewer (data + dex injected) -- runs last
    build_sha, build_date = _build_stamp()
    template = TEMPLATE.read_text()
    html = template.replace("/*__DATA__*/null", json.dumps(teams, ensure_ascii=False))
    html = html.replace("/*__DEX__*/null", json.dumps(dex, ensure_ascii=False))
    html = html.replace("{{BUILD_SHA}}", build_sha)
    html = html.replace("{{BUILD_DATE}}", build_date)
    HTML_OUT.write_text(html)
    print(f"Wrote {HTML_OUT} (v{build_sha} · {build_date}). Open it in your browser.", flush=True)


if __name__ == "__main__":
    sys.exit(main())
