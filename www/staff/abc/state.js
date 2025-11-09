export const ABC_SNIPPETS = {
  C: `X:1
T:C Major Scale
M:4/4
L:1/4
K:C
C D E F | G A B c |]`,
  G: `X:1
T:G Major Scale
M:4/4
L:1/4
K:G
G A B c | d e f g |]`,
  D: `X:1
T:D Major Scale
M:4/4
L:1/4
K:D
D E F G | A B c d |]`,
  A: `X:1
T:A Major Scale
M:4/4
L:1/4
K:A
A B c d | e f g a |]`,
  F: `X:1
T:F Major Scale
M:4/4
L:1/4
K:F
F G A B | c d e f |]`,
  Bb: `X:1
T:Bb Major Scale
M:4/4
L:1/4
K:Bb
B, C D E | F G A B |]`,
  Eb: `X:1
T:Eb Major Scale
M:4/4
L:1/4
K:Eb
E F G A | B c d e |]`,
};

const currentAbc = new Map(Object.entries(ABC_SNIPPETS));

let activeKey = null;
let isLoading = false;
let lastSelected = null; // { key, start, end }
let dragState = null;

export function getSnippet(key) {
  if (!key) return null;
  return currentAbc.get(key) ?? ABC_SNIPPETS[key] ?? null;
}

export function getStoredSnippet(key) {
  if (!key) return null;
  return currentAbc.has(key) ? currentAbc.get(key) : null;
}

export function getDefaultSnippet(key) {
  if (!key) return null;
  return ABC_SNIPPETS[key] ?? null;
}

export function setSnippet(key, value) {
  if (!key || typeof value !== 'string') return;
  currentAbc.set(key, value);
}

export function resetSnippet(key) {
  if (!key) return;
  if (key in ABC_SNIPPETS) {
    currentAbc.set(key, ABC_SNIPPETS[key]);
  } else {
    currentAbc.delete(key);
  }
}

export function getActiveKey() {
  return activeKey;
}

export function setActiveKey(key) {
  activeKey = key;
}

export function getIsLoading() {
  return isLoading;
}

export function setIsLoading(value) {
  isLoading = Boolean(value);
}

export function getLastSelected() {
  return lastSelected;
}

export function setLastSelected(value) {
  lastSelected = value || null;
}

export function getDragState() {
  return dragState;
}

export function setDragState(value) {
  dragState = value || null;
}

export function clearDragState() {
  dragState = null;
}

export function getCurrentAbcMap() {
  return currentAbc;
}
