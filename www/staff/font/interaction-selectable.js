export const selectableRegistry = {
  items: [],
  svg: null,
  reset(svg) {
    this.items = [];
    this.svg = svg || null;
  },
  add(entry) {
    if (!entry || !entry.noteEl) return null;
    const index = this.items.length;
    const { noteEl } = entry;
    noteEl.setAttribute('selectable', 'true');
    noteEl.setAttribute('tabindex', '0');
    noteEl.dataset.index = String(index);
    noteEl.style.pointerEvents = 'all';
    console.log('[VexflowSelectable] add', {
      index,
      voiceIndex: entry.voiceIndex,
      noteIndex: entry.noteIndex,
      id: noteEl.id,
      className: noteEl.className?.baseVal || noteEl.className,
    });
    this.items.push({
      index,
      note: entry.note,
      noteEl,
      voiceIndex: entry.voiceIndex,
      noteIndex: entry.noteIndex,
      staffSpacing: entry.staffSpacing,
      dim: null,
    });
    return this.items[index];
  },
  get(index) {
    return (index >= 0 && index < this.items.length) ? this.items[index] : null;
  },
  clearDims() {
    this.items.forEach((item) => { item.dim = null; });
  },
  indexFromTarget(target) {
    let el = target;
    while (el && el !== this.svg) {
      if (el.dataset && el.dataset.index !== undefined) {
        const idx = Number.parseInt(el.dataset.index, 10);
        if (Number.isInteger(idx)) return idx;
      }
      el = el.parentNode;
    }
    return -1;
  },
  findClosestDetails(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const item of this.items) {
      if (!item || !item.noteEl) continue;
      const bbox = item.dim || item.noteEl.getBBox?.();
      if (!bbox) continue;
      const dx = (bbox.x + bbox.width / 2) - x;
      const dy = (bbox.y + bbox.height / 2) - y;
      const dist = Math.sqrt((dx * dx) + (dy * dy));
      if (dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    if (!best) return null;
    return { item: best, distance: bestDist };
  },
  findClosest(x, y) {
    const result = this.findClosestDetails(x, y);
    return result ? result.item : null;
  },
};
