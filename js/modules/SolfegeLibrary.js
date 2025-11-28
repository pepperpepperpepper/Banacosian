(function initSolfegeLibrary(globalScope) {
    'use strict';

    const DEFAULT_MANIFEST_URL = '/raw_data/solfege_manifest.json';
    const DEFAULT_DIVISIONS = 480;
    const DURATION_TABLE = [
        { beats: 4, duration: 'w', dots: 0 },
        { beats: 3, duration: 'h', dots: 1 },
        { beats: 2, duration: 'h', dots: 0 },
        { beats: 1.5, duration: 'q', dots: 1 },
        { beats: 1, duration: 'q', dots: 0 },
        { beats: 0.75, duration: '8', dots: 1 },
        { beats: 0.5, duration: '8', dots: 0 },
        { beats: 0.375, duration: '16', dots: 1 },
        { beats: 0.25, duration: '16', dots: 0 }
    ];
    const MODE_BUCKETS = {
        major: new Set(['ionian', 'lydian', 'mixolydian', 'ionian-sharp5', 'lydian-augmented', 'lydian-dominant', 'lydian-sharp2', 'whole-tone', 'whole-half', 'half-whole', 'chromatic']),
        minor: new Set(['aeolian', 'dorian', 'phrygian', 'locrian', 'melodic-minor', 'harmonic-minor', 'dorian-b2', 'mixolydian-b6', 'dorian-sharp4', 'phrygian-dominant', 'locrian-sharp2', 'locrian-sharp6', 'altered', 'super-locrian-bb7']),
        blues: new Set(['blues'])
    };
    const DEFAULT_FINAL_BARLINE = 'end';

    function toPositiveNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) && num >= 0 ? num : fallback;
    }

    function normalizeMode(value) {
        return (value || '').toString().trim().toLowerCase();
    }

    function buildAccidental(alter) {
        const offset = Number.parseInt(alter, 10) || 0;
        if (offset === 0) return '';
        if (offset > 0) return '#'.repeat(Math.min(offset, 3));
        return 'b'.repeat(Math.min(Math.abs(offset), 3));
    }

    function deriveDurationInfo(beats) {
        const normalized = Number.parseFloat(Number(beats || 0).toFixed(3));
        const directMatch = DURATION_TABLE.find((entry) => Math.abs(entry.beats - normalized) < 0.01);
        if (directMatch) {
            return directMatch;
        }
        let closest = DURATION_TABLE[0];
        let bestDiff = Math.abs(DURATION_TABLE[0].beats - normalized);
        for (let i = 1; i < DURATION_TABLE.length; i += 1) {
            const diff = Math.abs(DURATION_TABLE[i].beats - normalized);
            if (diff < bestDiff) {
                closest = DURATION_TABLE[i];
                bestDiff = diff;
            }
        }
        return closest;
    }

    function summarizeManifest(manifest) {
        return {
            total: manifest?.total || 0,
            modes: manifest?.supportedModes || []
        };
    }

    class SolfegeLibrary {
        constructor(options = {}) {
            this.manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
            this.cacheToken = options.cacheToken || null;
            this.manifestPromise = null;
            this.manifest = null;
            this.baseEntryCache = new Map(); // entryId -> parsed base entry
            this.parser = null;
        }

        getModeBucket(mode) {
            const normalized = normalizeMode(mode || 'ionian');
            if (MODE_BUCKETS.major.has(normalized)) return 'major';
            if (MODE_BUCKETS.minor.has(normalized)) return 'minor';
            if (MODE_BUCKETS.blues.has(normalized)) return 'blues';
            // Explicit shortcuts
            if (normalized === 'major') return 'major';
            if (normalized === 'minor') return 'minor';
            return null;
        }

        async ensureManifest() {
            if (this.manifestPromise) {
                await this.manifestPromise;
                return this.manifest;
            }
            const url = this.buildManifestUrl();
            this.manifestPromise = fetch(url)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Manifest request failed with ${response.status}`);
                    }
                    return response.json();
                })
                .then((data) => {
                    this.manifest = data;
                    return data;
                })
                .catch((error) => {
                    console.error('[SolfegeLibrary] Manifest load failed', error);
                    this.manifestPromise = null;
                    throw error;
                });
            return this.manifestPromise;
        }

        buildManifestUrl() {
            if (!this.cacheToken) {
                return this.manifestUrl;
            }
            return `${this.manifestUrl}${this.manifestUrl.includes('?') ? '&' : '?'}${this.cacheToken}`;
        }

        async getRandomEntryForMode(mode) {
            await this.ensureManifest();
            const bucket = this.getModeBucket(mode);
            if (!bucket) {
                return { entry: null, reason: 'unsupported-mode', manifest: summarizeManifest(this.manifest) };
            }
            const entries = Array.isArray(this.manifest?.entries)
                ? this.manifest.entries.filter((entry) => entry.mode === bucket)
                : [];
            if (entries.length === 0) {
                return { entry: null, reason: 'empty-bucket', manifest: summarizeManifest(this.manifest) };
            }
            const index = Math.floor(Math.random() * entries.length);
            return { entry: entries[index], reason: null, manifest: summarizeManifest(this.manifest) };
        }

        async getRandomMelody(options = {}) {
            const { entry, reason, manifest } = await this.getRandomEntryForMode(options.mode);
            if (!entry) {
                return { error: reason || 'unavailable', manifest };
            }
            const base = await this.loadBaseEntry(entry);
            const formatted = this.formatEntry(base, entry, options);
            return formatted;
        }

        async loadBaseEntry(entry) {
            if (!entry || typeof entry.id === 'undefined') {
                throw new Error('Invalid manifest entry.');
            }
            if (this.baseEntryCache.has(entry.id)) {
                return this.baseEntryCache.get(entry.id);
            }
            const text = await this.fetchText(entry.musicxml);
            const base = this.parseMusicXml(text, entry);
            this.baseEntryCache.set(entry.id, base);
            return base;
        }

        async fetchText(url) {
            if (!url) {
                throw new Error('Missing resource URL');
            }
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load ${url} (${response.status})`);
            }
            return response.text();
        }

        ensureParser() {
            if (this.parser) {
                return this.parser;
            }
            if (typeof DOMParser === 'undefined') {
                throw new Error('DOMParser unavailable in this environment.');
            }
            this.parser = new DOMParser();
            return this.parser;
        }

        parseMusicXml(xmlText, entry) {
            const parser = this.ensureParser();
            const doc = parser.parseFromString(xmlText, 'application/xml');
            if (!doc || doc.getElementsByTagName('parsererror').length > 0) {
                throw new Error('Unable to parse MusicXML content.');
            }
            const divisionsNode = doc.querySelector('divisions');
            const divisions = divisionsNode ? toPositiveNumber(divisionsNode.textContent, DEFAULT_DIVISIONS) : DEFAULT_DIVISIONS;
            const timeNode = doc.querySelector('time');
            const beats = toPositiveNumber(timeNode?.querySelector('beats')?.textContent, 4) || 4;
            const beatType = toPositiveNumber(timeNode?.querySelector('beat-type')?.textContent, 4) || 4;
            const notes = Array.from(doc.getElementsByTagName('note'));
            const events = [];
            let currentEvent = null;
            let cursorBeats = 0;

            const divisionsPerBeat = divisions || DEFAULT_DIVISIONS;

            const extractBeams = (noteNode) => {
                if (!noteNode) return null;
                const beamNodes = noteNode.getElementsByTagName('beam');
                if (!beamNodes || beamNodes.length === 0) return null;
                const beams = [];
                for (let i = 0; i < beamNodes.length; i += 1) {
                    const beamNode = beamNodes[i];
                    if (!beamNode) continue;
                    const rawType = (beamNode.textContent || '').trim().toLowerCase();
                    if (!rawType) continue;
                    const numberAttr = beamNode.getAttribute('number');
                    const number = Number.isFinite(Number.parseInt(numberAttr, 10))
                        ? Number.parseInt(numberAttr, 10)
                        : 1;
                    beams.push({
                        number,
                        type: rawType,
                    });
                }
                return beams.length > 0 ? beams : null;
            };

            notes.forEach((noteNode) => {
                const isRest = noteNode.getElementsByTagName('rest').length > 0;
                const isChordComponent = noteNode.getElementsByTagName('chord').length > 0;
                const durationNode = noteNode.getElementsByTagName('duration')[0];
                const durationValue = toPositiveNumber(durationNode ? durationNode.textContent : null, 0);
                const durationBeats = divisionsPerBeat > 0 ? durationValue / divisionsPerBeat : 0;
                if (durationBeats <= 0) {
                    return;
                }
                if (!isChordComponent || !currentEvent) {
                    currentEvent = {
                        startBeat: cursorBeats,
                        durationBeats,
                        midiPitches: [],
                        isRest,
                    };
                    events.push(currentEvent);
                    cursorBeats += durationBeats;
                } else {
                    currentEvent.durationBeats = Math.max(currentEvent.durationBeats, durationBeats);
                    if (!isRest) {
                        currentEvent.isRest = false;
                    }
                }

                if (!isRest) {
                    const pitchNode = noteNode.getElementsByTagName('pitch')[0];
                    if (pitchNode) {
                        const midi = this.pitchNodeToMidi(pitchNode);
                        if (typeof midi === 'number') {
                            currentEvent.midiPitches.push(midi);
                        }
                    }
                    const beams = extractBeams(noteNode);
                    if (beams && (!currentEvent.beams || currentEvent.beams.length === 0)) {
                        currentEvent.beams = beams;
                    }
                }
            });

            return {
                entryId: entry.id,
                slug: entry.slug,
                datasetMode: entry.mode,
                sourceTonic: entry.tonic,
                timeSignature: { beats, beatType },
                totalBeats: Number.parseFloat(cursorBeats.toFixed(5)),
                events,
            };
        }

        pitchNodeToMidi(pitchNode) {
            if (!pitchNode) return null;
            const step = (pitchNode.getElementsByTagName('step')[0]?.textContent || 'C').trim().toUpperCase();
            const alter = pitchNode.getElementsByTagName('alter')[0]?.textContent || '0';
            const octave = pitchNode.getElementsByTagName('octave')[0]?.textContent || '4';
            const accidental = buildAccidental(alter);
            const letterOffsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
            const base = letterOffsets[step] ?? 0;
            const alterValue = accidental.startsWith('b')
                ? -accidental.length
                : accidental.length;
            const octaveValue = Number.parseInt(octave, 10);
            if (!Number.isFinite(octaveValue)) {
                return null;
            }
            return (12 * (octaveValue + 1)) + base + alterValue;
        }

        formatEntry(base, manifestEntry, options = {}) {
            const musicTheory = options.musicTheory || null;
            const targetTonicLetter = options.tonicLetter || manifestEntry.tonic?.replace(/\d+$/, '') || 'C';
            const range = musicTheory?.getModeRange ? musicTheory.getModeRange(options.mode, targetTonicLetter) : null;
            const targetTonicNote = range?.tonicNote || `${targetTonicLetter}4`;
            const sourceMidi = musicTheory?.noteToSemitone ? musicTheory.noteToSemitone(manifestEntry.tonic || 'C4') : 60;
            const targetMidi = musicTheory?.noteToSemitone ? musicTheory.noteToSemitone(targetTonicNote) : 60;
            const transpose = (typeof targetMidi === 'number' && typeof sourceMidi === 'number')
                ? targetMidi - sourceMidi
                : 0;
            const staffEntries = [];
            const playbackEvents = [];
            const pitchNames = [];
            const noteToSemitone = (note) => (musicTheory?.noteToSemitone ? musicTheory.noteToSemitone(note) : null);
            const semitoneToNote = (value) => (musicTheory?.semitoneToNote ? musicTheory.semitoneToNote(value) : '');

            const beatsPerMeasure = Number(base.timeSignature?.beats) || 4;
            const tolerance = 0.01;
            let measureProgress = 0;
            let measureCount = 0;
            let finalBarline = DEFAULT_FINAL_BARLINE;

            base.events.forEach((event, index) => {
                const durationInfo = deriveDurationInfo(event.durationBeats);
                if (event.isRest || event.midiPitches.length === 0) {
                    staffEntries.push({
                        isRest: true,
                        duration: durationInfo.duration,
                        dots: durationInfo.dots,
                    });
                    playbackEvents.push({
                        startBeat: event.startBeat,
                        durationBeats: event.durationBeats,
                        midiPitches: [],
                        isRest: true,
                    });
                } else {
                    const transposed = event.midiPitches.map((midi) => midi + transpose);
                    const clamped = transposed.map((value) => {
                        if (!Number.isFinite(value)) return value;
                        return Math.min(Math.max(value, 36), 96);
                    });
                    const spelled = clamped
                        .map((midi) => semitoneToNote(midi))
                        .filter(Boolean);
                    const pitchPairs = spelled.map((note, idx) => ({
                        note,
                        midi: noteToSemitone(note) ?? clamped[idx],
                    }));
                    pitchPairs.sort((a, b) => (a.midi || 0) - (b.midi || 0));
                    const orderedNotes = pitchPairs.map((pair) => pair.note);
                    staffEntries.push({
                        note: orderedNotes[0],
                        notes: orderedNotes.slice(),
                        duration: durationInfo.duration,
                        dots: durationInfo.dots,
                        beams: Array.isArray(event.beams) ? event.beams.map((beam) => ({
                            number: Number.isFinite(beam.number) ? beam.number : 1,
                            type: (beam.type || '').toLowerCase(),
                        })) : undefined,
                    });
                    playbackEvents.push({
                        startBeat: event.startBeat,
                        durationBeats: event.durationBeats,
                        midiPitches: clamped.slice(),
                        isRest: false,
                    });
                    orderedNotes.forEach((note) => pitchNames.push(note));
                }

                measureProgress += event.durationBeats;
                const isLastEvent = index === base.events.length - 1;
                if (beatsPerMeasure > 0) {
                    const remainingEvents = base.events.length - index - 1;
                    while (measureProgress >= (beatsPerMeasure - tolerance)) {
                        measureCount += 1;
                        const projected = measureProgress - beatsPerMeasure;
                        const boundaryIsFinal = (remainingEvents === 0)
                            && isLastEvent
                            && projected <= tolerance;
                        if (boundaryIsFinal) {
                            finalBarline = 'end';
                        } else {
                        staffEntries.push({
                            barline: 'single',
                        });
                        }
                        measureProgress = projected <= tolerance ? 0 : projected;
                    }
                }
            });

            return {
                manifestEntry,
                datasetMode: manifestEntry.mode,
                sourceTonic: manifestEntry.tonic,
                targetTonicNote,
                transpose,
                timeSignature: base.timeSignature,
                timeSignatureLabel: `${base.timeSignature.beats}/${base.timeSignature.beatType}`,
                totalBeats: base.totalBeats,
                staffEntries,
                playbackEvents,
                pitchNames,
                measureCount: measureCount || 1,
                finalBarline,
                musicXmlUrl: manifestEntry.musicxml || null,
                transposeSemitones: transpose,
            };
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SolfegeLibrary;
    } else {
        globalScope.SolfegeLibrary = SolfegeLibrary;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
