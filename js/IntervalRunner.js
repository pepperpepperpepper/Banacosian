/* Interval Runner — endless side-scroller using interval recognition */
(function () {
  const INTERVAL_DEFS = [
    { value: 1, label: 'm2', description: 'Minor 2nd (1 semitone)' },
    { value: 2, label: 'M2', description: 'Major 2nd (2 semitones)' },
    { value: 3, label: 'm3', description: 'Minor 3rd (3 semitones)' },
    { value: 4, label: 'M3', description: 'Major 3rd (4 semitones)' },
    { value: 5, label: 'P4', description: 'Perfect 4th (5 semitones)' },
    { value: 6, label: 'TT', description: 'Tritone (6 semitones)' },
    { value: 7, label: 'P5', description: 'Perfect 5th (7 semitones)' },
    { value: 8, label: 'm6', description: 'Minor 6th (8 semitones)' },
    { value: 9, label: 'M6', description: 'Major 6th (9 semitones)' },
    { value: 10, label: 'm7', description: 'Minor 7th (10 semitones)' },
    { value: 11, label: 'M7', description: 'Major 7th (11 semitones)' },
    { value: 12, label: 'P8', description: 'Perfect Octave (12 semitones)' },
    { value: 13, label: '♭9', description: 'Flat 9 (13 semitones)' },
    { value: 14, label: '9', description: 'Major 9 (14 semitones)' },
    { value: 15, label: '♯9', description: 'Sharp 9 (15 semitones)' },
    { value: 16, label: '10', description: 'Major 10 (16 semitones)' },
    { value: 17, label: '11', description: 'Perfect 11 (17 semitones)' },
    { value: 18, label: '♯11', description: 'Sharp 11 (18 semitones)' },
    { value: 20, label: '♭13', description: 'Flat 13 (20 semitones)' },
    { value: 21, label: '13', description: 'Major 13 (21 semitones)' },
  ];
  const INTERVAL_VALUE_LIST = INTERVAL_DEFS.map((def) => def.value);
  const INTERVAL_LABEL_MAP = INTERVAL_DEFS.reduce((acc, def) => {
    acc[def.value] = def.label;
    return acc;
  }, {});
  const INTERVAL_VALUE_SET = new Set(INTERVAL_VALUE_LIST);
  const LEGACY_INTERVAL_MAX = 12;
  const INTERVAL_SPEC_VERSION = 2;
  const EXTENDED_INTERVAL_VALUES = INTERVAL_DEFS
    .filter((def) => def.value > LEGACY_INTERVAL_MAX)
    .map((def) => def.value);

  const intervalLabelFor = (value) => INTERVAL_LABEL_MAP[value] || String(value);
  const TWO_PI = Math.PI * 2;
  const RAND = (min, max) => min + Math.random() * (max - min);
  const CLAMP = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const USER_SPEED_MIN = 0.4;
  const USER_SPEED_MAX = 1.6;
  const USER_SPEED_STEP = 0.1;
  const DEFAULT_USER_SPEED = 0.4;
  const DEFAULT_TIMBRE_ID = 'triangle';

  function buildChoices(container, onChoose, allowedSet) {
    const order = INTERVAL_VALUE_LIST;
    const allowed = allowedSet instanceof Set ? order.filter((n) => allowedSet.has(n)) : order;
    container.textContent = '';
    allowed.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'control-btn ui-pill interval-choice';
      const label = intervalLabelFor(n);
      btn.textContent = label;
      btn.title = `Select ${label}`;
      btn.dataset.semitones = String(n);
      btn.setAttribute('role','radio'); btn.setAttribute('aria-checked','false'); btn.tabIndex=-1;
      btn.addEventListener('click', () => onChoose(n, btn));
      container.appendChild(btn);
    });
    const first = container.querySelector('.interval-choice');
    if (first) first.tabIndex = 0;
  }

  function main() {
    const theory = new (window.MusicTheoryModule||function(){})();
    const audio = new (window.AudioModule||function(){})();
    const scoring = new (window.ScoringModule||function(){})();

    const $canvas = document.getElementById('runnerCanvas');
    const $overlay = document.getElementById('runnerOverlay');
    const $choices = document.getElementById('runnerChoices');
    const $pause = document.getElementById('runnerPauseBtn');
    const $settingsBtn = document.getElementById('runnerSettingsBtn');
    const $settingsPanel = document.getElementById('runnerSettingsPanel');
    const $type = document.getElementById('runnerType');
    const $dir = document.getElementById('runnerDirection');
    const $timbre = document.getElementById('runnerTimbre');
    const $startMode = document.getElementById('runnerStartMode');
    const $anchorSelect = document.getElementById('runnerAnchorSelect');
    const $intervalSet = document.getElementById('runnerIntervalSet');
    const $speedDown = document.getElementById('runnerSpeedDown');
    const $speedUp = document.getElementById('runnerSpeedUp');

    const ctx = $canvas.getContext('2d');

    // Runner preference persistence
    const RUNNER_SETTINGS_KEY = 'runner:settings:v1';
    const RUNNER_SPEED_PREF_KEY = 'runner:user-speed-pref:v1';
    function loadRunnerSettings() {
      try { const raw = localStorage.getItem(RUNNER_SETTINGS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
    }
    function saveRunnerSettings(partial) {
      try {
        const prev = loadRunnerSettings() || {};
        const next = {
          ...prev,
          ...partial,
          intervalSetVersion: INTERVAL_SPEC_VERSION,
          _meta: { v: 1, updatedAt: new Date().toISOString() }
        };
        localStorage.setItem(RUNNER_SETTINGS_KEY, JSON.stringify(next));
      } catch {}
    }
    function loadStoredSpeedPreference(savedSettings) {
      try {
        const raw = localStorage.getItem(RUNNER_SPEED_PREF_KEY);
        if (raw !== null) {
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) {
            return CLAMP(parsed, USER_SPEED_MIN, USER_SPEED_MAX);
          }
        }
      } catch {}
      if (savedSettings && typeof savedSettings.userSpeed === 'number' && !Number.isNaN(savedSettings.userSpeed)) {
        return CLAMP(savedSettings.userSpeed, USER_SPEED_MIN, USER_SPEED_MAX);
      }
      return null;
    }
    function persistUserSpeedPreference(value) {
      const safe = CLAMP(value, USER_SPEED_MIN, USER_SPEED_MAX);
      try { localStorage.setItem(RUNNER_SPEED_PREF_KEY, String(safe)); } catch {}
      try { saveRunnerSettings({ userSpeed: safe }); } catch {}
    }
    // Optional: allow providing a custom sprite via data-sprite on the canvas, URL, or localStorage
    let spriteImg = null; let spriteReady = false; let wantProceduralLegs = false; let spriteScale = 1.0;
    (function initSpriteFromPrefs(){
      // Always use the sprite declared on the canvas dataset; no picker/URL/localStorage overrides.
      // Keep spriteScale support (dataset value or stored scale) for layout flexibility.
      try {
        if ($canvas?.dataset?.spriteScale && !Number.isNaN(Number($canvas.dataset.spriteScale))) {
          spriteScale = Math.max(0.5, Math.min(4.0, Number($canvas.dataset.spriteScale)));
        } else {
          const storedScale = Number(localStorage.getItem('runnerSpriteScale'));
          if (!Number.isNaN(storedScale) && storedScale) spriteScale = storedScale;
        }
      } catch {}
      if ($canvas && $canvas.dataset && $canvas.dataset.sprite) {
        spriteImg = new Image();
        spriteImg.onload = () => {
          spriteReady = true;
          console.log('[RunnerSprite] loaded', $canvas.dataset.sprite, 'scale=', spriteScale);
          try { if (!state.running) draw(); } catch {}
        };
        spriteImg.onerror = () => { console.error('[RunnerSprite] failed to load', $canvas.dataset.sprite); spriteImg = null; spriteReady = false; };
        spriteImg.src = $canvas.dataset.sprite;
      }
      // legs preference from dataset only
      wantProceduralLegs = !!($canvas?.dataset?.legs && $canvas.dataset.legs !== 'off');
    })();
    let lastTs = 0;

    const state = {
      running: false,
      paused: false,
      cleared: 0,
      speed: 220, // px/s world speed
      speedMult: 1.0,
      gravity: 1700,
      groundY: $canvas.height - 42,
      player: { x: 90, y: 0, vy: 0, w: 28, h: 38, onGround: true, jumpQueued: false, runPhase: 0 },
      gates: [],
      nextSpawnIn: 0, // seconds
      minSpawn: 1.5,
      maxSpawn: 2.7,
      cueDistance: 360, // play sound when within this x distance from player
      // When true, the next spawn cycle produces a blank (no obstacle) to space bricks
      deferBlankAfter: false,
      // Defer the very first brick to ensure a blank precedes it
      deferredFirstBrick: null,
      firstBrickSpawned: false,
      activeSemitones: null,
      activeGateId: null,
      type: 'melodic',
      direction: 'random',
      startMode: 'chromatic',
      anchorNote: 'C4',
      anchorMidi: null,
      enabledIntervals: new Set(INTERVAL_VALUE_LIST),
      showGlasses: false,
      useProceduralLegs: wantProceduralLegs,
      // Remember last anchored (interval,direction) to avoid immediate repeats in fixed root mode
      lastAnchoredPair: null,
      hitMarker: null,
      spawnedCount: 0,
      userSpeed: DEFAULT_USER_SPEED,
    };

    // Keyboard answer shortcuts: map visible interval choices to physical keyboard rows.
    // First visual row -> home row (ASDFGHJKL;), centered on G/H.
    // Second visual row -> bottom row (ZXCVBNM,./), centered on B/N.
    // Third visual row -> top row (QWERTYUIOP), centered on T/Y.
    const CHOICE_ROW_KEY_PAIR_SETS = [
      [
        ['g', 'h'],
        ['f', 'j'],
        ['d', 'k'],
        ['s', 'l'],
        ['a', ';'],
      ],
      [
        ['b', 'n'],
        ['v', 'm'],
        ['c', ','],
        ['x', '.'],
        ['z', '/'],
      ],
      [
        ['t', 'y'],
        ['r', 'u'],
        ['e', 'i'],
        ['w', 'o'],
        ['q', 'p'],
      ],
    ];

    let choiceKeyMap = new Map();
    let keyMapRaf = 0;

    function rebuildChoiceKeyMap() {
      choiceKeyMap.clear();
      if (!$choices) return;
      const buttons = Array.from($choices.querySelectorAll('.interval-choice')).filter((btn) => !btn.disabled);
      if (!buttons.length) return;

      // Sort by layout position: top-to-bottom, then left-to-right.
      const sorted = buttons.slice().sort((a, b) => {
        const topDiff = a.offsetTop - b.offsetTop;
        if (Math.abs(topDiff) > 4) return topDiff;
        return a.offsetLeft - b.offsetLeft;
      });

      // Group into visual rows based on offsetTop.
      const rows = [];
      let currentRowTop = null;
      let currentRow = null;
      const rowThreshold = 20;
      sorted.forEach((btn) => {
        const top = btn.offsetTop;
        if (currentRowTop === null || Math.abs(top - currentRowTop) > rowThreshold) {
          currentRowTop = top;
          currentRow = [];
          rows.push(currentRow);
        }
        currentRow.push(btn);
      });

      rows.forEach((row, rowIndex) => {
        const pairSet =
          CHOICE_ROW_KEY_PAIR_SETS[rowIndex] ||
          CHOICE_ROW_KEY_PAIR_SETS[CHOICE_ROW_KEY_PAIR_SETS.length - 1];
        if (!pairSet || !pairSet.length) return;
        const N = row.length;
        row.sort((a, b) => a.offsetLeft - b.offsetLeft);
        const indexToKey = new Map();
        const midLeft = Math.floor((N - 1) / 2);
        const midRight = midLeft + 1;

        for (let level = 0; level < pairSet.length; level += 1) {
          const pair = pairSet[level];
          if (!pair || pair.length < 2) continue;
          const leftKey = pair[0];
          const rightKey = pair[1];
          const li = midLeft - level;
          const ri = midRight + level;
          if (li < 0 && ri >= N) break;
          if (li >= 0 && li < N && !indexToKey.has(li)) indexToKey.set(li, leftKey);
          if (ri >= 0 && ri < N && !indexToKey.has(ri)) indexToKey.set(ri, rightKey);
        }

        if (N === 1 && !indexToKey.has(0)) {
          const firstPair = pairSet[0];
          if (firstPair && firstPair[0]) indexToKey.set(0, firstPair[0]);
        }

        indexToKey.forEach((key, index) => {
          const btn = row[index];
          if (btn && key && !choiceKeyMap.has(key)) {
            choiceKeyMap.set(key, btn);
          }
        });
      });
    }

    function scheduleRebuildChoiceKeyMap() {
      if (keyMapRaf) cancelAnimationFrame(keyMapRaf);
      keyMapRaf = requestAnimationFrame(() => {
        keyMapRaf = 0;
        try {
          rebuildChoiceKeyMap();
        } catch (err) {
          console.warn('[Runner] Failed to rebuild choice key map', err);
        }
      });
    }

    function handleChoiceKeydown(e) {
      if (!state.running || state.paused) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      if (!key || key.length !== 1) return;
      const btn = choiceKeyMap.get(key);
      if (!btn || btn.disabled) return;
      e.preventDefault();
      btn.click();
    }

    document.addEventListener('keydown', handleChoiceKeydown);
    window.addEventListener('resize', scheduleRebuildChoiceKeyMap);

    function getGameSpeedFactor() {
      const raw = (typeof state.userSpeed === 'number' && !Number.isNaN(state.userSpeed))
        ? state.userSpeed
        : DEFAULT_USER_SPEED;
      return CLAMP(raw, USER_SPEED_MIN, USER_SPEED_MAX);
    }

    function applyUserSpeed(next, options) {
      const persist = !options || options.persist !== false;
      const clamped = CLAMP(next, USER_SPEED_MIN, USER_SPEED_MAX);
      const stepped = Math.round(clamped / USER_SPEED_STEP) * USER_SPEED_STEP;
      const rounded = Number(stepped.toFixed(2));
      state.userSpeed = rounded;
      if (persist) persistUserSpeedPreference(state.userSpeed);
      updateHud();
      updateSpeedButtonsDisabledState();
    }

    function stepUserSpeed(deltaSteps) {
      const current = (typeof state.userSpeed === 'number' && !Number.isNaN(state.userSpeed))
        ? state.userSpeed
        : DEFAULT_USER_SPEED;
      const next = current + (deltaSteps * USER_SPEED_STEP);
      applyUserSpeed(next, { persist: true });
    }

    function updateSpeedButtonsDisabledState() {
      const factor = getGameSpeedFactor();
      if ($speedDown) $speedDown.disabled = factor <= USER_SPEED_MIN + USER_SPEED_STEP * 0.25;
      if ($speedUp) $speedUp.disabled = factor >= USER_SPEED_MAX - USER_SPEED_STEP * 0.25;
    }

    // Populate timbres
    if ($timbre && typeof audio.getAvailableTimbres === 'function') {
      const opts = audio.getAvailableTimbres();
      $timbre.innerHTML = '';
      opts.forEach(({ id, label }) => {
        const o = document.createElement('option');
        o.value = id; o.textContent = label; if (id === audio.getCurrentTimbreId()) o.selected = true; $timbre.appendChild(o);
      });
      // Restore saved timbre if present
      const saved0 = loadRunnerSettings();
      if (saved0?.timbre && $timbre.querySelector(`option[value="${saved0.timbre}"]`)) {
        $timbre.value = saved0.timbre; audio.setTimbre(saved0.timbre);
      } else if ($timbre.querySelector(`option[value="${DEFAULT_TIMBRE_ID}"]`)) {
        $timbre.value = DEFAULT_TIMBRE_ID;
        audio.setTimbre(DEFAULT_TIMBRE_ID);
      }
      $timbre.addEventListener('change', () => { audio.setTimbre($timbre.value); saveRunnerSettings({ timbre: $timbre.value }); });
    }

    // Settings collapsible
    if ($settingsBtn && $settingsPanel) {
      const clearPressed = () => $settingsBtn.removeAttribute('data-pressed');
      $settingsBtn.addEventListener('pointerdown', () => $settingsBtn.setAttribute('data-pressed','true'));
      $settingsBtn.addEventListener('pointerup', clearPressed);
      $settingsBtn.addEventListener('pointercancel', clearPressed);
      $settingsBtn.addEventListener('blur', clearPressed);
      $settingsBtn.addEventListener('click', () => {
        const expanded = $settingsBtn.getAttribute('aria-expanded') === 'true';
        $settingsBtn.setAttribute('aria-expanded', String(!expanded));
        $settingsPanel.hidden = expanded;
      });
    }

    // Restore and bind basic prefs
    (function restoreBasicPrefs(){
      const saved = loadRunnerSettings();
      if (saved) {
        if ($type && saved.type && $type.querySelector(`option[value="${saved.type}"]`)) $type.value = saved.type;
        if ($dir && saved.direction && $dir.querySelector(`option[value="${saved.direction}"]`)) $dir.value = saved.direction;
        if ($startMode && saved.startMode && $startMode.querySelector(`option[value="${saved.startMode}"]`)) $startMode.value = saved.startMode;
      }
      let initialSpeed = loadStoredSpeedPreference(saved);
      if (typeof initialSpeed !== 'number' || Number.isNaN(initialSpeed)) {
        if (saved && saved.speedSetting && ['slow','normal','fast'].includes(saved.speedSetting)) {
          // Backwards-compat mapping from older string speedSetting
          if (saved.speedSetting === 'slow') initialSpeed = 0.7;
          else if (saved.speedSetting === 'fast') initialSpeed = 1.4;
          else initialSpeed = 1.0;
        } else {
          initialSpeed = DEFAULT_USER_SPEED;
        }
      }
      state.userSpeed = CLAMP(initialSpeed, USER_SPEED_MIN, USER_SPEED_MAX);
    })();

    state.type = ($type?.value === 'harmonic') ? 'harmonic' : 'melodic';
    state.direction = ($dir?.value === 'up' || $dir?.value === 'down') ? $dir.value : 'random';
    state.startMode = ($startMode?.value === 'anchored') ? 'anchored' : 'chromatic';

    function syncAnchorSelectVisibility() {
      if (!$anchorSelect) return;
      const anchored = state.startMode === 'anchored';
      $anchorSelect.hidden = !anchored;
      $anchorSelect.disabled = !anchored;
      if (anchored) {
        $anchorSelect.removeAttribute('aria-hidden');
      } else {
        $anchorSelect.setAttribute('aria-hidden', 'true');
      }
    }
    syncAnchorSelectVisibility();
    if (typeof state.userSpeed !== 'number' || Number.isNaN(state.userSpeed)) {
      state.userSpeed = DEFAULT_USER_SPEED;
    }
    state.userSpeed = CLAMP(state.userSpeed, USER_SPEED_MIN, USER_SPEED_MAX);
    $type?.addEventListener('change', () => { state.type = ($type.value === 'harmonic') ? 'harmonic' : 'melodic'; saveRunnerSettings({ type: state.type }); });
    $dir?.addEventListener('change', () => { state.direction = ($dir.value === 'up' || $dir.value === 'down') ? $dir.value : 'random'; saveRunnerSettings({ direction: state.direction }); });
    $startMode?.addEventListener('change', () => {
      state.startMode = ($startMode.value === 'anchored') ? 'anchored' : 'chromatic';
      saveRunnerSettings({ startMode: state.startMode });
      syncAnchorSelectVisibility();
    });

    if ($speedDown) {
      $speedDown.addEventListener('click', () => stepUserSpeed(-1));
    }
    if ($speedUp) {
      $speedUp.addEventListener('click', () => stepUserSpeed(1));
    }
    updateSpeedButtonsDisabledState();

    // Build interval choices (filtered to enabled set)
    function renderChoiceButtonsFromEnabled() {
      buildChoices($choices, handleChoose, state.enabledIntervals);
      scheduleRebuildChoiceKeyMap();
    }
    function filterPendingDisabledGates() {
      // Remove any upcoming, not-yet-cued gates that are now disabled
      state.gates = state.gates.filter(g => state.enabledIntervals.has(g.semitones) || g.cued || g.past);
    }
    renderChoiceButtonsFromEnabled();

    // Build interval enable toggles (default: all enabled)
    (function buildIntervalSet() {
      if (!$intervalSet) return;
      $intervalSet.textContent = '';
      const saved = loadRunnerSettings();
      let enabledSaved = null;
      const savedVersion = Number(saved?.intervalSetVersion) || 1;
      if (saved && Array.isArray(saved.enabledIntervals) && saved.enabledIntervals.length) {
        const filtered = saved.enabledIntervals
          .map(Number)
          .filter((value) => INTERVAL_VALUE_SET.has(value));
        enabledSaved = new Set(filtered);
        state.enabledIntervals = new Set(enabledSaved);
        if (savedVersion < INTERVAL_SPEC_VERSION) {
          EXTENDED_INTERVAL_VALUES.forEach((value) => state.enabledIntervals.add(value));
        }
      } else {
        state.enabledIntervals = new Set(INTERVAL_VALUE_LIST);
      }
      INTERVAL_DEFS.forEach((def) => {
        const id = `runner-int-${def.value}`;
        const lab = document.createElement('label');
        lab.setAttribute('for', id);
        lab.title = def.description || `Enable ${def.label}`;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.dataset.semitones = String(def.value);
        cb.checked = state.enabledIntervals.has(def.value);
        const span = document.createElement('span');
        span.textContent = def.label;
        cb.addEventListener('change', () => {
          if (cb.checked) state.enabledIntervals.add(def.value); else state.enabledIntervals.delete(def.value);
          if (state.enabledIntervals.size === 0) { state.enabledIntervals.add(def.value); cb.checked = true; }
          renderChoiceButtonsFromEnabled();
          filterPendingDisabledGates();
          saveRunnerSettings({ enabledIntervals: Array.from(state.enabledIntervals) });
        });
        lab.appendChild(cb);
        lab.appendChild(span);
        $intervalSet.appendChild(lab);
      });
    })();

    // Re-render choices in case saved intervals changed the set
    renderChoiceButtonsFromEnabled();

    // Populate anchor select with a comfortable range (C3..C6)
    (function populateAnchorSelect() {
      if (!$anchorSelect) return;
      const MIN = 48; // C3
      const MAX = 84; // C6
      const toNote = (m) => (theory && typeof theory.semitoneToNote === 'function') ? theory.semitoneToNote(m) : null;
      $anchorSelect.innerHTML = '';
      for (let m = MIN; m <= MAX; m += 1) {
        const label = toNote(m) || `MIDI ${m}`;
        const opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = label;
        $anchorSelect.appendChild(opt);
      }
      // Default to saved anchor or C4 (60) if present
      const saved = loadRunnerSettings();
      const def = (saved && Number.isFinite(saved.anchorMidi)) ? Number(saved.anchorMidi) : 60;
      const defOpt = $anchorSelect.querySelector(`option[value="${def}"]`);
      if (defOpt) defOpt.selected = true;
      state.anchorMidi = def;
      state.anchorNote = toNote(def) || 'C4';
      $anchorSelect.addEventListener('change', () => {
        const midi = Number($anchorSelect.value);
        if (Number.isFinite(midi)) {
          state.anchorMidi = midi;
          state.anchorNote = toNote(midi) || `MIDI ${midi}`;
          saveRunnerSettings({ anchorMidi: midi });
        }
      });
    })();

    // Basic keyboard mapping: 1-9 => 1..9, 0=>10, -=>11, =/+=>12
    document.addEventListener('keydown', (e) => {
      if (!state.running || state.paused) return;
      const key = e.key;
      let n = null;
      if (key >= '1' && key <= '9') n = Number(key);
      else if (key === '0') n = 10;
      else if (key === '-') n = 11;
      else if (key === '=' || key === '+') n = 12;
      if (n) {
        const btn = $choices.querySelector(`.interval-choice[data-semitones="${n}"]`);
        if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
      }
    });

    function showOverlay(msg, css='') {
      if (!$overlay) return;
      $overlay.innerHTML = msg ? `<div class="runner-msg ${css}">${msg}</div>` : '';
      if (!state.running && msg) {
        $overlay.classList.add('is-clickable');
        $overlay.setAttribute('role','button');
        $overlay.setAttribute('tabindex','0');
        $overlay.setAttribute('aria-label','Start game');
      } else {
        $overlay.classList.remove('is-clickable');
        $overlay.removeAttribute('role');
        $overlay.removeAttribute('tabindex');
        $overlay.removeAttribute('aria-label');
      }
    }

    // Game loop
    function frame(ts) {
      if (!state.running) return;
      const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0); // clamp 30ms
      lastTs = ts;
      if (!state.paused) update(dt);
      draw();
      requestAnimationFrame(frame);
    }

    // Idle animation so legs move on the resting screen
    let idleRAF = 0; let lastIdle = 0;
    function idle(ts){
      if (state.running) { idleRAF = 0; return; }
      const dt = Math.min(0.033, (ts - lastIdle)/1000 || 0);
      lastIdle = ts;
      state.player.runPhase += dt * 2.5 * Math.PI * 2; // gentle pace
      draw();
      idleRAF = requestAnimationFrame(idle);
    }

    function reset() {
      state.cleared = 0; updateHud();
      state.speed = 220; state.speedMult = 1.0;
      state.gates = []; state.nextSpawnIn = 0.5 + RAND(0,0.4);
      state.deferBlankAfter = false;
      state.deferredFirstBrick = null;
      state.firstBrickSpawned = false;
      state.activeSemitones = null; state.activeGateId = null;
      state.player.y = state.groundY - state.player.h; state.player.vy = 0; state.player.onGround = true; state.player.jumpQueued=false;
      state.hitMarker = null;
      state.spawnedCount = 0;
      scoring.startNewRound();
      showOverlay('');
    }

    // Ensure the AudioContext is created and unlocked from a direct user gesture
    function unlockAudioIfNeeded() {
      try {
        if (!audio || typeof audio.getAudioContext !== 'function') return;
        let ctx = audio.getAudioContext();
        // Lazily create the context if it doesn't exist yet
        if (!ctx && typeof audio.initializeAudio === 'function') {
          // initializeAudio is synchronous aside from returning a Promise,
          // so this will set audio.audioContext immediately.
          audio.initializeAudio();
          ctx = audio.getAudioContext();
        }
        // On many browsers, resume() must be invoked from a user gesture
        if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          ctx.resume().catch(() => {});
        }
      } catch (err) {
        // Failing to unlock audio should never break the game loop
        console.warn('[RunnerAudio] Failed to unlock audio context', err);
      }
    }

    function start() {
      // Unlock audio before the first interval cue so the initial pair
      // plays with the same timing behavior as subsequent intervals.
      unlockAudioIfNeeded();
      reset();
      state.running = true; state.paused = false;
      scoring.startNewSequence();
      // Snapshot current preferences on each start
      try {
        saveRunnerSettings({
          type: state.type,
          direction: state.direction,
          startMode: state.startMode,
          anchorMidi: state.anchorMidi,
          enabledIntervals: Array.from(state.enabledIntervals),
          timbre: $timbre ? $timbre.value : undefined,
        });
      } catch {}
      lastTs = performance.now();
      $pause.disabled = false;
      requestAnimationFrame(frame);
    }

    function pauseToggle() {
      if (!state.running) return;
      state.paused = !state.paused;
      if (state.paused) { scoring.pauseSequenceTimer(); showOverlay('Paused'); $pause.textContent = 'Resume'; }
      else { scoring.resumeSequenceTimer(); showOverlay(''); $pause.textContent = 'Pause'; }
    }

    if ($overlay) {
      $overlay.addEventListener('click', () => { if (!state.running) start(); });
      $overlay.addEventListener('keydown', (e) => {
        if (!state.running && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(); }
      });
    }
    // Also allow clicking the canvas to start
    $canvas.addEventListener('click', () => { if (!state.running) start(); });
    $pause.addEventListener('click', pauseToggle);

    // Core update
    function update(dt) {
      // Spawn logic
      state.nextSpawnIn -= dt;
      if (state.nextSpawnIn <= 0) {
        // spawn cadence tightens over time; adjust by game speed factor
        const speedFactor = getGameSpeedFactor();
        const baseRaw = CLAMP(1.2 - (state.cleared * 0.01), 0.55, 1.2);
        const base = baseRaw / speedFactor;
        const jitter = RAND(0.2, 0.7) / speedFactor;
        if (state.deferBlankAfter && state.cleared < 50) {
          // Produce a blank space after a brick wall when score < 50
          state.deferBlankAfter = false;
          state.nextSpawnIn = base + jitter; // skip this cycle — no spawn
        } else {
          spawnGate();
          state.nextSpawnIn = base + jitter;
        }
      }

      // Move gates (world speed)
      const speed = state.speed * state.speedMult * getGameSpeedFactor();
      state.gates.forEach(g => {
        g.x -= speed * dt;
        // Update crumble animation / fragments
        if (g.crumbling) {
          g.crumbleT = (g.crumbleT || 0) + dt * 2.6;
          if (Array.isArray(g.fragments)) {
            g.fragments.forEach(fr => { fr.x += fr.vx * dt; fr.y += fr.vy * dt; fr.vy += 900 * dt; });
          }
        }
      });
      // Remove off-screen
      state.gates = state.gates.filter(g => g.x + g.w > -40);

      // Cue: play interval as soon as the gate enters the screen, but only if still enabled
      // Also prune any newly disabled gates that slipped through
      state.gates = state.gates.filter(g => state.enabledIntervals.has(g.semitones) || g.cued || g.past);
      const cueGate = state.gates.find(g => !g.cued && state.enabledIntervals.has(g.semitones) && g.x <= $canvas.width && (g.x + g.w) > 0);
      if (cueGate) {
        cueGate.cued = true; state.activeSemitones = cueGate.semitones; state.activeGateId = cueGate.id; playInterval(cueGate);
      }

      // Player physics
      const p = state.player;
      p.vy += state.gravity * dt;
      p.y += p.vy * dt;
      if (p.y >= state.groundY - p.h) { p.y = state.groundY - p.h; p.vy = 0; p.onGround = true; }
      else { p.onGround = false; }
      // advance running animation phase (faster as speed ramps). When airborne, slow it slightly
      const baseHz = 6.0; // cycles per second at 1.0x
      const mult = p.onGround ? 1.0 : 0.6;
      state.player.runPhase += dt * baseHz * (0.85 + 0.3 * state.speedMult) * mult * Math.PI * 2;
      // Auto-jump if queued and we are approaching any answered brick
      if (p.onGround && p.jumpQueued) {
        const targetBrick = state.gates
          .filter(x => x.style === 'brick' && x.answeredCorrect && !x.cleared && (x.x + x.w) >= p.x)
          .sort((a,b) => a.x - b.x)[0];
        if (targetBrick && (targetBrick.x - p.x) < 60) doJump();
      }

      // Collision / clear detection
      for (const g of state.gates) {
        // For brick walls: if answered correctly and we're above the top while overlapping horizontally, mark cleared
        if (g.style === 'brick' && g.answeredCorrect && !g.cleared) {
          const overlapXNow = (g.x < p.x + p.w) && (g.x + g.w > p.x);
          const aboveTop = (p.y + p.h) <= (state.groundY - g.h);
          if (overlapXNow && aboveTop) { g.cleared = true; }
        }
        // If passed player x fully, count as cleared only if g.cleared flag
        if (!g.past && g.x + g.w < p.x) {
          g.past = true;
          if (g.cleared) { onCleared(g); }
          else {
            const msg = (g.style === 'brick' && g.answeredCorrect)
              ? 'Jump timing off'
              : 'Missed interval';
            return gameOver(msg);
          }
        }
        // If overlapping horizontally near feet height, collision if not cleared
        const overlapX = (g.x < p.x + p.w) && (g.x + g.w > p.x);
        const overlapY = (p.y + p.h) > (state.groundY - g.h);
        if (overlapX && overlapY && !g.cleared) {
      const name = intervalLabelFor(g.semitones);
          state.hitMarker = { x: g.x, yTop: state.groundY - g.h, w: g.w, label: name };
          const msg = (g.style === 'brick' && g.answeredCorrect)
            ? 'Jump timing off'
            : 'Hit obstacle';
          return gameOver(msg);
        }
      }
    }

    function onCleared(g) {
      state.cleared += 1; updateHud();
      // Gradually increase speed multiplier
      state.speedMult = CLAMP(1.0 + state.cleared * 0.015, 1.0, 2.2);
    }

    function getBestCleared() {
      try { return Number(localStorage.getItem('runnerBestCleared')) || 0; } catch { return 0; }
    }
    function setBestCleared(n) {
      try { localStorage.setItem('runnerBestCleared', String(n)); } catch {}
    }
    function updateHud() {
      const c = document.getElementById('cleared'); if (c) c.textContent = String(state.cleared);
      const s = document.getElementById('speed'); if (s) s.textContent = (state.speedMult * getGameSpeedFactor()).toFixed(1) + 'x';
      const b = document.getElementById('best'); if (b) b.textContent = String(getBestCleared());
    }

    function draw() {
      const w = $canvas.width, h = $canvas.height;
      ctx.clearRect(0,0,w,h);
      // Sky
      ctx.fillStyle = '#a7d8ff'; // light sky blue
      ctx.fillRect(0, 0, w, state.groundY);
      // Ground (grass)
      const grassTopH = 6;
      const grassTop = ctx.createLinearGradient(0, state.groundY - grassTopH, 0, state.groundY);
      grassTop.addColorStop(0, '#3bc063'); // bright tip
      grassTop.addColorStop(1, '#2aa555'); // base
      ctx.fillStyle = grassTop; ctx.fillRect(0, state.groundY - grassTopH, w, grassTopH);
      const grassBody = ctx.createLinearGradient(0, state.groundY, 0, h);
      grassBody.addColorStop(0, '#1f7a3e');
      grassBody.addColorStop(1, '#145c2c');
      ctx.fillStyle = grassBody; ctx.fillRect(0, state.groundY, w, h - state.groundY);
      // Simple blades along the top edge
      ctx.fillStyle = '#1a6d36';
      for (let x = 0; x < w; x += 12) {
        const k = (x * 37) % 9; // deterministic variation
        const bh = 3 + (k % 6); // blade height 3..8
        ctx.beginPath();
        ctx.moveTo(x, state.groundY);
        ctx.lineTo(x + 4, state.groundY);
        ctx.lineTo(x + 2, state.groundY - bh);
        ctx.closePath();
        ctx.fill();
      }
      // Player
      const p = state.player;
      drawPlayer(ctx, p, state);

      // Gates
      state.gates.forEach(g => drawGate(g));

      // Draw interval label above the last hit obstacle (if any)
      if (state.hitMarker) {
        const { x, yTop, w, label } = state.hitMarker;
        drawIntervalLabel(x + w/2, yTop - 10, label);
      }
    }

    function roundedRect(c, x,y,w,h,r) {
      c.beginPath();
      c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
      c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
      c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
    }

    // Draw the runner as an ear with sunglasses and animated legs
    function drawPlayer(c, p, state) {
      const phase = state.player.runPhase;
      const gnd = state.groundY;
      // Draw body first, then legs on top so legs are always visible
      if (spriteImg && spriteReady) {
        // Draw provided sprite larger than the player box while keeping leg size constant.
        // Anchor the bottom of the sprite to the player's feet so alignment looks natural.
        const scale = spriteScale || 1.0;
        const destW = (p.w + 4) * scale;
        const destH = (p.h + 4) * scale;
        const dx = p.x - 2 + (p.w + 4 - destW) / 2; // center horizontally over player
        const dy = p.y - 2 + (p.h + 4 - destH);     // bottom-align to feet
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(spriteImg, dx, dy, destW, destH);
        c.restore();
      } else {
        // fallback vector ear + glasses
        drawEarBody(c, p);
        if (state.showGlasses) drawSunglasses(c, p);
      }
      if (state.useProceduralLegs) drawLegs(c, p, gnd, phase, state);
    }

    function drawLegs(c, p, groundY, phase, state) {
      // Stable ground-anchored rig with body-lift offset so legs jump with the sprite.
      const hipX = p.x + p.w * 0.50;
      const legLen = 24;
      const baseHipY = groundY - legLen - 6; // where hips sit when on ground
      const bodyLift = Math.max(0, (groundY - p.h) - p.y); // 0 on ground, >0 when jumping
      const hipY = baseHipY - bodyLift;
      const stepA = Math.sin(phase);
      const stepB = Math.sin(phase + Math.PI);
      const stride = 12;
      const lift = 8;

      const legs = [
        { t: stepA, color: '#0e222f' },
        { t: stepB, color: '#152a39' },
      ];
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = 5;
      legs.forEach((leg) => {
        const t = leg.t;
        const kneeX = hipX + t * 5;
        const kneeY = hipY + 10 + Math.max(0, -t) * lift;
        const footX = hipX + t * stride;
        // Feet rest on ground; when jumping, shift up by bodyLift
        const footGround = groundY - 2;
        const footY = Math.min(footGround, footGround - bodyLift);

        c.strokeStyle = leg.color;
        // Thigh
        c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(kneeX, kneeY); c.stroke();
        // Shin
        c.beginPath(); c.moveTo(kneeX, kneeY); c.lineTo(footX, footY - 2); c.stroke();
        // Shoe
        c.fillStyle = '#4aa8ff';
        c.beginPath(); c.ellipse(footX, footY, 9.0, 3.8, 0, 0, TWO_PI); c.fill();
        c.strokeStyle = '#0b4ea3'; c.lineWidth = 1.4; c.stroke();
        c.lineWidth = 5;
      });
    }

    function drawEarBody(c, p) {
      const x = p.x, y = p.y, w = p.w, h = p.h;
      c.save();
      // gradient fill for more depth
      const grad = c.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#f8d1b3');
      grad.addColorStop(1, '#e3ad8a');
      c.fillStyle = grad;
      c.strokeStyle = '#c68f6f';
      c.lineWidth = 1.6;

      // Outer helix/lobe silhouette with distinct notch near the tragus
      c.beginPath();
      c.moveTo(x + 0.40*w, y + 0.06*h);                    // upper inner start
      c.quadraticCurveTo(x + 0.96*w, y + 0.08*h, x + 0.95*w, y + 0.42*h);   // top bulge
      c.quadraticCurveTo(x + 0.94*w, y + 0.90*h, x + 0.54*w, y + 0.98*h);   // lobe
      c.quadraticCurveTo(x + 0.24*w, y + 0.95*h, x + 0.18*w, y + 0.60*h);   // back edge
      c.quadraticCurveTo(x + 0.16*w, y + 0.38*h, x + 0.28*w, y + 0.30*h);   // rise to notch
      c.quadraticCurveTo(x + 0.36*w, y + 0.27*h, x + 0.36*w, y + 0.33*h);
      c.quadraticCurveTo(x + 0.33*w, y + 0.50*h, x + 0.44*w, y + 0.48*h);   // notch inward
      c.quadraticCurveTo(x + 0.48*w, y + 0.46*h, x + 0.40*w, y + 0.06*h);   // close towards start
      c.closePath(); c.fill(); c.stroke();

      // Inner helix trace (rim inside the outer edge)
      c.strokeStyle = '#deae8f'; c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x + 0.64*w, y + 0.20*h);
      c.quadraticCurveTo(x + 0.82*w, y + 0.34*h, x + 0.64*w, y + 0.60*h);
      c.quadraticCurveTo(x + 0.50*w, y + 0.78*h, x + 0.40*w, y + 0.70*h);
      c.stroke();

      // Antihelix (Y-shape)
      c.beginPath();
      c.moveTo(x + 0.52*w, y + 0.44*h);
      c.quadraticCurveTo(x + 0.60*w, y + 0.50*h, x + 0.48*w, y + 0.66*h);
      c.moveTo(x + 0.52*w, y + 0.44*h);
      c.quadraticCurveTo(x + 0.56*w, y + 0.40*h, x + 0.58*w, y + 0.34*h);
      c.stroke();

      // Tragus accent
      c.beginPath();
      c.moveTo(x + 0.38*w, y + 0.54*h);
      c.quadraticCurveTo(x + 0.34*w, y + 0.50*h, x + 0.38*w, y + 0.46*h);
      c.stroke();

      // Ear canal shadow for readability
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.beginPath(); c.ellipse(x + 0.50*w, y + 0.56*h, 0.07*w, 0.05*h, 0, 0, TWO_PI); c.fill();

      c.restore();
    }

    function drawSunglasses(c, p) {
      const x = p.x, y = p.y, w = p.w, h = p.h;
      const bridgeY = y + 0.33*h;
      const lensW = 0.24*w, lensH = 0.18*h, r = 2.5;
      c.save();
      // strap
      c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 0.08*w, bridgeY); c.lineTo(x + 0.92*w, bridgeY); c.stroke();
      // left lens
      c.fillStyle = '#0b0e12';
      roundedRect(c, x + 0.22*w, bridgeY - lensH/2, lensW, lensH, r); c.fill();
      // right lens (slightly overlapping the edge for style)
      roundedRect(c, x + 0.22*w + lensW + 4, bridgeY - lensH/2, lensW, lensH, r); c.fill();
      // small highlight
      c.fillStyle = 'rgba(255,255,255,0.14)';
      c.beginPath(); c.ellipse(x + 0.22*w + 6, bridgeY - 2, 4, 2, -0.6, 0, TWO_PI); c.fill();
      c.restore();
    }

    function drawGate(g) {
      const baseY = state.groundY;
      if (g.style === 'greek') {
        drawGreekColumn(g, baseY);
      } else if (g.style === 'brick') {
        drawBrickWall(g, baseY);
      } else {
        // default to greek to honor "only columns or brick walls"
        drawGreekColumn(g, baseY);
      }
      // cleared tint overlay for both types
      if (g.cleared) { ctx.fillStyle = 'rgba(91,213,151,0.35)'; ctx.fillRect(g.x, baseY - g.h, g.w, g.h); }
    }

    function drawGreekColumn(g, baseY) {
      const x = g.x; const w = g.w; const h0 = g.h; let h = h0; let y;
      const f = Math.min(1, Math.max(0, g.crumbleT || 0));
      if (f > 0) {
        // shrink visible height as it crumbles
        h = Math.max(0, h0 * (1 - f * 1.1));
      }
      y = baseY - h;
      const capH = Math.max(6, Math.round(h * 0.18));
      const baseH = Math.max(6, Math.round(h * 0.18));
      const shaftH = Math.max(6, h - capH - baseH);
      const shaftY = y + capH;

      // Column base (plinth)
      const baseGrad = ctx.createLinearGradient(x, baseY - baseH, x, baseY);
      baseGrad.addColorStop(0, '#bfc6cc');
      baseGrad.addColorStop(1, '#aeb5ba');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(x, baseY - baseH, w, baseH);

      // Shaft background
      const shaftGrad = ctx.createLinearGradient(x, shaftY, x + w, shaftY);
      shaftGrad.addColorStop(0, '#e5e8ea');
      shaftGrad.addColorStop(0.5, '#f4f6f7');
      shaftGrad.addColorStop(1, '#d6dbdf');
      ctx.fillStyle = shaftGrad;
      ctx.fillRect(x, shaftY, w, shaftH);

      // Flutes (vertical grooves)
      const inset = 3;
      const fluteSpan = Math.max(4, w - inset * 2);
      const fluteCount = Math.max(3, Math.floor(fluteSpan / 3));
      const spacing = fluteSpan / (fluteCount + 1);
      for (let i = 1; i <= fluteCount; i++) {
        const fx = Math.round(x + inset + i * spacing);
        // shadow
        ctx.strokeStyle = 'rgba(160,168,176,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx, shaftY + 1); ctx.lineTo(fx, shaftY + shaftH - 1); ctx.stroke();
        // highlight slightly to the right
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.moveTo(fx + 1, shaftY + 1); ctx.lineTo(fx + 1, shaftY + shaftH - 1); ctx.stroke();
      }

      // Capital (simple Doric: echinus + abacus)
      const capY = y;
      // Echinus (curved look using rounded rect)
      ctx.fillStyle = '#cdd3d8';
      roundedRect(ctx, x - 1, capY + 1, w + 2, Math.max(4, capH - 3), 3); ctx.fill();
      // Abacus (top slab)
      ctx.fillStyle = '#b7bec4';
      ctx.fillRect(x - 2, capY - 4, w + 4, 4);

      // Debris pieces if crumbling
      if (f > 0 && Array.isArray(g.fragments)) {
        g.fragments.forEach(fr => {
          ctx.fillStyle = fr.color;
          ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
        });
      }
    }

    function drawIntervalLabel(cx, cy, text) {
      if (!text) return;
      ctx.save();
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const padX = 6, padY = 4;
      const metrics = ctx.measureText(text);
      const tw = metrics.width;
      const th = 16; // approx line height
      const rx = cx - tw/2 - padX;
      const ry = cy - th - padY;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundedRect(ctx, rx, ry, tw + padX*2, th + padY*2, 6); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, cx, cy - 4);
      ctx.restore();
    }

    function drawBrickWall(g, baseY) {
      const x = g.x; const w = g.w; const h = g.h; const y = baseY - h;
      // Base wall fill with slight vertical gradient
      const grad = ctx.createLinearGradient(0, y, 0, baseY);
      grad.addColorStop(0, '#c55340');
      grad.addColorStop(1, '#a84436');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      // Mortar pattern
      const brickH = 6;            // brick row height
      const brickW = 10;           // nominal brick width
      ctx.fillStyle = '#e9e4da';   // mortar color
      // Horizontal mortar lines
      for (let yy = y; yy <= baseY; yy += brickH) {
        ctx.fillRect(x, Math.round(yy), w, 1);
      }
      // Vertical mortar lines (staggered every other row)
      let row = 0;
      for (let yy = y; yy < baseY; yy += brickH) {
        const offset = (row % 2 === 0) ? 0 : Math.floor(brickW / 2);
        for (let xx = x + offset; xx < x + w; xx += brickW) {
          ctx.fillRect(Math.round(xx), Math.round(yy), 1, Math.min(brickH, baseY - yy));
        }
        row++;
      }
      // Slight bevel on edges
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + w - 1, y, 1, h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, 1, h);
    }

    function chooseDirection() {
      if (state.direction === 'up' || state.direction === 'down') return state.direction;
      return Math.random() < 0.5 ? 'up' : 'down';
    }

    function pickRoot(rangeLo=55, rangeHi=90) { // G3..F#6 default
      const lo = Math.min(rangeLo, rangeHi); const hi = Math.max(rangeLo, rangeHi);
      return Math.floor(lo + Math.random() * (hi - lo + 1));
    }

    function computeOther(rootMidi, semitones, direction) {
      // Assume callers have constrained root so the result is in-bounds; do not clamp here
      const delta = direction === 'down' ? -semitones : semitones;
      return rootMidi + delta;
    }

    function parseNoteToMidi(noteStr) {
      try {
        if (!noteStr) return null;
        const n = noteStr.trim();
        if (!n) return null;
        if (theory && typeof theory.noteToSemitone === 'function') {
          const v = theory.noteToSemitone(n);
          return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
        }
        return null;
      } catch { return null; }
    }

    function getEnabledSemis() { return Array.from(state.enabledIntervals); }
    function pickEnabledSemi() {
      const pool = getEnabledSemis();
      if (!pool.length) {
        const idx = Math.floor(Math.random() * INTERVAL_VALUE_LIST.length);
        return INTERVAL_VALUE_LIST[idx];
      }
      return pool[Math.floor(Math.random()*pool.length)];
    }

    function pickDirectionFitting(anchorMidi, semi) {
      const lo = 48, hi = 96;
      if (state.direction === 'up') return (anchorMidi + semi) <= hi ? 'up' : null;
      if (state.direction === 'down') return (anchorMidi - semi) >= lo ? 'down' : null;
      const canUp = (anchorMidi + semi) <= hi;
      const canDown = (anchorMidi - semi) >= lo;
      if (canUp && canDown) return Math.random()<0.5 ? 'up' : 'down';
      if (canUp) return 'up';
      if (canDown) return 'down';
      return null;
    }

    function shuffled(arr) { return arr.slice().sort(() => Math.random() - 0.5); }

    // In anchored (fixed root) mode, avoid repeating the same (interval,direction)
    // consecutively when possible, given bounds and enabled intervals.
    function pickAnchoredPairAvoidRepeat(anchorMidi) {
      const lo = 48, hi = 96;
      const pool = getEnabledSemis();
      if (!pool.length) return null;
      const last = state.lastAnchoredPair;

      function allowedDirsFor(semi) {
        const dirs = [];
        const upOK = (anchorMidi + semi) <= hi;
        const downOK = (anchorMidi - semi) >= lo;
        if (state.direction === 'up') return upOK ? ['up'] : [];
        if (state.direction === 'down') return downOK ? ['down'] : [];
        if (upOK) dirs.push('up'); if (downOK) dirs.push('down');
        return dirs;
      }

      // First pass: exclude last pair
      const semiOrder = shuffled(pool);
      for (const s of semiOrder) {
        const dirOrder = shuffled(allowedDirsFor(s));
        for (const d of dirOrder) {
          if (last && last.s === s && last.d === d) continue; // avoid immediate repeat
          const other = anchorMidi + (d === 'down' ? -s : s);
          if (other >= lo && other <= hi) return { s, d, o: other };
        }
      }

      // Second pass: allow last pair if nothing else fits
      for (const s of semiOrder) {
        const dirOrder = shuffled(allowedDirsFor(s));
        for (const d of dirOrder) {
          const other = anchorMidi + (d === 'down' ? -s : s);
          if (other >= lo && other <= hi) return { s, d, o: other };
        }
      }
      return null;
    }

    function spawnGate() {
      // If we deferred the first brick to insert a blank, spawn it now
      if (state.deferredFirstBrick && !state.firstBrickSpawned) {
        const spec = state.deferredFirstBrick; state.deferredFirstBrick = null;
        const id = Math.random().toString(36).slice(2);
        const style = 'brick'; const w = 26;
        const { semitones, dir, root, other } = spec;
        const gate = { id, x: $canvas.width + 30, w, h: 36, style, cued: false, cleared: false, past: false, semitones, dir, root, other };
        state.gates.push(gate);
        state.spawnedCount += 1;
        state.firstBrickSpawned = true;
        if (state.cleared < 50) state.deferBlankAfter = true;
        if (state.startMode === 'anchored') state.lastAnchoredPair = { s: semitones, d: dir };
        return;
      }

      let semitones = pickEnabledSemi();
      let dir = chooseDirection();
      let root = pickRoot(55, 76);
      let other = computeOther(root, semitones, dir);

      if (state.startMode === 'anchored') {
        if (state.anchorMidi == null) state.anchorMidi = parseNoteToMidi(state.anchorNote) ?? parseNoteToMidi('C4');
        const anchor = state.anchorMidi ?? 60; // C4 fallback
        // Prefer a pair different from the last one; fall back if no alternative fits
        const picked = pickAnchoredPairAvoidRepeat(anchor);
        if (picked) {
          semitones = picked.s; dir = picked.d; root = anchor; other = picked.o;
          // Safety guard
          const hi = 96, lo = 48;
          if (other < lo || other > hi) {
            other = computeOther(root, semitones, dir);
          }
        } else {
          console.warn('[RunnerSpawn] Anchor constraints produced no valid gate; falling back to chromatic.', { anchor: state.anchorNote, anchorMidi: state.anchorMidi });
          semitones = pickEnabledSemi(); dir = chooseDirection();
          const hi = 96, lo = 48;
          let loPref = 55, hiPref = 76;
          if (dir === 'up') hiPref = Math.min(hiPref, hi - semitones);
          if (dir === 'down') loPref = Math.max(loPref, lo + semitones);
          if (hiPref < loPref) { loPref = lo + semitones; hiPref = hi - semitones; }
          root = pickRoot(loPref, hiPref);
          other = computeOther(root, semitones, dir);
        }
      } else {
        // Chromatic with enabled set; bias root so other stays in bounds
        semitones = pickEnabledSemi(); dir = chooseDirection();
        const hi = 96, lo = 48;
        let loPref = 55, hiPref = 76;
        if (dir === 'up') hiPref = Math.min(hiPref, hi - semitones);
        if (dir === 'down') loPref = Math.max(loPref, lo + semitones);
        if (hiPref < loPref) { loPref = lo + semitones; hiPref = hi - semitones; }
        root = pickRoot(loPref, hiPref);
        other = computeOther(root, semitones, dir);
        // Safety: if still out of bounds for any reason, correct deterministically
        if (other < lo) { root = lo + semitones; other = root - semitones; }
        if (other > hi) { root = hi - semitones; other = root + semitones; }
      }

      const id = Math.random().toString(36).slice(2);
      // Only columns or brick walls. Ensure the run starts with 10 columns (no early brick walls).
      let style;
      if (state.spawnedCount < 10) {
        style = 'greek';
      } else {
        style = Math.random() < 0.5 ? 'greek' : 'brick';
      }
      // If this would be the first brick in the run, defer it and insert a blank this cycle
      if (style === 'brick' && !state.firstBrickSpawned) {
        state.deferredFirstBrick = { semitones, dir, root, other };
        return; // create blank before first brick
      }
      const w = style === 'greek' ? 22 : 26;
      const gate = { id, x: $canvas.width + 30, w, h: 36, style, cued: false, cleared: false, past: false, semitones, dir, root, other };
      state.gates.push(gate);
      // Spacing rule: if score < 50 and three brick walls would be consecutive,
      // remove the middle one; if the middle has already been cued, convert the new
      // one to a column instead (to avoid removing a cued obstacle).
      if (state.cleared < 50) {
        const upcoming = state.gates.filter(g => !g.past).sort((a,b)=> a.x - b.x);
        if (upcoming.length >= 3) {
          const a = upcoming[upcoming.length - 3];
          const b = upcoming[upcoming.length - 2];
          const c = upcoming[upcoming.length - 1];
          if (a.style === 'brick' && b.style === 'brick' && c.style === 'brick') {
            if (!b.cued) {
              // Remove the middle brick entirely
              state.gates = state.gates.filter(g => g !== b);
            } else {
              // Middle already cued: convert the newly spawned one to a column instead
              gate.style = 'greek';
              gate.w = 22;
            }
          }
        }
      }
      // After each brick wall, schedule a blank spawn on the next cycle while under 50
      if (gate.style === 'brick') {
        state.firstBrickSpawned = true;
        if (state.cleared < 50) state.deferBlankAfter = true;
      }
      // Remember last anchored pair so we can avoid immediate repeats next time
      if (state.startMode === 'anchored') {
        state.lastAnchoredPair = { s: semitones, d: dir };
      }
      state.spawnedCount += 1;
    }

    async function playInterval(gate) {
      const toNote = (m) => theory?.semitoneToNote ? theory.semitoneToNote(m) : null;
      const midiToHz = (m) => (typeof m === 'number' && Number.isFinite(m)) ? 440 * Math.pow(2, (m - 69) / 12) : undefined;
      const fmt = (x) => (typeof x === 'number' && Number.isFinite(x)) ? x.toFixed(2) + 'Hz' : '—';
      try {
        const a = toNote(gate.root), b = toNote(gate.other);
        // Derive freqs directly from MIDI to avoid parsing/naming issues
        let fa = midiToHz(gate.root);
        let fb = midiToHz(gate.other);
        // Sanity: ensure the interval size matches the declared semitones; if not, correct 'other'
        const diff = (typeof gate.root === 'number' && typeof gate.other === 'number') ? Math.abs(gate.other - gate.root) : null;
        if (diff !== null && diff !== gate.semitones) {
          const adjustedOther = gate.root + (gate.dir === 'down' ? -gate.semitones : gate.semitones);
          fb = midiToHz(adjustedOther);
          // Also patch the gate so subsequent logic is consistent
          gate.other = adjustedOther;
        }
        // Log exactly when the cue fires
        const name = intervalLabelFor(gate.semitones);
        console.log(
          `[RunnerCue] id=${gate.id} type=${state.type} dir=${gate.dir} semitones=${gate.semitones}(${name})` +
          ` notes=${a || '?'}→${b || '?'} freqs=${fmt(fa)}→${fmt(fb)}`
        );
        // Don’t require note-name mapping to exist, as we play from MIDI
        scoring.pauseSequenceTimer?.();
        if (state.type === 'harmonic') {
          const f = [fa, fb].filter(x => typeof x === 'number' && Number.isFinite(x));
          if (!f.length) {
            console.warn('[RunnerCue] No valid frequencies for harmonic cue', { a, b, fa, fb });
          }
          if (f.length) await audio.playChord(f, 0.7);
        } else {
          const freqs = [];
          if (!(typeof fa === 'number' && Number.isFinite(fa))) {
            console.warn('[RunnerCue] Invalid first frequency', { a, fa });
          } else {
            freqs.push(fa);
          }
          if (!(typeof fb === 'number' && Number.isFinite(fb))) {
            console.warn('[RunnerCue] Invalid second frequency', { b, fb });
          } else {
            freqs.push(fb);
          }
          if (freqs.length) {
            if (typeof audio.playToneSequence === 'function') {
              // Slightly tighter than the original 140ms gap
              await audio.playToneSequence(freqs, 0.55, 0.12);
            } else {
              // Fallback: preserve previous behavior if sequence helper is unavailable
              if (freqs[0] != null) {
                await audio.playTone(freqs[0], 0.55);
              }
              if (freqs.length > 1) {
                await new Promise(r => setTimeout(r, 120));
                await audio.playTone(freqs[1], 0.55);
              }
            }
          }
        }
      } catch (err) {
        console.error('[RunnerCue] Failed to play interval', err);
      } finally {
        scoring.resumeSequenceTimer?.();
      }
    }

    function doJump() {
      const p = state.player;
      if (p.onGround) { p.onGround = false; p.vy = -620; p.jumpQueued = false; }
    }

    function handleChoose(n, btn) {
      if (!state.running || state.paused) return;
      // Find the nearest upcoming, answerable gate in front of player
      const p = state.player;
      const candidates = state.gates
        .filter(g => (g.x + g.w) >= p.x)
        .sort((a,b)=> a.x - b.x);
      let upcoming = null;
      for (const g of candidates) {
        // Pop columns that have already been correctly answered (crumbling/cleared)
        if (g.consumed || (g.style === 'greek' && g.cleared)) continue;
        // Skip brick walls that were already answered correctly; they still require a jump,
        // but should not consume another interval input.
        if (g.style === 'brick' && g.answeredCorrect) continue;
        upcoming = g; break;
      }
      if (!upcoming) return;

      // Visual button state
      const all = Array.from($choices.querySelectorAll('.interval-choice'));
      all.forEach(b => { b.classList.remove('is-selected','is-correct','is-wrong'); b.setAttribute('aria-checked','false'); });
      btn.classList.add('is-selected'); btn.setAttribute('aria-checked','true');

      const correct = (n === upcoming.semitones);
      if (correct) {
        btn.classList.add('is-correct');
        state.activeGateId = upcoming.id; state.activeSemitones = n;
        if (upcoming.style === 'greek') {
          // Columns crumble immediately; no jump required
          upcoming.cleared = true;
          upcoming.crumbling = true; upcoming.crumbleT = 0;
          // Mark as consumed for input targeting so the next selection aims at the next gate
          // while allowing the crumble animation to continue visually.
          upcoming.consumed = true;
          if (!upcoming.fragments) {
            upcoming.fragments = [];
            const baseY = state.groundY; const yTop = baseY - upcoming.h;
            for (let i=0;i<8;i++) {
              const fw = 2 + Math.random()*3, fh = 2 + Math.random()*3;
              const fx = upcoming.x + Math.random()*upcoming.w;
              const fy = yTop + Math.random()*(upcoming.h*0.5);
              const vx = (Math.random()*2 - 1) * 40; const vy = -Math.random()*80;
              upcoming.fragments.push({ x: fx, y: fy, w: fw, h: fh, vx, vy, color: '#cfd6db' });
            }
          }
          // Do not cancel a queued jump for a previously answered brick
        } else {
          // Brick wall: must jump over; do not mark cleared yet
          upcoming.answeredCorrect = true;
          // Immediate jump on correct answer; if timed poorly, player will collide
          doJump();
          state.player.jumpQueued = false;
        }
      } else {
        btn.classList.add('is-wrong');
        // Always show the correct interval label above the obstacle we just answered for
        const name = intervalLabelFor(upcoming.semitones);
        state.hitMarker = { x: upcoming.x, yTop: state.groundY - upcoming.h, w: upcoming.w, label: name };
        gameOver('Wrong interval');
      }
    }

    function gameOver(reason) {
      state.running = false; state.paused = false; $pause.disabled = true; $pause.textContent = 'Pause';
      scoring.completeRound('intervals-runner','runner','melodic',1);
      const prevBest = getBestCleared();
      if (state.cleared > prevBest) setBestCleared(state.cleared);
      updateHud();
      const hitText = state.hitMarker?.label ? ` — ${state.hitMarker.label}` : '';
      showOverlay(`${reason}${hitText}. Game Over — Cleared ${state.cleared}`,'err');
      // restart idle loop for resting animation
      if (!idleRAF) requestAnimationFrame((t)=>{ lastIdle=t; idle(t); });
    }

    // Initial paint
    reset(); draw(); showOverlay('Click or tap anywhere to start');
    // kick off idle animation so legs move before start
    requestAnimationFrame((t)=>{ lastIdle = t; idle(t); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else { main(); }
})();
