/**
 * MidiInputModule - Adds Web MIDI input and routes note-on to the app
 * - Desktop Chrome/Edge support; gracefully no-op elsewhere.
 * - Converts MIDI note numbers to note names via MusicTheory.semitoneToNote.
 * - Plays notes through KeyboardModule to reuse filtering/feedback.
 */
(function () {
  class MidiInputModule {
    constructor(musicTheory, keyboardModule) {
      this.musicTheory = musicTheory;
      this.keyboardModule = keyboardModule;
      this.midiAccess = null;
      this.activeInput = null;
      this.onStateChange = this.onStateChange.bind(this);
      this.onMidiMessage = this.onMidiMessage.bind(this);
    }

    isSupported() {
      return !!(navigator && navigator.requestMIDIAccess);
    }

    async start() {
      if (!this.isSupported()) {
        console.info('[MIDI] Web MIDI API not supported in this environment.');
        return { supported: false };
      }
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.midiAccess.onstatechange = this.onStateChange;
        this.attachFirstInput();
        return { supported: true };
      } catch (err) {
        console.warn('[MIDI] Access request failed:', err);
        return { supported: true, error: String(err) };
      }
    }

    attachFirstInput() {
      if (!this.midiAccess) return;
      const inputs = Array.from(this.midiAccess.inputs.values());
      const first = inputs.find(i => i.state === 'connected') || inputs[0];
      this.setInput(first || null);
    }

    setInput(input) {
      if (this.activeInput) {
        try { this.activeInput.onmidimessage = null; } catch {}
      }
      this.activeInput = input || null;
      if (this.activeInput) {
        this.activeInput.onmidimessage = this.onMidiMessage;
        console.info(`[MIDI] Connected input: ${this.activeInput.name || 'Unknown device'}`);
      } else {
        console.info('[MIDI] No MIDI input connected.');
      }
    }

    listInputs() {
      if (!this.midiAccess) return [];
      return Array.from(this.midiAccess.inputs.values()).map(i => ({ id: i.id, name: i.name, state: i.state }));
    }

    onStateChange(e) {
      const port = e && e.port;
      if (!port || port.type !== 'input') return;
      console.info(`[MIDI] ${port.state}: ${port.name}`);
      if (port.state === 'connected' && !this.activeInput) {
        this.attachFirstInput();
      }
      if (port.state === 'disconnected' && this.activeInput && port.id === this.activeInput.id) {
        this.setInput(null);
        this.attachFirstInput();
      }
    }

    onMidiMessage(event) {
      const data = event.data;
      if (!data || data.length < 2) return;
      const status = data[0] & 0xf0;
      const note = data[1];
      const velocity = data[2] || 0;

      // Note On (0x90) with velocity > 0
      if (status === 0x90 && velocity > 0) {
        const noteName = this.musicTheory && typeof this.musicTheory.semitoneToNote === 'function'
          ? this.musicTheory.semitoneToNote(note)
          : null;
        if (!noteName) return;
        // Route through KeyboardModule to reuse filtering and visuals
        if (this.keyboardModule && typeof this.keyboardModule.playNote === 'function') {
          this.keyboardModule.playNote(noteName);
        }
      }
      // Ignore Note Off (0x80) and Note On with velocity 0
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiInputModule;
  } else {
    window.MidiInputModule = MidiInputModule;
  }
})();

