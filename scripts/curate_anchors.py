#!/usr/bin/env python3
"""Pick ~50 Essen folksong tunes as few-shot anchors for the Phase 2 LLM
generator.

The anchors are chosen for being clean sight-singing material — clear
cadence, balanced phrase length, modest leap density, mostly diatonic — and
are stratified across mode, difficulty, and meter so the few-shot prompt
exposes the LLM to the full range of what we want it to produce.

Output:
    scripts/anchors/anchors.json   structured list, each entry has
                                   metadata + ABC body.
    scripts/anchors/anchors.abc    concatenated ABC text for human review
                                   (paste into any ABC viewer, e.g.
                                   abcjs.net/abcweb/).

Run:
    .venv/bin/python scripts/curate_anchors.py
"""
import json
import os
import random
import sys
from collections import Counter, defaultdict
from fractions import Fraction

from music21 import converter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, "raw_data")
METADATA_PATH = os.path.join(RAW_DIR, "essen_metadata.json")
ANCHORS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "anchors")
ANCHORS_JSON = os.path.join(ANCHORS_DIR, "anchors.json")
ANCHORS_ABC = os.path.join(ANCHORS_DIR, "anchors.abc")

TARGET_TOTAL = 50

# Target stratification — chosen so the LLM sees both keys we transpose to,
# both modes, and the full difficulty/meter range. Per-cell counts add to ~50.
TARGET_STRATA = {
    ("major", "easy"):   12,
    ("major", "medium"): 10,
    ("major", "hard"):    4,
    ("minor", "easy"):    8,
    ("minor", "medium"): 10,
    ("minor", "hard"):    6,
}

# Prefer the "natural" key for each mode so anchors aren't dominated by
# transposition artifacts; if we run out we fall back to the other key.
PREFERRED_KEY = {"major": "C4", "minor": "A3"}

# Slugs (or source identifiers) to skip during anchor selection. Populate when
# a human review surfaces an anchor that scores well on heuristics but is
# musically weak (banal contour, awkward repetition, etc.). Empty for v1 lock.
EXCLUDED_SLUGS = frozenset({
})
EXCLUDED_SOURCES = frozenset({
})

# ---------------------------------------------------------------------------
# Quality scoring
# ---------------------------------------------------------------------------

def anchor_score(meta):
    """Heuristic anchor-suitability score from the Essen sidecar fields.

    The signal we care about for sight-singing anchors:
      - Clean cadence (ends on tonic, occasionally on 3 or 5)
      - Phrase-symmetric bar count
      - Some leaps (so the model learns ornamentation) but not too many
      - Mostly diatonic
      - Simple rhythmic subdivisions
    """
    score = 0
    final = meta.get("finalScaleDegree")
    if final == 1:
        score += 3
    elif final in (3, 5):
        score += 1
    bars = meta.get("bars", 0)
    if bars in (4, 8, 12, 16):
        score += 2
    elif bars in (6, 10, 14):
        score += 1
    max_leap = meta.get("maxLeapSemitones", 0)
    leaps = meta.get("leapCount", 0)
    if leaps >= 1 and max_leap <= 7:
        score += 2
    if meta.get("nondiatonicNotes", 0) == 0:
        score += 2
    if meta.get("smallestSubdivision", 0) >= 0.5:
        score += 1
    range_semi = meta.get("rangeSemitones", 0)
    if 5 <= range_semi <= 14:
        score += 1
    return score


# ---------------------------------------------------------------------------
# MusicXML → ABC converter (monophonic, single key/meter, our normalized output)
# ---------------------------------------------------------------------------

# Letter spelling of each major key signature, used to build the ABC K: header.
MAJOR_LETTERS = {0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
                 -1: "F", -2: "Bb", -3: "Eb", -4: "Ab", -5: "Db", -6: "Gb", -7: "Cb"}
MINOR_LETTERS = {0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m",
                 -1: "Dm", -2: "Gm", -3: "Cm", -4: "Fm", -5: "Bbm", -6: "Ebm", -7: "Abm"}


def abc_pitch(p):
    """Encode a music21.pitch.Pitch in ABC (default-octave convention: C = C4)."""
    # Accidental: only emit when the displayed accidental is non-natural and
    # not already implied by the key signature. We use displayStatus if set;
    # otherwise we emit whenever alter != 0 (slight redundancy is harmless for
    # an LLM few-shot prompt).
    acc = ""
    if p.accidental is not None:
        a = p.accidental.alter
        if a == 1:
            acc = "^"
        elif a == 2:
            acc = "^^"
        elif a == -1:
            acc = "_"
        elif a == -2:
            acc = "__"
        elif a == 0 and getattr(p.accidental, "displayStatus", False):
            acc = "="
    letter = p.step  # already 'A'..'G'
    octave = p.octave if p.octave is not None else 4
    if octave >= 5:
        return acc + letter.lower() + ("'" * (octave - 5))
    return acc + letter + ("," * (4 - octave))


