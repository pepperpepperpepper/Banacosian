(function initStaffSharedUtils(globalScope) {
    function reindexStaffNotes(startIndex = 0) {
        if (!Array.isArray(this.staffNotes) || this.staffNotes.length === 0) return;
        for (let i = Math.max(0, startIndex); i < this.staffNotes.length; i += 1) {
            if (this.staffNotes[i]) {
                this.staffNotes[i].index = i;
            }
        }
    }

    function normalizeInsertIndex(index) {
        const length = Array.isArray(this.noteEntries) ? this.noteEntries.length : 0;
        if (!Number.isInteger(index)) return length;
        if (index < 0) return 0;
        if (index > length) return length;
        return index;
    }

    function getStaffNotes() {
        return this.staffNotes;
    }

    function getStaffNotesCount() {
        return Array.isArray(this.staffNotes) ? this.staffNotes.length : 0;
    }

    function attachTo(target) {
        if (!target) return;
        const proto = target.prototype || target;
        if (!proto) return;
        proto.reindexStaffNotes = reindexStaffNotes;
        proto.normalizeInsertIndex = normalizeInsertIndex;
        proto.getStaffNotes = getStaffNotes;
        proto.getStaffNotesCount = getStaffNotesCount;
    }

    const api = { attachTo };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffSharedUtils = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
