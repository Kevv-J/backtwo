#!/usr/bin/env python3
"""Build a local VGC team database from the VGCPastes Champions sheet.

Pulls the public sheet as CSV (the M-A, M-B and — once live — M-C tabs; each reg
is additive over the prior), parses each team's metadata + pokepaste link,
resolves every pokepaste to its full Showdown set, caches the raw pokepastes,
and writes:

  data/teams.json   -- structured dataset (each team tagged with reg="M-A"/"M-B"/"M-C")
  index.html        -- self-contained searchable viewer (data embedded)

Re-runnable: cached pokepastes are reused, so re-runs are fast and polite.
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

SHEET_ID = "1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw"
# Regulation tabs to pull (Reg I and Reg I Featured are deliberately skipped —
# they're the prior gen). Each reg is additive over the prior in the same format
# family (M-C ⊇ M-B ⊇ M-A). M-C's tab did not exist yet at 2026-09-10 (the format
# launched 2026-09-09); its gid stays None until VGCPastes adds a "Champions M-C"
# tab. When it does: re-enumerate the sheet for the real gid, confirm the team-id
# prefix from live rows (M-A used "PC", not "MA", so don't assume "MC"), fill the
# gid below, and once it clears the floor drop M-C from SOFT_REGS.
REGS: list[tuple[str, str | None]] = [
    ("M-A", "791705272"),
    ("M-B", "1458357160"),
    ("M-C", None),
]

# Regs still onboarding: their VGCPastes tab may be absent or near-empty, so a
# None/failed fetch is skipped gracefully and they're EXEMPT from the per-reg
# floor. Temporary onboarding state, not a permanent exemption.
SOFT_REGS: set[str] = {"M-C"}


def csv_url(gid: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
TEAMS_JSON = DATA / "teams.json"
HTML_OUT = ROOT / "index.html"

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "vgc-team-db/1.0 (personal study tool)"


# --------------------------------------------------------------------------- #
# Sheet parsing
# --------------------------------------------------------------------------- #
def fetch_csv(gid: str) -> list[list[str]]:
    r = SESSION.get(csv_url(gid), timeout=60)
    r.raise_for_status()
    return list(csv.reader(io.StringIO(r.text)))


def find_header(rows: list[list[str]]) -> tuple[int, dict[str, int]]:
    """Locate the header row and map known column names -> index."""
    for i, row in enumerate(rows):
        if row and row[0].strip() == "Team ID":
            idx = {name.strip(): j for j, name in enumerate(row) if name.strip()}
            return i, idx
    raise RuntimeError("Could not find header row")


def extract_paste_id(url: str) -> str | None:
    m = re.search(r"pokepast\.es/([A-Za-z0-9]+)", url or "")
    return m.group(1) if m else None


# Team IDs look like "PC906" (M-A), "MB300" (M-B), "MC###" (M-C, prefix TBD from
# live rows). reg is tagged from the source tab, not the prefix, and ID_RE below
# accepts any 2-4 letter prefix, so all regs use the same parser.
ID_RE = re.compile(r"^[A-Z]{2,4}\d+$")


def parse_teams(rows: list[list[str]], reg: str) -> list[dict]:
    hdr_i, idx = find_header(rows)
    # The six Pokemon names live in 6 consecutive cols starting at this header.
    poke_start = idx.get("Pokemon Text for Copypasta")

    def cell(row, key):
        j = idx.get(key)
        return row[j].strip() if j is not None and j < len(row) else ""

    teams = []
    for row in rows[hdr_i + 1 :]:
        if not row:
            continue
        team_id = row[0].strip()
        if not ID_RE.match(team_id):
            continue

        names = []
        if poke_start is not None:
            names = [
                row[j].strip()
                for j in range(poke_start, min(poke_start + 6, len(row)))
                if row[j].strip()
            ]

        paste_url = cell(row, "Pokepaste")
        teams.append(
            {
                "team_id": team_id,
                "reg": reg,  # "M-A", "M-B" or "M-C"
                "description": cell(row, "Team Description"),
                "creator": cell(row, "Full Name") or cell(row, "Owner"),
                "owner_handle": cell(row, "Owner"),
                "pokepaste": paste_url,
                "paste_id": extract_paste_id(paste_url),
                "date": cell(row, "Date Shared"),
                "event": cell(row, "Tournament / Event"),
                "rank": cell(row, "Rank"),
                "source": cell(row, "Link to Source"),
                "sheet_names": names,  # fallback if paste fails
            }
        )
    return teams


# --------------------------------------------------------------------------- #
# Pokepaste fetching + Showdown set parsing
# --------------------------------------------------------------------------- #
def fetch_paste(paste_id: str) -> dict | None:
    cache_file = CACHE / f"{paste_id}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text())
        except json.JSONDecodeError:
            pass
    url = f"https://pokepast.es/{paste_id}/json"
    try:
        r = SESSION.get(url, timeout=30)
        if r.status_code != 200:
            return None
        data = r.json()
    except (requests.RequestException, json.JSONDecodeError):
        return None
    cache_file.write_text(json.dumps(data))
    time.sleep(0.05)  # be polite
    return data


def normalize_species(name: str) -> str:
    """Merge mega forme spellings into their base species.

    Creators inconsistently write either the base species ("Blastoise" + a
    Blastoisinite item) or the forme name ("Blastoise-Mega"). The held mega
    stone already conveys mega state, so the base species is canonical.
    Charizard-Mega-X/Y collapse to "Charizard" (the X vs Y stone still tells
    them apart). Floette strays all hold Floettite -> Floette-Eternal, the
    only Floette forme that megas.
    """
    if not name:
        return name
    n = re.sub(r"-Mega(-[XY])?$", "", name)
    if n == "Floette":
        n = "Floette-Eternal"
    return n


def parse_showdown(paste: str) -> list[dict]:
    """Parse a Showdown export block into structured sets."""
    mons = []
    for block in re.split(r"\n\s*\n", paste.replace("\r\n", "\n").strip()):
        lines = [ln.rstrip() for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        mon = {
            "name": "",
            "item": "",
            "ability": "",
            "tera": "",
            "nature": "",
            "evs": "",
            "ivs": "",
            "moves": [],
        }
        head = lines[0]
        if " @ " in head:
            lead, item = head.split(" @ ", 1)
            mon["item"] = item.strip()
        else:
            lead = head
        # strip gender + nickname-species parens
        lead = re.sub(r"\((M|F)\)", "", lead).strip()
        nick = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", lead)
        if nick:  # "Nickname (Species)"
            mon["name"] = normalize_species(nick.group(2).strip())
        else:
            mon["name"] = normalize_species(lead.strip())

        for ln in lines[1:]:
            s = ln.strip()
            if s.startswith("- "):
                mon["moves"].append(s[2:].strip())
            elif s.startswith("Ability:"):
                mon["ability"] = s.split(":", 1)[1].strip()
            elif s.startswith("Tera Type:"):
                mon["tera"] = s.split(":", 1)[1].strip()
            elif s.startswith("EVs:"):
                mon["evs"] = s.split(":", 1)[1].strip()
            elif s.startswith("IVs:"):
                mon["ivs"] = s.split(":", 1)[1].strip()
            elif s.endswith(" Nature"):
                mon["nature"] = s.replace(" Nature", "").strip()
        if mon["name"]:
            mons.append(mon)
    return mons


def enrich(team: dict) -> dict:
    pid = team.get("paste_id")
    data = fetch_paste(pid) if pid else None
    if data and data.get("paste"):
        team["format"] = (data.get("notes") or "").replace("Format:", "").strip()
        team["mons"] = parse_showdown(data["paste"])
        team["raw_paste"] = data["paste"]
    else:
        # fallback: names only, no set detail
        team["format"] = ""
        team["mons"] = [{"name": normalize_species(n), "item": "", "ability": "",
                         "tera": "", "nature": "", "evs": "", "ivs": "", "moves": []}
                        for n in team.get("sheet_names", [])]
        team["raw_paste"] = ""
    return team


# --------------------------------------------------------------------------- #
# Schema validation — fail closed so CI doesn't ship a half-broken dataset
# --------------------------------------------------------------------------- #
# Thresholds chosen to tolerate normal week-over-week variation (teams being
# added in the dozens) but catch catastrophic failures (sheet column rename,
# permission revoke, paste service down).
VALIDATION_THRESHOLDS = {
    "min_total_teams": 1200,        # current ~1404; floor at ~85% to absorb weekly drift
    "min_per_reg_teams": 80,        # floor catches an "empty tab"; soft regs exempt
    "min_resolve_rate": 0.70,       # pokepaste resolve %; current ~97%; alerts on outage
    "max_empty_team_rate": 0.10,    # teams with zero mons; should be near-zero
}


def validate_scrape(teams: list[dict]) -> list[str]:
    """Return list of validation errors. Empty list = OK."""
    errors: list[str] = []
    n_total = len(teams)
    th = VALIDATION_THRESHOLDS

    if n_total < th["min_total_teams"]:
        errors.append(
            f"team count {n_total} below floor {th['min_total_teams']} "
            f"(VGCPastes sheet likely changed or permission revoked)"
        )

    by_reg = {r: sum(1 for t in teams if t.get("reg") == r) for r, _ in REGS}
    for reg, _ in REGS:
        floor = 0 if reg in SOFT_REGS else th["min_per_reg_teams"]
        if by_reg.get(reg, 0) < floor:
            errors.append(
                f"reg {reg} has {by_reg.get(reg, 0)} teams, below floor "
                f"{floor} (tab gid may have changed)"
            )

    if n_total > 0:
        resolved = sum(1 for t in teams if t.get("raw_paste"))
        rate = resolved / n_total
        if rate < th["min_resolve_rate"]:
            errors.append(
                f"pokepaste resolve rate {rate:.1%} below floor "
                f"{th['min_resolve_rate']:.0%} (pokepast.es may be down)"
            )

        empty = sum(1 for t in teams if not t.get("mons"))
        empty_rate = empty / n_total
        if empty_rate > th["max_empty_team_rate"]:
            errors.append(
                f"{empty}/{n_total} teams ({empty_rate:.1%}) have zero mons, "
                f"above ceiling {th['max_empty_team_rate']:.0%} "
                f"(showdown parse likely broken)"
            )

    return errors


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    DATA.mkdir(exist_ok=True)
    CACHE.mkdir(exist_ok=True)

    teams: list[dict] = []
    active_regs = 0
    for reg, gid in REGS:
        if not gid:
            print(f"Skipping {reg}: no gid set yet (soft reg, tab not live).", flush=True)
            continue
        print(f"Fetching {reg} (gid={gid}) ...", flush=True)
        try:
            reg_teams = parse_teams(fetch_csv(gid), reg)
        except (requests.RequestException, RuntimeError) as e:
            if reg in SOFT_REGS:
                print(f"  WARN {reg}: fetch/parse failed ({e}); skipping (soft reg).", flush=True)
                continue
            raise  # an established reg failing hard is a real error — fail closed
        print(f"  parsed {len(reg_teams)} {reg} teams.", flush=True)
        teams.extend(reg_teams)
        active_regs += 1
    print(f"Total {len(teams)} teams across {active_regs} regulations.", flush=True)

    print(f"Resolving pokepastes (cached reused) ...", flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        teams = list(pool.map(enrich, teams))

    resolved = sum(1 for t in teams if t["raw_paste"])
    by_reg = {r: sum(1 for t in teams if t.get("reg") == r) for r, _ in REGS}
    print(f"Resolved full sets for {resolved}/{len(teams)} teams.", flush=True)
    print(f"Breakdown by reg: {by_reg}", flush=True)

    # Validate BEFORE overwriting teams.json so previous good snapshot survives
    # a bad scrape. CI sees the non-zero exit and opens an issue.
    errors = validate_scrape(teams)
    if errors:
        print("\n::error::Scrape validation failed:", flush=True)
        for e in errors:
            print(f"  - {e}", flush=True)
        print(
            "\nKeeping last good teams.json on disk; rerun after investigating.",
            flush=True,
        )
        return 1

    TEAMS_JSON.write_text(json.dumps(teams, ensure_ascii=False, indent=2))
    print(f"Wrote {TEAMS_JSON}", flush=True)
    print("\nNow run: ./venv/bin/python build_dex.py  (adds stats + builds index.html)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
