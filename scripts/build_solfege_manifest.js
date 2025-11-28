#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'raw_data');
const MUSICXML_DIR = path.join(RAW_DIR, 'musicxml');
const MIDI_DIR = path.join(RAW_DIR, 'midi');
const OUTPUT_PATH = path.join(RAW_DIR, 'solfege_manifest.json');

function ensureDirExists(dirPath) {
    try {
        fs.accessSync(dirPath, fs.constants.R_OK);
    } catch (err) {
        throw new Error(`Missing directory: ${dirPath}`);
    }
}

function normalizeMode(value) {
    if (!value) return 'unknown';
    return value.toLowerCase();
}

function parseFilename(fileName) {
    const baseName = fileName.replace(/\.musicxml$/i, '');
    const parts = baseName.split('_');
    if (parts.length < 4) {
        return null;
    }
    const id = Number(parts[0]);
    if (!Number.isFinite(id)) {
        return null;
    }
    const tonicLetter = parts[1] || 'C';
    const tonicOctave = parts[2] || '4';
    const mode = normalizeMode(parts[3]);
    const variant = parts.slice(4);
    const tonic = `${tonicLetter}${tonicOctave}`;
    const midiFile = `${baseName}.mid`;
    const midiPath = path.join(MIDI_DIR, midiFile);
    if (!fs.existsSync(midiPath)) {
        return null;
    }
    return {
        id,
        slug: baseName,
        mode,
        tonic,
        variant,
        musicxml: `/raw_data/musicxml/${baseName}.musicxml`,
        midi: `/raw_data/midi/${baseName}.mid`,
    };
}

function buildManifest() {
    ensureDirExists(MUSICXML_DIR);
    ensureDirExists(MIDI_DIR);
    const files = fs.readdirSync(MUSICXML_DIR).filter((file) => file.toLowerCase().endsWith('.musicxml'));
    const entries = [];
    files.forEach((file) => {
        const entry = parseFilename(file);
        if (entry) {
            entries.push(entry);
        }
    });
    entries.sort((a, b) => {
        if (a.id === b.id) {
            return a.slug.localeCompare(b.slug);
        }
        return a.id - b.id;
    });
    const payload = {
        generatedAt: new Date().toISOString(),
        total: entries.length,
        supportedModes: Array.from(new Set(entries.map((entry) => entry.mode))).sort(),
        tonic: 'relative',
        entries,
    };
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return payload;
}

try {
    const manifest = buildManifest();
    console.log(`Solfege manifest written to ${path.relative(ROOT, OUTPUT_PATH)} (${manifest.total} entries).`);
    console.log(`Supported modes: ${manifest.supportedModes.join(', ')}`);
} catch (error) {
    console.error('[build_solfege_manifest] Failed:', error.message);
    process.exitCode = 1;
}
