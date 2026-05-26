#!/usr/bin/env python3
"""Import filtered Essen folksong tunes as sight-singing source material.

Reads music21's bundled essenFolksong ABC corpus, applies pedagogical filters
(range, length, meter, chromaticism, final pitch), transposes each surviving
tune to the supported target keys (C major, G major, A minor, E minor), and
writes MusicXML + MIDI into raw_data/ using a filename layout the existing
build_solfege_manifest.js scanner already understands:

    <id>_<TonicLetter>_<Octave>_<mode>_essen_<difficulty>_<bars>bar.{musicxml,mid}

A sidecar raw_data/essen_metadata.json captures richer per-slug metadata
(difficulty, bar count, range, leap density, source file/index) so the
runtime can filter on difficulty later without disturbing the legacy 60k
contour-enumerated pool.

After running this script, re-run scripts/build_solfege_manifest.js to
refresh solfege_manifest.json.
"""
import argparse
import json
import os
import sys
from collections import Counter

from music21 import converter, corpus, interval, key as m21key, meter as m21meter, note as m21note, pitch as m21pitch, stream

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, "raw_data")
MUSICXML_DIR = os.path.join(RAW_DIR, "musicxml")
MIDI_DIR = os.path.join(RAW_DIR, "midi")
METADATA_PATH = os.path.join(RAW_DIR, "essen_metadata.json")

ID_OFFSET = 1_000_000

TARGET_KEYS = {
    "major": [("C", 4), ("G", 4)],
    "minor": [("A", 3), ("E", 4)],
}

# Map a raw Essen time signature to (modern equivalent, duration scale factor).
# Older folk notation often uses half-note or whole-note beats; we rewrite to
# quarter-note-beat equivalents so the runtime (which assumes quarter = beat)
# renders correct note shapes.
TS_NORMALIZATIONS = {
    "4/4": ("4/4", 1.0),
    "3/4": ("3/4", 1.0),
    "6/8": ("6/8", 1.0),
    "2/4": ("2/4", 1.0),
    "2/2": ("4/4", 1.0),  # cut time → write as 4/4 for runtime simplicity
    "4/2": ("4/4", 0.5),
    "3/2": ("3/4", 0.5),
    "6/4": ("6/8", 0.5),
    "2/8": ("2/4", 2.0),
    "3/8": ("3/4", 2.0),
    "4/8": ("4/4", 2.0),
    "4/1": ("4/4", 0.25),
    "3/1": ("3/4", 0.25),
    "6/2": ("6/8", 0.25),
}

MIN_BARS = 4
MAX_BARS = 16
MAX_RANGE_SEMITONES = 16  # P8 + M3
MAX_NONDIATONIC = 2
ALLOWED_FINAL_DEGREES = {1, 3, 5}

# Smallest-subdivision thresholds in quarter-note units
QUARTER = 1.0
EIGHTH = 0.5
SIXTEENTH = 0.25


def essen_abc_files():
    import music21

    essen_dir = os.path.join(os.path.dirname(music21.__file__), "corpus", "essenFolksong")
    return sorted(os.path.join(essen_dir, f) for f in os.listdir(essen_dir) if f.endswith(".abc"))


def normalize_time_signature(ts_obj):
    """Return (modern_ts_str, scale_factor) or None if unsupported."""
    if ts_obj is None:
        return None
    return TS_NORMALIZATIONS.get(ts_obj.ratioString)


def rescale_durations(sc, factor):
    """Return a copy of sc with all rhythmic values multiplied by factor."""
    if factor == 1.0:
        return sc
    return sc.augmentOrDiminish(factor, inPlace=False)


def replace_time_signature(sc, new_ts_str):
    """Strip any existing TimeSignature objects and install a fresh one at offset 0."""
    new_ts = m21meter.TimeSignature(new_ts_str)
    for old in list(sc.recurse().getElementsByClass("TimeSignature")):
        site = old.activeSite
        if site is not None:
            site.remove(old)
    # Attach to the first part if present, else to the score.
    target = sc.parts[0] if sc.parts else sc
    target.insert(0, new_ts)
    return sc


