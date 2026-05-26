#!/usr/bin/env python3
"""Generate sight-singing exercises via Claude Opus 4.7 + Batch API.

Two subcommands:

    submit    Build 1200 batched requests across the (mode × difficulty)
              cells, submit to the Batch API, persist the batch ID and the
              per-request parameter map. Prints the batch ID.

    collect   Poll the batch until ended, parse each result's ABC output,
              validate against the same Phase 1 filters used for Essen,
              dedup near-duplicates per cell, and write MusicXML + MIDI
              into raw_data/ with naming the existing manifest scanner
              already understands. After this completes, re-run
              scripts/build_solfege_manifest.js to fold the new entries in.

Cache strategy: the 50 Essen anchors plus the rule book live in the system
prompt with a 1-hour TTL ephemeral cache breakpoint. Each per-request user
message is small and varies, so the cache prefix is shared across all
~1200 requests in the batch.

Identity / namespace:
    Generated slugs land in id range starting at 8_000_000, the variant
    token after the mode is 'llm', and the sidecar metadata is written to
    raw_data/llm_metadata.json so the build_solfege_manifest.js scanner
    can tag entries with source='llm' for the runtime weighted picker.

Requires: ANTHROPIC_API_KEY in the environment.
"""

import argparse
import json
import os
import random
import re
import sys
import time
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

import anthropic
from music21 import converter, key as m21key, meter as m21meter, pitch as m21pitch

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent

ANCHORS_JSON = SCRIPT_DIR / "anchors" / "anchors.json"
RAW_DIR = REPO_ROOT / "raw_data"
MUSICXML_DIR = RAW_DIR / "musicxml"
MIDI_DIR = RAW_DIR / "midi"
LLM_METADATA_PATH = RAW_DIR / "llm_metadata.json"

GENERATIONS_DIR = SCRIPT_DIR / "generations"
BATCH_ID_FILE = GENERATIONS_DIR / "batch_id.txt"
REQUESTS_FILE = GENERATIONS_DIR / "requests.json"

MODEL = "claude-opus-4-7"
ID_OFFSET = 8_000_000

# Generation distribution. 200 per cell, 6 cells, = 1200 total.
N_PER_CELL = 200
CELLS = [
    ("major", "easy"), ("major", "medium"), ("major", "hard"),
    ("minor", "easy"), ("minor", "medium"), ("minor", "hard"),
]
MAJOR_KEYS = [("C", 4), ("G", 4)]
MINOR_KEYS = [("A", 3), ("E", 4)]
BAR_OPTIONS = [8, 12, 16]
METER_OPTIONS = ["4/4", "3/4", "6/8"]

# Number-of-sharps for each key sig the LLM is allowed to produce.
KEYSIG_FIFTHS_TO_MAJOR_PC = {
    -7: 11, -6: 6, -5: 1, -4: 8, -3: 3, -2: 10, -1: 5,
     0: 0,
     1: 7,  2: 2,  3: 9,  4: 4,  5: 11, 6: 6,  7: 1,
}

ALLOWED_FINAL_DEGREES = {1, 3, 5}
MAX_RANGE_SEMITONES = 16
MAX_NONDIATONIC = 2

# Diversity dedup threshold — drop tunes whose scale-degree sequence is more
# than this similar to another already-kept tune in the same cell.
DUP_SIMILARITY_THRESHOLD = 0.85


# ---------------------------------------------------------------------------
# System prompt + request building
# ---------------------------------------------------------------------------