def abc_duration(quarter_length, unit_qL):
    """Encode a duration as an ABC multiplier of the unit note length.

    unit_qL is the unit-note length expressed in quarter-note units (e.g.,
    L:1/8 → unit_qL = 0.5). We use Fraction to keep tuplets exact and emit
    either an integer multiplier ('2'), a slash divisor ('/2'), or 'a/b'.
    """
    if quarter_length <= 0:
        return ""
    m = Fraction(quarter_length).limit_denominator(64) / Fraction(unit_qL).limit_denominator(64)
    if m == 1:
        return ""
    if m.denominator == 1:
        return str(m.numerator)
    if m.numerator == 1:
        return f"/{m.denominator}"
    return f"{m.numerator}/{m.denominator}"


def score_to_abc(score, *, x_id, title, mode, fifths):
    """Return an ABC string for our normalized (single voice, simple rhythm)
    MusicXML. Walks measures so barlines line up; uses L:1/8 throughout."""
    ts = next(iter(score.recurse().getElementsByClass("TimeSignature")), None)
    meter = ts.ratioString if ts else "4/4"
    key_token = (MAJOR_LETTERS if mode == "major" else MINOR_LETTERS).get(fifths, "C")

    unit_qL = 0.5  # L:1/8

    lines = [f"X:{x_id}", f"T:{title}", f"M:{meter}", "L:1/8", f"K:{key_token}"]
    measure_tokens = []
    for part in (score.parts or [score]):
        for measure in part.getElementsByClass("Measure"):
            tokens = []
            for n in measure.notesAndRests:
                qL = float(n.duration.quarterLength)
                if n.isRest:
                    tokens.append("z" + abc_duration(qL, unit_qL))
                elif n.isChord:
                    # Our exports are monophonic; if we ever see a chord, take the top note.
                    p = max(n.pitches, key=lambda pp: pp.ps)
                    tokens.append(abc_pitch(p) + abc_duration(qL, unit_qL))
                else:
                    tokens.append(abc_pitch(n.pitch) + abc_duration(qL, unit_qL))
            if tokens:
                measure_tokens.append(" ".join(tokens))
        break  # only first part
    body = " | ".join(measure_tokens) + " |]"
    lines.append(body)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Curation pipeline
# ---------------------------------------------------------------------------

def group_by_source(metadata):
    """Group manifest slugs by their original Essen source tune."""
    by_source = defaultdict(list)
    for slug, meta in metadata.items():
        by_source[meta["source"]].append((slug, meta))
    return by_source


def pick_one_per_source(by_source):
    """For each source tune, pick its preferred-key slug for evaluation."""
    picks = []
    for source, slugs in by_source.items():
        preferred = [s for s in slugs if s[1]["tonic"] == PREFERRED_KEY[s[1]["mode"]]]
        chosen = preferred[0] if preferred else slugs[0]
        picks.append(chosen)
    return picks


def has_trailing_rest_bar(sc):
    """True if the last measure of the (first) part is entirely rests.

    We exclude these so the LLM doesn't learn that anchor tunes can end with
    a silent bar — an artifact of expandRepeats() over-extending some Essen
    sources past their actual cadence.
    """
    measures = []
    for part in (sc.parts or [sc]):
        measures = list(part.getElementsByClass("Measure"))
        if measures:
            break
    if not measures:
        return True
    last = measures[-1]
    events = list(last.notesAndRests)
    if not events:
        return True
    return all(e.isRest for e in events)


