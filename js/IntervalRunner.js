/* Interval Runner — endless side-scroller using interval recognition */
(function () {
  const INTERVAL_NAMES = { 1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'P8' };
  const TWO_PI = Math.PI * 2;
  const RAND = (min, max) => min + Math.random() * (max - min);
  const CLAMP = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function buildChoices(container, onChoose, allowedSet) {
    const order = [1,2,3,4,5,6,7,8,9,10,11,12];
    const allowed = allowedSet instanceof Set ? order.filter(n => allowedSet.has(n)) : order;
    container.textContent = '';
    allowed.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'control-btn ui-pill interval-choice';
      btn.textContent = INTERVAL_NAMES[n];
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
    const $start = document.getElementById('runnerStartBtn');
    const $pause = document.getElementById('runnerPauseBtn');
    const $settingsBtn = document.getElementById('runnerSettingsBtn');
    const $settingsPanel = document.getElementById('runnerSettingsPanel');
    const $type = document.getElementById('runnerType');
    const $dir = document.getElementById('runnerDirection');
    const $timbre = document.getElementById('runnerTimbre');
    const $startMode = document.getElementById('runnerStartMode');
    const $anchorSelect = document.getElementById('runnerAnchorSelect');
    const $intervalSet = document.getElementById('runnerIntervalSet');

    const ctx = $canvas.getContext('2d');
    let lastTs = 0;

    const state = {
      running: false,
      paused: false,
      cleared: 0,
      speed: 220, // px/s world speed
      speedMult: 1.0,
      gravity: 1700,
      groundY: $canvas.height - 42,
      player: { x: 90, y: 0, vy: 0, w: 26, h: 36, onGround: true, jumpQueued: false },
      gates: [],
      nextSpawnIn: 0, // seconds
      minSpawn: 1.5,
      maxSpawn: 2.7,
      cueDistance: 360, // play sound when within this x distance from player
      activeSemitones: null,
      activeGateId: null,
      type: 'melodic',
      direction: 'random',
      startMode: 'chromatic',
      anchorNote: 'C4',
      anchorMidi: null,
      enabledIntervals: new Set([1,2,3,4,5,6,7,8,9,10,11,12]),
    };

    // Populate timbres
    if ($timbre && typeof audio.getAvailableTimbres === 'function') {
      const opts = audio.getAvailableTimbres();
      $timbre.innerHTML = '';
      opts.forEach(({ id, label }) => {
        const o = document.createElement('option');
        o.value = id; o.textContent = label; if (id === audio.getCurrentTimbreId()) o.selected = true; $timbre.appendChild(o);
      });
      $timbre.addEventListener('change', () => audio.setTimbre($timbre.value));
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

    state.type = ($type?.value === 'harmonic') ? 'harmonic' : 'melodic';
    state.direction = ($dir?.value === 'up' || $dir?.value === 'down') ? $dir.value : 'random';
    state.startMode = ($startMode?.value === 'anchored') ? 'anchored' : 'chromatic';
    $type?.addEventListener('change', () => { state.type = ($type.value === 'harmonic') ? 'harmonic' : 'melodic'; });
    $dir?.addEventListener('change', () => { state.direction = ($dir.value === 'up' || $dir.value === 'down') ? $dir.value : 'random'; });
    $startMode?.addEventListener('change', () => { state.startMode = ($startMode.value === 'anchored') ? 'anchored' : 'chromatic'; });

    // Build interval choices (filtered to enabled set)
    function renderChoiceButtonsFromEnabled() {
      buildChoices($choices, handleChoose, state.enabledIntervals);
    }
    function filterPendingDisabledGates() {
      // Remove any upcoming, not-yet-cued gates that are now disabled
      state.gates = state.gates.filter(g => state.enabledIntervals.has(g.semitones) || g.cued || g.past);
    }
    renderChoiceButtonsFromEnabled();

    // Build interval enable toggles (m2..P8), defaults to enabled
    (function buildIntervalSet() {
      if (!$intervalSet) return;
      const labels = {1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'P8'};
      $intervalSet.textContent = '';
      for (let n=1; n<=12; n+=1) {
        const id = `runner-int-${n}`;
        const lab = document.createElement('label'); lab.setAttribute('for', id); lab.title = `Enable ${labels[n]}`;
        const cb = document.createElement('input'); cb.type='checkbox'; cb.id=id; cb.checked = true; cb.dataset.semitones=String(n);
        const span = document.createElement('span'); span.textContent = labels[n];
        cb.addEventListener('change', () => {
          if (cb.checked) state.enabledIntervals.add(n); else state.enabledIntervals.delete(n);
          if (state.enabledIntervals.size === 0) { state.enabledIntervals.add(n); cb.checked = true; }
          renderChoiceButtonsFromEnabled();
          filterPendingDisabledGates();
        });
        lab.appendChild(cb); lab.appendChild(span); $intervalSet.appendChild(lab);
      }
    })();

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
      // Default to C4 (60) if present
      const def = 60;
      const defOpt = $anchorSelect.querySelector(`option[value="${def}"]`);
      if (defOpt) defOpt.selected = true;
      state.anchorMidi = def;
      state.anchorNote = toNote(def) || 'C4';
      $anchorSelect.addEventListener('change', () => {
        const midi = Number($anchorSelect.value);
        if (Number.isFinite(midi)) {
          state.anchorMidi = midi;
          state.anchorNote = toNote(midi) || `MIDI ${midi}`;
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

    function reset() {
      state.cleared = 0; updateHud();
      state.speed = 220; state.speedMult = 1.0;
      state.gates = []; state.nextSpawnIn = 0.5 + RAND(0,0.4);
      state.activeSemitones = null; state.activeGateId = null;
      state.player.y = state.groundY - state.player.h; state.player.vy = 0; state.player.onGround = true; state.player.jumpQueued=false;
      scoring.startNewRound();
      showOverlay('');
    }

    function start() {
      reset();
      state.running = true; state.paused = false;
      scoring.startNewSequence();
      lastTs = performance.now();
      $pause.disabled = false; $start.textContent = 'Restart';
      requestAnimationFrame(frame);
    }

    function pauseToggle() {
      if (!state.running) return;
      state.paused = !state.paused;
      if (state.paused) { scoring.pauseSequenceTimer(); showOverlay('Paused'); $pause.textContent = 'Resume'; }
      else { scoring.resumeSequenceTimer(); showOverlay(''); $pause.textContent = 'Pause'; }
    }

    $start.addEventListener('click', start);
    if ($overlay) {
      $overlay.addEventListener('click', () => { if (!state.running) start(); });
      $overlay.addEventListener('keydown', (e) => {
        if (!state.running && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(); }
      });
    }
    $pause.addEventListener('click', pauseToggle);

    // Core update
    function update(dt) {
      // Spawn logic
      state.nextSpawnIn -= dt;
      if (state.nextSpawnIn <= 0) {
        spawnGate();
        // spawn cadence tightens over time
        const base = CLAMP(1.2 - (state.cleared * 0.01), 0.55, 1.2);
        const jitter = RAND(0.2, 0.7);
        state.nextSpawnIn = base + jitter;
      }

      // Move gates
      const speed = state.speed * state.speedMult;
      state.gates.forEach(g => { g.x -= speed * dt; });
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
      // Auto-jump if queued and close to active gate
      if (p.onGround && p.jumpQueued && state.activeGateId) {
        const g = state.gates.find(x => x.id === state.activeGateId);
        if (g && (g.x - p.x) < 60) doJump();
      }

      // Collision / clear detection
      for (const g of state.gates) {
        // If passed player x fully, count as cleared only if g.cleared flag
        if (!g.past && g.x + g.w < p.x) {
          g.past = true;
          if (g.cleared) { onCleared(g); }
          else { return gameOver('Missed interval'); }
        }
        // If overlapping horizontally near feet height, collision if not cleared
        const overlapX = (g.x < p.x + p.w) && (g.x + g.w > p.x);
        const overlapY = (p.y + p.h) > (state.groundY - g.h);
        if (overlapX && overlapY && !g.cleared) {
          return gameOver('Hit obstacle');
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
      const s = document.getElementById('speed'); if (s) s.textContent = (state.speedMult).toFixed(1) + 'x';
      const b = document.getElementById('best'); if (b) b.textContent = String(getBestCleared());
    }

    function draw() {
      const w = $canvas.width, h = $canvas.height;
      ctx.clearRect(0,0,w,h);
      // Ground
      ctx.fillStyle = '#173141'; ctx.fillRect(0, state.groundY, w, 4);
      ctx.fillStyle = '#0d2230'; ctx.fillRect(0, state.groundY+4, w, h - state.groundY - 4);
      // Player
      const p = state.player;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundedRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fill();
      // simple face
      ctx.fillStyle = '#0a0f1a'; ctx.beginPath(); ctx.arc(p.x + p.w*0.65, p.y + p.h*0.35, 2.2, 0, TWO_PI); ctx.fill();

      // Gates
      state.gates.forEach(g => drawGate(g));
    }

    function roundedRect(c, x,y,w,h,r) {
      c.beginPath();
      c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
      c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
      c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
    }

    function drawGate(g) {
      const baseY = state.groundY;
      // post
      ctx.fillStyle = 'rgba(136,170,255,0.8)';
      ctx.fillRect(g.x, baseY - g.h, g.w, g.h);
      // top cap (no interval text — purely visual)
      ctx.fillStyle = 'rgba(90,120,200,0.6)';
      roundedRect(ctx, g.x - 2, baseY - g.h - 10, g.w + 4, 8, 4); ctx.fill();
      // cleared tint
      if (g.cleared) { ctx.fillStyle = 'rgba(91,213,151,0.35)'; ctx.fillRect(g.x, baseY - g.h, g.w, g.h); }
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
      const delta = direction === 'down' ? -semitones : semitones; return CLAMP(rootMidi + delta, 48, 96);
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
      if (!pool.length) return Math.floor(Math.random()*12)+1;
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

    function spawnGate() {
      let semitones = pickEnabledSemi();
      let dir = chooseDirection();
      let root = pickRoot(55, 76);
      let other = computeOther(root, semitones, dir);

      if (state.startMode === 'anchored') {
        if (state.anchorMidi == null) state.anchorMidi = parseNoteToMidi(state.anchorNote) ?? parseNoteToMidi('C4');
        const anchor = state.anchorMidi ?? 60; // C4 fallback
        // Try to find a fit compatible with bounds
        let picked = null;
        const attempts = 30;
        for (let i=0; i<attempts; i+=1) {
          const s = pickEnabledSemi();
          const d = pickDirectionFitting(anchor, s);
          if (!d) continue;
          const o = anchor + (d === 'down' ? -s : s);
          if (o >= 48 && o <= 96) { picked = { s, d, o }; break; }
        }
        if (picked) {
          semitones = picked.s; dir = picked.d; root = anchor; other = picked.o;
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
      }

      const id = Math.random().toString(36).slice(2);
      state.gates.push({ id, x: $canvas.width + 30, w: 18, h: 36, cued: false, cleared: false, past: false, semitones, dir, root, other });
    }

    async function playInterval(gate) {
      const toNote = (m) => theory?.semitoneToNote ? theory.semitoneToNote(m) : null;
      const toFreq = (n) => theory?.getNoteFrequency ? theory.getNoteFrequency(n) : null;
      const fmt = (x) => (typeof x === 'number' && Number.isFinite(x)) ? x.toFixed(2) + 'Hz' : '—';
      try {
        const a = toNote(gate.root), b = toNote(gate.other);
        const fa = a ? toFreq(a) : undefined;
        const fb = b ? toFreq(b) : undefined;
        // Log exactly when the cue fires
        const name = INTERVAL_NAMES[gate.semitones] || `${gate.semitones}`;
        console.log(
          `[RunnerCue] id=${gate.id} type=${state.type} dir=${gate.dir} semitones=${gate.semitones}(${name})` +
          ` notes=${a || '?'}→${b || '?'} freqs=${fmt(fa)}→${fmt(fb)}`
        );
        if (!a || !b) {
          console.warn('[RunnerCue] Missing note for cue', { gate, a, b });
          return;
        }
        scoring.pauseSequenceTimer?.();
        if (state.type === 'harmonic') {
          const f = [fa, fb].filter(x => typeof x === 'number' && Number.isFinite(x));
          if (!f.length) {
            console.warn('[RunnerCue] No valid frequencies for harmonic cue', { a, b, fa, fb });
          }
          if (f.length) await audio.playChord(f, 0.7);
        } else {
          if (!(typeof fa === 'number' && Number.isFinite(fa))) {
            console.warn('[RunnerCue] Invalid first frequency', { a, fa });
          } else {
            await audio.playTone(fa, 0.55);
          }
          await new Promise(r => setTimeout(r, 140));
          if (!(typeof fb === 'number' && Number.isFinite(fb))) {
            console.warn('[RunnerCue] Invalid second frequency', { b, fb });
          } else {
            await audio.playTone(fb, 0.55);
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
      // Find the nearest upcoming gate in front of player
      const p = state.player;
      const upcoming = state.gates.filter(g => (g.x + g.w) >= p.x).sort((a,b)=> a.x-b.x)[0];
      if (!upcoming) return;

      // Visual button state
      const all = Array.from($choices.querySelectorAll('.interval-choice'));
      all.forEach(b => { b.classList.remove('is-selected','is-correct','is-wrong'); b.setAttribute('aria-checked','false'); });
      btn.classList.add('is-selected'); btn.setAttribute('aria-checked','true');

      const correct = (n === upcoming.semitones);
      if (correct) {
        btn.classList.add('is-correct');
        // mark gate cleared and queue jump
        upcoming.cleared = true;
        state.activeGateId = upcoming.id; state.activeSemitones = n;
        state.player.jumpQueued = true; doJump();
      } else {
        btn.classList.add('is-wrong');
        gameOver('Wrong interval');
      }
    }

    function gameOver(reason) {
      state.running = false; state.paused = false; $pause.disabled = true; $pause.textContent = 'Pause';
      scoring.completeRound('intervals-runner','runner','melodic',1);
      const prevBest = getBestCleared();
      if (state.cleared > prevBest) setBestCleared(state.cleared);
      updateHud();
      showOverlay(`${reason}. Game Over — Cleared ${state.cleared}`,'err');
    }

    // Initial paint
    reset(); draw(); showOverlay('Press Start to run');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else { main(); }
})();