INSTRUCTION_PREAMBLE = """\
You are an expert composer of pedagogical sight-singing exercises in the
tradition of folk-song collections (Bartók, Kodály, the Essen Folksong
Collection) and graded solfège methods (Bona, Pozzoli, Lemoine, Ottman).

Your job is to compose ONE short tonal melody that satisfies the request
below. Your output is consumed by an automated pipeline — strictly follow
the output format and musical rules.

## OUTPUT FORMAT — strict

- Output exactly ONE ABC notation tune. Nothing else.
- No markdown, no code fences, no commentary, no preamble, no closing remark.
- Begin with the X: header line. End with the final barline `|]`.
- Required header lines, in order:
    X:1
    T:<short title>
    M:<meter, e.g. 4/4>
    L:1/8
    K:<key, e.g. C or Am>
- ALWAYS use `L:1/8` as the unit note length, regardless of the requested
  meter. Every note's duration is expressed as a multiple of an 8th note
  (e.g. quarter = `2`, dotted-quarter = `3`, half = `4`, dotted-half = `6`,
  whole = `8`, sixteenth = `/2`, dotted-eighth = `3/2`).
- Octave convention: `C` is middle C (C4). Lowercase letters are an octave
  higher (`c` = C5). Append `'` for further octaves up (`c'` = C6) and `,`
  for octaves down (`C,` = C3).
- Accidentals: `^` = sharp, `_` = flat, `=` = natural. Omit accidentals
  that the key signature already implies.
- Rests use `z` followed by the same duration encoding as notes.
- Separate measures with ` | `. End the tune with ` |]`.
- NO `V:` voice declarations. NO `[` chord brackets. Single voice only.
- NO `w:` lyrics, `Q:` tempo, or any other header lines beyond the five above.

## MUSICAL RULES — non-negotiable

1. Stay diatonic. At most ONE chromatic note in the entire tune, and only
   if musically motivated (raised 7th approaching the tonic in minor; a
   secondary leading-tone). easy difficulty must be fully diatonic.

2. Cadence on the tonic. The final note must be the tonic (1) of the
   requested key. Occasionally — at most 1 in 10 — the mediant (3) or
   dominant (5) is acceptable, but tonic is strongly preferred.

3. NO trailing rest measure. The melody ends with a sounded tonic, not with
   a bar of silence. The penultimate bar may include a brief rest only if
   the final bar starts with a sounded note that resolves to tonic.

4. Range — total span from lowest to highest note:
   - easy:   ≤ a perfect 5th (7 semitones)
   - medium: ≤ an octave (12 semitones)
   - hard:   ≤ an octave + a 3rd (16 semitones)

5. Step/leap balance: roughly 70% steps (2nds), 25% small leaps (3rds),
   5% larger leaps (4th, 5th, occasional 6th). After any leap of a 4th or
   larger, the very next note must resolve by step in the opposite
   direction ("gap-fill" — Huron). Three leaps in a row is forbidden.

6. Phrase structure: aim for antecedent–consequent. Treat the tune as two
   halves of equal length; the second half should restate, vary, or
   complete a motif from the first half rather than introducing wholly
   unrelated material. Avoid 4 bars of unrelated note-spitting.

7. Beat hierarchy: chord tones (1, 3, 5 of the key) should land on strong
   beats. Passing tones and neighbor tones may land on weak beats.

8. Every measure's durations MUST sum exactly to the meter. In 4/4 with
   L:1/8 that is 8 eighth-note units; in 3/4 it is 6 units; in 6/8 it is
   6 units. Count carefully — the validator will reject any tune whose
   bars don't add up.

9. Bar count: produce EXACTLY the number of bars requested.

10. Rhythmic vocabulary:
    - easy:   only quarters and eighth notes; no dots, no 16ths.
    - medium: quarters, eighths, dotted-quarters, occasional halves.
    - hard:   may include 16th notes, dotted-eighths, syncopation.

## ANCHOR EXAMPLES

What follows are 50 anchor tunes from the Essen Folksong Collection,
selected to demonstrate the desired style across modes, difficulties, and
meters. The opening line of each gives the cell label
(e.g. `% major easy 8-bar 3/4 in C`). Match THIS quality bar — singable,
idiomatic, motivically coherent.

"""

INSTRUCTION_CLOSING = """\

## END OF ANCHORS

Now wait for the per-request brief.
"""


def load_anchors():
    with open(ANCHORS_JSON, "r", encoding="utf-8") as fh:
        return json.load(fh)