def score_passes_main_filter(sc, stats):
    notes = list(sc.recurse().notes)
    if not notes:
        stats["empty"] += 1
        return None

    # Reject anything with chords (we want monophonic)
    if any(n.isChord for n in notes):
        stats["chord"] += 1
        return None

    # Reject multi-part scores; keep only first part if there are multiple
    parts = list(sc.parts)
    if len(parts) > 1:
        # Use first part only; if first part has chords/multiple voices reject
        first_part = parts[0]
        if any(n.isChord for n in first_part.recurse().notes):
            stats["chord"] += 1
            return None
        sc = first_part

    ts_objs = list(sc.recurse().getElementsByClass("TimeSignature"))
    if not ts_objs:
        stats["no_ts"] += 1
        return None
    ts_norm = normalize_time_signature(ts_objs[0])
    if ts_norm is None:
        stats["bad_ts"] += 1
        return None
    ts_str, ts_factor = ts_norm
    # Reject mid-piece meter changes (rare in folk; keeps the corpus clean)
    if len(ts_objs) > 1 and any(normalize_time_signature(t) != ts_norm for t in ts_objs[1:]):
        stats["meter_change"] += 1
        return None

    # Pitch range
    pitches = [p for n in notes for p in (n.pitches if n.isChord else [n.pitch])]
    if not pitches:
        stats["empty"] += 1
        return None
    ps_values = [p.ps for p in pitches]
    range_semi = max(ps_values) - min(ps_values)
    if range_semi > MAX_RANGE_SEMITONES:
        stats["range"] += 1
        return None

    return {
        "score": sc,
        "ts_str": ts_str,
        "ts_factor": ts_factor,
        "range_semi": range_semi,
        "notes": notes,
        "pitches": pitches,
    }


# Number of sharps in the key signature → pitch class of the *major* tonic.
# (Relative minor tonic is this − 3 semitones, mod 12.)
KEYSIG_FIFTHS_TO_MAJOR_PC = {
    -7: 11, -6: 6, -5: 1, -4: 8, -3: 3, -2: 10, -1: 5,
     0: 0,
     1: 7,  2: 2,  3: 9,  4: 4,  5: 11, 6: 6,  7: 1,
}
# Canonical letter spelling for each major key signature (for building target Keys).
KEYSIG_FIFTHS_TO_MAJOR_LETTER = {
    -7: "Cb", -6: "Gb", -5: "Db", -4: "Ab", -3: "Eb", -2: "Bb", -1: "F",
     0: "C",
     1: "G",  2: "D",  3: "A",  4: "E",  5: "B",  6: "F#",  7: "C#",
}


# Minor-tonic letter for each key signature, so we can build a proper source-tonic
# pitch for transposition (rather than guessing).
KEYSIG_FIFTHS_TO_MINOR_LETTER = {
    -7: "Ab", -6: "Eb", -5: "Bb", -4: "F",  -3: "C",  -2: "G",  -1: "D",
     0: "A",
     1: "E",   2: "B",   3: "F#",  4: "C#",  5: "G#",  6: "D#",  7: "A#",
}


