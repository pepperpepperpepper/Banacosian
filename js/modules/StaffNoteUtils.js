(function initStaffNoteUtils(globalScope) {
    const NOTE_MATCH = /^([A-Ga-g])([#♯x𝄪b♭b𝄫]{0,3})(-?\d+)$/;
    const LETTER_TO_SEMITONE = {
        c: 0,
        d: 2,
        e: 4,
        f: 5,
        g: 7,
        a: 9,
        b: 11,
    };

    function accidentalOffset(symbol) {
        if (!symbol) return 0;
        switch (symbol) {
            case '#':
            case '♯':
                return 1;
            case '###':
                return 3;
            case '##':
            case 'x':
            case '𝄪':
                return 2;
            case 'b':
            case '♭':
                return -1;
            case 'bbb':
                return -3;
            case 'bb':
            case '𝄫':
                return -2;
            default:
                return 0;
        }
    }

    function estimateMidi(note) {
        if (!note || typeof note !== 'string') return Number.NEGATIVE_INFINITY;
        const match = NOTE_MATCH.exec(note.trim());
        if (!match) return Number.NEGATIVE_INFINITY;
        const letter = match[1].toLowerCase();
        const accidental = accidentalOffset(match[2]);
        const octave = Number.parseInt(match[3], 10);
        if (!Number.isInteger(octave) || !(letter in LETTER_TO_SEMITONE)) {
            return Number.NEGATIVE_INFINITY;
        }
        return (octave + 1) * 12 + LETTER_TO_SEMITONE[letter] + accidental;
    }

    function sortNotesAscending(notes) {
        return Array.isArray(notes)
            ? notes.slice().sort((a, b) => estimateMidi(a) - estimateMidi(b))
            : [];
    }

    function formatSpecToNote(spec) {
        if (!spec) return null;
        const letter = (spec.letter || 'c').toUpperCase();
        const octave = Number.isFinite(spec.octave) ? spec.octave : 4;
        const accidental = spec.accidental && spec.accidental !== 'n'
            ? spec.accidental.replace('♯', '#').replace('♭', 'b')
            : '';
        return `${letter}${accidental}${octave}`;
    }

    function diffSequences(prev = [], next = []) {
        const diffs = [];
        const max = Math.max(prev.length, next.length);
        for (let i = 0; i < max; i += 1) {
            const a = prev[i];
            const b = next[i];
            if (a === undefined && b !== undefined) {
                diffs.push({ type: 'insert', index: i, note: b });
            } else if (a !== undefined && b === undefined) {
                diffs.push({ type: 'delete', index: i });
            } else if (a !== b) {
                diffs.push({ type: 'update', index: i, note: b });
            }
        }
        return diffs;
    }

    const api = {
        NOTE_MATCH,
        LETTER_TO_SEMITONE,
        accidentalOffset,
        estimateMidi,
        sortNotesAscending,
        formatSpecToNote,
        diffSequences,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffNoteUtils = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