def build_system_prompt(anchors):
    """Concatenate the rule book and all 50 anchors into one cacheable block."""
    blocks = [INSTRUCTION_PREAMBLE]
    for a in anchors:
        label = f"% {a['mode']} {a['difficulty']} {a['bars']}-bar {a['timeSignature']} in {a['tonic']}\n"
        blocks.append(label + a["abc"])
        blocks.append("")  # blank separator
    blocks.append(INSTRUCTION_CLOSING)
    return "\n".join(blocks)


def build_user_brief(*, key_letter, key_octave, mode, meter, bars, difficulty):
    abc_key = key_letter if mode == "major" else f"{key_letter}m"
    return (
        f"Generate a fresh sight-singing exercise.\n"
        f"Key: {key_letter} {mode} (ABC `K:{abc_key}`)\n"
        f"Meter: {meter}\n"
        f"Bars: {bars}\n"
        f"Difficulty: {difficulty}\n"
        f"Tonic register: place the final tonic at or near {key_letter}{key_octave}.\n"
        f"\n"
        f"Output the ABC only — no commentary, no fences."
    )


def plan_requests(rng):
    """Generate a deterministic plan of (custom_id, params) for the batch."""
    plan = []
    next_id = ID_OFFSET
    for mode, difficulty in CELLS:
        keys = MAJOR_KEYS if mode == "major" else MINOR_KEYS
        for _ in range(N_PER_CELL):
            key_letter, key_octave = rng.choice(keys)
            bars = rng.choice(BAR_OPTIONS)
            meter = rng.choice(METER_OPTIONS)
            cid = f"llm_{next_id}"
            plan.append({
                "custom_id": cid,
                "slug_id": next_id,
                "mode": mode,
                "difficulty": difficulty,
                "key_letter": key_letter,
                "key_octave": key_octave,
                "bars": bars,
                "meter": meter,
            })
            next_id += 1
    return plan


def build_batch_request(entry, system_text):
    user_brief = build_user_brief(
        key_letter=entry["key_letter"],
        key_octave=entry["key_octave"],
        mode=entry["mode"],
        meter=entry["meter"],
        bars=entry["bars"],
        difficulty=entry["difficulty"],
    )
    return {
        "custom_id": entry["custom_id"],
        "params": {
            "model": MODEL,
            # Headroom for adaptive thinking + ABC output. In v1's batch run,
            # ~48% of requests hit a 4096-token ceiling consumed entirely by
            # thinking, never emitting any ABC. 8192 leaves comfortable space
            # for the model to reason through the constraint set (range,
            # cadence, bar count, meter, phrase shape) and still produce the
            # tune — a 16-bar ABC is only ~500-800 tokens.
            "max_tokens": 8192,
            "system": [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral", "ttl": "1h"},
                }
            ],
            "thinking": {"type": "adaptive"},
            "messages": [{"role": "user", "content": user_brief}],
        },
    }


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------