def detect_key_and_mode(sc, notes):
    """Pick mode from (key signature, final pitch). Folk tunes typically end on
    1, 3, or 5 — we accept any of those and resolve the mode by which scale is
    a better fit. Returns (mode, source_tonic_pitch, fifths) or None.
    """
    sig_objs = list(sc.recurse().getElementsByClass("KeySignature"))
    if not sig_objs:
        return None
    fifths = getattr(sig_objs[0], "sharps", None)
    if fifths not in KEYSIG_FIFTHS_TO_MAJOR_PC:
        return None
    maj_pc = KEYSIG_FIFTHS_TO_MAJOR_PC[fifths]
    min_pc = (maj_pc - 3) % 12

    last = notes[-1]
    last_p = last.pitches[0] if last.isChord else last.pitch
    final_pc = last_p.pitchClass

    # 1, 3, 5 in each mode (semitone offsets from tonic).
    major_endings = {0, 4, 7}
    minor_endings = {0, 3, 7}
    deg_in_maj = (final_pc - maj_pc) % 12
    deg_in_min = (final_pc - min_pc) % 12
    can_major = deg_in_maj in major_endings
    can_minor = deg_in_min in minor_endings

    if not can_major and not can_minor:
        return None

    if can_major and can_minor:
        # Tonic ending wins; otherwise default to major (folk corpus is major-skewed).
        if deg_in_maj == 0:
            mode = "major"
        elif deg_in_min == 0:
            mode = "minor"
        else:
            mode = "major"
    elif can_major:
        mode = "major"
    else:
        mode = "minor"

    tonic_letter = (
        KEYSIG_FIFTHS_TO_MAJOR_LETTER[fifths]
        if mode == "major"
        else KEYSIG_FIFTHS_TO_MINOR_LETTER[fifths]
    )
    # Pick an octave for the source tonic that sits roughly in the middle of the
    # tune so the chosen transposition interval lands the result in the target
    # register rather than an octave away.
    pitches = [n.pitches[0] if n.isChord else n.pitch for n in notes]
    median_ps = sorted(p.ps for p in pitches)[len(pitches) // 2]
    src_tonic_pitch = m21pitch.Pitch(f"{tonic_letter}4")
    while src_tonic_pitch.ps - median_ps > 6:
        src_tonic_pitch.octave -= 1
    while median_ps - src_tonic_pitch.ps > 6:
        src_tonic_pitch.octave += 1
    return mode, src_tonic_pitch, fifths


def count_nondiatonic(notes, scale_pitches_pc):
    nondiatonic = 0
    for n in notes:
        for p in (n.pitches if n.isChord else [n.pitch]):
            if p.pitchClass not in scale_pitches_pc:
                nondiatonic += 1
                break
    return nondiatonic


def final_scale_degree(notes, tonic_pc):
    last = notes[-1]
    last_p = last.pitches[0] if last.isChord else last.pitch
    semitone_offset = (last_p.pitchClass - tonic_pc) % 12
    # Degree map (works for major; for minor we accept 1/3/5 chromatically too)
    degree_map = {0: 1, 2: 2, 3: 3, 4: 3, 5: 4, 7: 5, 9: 6, 11: 7, 10: 7, 8: 6, 1: 2, 6: 4}
    return degree_map.get(semitone_offset)


def measure_count(sc):
    measures = list(sc.recurse().getElementsByClass("Measure"))
    return len(measures)


def smallest_subdivision(notes):
    quarter_lengths = [n.duration.quarterLength for n in notes if n.duration.quarterLength > 0]
    return min(quarter_lengths) if quarter_lengths else QUARTER


def leap_stats(notes):
    """Compute (max_leap_semitones, leap_count) where a 'leap' is > M2 (>2 semi)."""
    melodic_pitches = []
    for n in notes:
        if n.isChord:
            continue
        melodic_pitches.append(n.pitch.ps)
    if len(melodic_pitches) < 2:
        return 0, 0
    max_leap = 0
    leap_count = 0
    for a, b in zip(melodic_pitches[:-1], melodic_pitches[1:]):
        d = abs(b - a)
        if d > max_leap:
            max_leap = d
        if d > 2:
            leap_count += 1
    return int(max_leap), leap_count


def classify_difficulty(*, range_semi, max_leap, smallest_sub, nondiatonic, bars):
    """Graded difficulty score (0–10). Each pedagogical axis contributes 0–2
    points; we bucket the sum into easy/medium/hard. This balances better than
    a "any one criterion flips it to hard" disjunction, which collapsed almost
    every folk tune into the hard bucket.
    """
    score = 0
    score += (range_semi > 10) + (range_semi > 13)
    score += (max_leap > 5) + (max_leap > 7)
    score += (smallest_sub < QUARTER) + (smallest_sub < EIGHTH)
    score += (nondiatonic > 0) + (nondiatonic > 1)
    score += (bars > 8) + (bars > 12)
    if score <= 3:
        return "easy"
    if score >= 7:
        return "hard"
    return "medium"


def transpose_to_target(sc, src_tonic_pitch, target_letter, target_octave, mode):
    """Return a new score transposed so its tonic is target_letter at target_octave,
    with a clean, correct key signature stamped at offset 0.
    """
    tgt_tonic = m21pitch.Pitch(f"{target_letter}{target_octave}")
    iv = interval.Interval(src_tonic_pitch, tgt_tonic)
    transposed = sc.transpose(iv)
    # Strip every existing KeySignature/Key so the export uses ours alone.
    for old_sig in list(transposed.recurse().getElementsByClass("KeySignature")):
        site = old_sig.activeSite
        if site is not None:
            site.remove(old_sig)
    new_key = m21key.Key(target_letter if mode == "major" else target_letter.lower())
    target = transposed.parts[0] if transposed.parts else transposed
    target.insert(0, new_key)
    return transposed


def sanitize_for_filename(s):
    return "".join(c for c in s if c.isalnum())


def export_one(*, sc, target_letter, target_octave, mode, difficulty, bars, slug_id, out_xml, out_midi):
    sc.write("musicxml", fp=out_xml)
    sc.write("midi", fp=out_midi)


def build_slug(*, slug_id, target_letter, target_octave, mode, difficulty, bars):
    return f"{slug_id}_{target_letter}_{target_octave}_{mode}_essen_{difficulty}_{bars}bar"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None, help="Stop after this many source tunes (testing).")
    parser.add_argument("--dry-run", action="store_true", help="Run filters and print stats, no file writes.")
    parser.add_argument("--start-id", type=int, default=ID_OFFSET, help="Starting numeric id (avoid colliding with legacy 60k).")
    args = parser.parse_args()

    os.makedirs(MUSICXML_DIR, exist_ok=True)
    os.makedirs(MIDI_DIR, exist_ok=True)

    abc_files = essen_abc_files()
    print(f"[essen] Found {len(abc_files)} ABC files in music21 bundle.", file=sys.stderr)

    stats = Counter()
    metadata = {}
    next_id = args.start_id
    source_count = 0
    written_count = 0

    for abc_path in abc_files:
        abc_name = os.path.basename(abc_path)
        try:
            opus = converter.parse(abc_path)
        except Exception as e:
            print(f"[essen] Skipped {abc_name}: {e}", file=sys.stderr)
            continue

        scores = list(opus.scores) if hasattr(opus, "scores") else [opus]
        for idx, sc in enumerate(scores):
            if args.limit is not None and source_count >= args.limit:
                break

            source_count += 1

            try:
                sc = sc.expandRepeats()
            except Exception:
                pass  # Some tunes have no repeats or malformed marks; carry on.

            filtered = score_passes_main_filter(sc, stats)
            if filtered is None:
                continue
            sc_clean = filtered["score"]
            ts_str = filtered["ts_str"]
            ts_factor = filtered["ts_factor"]
            range_semi = filtered["range_semi"]

            # Rewrite to modern notation (quarter-note beat or 6/8) so the
            # runtime's quarter-anchored duration table renders correct shapes.
            if ts_factor != 1.0:
                try:
                    sc_clean = rescale_durations(sc_clean, ts_factor)
                except Exception:
                    stats["rescale_failed"] += 1
                    continue
            sc_clean = replace_time_signature(sc_clean, ts_str)
            # Refresh the note list after any structural changes.
            notes = list(sc_clean.recurse().notes)
            if not notes:
                stats["empty_after_normalize"] += 1
                continue

            bars = measure_count(sc_clean)
            if bars < MIN_BARS or bars > MAX_BARS:
                stats["bars"] += 1
                continue

            keymode = detect_key_and_mode(sc_clean, notes)
            if keymode is None:
                stats["bad_key"] += 1
                continue
            mode, src_tonic_pitch, fifths = keymode

            # Build the diatonic scale pitch-class set straight from the key signature
            # rather than from analyze('key'), since that's our source of truth now.
            maj_pc = KEYSIG_FIFTHS_TO_MAJOR_PC[fifths]
            scale_pcs = {(maj_pc + step) % 12 for step in (0, 2, 4, 5, 7, 9, 11)}
            if mode == "minor":
                # Tonal minor commonly uses raised 6th and raised 7th (harmonic
                # / melodic minor). Treat those as in-key, not chromatic.
                tonic_pc_local = src_tonic_pitch.pitchClass
                scale_pcs = scale_pcs | {(tonic_pc_local + 9) % 12, (tonic_pc_local + 11) % 12}
            nondia = count_nondiatonic(notes, scale_pcs)
            if nondia > MAX_NONDIATONIC:
                stats["chromatic"] += 1
                continue

            tonic_pc = src_tonic_pitch.pitchClass
            final_deg = final_scale_degree(notes, tonic_pc)
            if final_deg not in ALLOWED_FINAL_DEGREES:
                stats["final"] += 1
                continue

            max_leap, leap_count = leap_stats(notes)
            smallest_sub = smallest_subdivision(notes)
            difficulty = classify_difficulty(
                range_semi=range_semi,
                max_leap=max_leap,
                smallest_sub=smallest_sub,
                nondiatonic=nondia,
                bars=bars,
            )

            stats["accepted"] += 1
            stats[f"accepted_{difficulty}"] += 1
            stats[f"accepted_{mode}"] += 1

            for target_letter, target_octave in TARGET_KEYS[mode]:
                slug_id = next_id
                next_id += 1
                slug = build_slug(
                    slug_id=slug_id,
                    target_letter=target_letter,
                    target_octave=target_octave,
                    mode=mode,
                    difficulty=difficulty,
                    bars=bars,
                )
                out_xml = os.path.join(MUSICXML_DIR, f"{slug}.musicxml")
                out_midi = os.path.join(MIDI_DIR, f"{slug}.mid")

                if args.dry_run:
                    written_count += 1
                    continue

                try:
                    transposed = transpose_to_target(sc_clean, src_tonic_pitch, target_letter, target_octave, mode)
                    export_one(
                        sc=transposed,
                        target_letter=target_letter,
                        target_octave=target_octave,
                        mode=mode,
                        difficulty=difficulty,
                        bars=bars,
                        slug_id=slug_id,
                        out_xml=out_xml,
                        out_midi=out_midi,
                    )
                except Exception as e:
                    stats["export_failed"] += 1
                    print(f"[essen] Export failed for {slug}: {e}", file=sys.stderr)
                    continue

                metadata[slug] = {
                    "id": slug_id,
                    "source": f"essenFolksong/{abc_name}#{idx}",
                    "mode": mode,
                    "tonic": f"{target_letter}{target_octave}",
                    "difficulty": difficulty,
                    "bars": bars,
                    "timeSignature": ts_str,
                    "rangeSemitones": range_semi,
                    "maxLeapSemitones": max_leap,
                    "leapCount": leap_count,
                    "smallestSubdivision": smallest_sub,
                    "nondiatonicNotes": nondia,
                    "finalScaleDegree": final_deg,
                }
                written_count += 1

        if args.limit is not None and source_count >= args.limit:
            break

    if not args.dry_run:
        # Merge with any prior import so re-runs don't lose tags for unchanged files.
        if os.path.exists(METADATA_PATH):
            try:
                with open(METADATA_PATH, "r", encoding="utf-8") as fh:
                    prior = json.load(fh)
                if isinstance(prior, dict):
                    prior.update(metadata)
                    metadata = prior
            except Exception:
                pass
        with open(METADATA_PATH, "w", encoding="utf-8") as fh:
            json.dump(metadata, fh, indent=2, sort_keys=True)
            fh.write("\n")

    print(f"\n[essen] Source tunes scanned: {source_count}", file=sys.stderr)
    print(f"[essen] Files written:        {written_count}", file=sys.stderr)
    print(f"[essen] Stats:", file=sys.stderr)
    for k_, v in sorted(stats.items()):
        print(f"  {k_:24s} {v}", file=sys.stderr)


if __name__ == "__main__":
    main()