def stratified_select(scored, target_strata, parse_score, rejection_stats):
    """Pick top-scoring tunes within each (mode, difficulty) cell, parsing
    each candidate so we can drop anchors that fail quality filters (e.g.
    trailing rest bars) and fall through to the next candidate in the cell.

    Returns a list of (slug, meta, score, parsed_score) tuples so the caller
    doesn't have to re-parse for ABC conversion.
    """
    # Drop human-excluded candidates before any cell ranking so the exclusion
    # behaves identically whether the slug was top-ranked or barely in.
    scored = [
        t for t in scored
        if t[0] not in EXCLUDED_SLUGS and t[1]["source"] not in EXCLUDED_SOURCES
    ]
    cells = defaultdict(list)
    for slug, meta, score in scored:
        cells[(meta["mode"], meta["difficulty"])].append((slug, meta, score))
    for key in cells:
        cells[key].sort(key=lambda t: (-t[2], t[0]))

    selected = []
    per_cell_taken = Counter()
    cursors = {k: 0 for k in cells}

    for cell_key, want in target_strata.items():
        pool = cells.get(cell_key, [])
        while per_cell_taken[cell_key] < want and cursors[cell_key] < len(pool):
            slug, meta, score = pool[cursors[cell_key]]
            cursors[cell_key] += 1
            sc = parse_score(slug)
            if sc is None or has_trailing_rest_bar(sc):
                rejection_stats[cell_key] += 1
                continue
            selected.append((slug, meta, score, sc))
            per_cell_taken[cell_key] += 1

    # Backfill if any cell came up short (rare cells like minor-hard may
    # exhaust before hitting target); pull the next-best survivors regardless
    # of cell so we still ship 50 anchors.
    if len(selected) < TARGET_TOTAL:
        chosen = {s[0] for s in selected}
        global_remaining = sorted(
            (t for t in scored if t[0] not in chosen),
            key=lambda t: -t[2],
        )
        for slug, meta, score in global_remaining:
            if len(selected) >= TARGET_TOTAL:
                break
            sc = parse_score(slug)
            if sc is None or has_trailing_rest_bar(sc):
                continue
            selected.append((slug, meta, score, sc))
    return selected[:TARGET_TOTAL]


def main():
    rng = random.Random(0)  # deterministic so the anchor set is reproducible

    with open(METADATA_PATH, "r", encoding="utf-8") as fh:
        metadata = json.load(fh)

    by_source = group_by_source(metadata)
    one_per_source = pick_one_per_source(by_source)

    scored = [(slug, meta, anchor_score(meta)) for slug, meta in one_per_source]

    def parse_score(slug):
        xml_path = os.path.join(RAW_DIR, "musicxml", f"{slug}.musicxml")
        try:
            return converter.parse(xml_path)
        except Exception as e:
            print(f"[curate] parse failed for {slug}: {e}", file=sys.stderr)
            return None

    rejection_stats = Counter()
    selected = stratified_select(scored, TARGET_STRATA, parse_score, rejection_stats)

    os.makedirs(ANCHORS_DIR, exist_ok=True)

    anchors = []
    abc_blocks = []
    cell_counts = Counter()
    for i, (slug, meta, score, sc) in enumerate(selected, start=1):
        # Recover the key-signature fifths the file was written with so the ABC
        # K: header matches the staff display.
        sig = next(iter(sc.recurse().getElementsByClass("KeySignature")), None)
        fifths = getattr(sig, "sharps", 0)

        title = f"{meta['mode'].title()} {meta['difficulty']} {meta['bars']}-bar"
        abc = score_to_abc(sc, x_id=i, title=title, mode=meta["mode"], fifths=fifths)
        anchors.append({
            "slug": slug,
            "source": meta["source"],
            "mode": meta["mode"],
            "difficulty": meta["difficulty"],
            "bars": meta["bars"],
            "timeSignature": meta["timeSignature"],
            "tonic": meta["tonic"],
            "rangeSemitones": meta["rangeSemitones"],
            "maxLeapSemitones": meta["maxLeapSemitones"],
            "finalScaleDegree": meta["finalScaleDegree"],
            "anchorScore": score,
            "abc": abc,
        })
        abc_blocks.append(abc)
        cell_counts[(meta["mode"], meta["difficulty"])] += 1

    with open(ANCHORS_JSON, "w", encoding="utf-8") as fh:
        json.dump(anchors, fh, indent=2)
        fh.write("\n")
    with open(ANCHORS_ABC, "w", encoding="utf-8") as fh:
        fh.write("\n\n".join(abc_blocks) + "\n")

    print(f"[curate] Wrote {len(anchors)} anchors to {os.path.relpath(ANCHORS_JSON, REPO_ROOT)}", file=sys.stderr)
    print(f"[curate] Cell distribution (rejected for trailing-rest bar in parens):", file=sys.stderr)
    for cell, want in TARGET_STRATA.items():
        got = cell_counts.get(cell, 0)
        rej = rejection_stats.get(cell, 0)
        flag = "" if got == want else f"  (target {want})"
        rej_note = f"  [-{rej} rejected]" if rej else ""
        print(f"  {cell[0]:6s} {cell[1]:7s}  {got}{flag}{rej_note}", file=sys.stderr)


if __name__ == "__main__":
    main()