def cmd_submit(args):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("[generate] ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        sys.exit(2)

    anchors = load_anchors()
    system_text = build_system_prompt(anchors)
    print(f"[generate] System prompt: {len(system_text)} chars (~{len(system_text)//4} tokens).", file=sys.stderr)

    rng = random.Random(args.seed)
    plan = plan_requests(rng)
    print(f"[generate] Planned {len(plan)} requests across {len(CELLS)} cells.", file=sys.stderr)

    if args.dry_run:
        sample = plan[:3]
        for entry in sample:
            req = build_batch_request(entry, system_text)
            print(f"\n=== {entry['custom_id']} ===")
            print(f"params: {entry['mode']}/{entry['difficulty']} {entry['key_letter']} bars={entry['bars']} meter={entry['meter']}")
            print(f"user message:\n{req['params']['messages'][0]['content']}")
        print(f"\n[generate] dry-run: would submit {len(plan)} requests; not sending.", file=sys.stderr)
        return

    requests = [build_batch_request(entry, system_text) for entry in plan]

    client = anthropic.Anthropic()
    batch = client.messages.batches.create(requests=requests)
    print(f"[generate] Submitted batch {batch.id}; status {batch.processing_status}.", file=sys.stderr)

    GENERATIONS_DIR.mkdir(parents=True, exist_ok=True)
    BATCH_ID_FILE.write_text(batch.id + "\n", encoding="utf-8")
    with open(REQUESTS_FILE, "w", encoding="utf-8") as fh:
        json.dump({entry["custom_id"]: entry for entry in plan}, fh, indent=2)
        fh.write("\n")
    print(f"[generate] Saved batch id to {BATCH_ID_FILE.relative_to(REPO_ROOT)}", file=sys.stderr)
    print(f"[generate] Saved request map to {REQUESTS_FILE.relative_to(REPO_ROOT)}", file=sys.stderr)
    print(batch.id)


# ---------------------------------------------------------------------------
# Validation — Phase 1 filters, re-applied to LLM output
# ---------------------------------------------------------------------------

ABC_BLOCK_RE = re.compile(r"(X:\s*\d+.*?\|\])", re.DOTALL)
ABC_HEADER_X_RE = re.compile(r"^X:\s*\d+", re.MULTILINE)


def extract_abc(text):
    """Pull a clean ABC tune out of the model response, tolerating stray
    code fences or commentary even though we asked for none."""
    text = text.replace("```abc", "").replace("```", "").strip()
    m = ABC_BLOCK_RE.search(text)
    if m:
        return m.group(1).strip()
    # Fall back to "from first X: line onward" — better partial than nothing.
    h = ABC_HEADER_X_RE.search(text)
    if h:
        return text[h.start():].strip()
    return None


def parse_abc(abc_text):
    try:
        return converter.parseData(abc_text, format="abc")
    except Exception:
        return None


def has_trailing_rest_bar(sc):
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


def measure_count(sc):
    for part in (sc.parts or [sc]):
        measures = list(part.getElementsByClass("Measure"))
        if measures:
            return len(measures)
    return 0


def melodic_pitches(sc):
    pitches = []
    for n in sc.recurse().notes:
        if n.isChord:
            return None  # we want monophonic only
        pitches.append(n.pitch)
    return pitches


def count_nondiatonic(notes, scale_pcs):
    nondia = 0
    for n in notes:
        if n.isChord:
            for p in n.pitches:
                if p.pitchClass not in scale_pcs:
                    nondia += 1
                    break
        else:
            if n.pitch.pitchClass not in scale_pcs:
                nondia += 1
    return nondia


def validate_against_request(sc, entry):
    """Run all per-request validations. Returns (ok, reason_or_None)."""
    notes = list(sc.recurse().notes)
    if not notes:
        return False, "no_notes"
    if any(n.isChord for n in notes):
        return False, "chord_block"

    pitches = melodic_pitches(sc)
    if pitches is None:
        return False, "polyphonic"
    if not pitches:
        return False, "no_pitches"

    # Range check
    ps_values = [p.ps for p in pitches]
    range_semi = max(ps_values) - min(ps_values)
    if range_semi > MAX_RANGE_SEMITONES:
        return False, "range"

    # Key signature must match request
    sig_objs = list(sc.recurse().getElementsByClass("KeySignature"))
    if not sig_objs:
        return False, "no_keysig"
    fifths = getattr(sig_objs[0], "sharps", None)
    expected_fifths = expected_fifths_for(entry["key_letter"], entry["mode"])
    if fifths != expected_fifths:
        return False, "wrong_keysig"

    # Meter check
    ts_objs = list(sc.recurse().getElementsByClass("TimeSignature"))
    if not ts_objs:
        return False, "no_ts"
    if ts_objs[0].ratioString != entry["meter"]:
        return False, "wrong_meter"

    # Bar count must match
    bars = measure_count(sc)
    if bars != entry["bars"]:
        return False, f"wrong_bars({bars}!={entry['bars']})"

    # Diatonic + final tonic checks
    maj_pc = KEYSIG_FIFTHS_TO_MAJOR_PC[fifths]
    scale_pcs = {(maj_pc + step) % 12 for step in (0, 2, 4, 5, 7, 9, 11)}
    expected_tonic_pc = (
        m21pitch.Pitch(f"{entry['key_letter']}4").pitchClass
        if entry["mode"] == "major"
        else m21pitch.Pitch(f"{entry['key_letter']}4").pitchClass
    )
    if entry["mode"] == "minor":
        # Raised 7th and 6th are tolerated in tonal minor
        scale_pcs = scale_pcs | {
            (expected_tonic_pc + 9) % 12,
            (expected_tonic_pc + 11) % 12,
        }

    nondia = count_nondiatonic(notes, scale_pcs)
    max_nondia = 0 if entry["difficulty"] == "easy" else MAX_NONDIATONIC
    if nondia > max_nondia:
        return False, "chromatic"

    last_p = notes[-1].pitches[0] if notes[-1].isChord else notes[-1].pitch
    deg = (last_p.pitchClass - expected_tonic_pc) % 12
    deg_map = {0: 1, 4: 3, 7: 5} if entry["mode"] == "major" else {0: 1, 3: 3, 7: 5}
    final_deg = deg_map.get(deg)
    if final_deg not in ALLOWED_FINAL_DEGREES:
        return False, "final_pitch"

    if has_trailing_rest_bar(sc):
        return False, "trailing_rest"

    return True, None


def expected_fifths_for(letter, mode):
    """Number of sharps for the requested key/mode."""
    sig_letter = letter if mode == "major" else letter.lower()
    return m21key.Key(sig_letter).sharps


# ---------------------------------------------------------------------------
# Diversity dedup — scale-degree sequence per cell
# ---------------------------------------------------------------------------

def scale_degree_sequence(sc, fifths, mode):
    """Encode a tune as a sequence of (degree, durationQL) tuples in its
    tonic. Used for similarity comparisons within a cell."""
    maj_pc = KEYSIG_FIFTHS_TO_MAJOR_PC[fifths]
    tonic_pc = maj_pc if mode == "major" else (maj_pc - 3) % 12
    seq = []
    for n in sc.recurse().notes:
        p = n.pitches[0] if n.isChord else n.pitch
        deg = (p.pitchClass - tonic_pc) % 12
        seq.append((deg, round(float(n.duration.quarterLength), 3)))
    return seq


def similarity(seq_a, seq_b):
    """1 - normalized edit distance over scale-degree-with-duration tokens."""
    if not seq_a or not seq_b:
        return 0.0
    a, b = seq_a, seq_b
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = i
    for j in range(n + 1): dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    dist = dp[m][n]
    return 1.0 - (dist / max(m, n))


# ---------------------------------------------------------------------------
# Collect
# ---------------------------------------------------------------------------

def cmd_collect(args):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("[generate] ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        sys.exit(2)

    if args.batch_id:
        batch_id = args.batch_id
    elif BATCH_ID_FILE.exists():
        batch_id = BATCH_ID_FILE.read_text().strip()
    else:
        print(f"[generate] No --batch-id given and {BATCH_ID_FILE.relative_to(REPO_ROOT)} not found.", file=sys.stderr)
        sys.exit(2)

    if not REQUESTS_FILE.exists():
        print(f"[generate] Missing request map at {REQUESTS_FILE.relative_to(REPO_ROOT)} — was submit run?", file=sys.stderr)
        sys.exit(2)
    with open(REQUESTS_FILE, "r", encoding="utf-8") as fh:
        request_map = json.load(fh)

    client = anthropic.Anthropic()

    print(f"[generate] Polling batch {batch_id}...", file=sys.stderr)
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            break
        c = batch.request_counts
        print(
            f"  status={batch.processing_status} processing={c.processing} "
            f"succeeded={c.succeeded} errored={c.errored} expired={c.expired}",
            file=sys.stderr,
        )
        if args.no_wait:
            print("[generate] --no-wait: batch not yet ended; bailing.", file=sys.stderr)
            sys.exit(1)
        time.sleep(60)

    print(f"[generate] Batch ended. Final counts: {batch.request_counts}", file=sys.stderr)

    MUSICXML_DIR.mkdir(parents=True, exist_ok=True)
    MIDI_DIR.mkdir(parents=True, exist_ok=True)

    metadata = {}
    if LLM_METADATA_PATH.exists():
        try:
            with open(LLM_METADATA_PATH, "r", encoding="utf-8") as fh:
                metadata = json.load(fh)
        except Exception:
            metadata = {}

    stats = Counter()
    # Buffer parsed candidates by cell so we can dedup before writing files.
    accepted_by_cell = defaultdict(list)  # cell → list of (entry, sc, fifths)

    for result in client.messages.batches.results(batch_id):
        rt = result.result.type
        cid = result.custom_id
        if rt != "succeeded":
            stats[f"result_{rt}"] += 1
            continue

        entry = request_map.get(cid)
        if entry is None:
            stats["unknown_custom_id"] += 1
            continue

        text = "".join(
            block.text for block in result.result.message.content if block.type == "text"
        ).strip()
        abc_text = extract_abc(text)
        if abc_text is None:
            stats["no_abc"] += 1
            continue

        sc = parse_abc(abc_text)
        if sc is None:
            stats["abc_parse"] += 1
            continue

        ok, reason = validate_against_request(sc, entry)
        if not ok:
            stats[f"reject_{reason}"] += 1
            continue

        sig_objs = list(sc.recurse().getElementsByClass("KeySignature"))
        fifths = sig_objs[0].sharps
        cell = (entry["mode"], entry["difficulty"])
        accepted_by_cell[cell].append((entry, sc, fifths))
        stats["validated"] += 1

    # Diversity dedup per cell.
    survivors = []
    for cell, items in accepted_by_cell.items():
        kept_seqs = []
        for entry, sc, fifths in items:
            seq = scale_degree_sequence(sc, fifths, entry["mode"])
            if any(similarity(seq, prior) >= DUP_SIMILARITY_THRESHOLD for prior in kept_seqs):
                stats[f"dedup_{cell[0]}_{cell[1]}"] += 1
                continue
            kept_seqs.append(seq)
            survivors.append((entry, sc, fifths))

    # Export survivors to MusicXML + MIDI + sidecar metadata.
    for entry, sc, fifths in survivors:
        slug = (
            f"{entry['slug_id']}_{entry['key_letter']}_{entry['key_octave']}"
            f"_{entry['mode']}_llm_{entry['difficulty']}_{entry['bars']}bar"
        )
        xml_path = MUSICXML_DIR / f"{slug}.musicxml"
        midi_path = MIDI_DIR / f"{slug}.mid"
        try:
            sc.write("musicxml", fp=str(xml_path))
            sc.write("midi", fp=str(midi_path))
        except Exception as e:
            stats["export_failed"] += 1
            print(f"[generate] Export failed for {slug}: {e}", file=sys.stderr)
            continue

        metadata[slug] = {
            "id": entry["slug_id"],
            "source": "llm",
            "mode": entry["mode"],
            "tonic": f"{entry['key_letter']}{entry['key_octave']}",
            "difficulty": entry["difficulty"],
            "bars": entry["bars"],
            "timeSignature": entry["meter"],
            "custom_id": entry["custom_id"],
        }
        stats["written"] += 1

    with open(LLM_METADATA_PATH, "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2, sort_keys=True)
        fh.write("\n")

    print(f"\n[generate] Result stats:", file=sys.stderr)
    for k, v in sorted(stats.items()):
        print(f"  {k:32s} {v}", file=sys.stderr)
    print(f"\n[generate] Wrote {stats['written']} new tunes. Now run:", file=sys.stderr)
    print(f"  node scripts/build_solfege_manifest.js", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_submit = sub.add_parser("submit", help="Build and submit the batch.")
    p_submit.add_argument("--seed", type=int, default=0, help="RNG seed for request planning.")
    p_submit.add_argument("--dry-run", action="store_true", help="Build the prompt + show 3 sample requests without submitting.")
    p_submit.set_defaults(func=cmd_submit)

    p_collect = sub.add_parser("collect", help="Poll and process the batch.")
    p_collect.add_argument("--batch-id", help="Override the saved batch id.")
    p_collect.add_argument("--no-wait", action="store_true", help="Don't loop on polling; exit if not yet ended.")
    p_collect.set_defaults(func=cmd_collect)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
