/**
 * Staff Module - Handles musical staff display and note positioning
 */
class StaffModule {
    constructor() {
        this.staffNotes = []; // Track notes on staff
    }

    /**
     * Show a note on the musical staff
     * @param {string} note - Note name (e.g., 'C4')
     */
    showNoteOnStaff(note) {
        console.log('=== showNoteOnStaff called with:', note, 'type:', typeof note);
        
        if (!note) {
            console.warn('showNoteOnStaff: note is falsy');
            return; // Safety check
        }
        
        console.log('About to query staff note with selector:', `.staff .note.${note}`);
        
        // Flash the note briefly, then make it persistent
        const staffNote = document.querySelector(`.staff .note.${note}`);
        if (staffNote) {
            // Position the note for the sequence
            const noteIndex = this.staffNotes.length;
            const spacing = 45; // Horizontal spacing between notes
            const startX = 90; // Start position after treble clef
            
            staffNote.style.left = `${startX + (noteIndex * spacing)}px`;
            staffNote.classList.add('visible');
            
            // Add to our tracking array
            this.staffNotes.push({
                note: note,
                element: staffNote,
                index: noteIndex
            });
            
            // Show accidental if it's a sharp
            if (note.includes('#')) {
                const accidental = document.querySelector(`.staff .accidental[data-sharp="${note}"]`);
                if (accidental) {
                    accidental.style.left = `${startX + (noteIndex * spacing) - 15}px`;
                    accidental.classList.add('visible');
                }
            }
            
            // After flash animation, make it persistent with user color
            setTimeout(() => {
                staffNote.classList.remove('visible');
                staffNote.classList.add('persistent', 'user');
            }, 500);
        }
    }

    /**
     * Clear all notes and accidentals from staff
     */
    clearStaffNotes() {
        // Clear all notes and accidentals from staff
        document.querySelectorAll('.staff .note').forEach(n => {
            n.classList.remove('visible', 'persistent');
            n.style.left = '50%'; // Reset to center
        });
        document.querySelectorAll('.staff .accidental').forEach(a => {
            a.classList.remove('visible');
            a.style.left = '35%'; // Reset to default
        });
        
        // Reset tracking array
        this.staffNotes = [];
    }

    /**
     * Update staff notes with comparison colors
     * @param {Array} currentSequence - The target sequence
     * @param {Array} userSequence - The user's sequence
     */
    updateStaffComparison(currentSequence, userSequence) {
        // Update staff notes with comparison colors
        for (let i = 0; i < currentSequence.length; i++) {
            if (i < userSequence.length) {
                if (this.staffNotes[i]) {
                    if (userSequence[i] === currentSequence[i]) {
                        this.staffNotes[i].element.classList.remove('user', 'incorrect');
                        this.staffNotes[i].element.classList.add('correct');
                    } else {
                        this.staffNotes[i].element.classList.remove('user', 'correct');
                        this.staffNotes[i].element.classList.add('incorrect');
                    }
                }
            }
        }
    }

    /**
     * Get the current staff notes
     * @returns {Array} Array of staff notes
     */
    getStaffNotes() {
        return this.staffNotes;
    }

    /**
     * Get the number of notes currently on staff
     * @returns {number} Number of notes
     */
    getStaffNotesCount() {
        return this.staffNotes.length;
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffModule;
} else {
    window.StaffModule = StaffModule;
}