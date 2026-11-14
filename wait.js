// Wartespiele: Hub mit 3 kleinen Spielen fuer die Wartezeit. Alles Eigenbau, keine fremden Figuren.
const WAITG = (() => {
  let ov = null, stop = null; const img = new Image(); img.src = 'badges/00_ralf.png';
  const best = (k, v) => { try { const o = JSON.parse(localStorage.getItem('ggg_best') || '{}'); if (v != null && (o[k] == null || v > o[k])) { o[k] = v; localStorage.setItem('ggg_best', JSON.stringify(o)); } return o[k] || 0; } catch { return 0; } };
  function close() { if (stop) { stop(); stop = null; } if (ov) { ov.remove(); ov = null; } }
  function menu() {
    if (stop) { stop(); stop = null; }
    ov.innerHTML = `<div class="wgbar"><b>WARTESPIELE</b><button id="wgx">ZURÜCK ZUR APP</button></div><div class="wgbody">
      <button class="big green" data-g="mario">1. RALLUM-LAUF (Jump'n'Run, Level mit 5 Pits)</button>
      <button class="big sec" data-g="flap">2. FLATTER-RALLUM (tippen, Kegeln ausweichen)</button>
      <button class="big sec" data-g="tap">3. BIERDECKEL-TAPPER (15 Sekunden)</button>
      <p class="small center">Rekorde: Lauf ${best('mario') ? best('mario') + ' Münzen' : '-'} · Flattern ${best('flap')} · Tapper ${best('tap')}</p></div>`;
    ov.querySelector('#wgx').onclick = close;
    ov.querySelectorAll('[data-g]').forEach(b => b.onclick = () => ({ mario, flap, tap })[b.dataset.g]());
  }
  function shell(title) {
    ov.innerHTML = `<div class="wgbar"><b>${title}</b><button id="wgb">MENÜ</button></div><div class="wgbody"><canvas id="wgc" width="640" height="384"></canvas><div id="wgctl"></div></div>`;
    ov.querySelector('#wgb').onclick = menu; return ov.querySelector('#wgc');
  }
  function hold(el, on, off) { const d = e => { e.preventDefault(); on(); }, u = e => { e.preventDefault(); off(); }; el.addEventListener('pointerdown', d); el.addEventListener('pointerup', u); el.addEventListener('pointerleave', u); el.addEventListener('pointercancel', u); }

  // ---------------------------------------------------------------- 1. RALLUM-LAUF
  function mario() {
    const cv = shell('RALLUM-LAUF'), g = cv.getContext('2d'), T = 32, ROWS = 12, COLS = 124, GR = 10;
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    const pits = [[14, 16], [30, 32], [44, 48], [64, 66], [72, 76], [86, 89], [98, 101]];
    for (let c = 0; c < COLS; c++) if (!pits.some(([a, b]) => c >= a && c <= b)) { grid[GR][c] = 1; grid[GR + 1][c] = 1; }
    const plat = [[22, 7, 3], [26, 5, 2], [38, 7, 3], [45, 8, 1], [47, 7, 1], [52, 7, 4], [56, 5, 3], [68, 7, 2], [73, 8, 1], [75, 6, 1], [80, 7, 3], [84, 5, 2], [88, 7, 1], [92, 7, 3], [95, 5, 3], [99, 8, 1], [104, 7, 2], [108, 5, 2], [112, 7, 3]];
    plat.forEach(([c, r, l]) => { for (let i = 0; i < l; i++) grid[r][c + i] = 2; });
    const spikes = [20, 35, 36, 57, 70, 82, 83, 94, 106, 107, 113]; const coins = [];
    plat.forEach(([c, r, l]) => { for (let i = 0; i < l; i++) coins.push({ x: (c + i) * T + 16, y: (r - 1) * T + 14, got: false }); });
    [10, 24, 60, 90, 118].forEach(c => coins.push({ x: c * T + 16, y: (GR - 1) * T + 14, got: false }));
    const mkEn = () => [18, 26, 40, 54, 62, 80, 90, 103, 110, 115].map(c => ({ x: c * T, y: (GR - 1) * T, vx: -45, dead: false }));
    let en = mkEn(), px, py, vx, vy, ground, face = 1, lives = 3, cn = 0, camx = 0, cp = 0, t0 = performance.now(), state = 'play', msg = '', inv = 0, coyote = 0, jbuf = 0;
    const keys = { l: false, r: false, j: false };
    const reset = () => { px = (cp ? 58 * T : 2 * T); py = (GR - 2) * T; vx = 0; vy = 0; ground = false; inv = 1.2; };
    reset();
    const solid = (c, r) => c < 0 || c >= COLS ? true : (r < 0 ? false : (r >= ROWS ? false : grid[r][c] > 0));
    const W = 22, H = 30;
    const die = () => { lives--; if (lives <= 0) { state = 'over'; msg = 'GAME OVER'; } else reset(); };
    const kd = e => { const d = e.type === 'keydown'; if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = d; if (e.key === 'ArrowRight' || e.key === 'd') keys.r = d; if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (d && !keys.j) jbuf = 0.14; keys.j = d; } };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', kd);
    ov.querySelector('#wgctl').innerHTML = `<div class="wgpad"><button id="bl">◀</button><button id="br">▶</button><button id="bj" class="jump">SPRUNG</button></div>`;
    hold(ov.querySelector('#bl'), () => keys.l = true, () => keys.l = false); hold(ov.querySelector('#br'), () => keys.r = true, () => keys.r = false);
    hold(ov.querySelector('#bj'), () => { if (!keys.j) jbuf = 0.14; keys.j = true; }, () => keys.j = false);
    function moveAxis(dx, dy) {
      px += dx; if (dx) { const c0 = Math.floor(px / T), c1 = Math.floor((px + W - 0.01) / T), r0 = Math.floor(py / T), r1 = Math.floor((py + H - 0.01) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) { px = dx > 0 ? c * T - W : (c + 1) * T; vx = 0; } }
      py += dy; ground = false; if (dy) { const c0 = Math.floor(px / T), c1 = Math.floor((px + W - 0.01) / T), r0 = Math.floor(py / T), r1 = Math.floor((py + H - 0.01) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) { if (dy > 0) { py = r * T - H; ground = true; } else py = (r + 1) * T; vy = 0; } }
    }
    let last = performance.now(), raf;
    const loop = now => {
      raf = requestAnimationFrame(loop); const dt = Math.min(0.033, (now - last) / 1000); last = now;
      if (state === 'play') {
        const tx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); if (tx) face = tx; vx += (tx * 165 - vx) * Math.min(1, dt * (ground ? 14 : 7));
        vy += 1180 * dt; if (vy > 700) vy = 700; coyote = ground ? 0.09 : coyote - dt; jbuf -= dt;
        if (jbuf > 0 && coyote > 0) { vy = -500; coyote = 0; jbuf = 0; ground = false; }
        if (!keys.j && vy < -170) vy = -170; // variable jump height
        moveAxis(vx * dt, 0); moveAxis(0, vy * dt); inv = Math.max(0, inv - dt);
        if (py > ROWS * T + 40) die();
        const pc0 = Math.floor(px / T), pc1 = Math.floor((px + W) / T);
        if (inv <= 0 && spikes.some(c => (c === pc0 || c === pc1) && py + H > (GR) * T - 14 && px + W > c * T + 4 && px < c * T + T - 4)) die();
        en.forEach(e => { if (e.dead) return; e.x += e.vx * dt; const fc = Math.floor((e.vx > 0 ? e.x + T - 4 : e.x + 2) / T); const below = e.vx > 0 ? !solid(fc, GR) : !solid(fc, GR); if (below || solid(fc, GR - 1)) e.vx = -e.vx;
          if (inv <= 0 && px + W > e.x + 4 && px < e.x + T - 4 && py + H > e.y + 4 && py < e.y + T) { if (vy > 60 && py + H - e.y < 20) { e.dead = true; vy = -330; cn += 2; } else die(); } });
        coins.forEach(c => { if (!c.got && Math.abs(px + W / 2 - c.x) < 18 && Math.abs(py + H / 2 - c.y) < 22) { c.got = true; cn++; } });
        if (px > 58 * T) cp = 1;
        if (px > 118 * T) { state = 'win'; msg = 'GESCHAFFT!'; best('mario', cn); }
      }
      window.__mario = { px, py, vx, vy, ground, state, cn, lives, en: en.filter(e => !e.dead).map(e => e.x), pits, spikes };
      camx = Math.max(0, Math.min(COLS * T - 640, px - 240));
      // draw
      const gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#79c8ff'); gr.addColorStop(1, '#fff1c4'); g.fillStyle = gr; g.fillRect(0, 0, 640, 384);
      g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 9; i++) { const cx0 = ((i * 330 - camx * 0.4) % 1500 + 1500) % 1500 - 200; g.beginPath(); g.ellipse(cx0, 60 + (i % 3) * 38, 54, 20, 0, 0, 7); g.fill(); }
      g.save(); g.translate(-Math.round(camx), 0);
      for (let r = 0; r < ROWS; r++) for (let c = Math.floor(camx / T); c < Math.floor((camx + 640) / T) + 1; c++) { const v = grid[r] && grid[r][c]; if (!v) continue; g.fillStyle = v === 1 ? (r === GR ? '#5fae3a' : '#9a6a3a') : '#c8742c'; g.fillRect(c * T, r * T, T, T); g.strokeStyle = '#16162a'; g.lineWidth = 2; g.strokeRect(c * T + 1, r * T + 1, T - 2, T - 2); if (v === 2) { g.beginPath(); g.moveTo(c * T + 4, r * T + 16); g.lineTo(c * T + T - 4, r * T + 16); g.stroke(); } }
      spikes.forEach(c => { g.fillStyle = '#d8d8e0'; g.strokeStyle = '#16162a'; g.lineWidth = 2; for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(c * T + k * 16, GR * T); g.lineTo(c * T + k * 16 + 8, GR * T - 20); g.lineTo(c * T + k * 16 + 16, GR * T); g.closePath(); g.fill(); g.stroke(); } });
      coins.forEach(c => { if (c.got) return; g.fillStyle = '#ffd21a'; g.strokeStyle = '#16162a'; g.lineWidth = 2; g.beginPath(); g.arc(c.x, c.y + Math.sin(now / 200 + c.x) * 2, 8, 0, 7); g.fill(); g.stroke(); });
      en.forEach(e => { if (e.dead) return; g.fillStyle = '#fff'; g.strokeStyle = '#16162a'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(e.x + 16, e.y + 18, 12, 15, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#d81018'; g.fillRect(e.x + 6, e.y + 14, 20, 5); g.fillStyle = '#16162a'; g.fillRect(e.x + 10, e.y + 6, 3, 4); g.fillRect(e.x + 19, e.y + 6, 3, 4); });
      // goal flag
      g.fillStyle = '#16162a'; g.fillRect(119 * T + 12, (GR - 6) * T, 6, 6 * T); g.fillStyle = '#d81018'; g.beginPath(); g.moveTo(119 * T + 18, (GR - 6) * T); g.lineTo(119 * T + 62, (GR - 5) * T - 8); g.lineTo(119 * T + 18, (GR - 4) * T); g.fill(); g.fillStyle = '#16162a'; g.font = '700 12px sans-serif'; g.fillText('ZIEL', 119 * T + 22, (GR - 5) * T + 2);
      if (cp) { g.fillStyle = '#ffd21a'; g.fillRect(58 * T, (GR - 3) * T, 4, 3 * T); }
      // player
      if (state !== 'over' && (inv <= 0 || Math.floor(now / 90) % 2 === 0)) { g.save(); g.translate(px + W / 2, py + H / 2); g.scale(face, 1); g.fillStyle = '#d81018'; g.strokeStyle = '#16162a'; g.lineWidth = 2.5; g.fillRect(-9, 2, 18, 13); g.strokeRect(-9, 2, 18, 13); g.fillStyle = '#16162a'; const lg = ground ? Math.sin(now / 70) * (Math.abs(vx) > 20 ? 5 : 0) : 4; g.fillRect(-8, 14, 6, 3 + lg); g.fillRect(2, 14, 6, 3 - lg);
        g.save(); g.beginPath(); g.arc(0, -6, 13, 0, 7); g.clip(); if (img.complete && img.naturalWidth) g.drawImage(img, -13, -19, 26, 26); else { g.fillStyle = '#f6c59a'; g.fill(); } g.restore(); g.beginPath(); g.arc(0, -6, 13, 0, 7); g.stroke(); g.restore(); }
      g.restore();
      g.fillStyle = 'rgba(22,22,42,.7)'; g.fillRect(0, 0, 640, 26); g.fillStyle = '#fff'; g.font = '700 14px sans-serif'; g.fillText('Leben ' + lives + '   Münzen ' + cn + '   Zeit ' + Math.floor((now - t0) / 1000) + ' s', 10, 18);
      if (state !== 'play') { g.fillStyle = 'rgba(22,22,42,.75)'; g.fillRect(120, 130, 400, 120); g.fillStyle = '#ffd21a'; g.font = '700 38px sans-serif'; g.textAlign = 'center'; g.fillText(msg, 320, 185); g.font = '700 16px sans-serif'; g.fillStyle = '#fff'; g.fillText(state === 'win' ? cn + ' Münzen in ' + Math.floor((now - t0) / 1000) + ' s. Antippen für Neustart' : 'Antippen für Neustart', 320, 220); g.textAlign = 'left'; }
    };
    cv.addEventListener('pointerdown', () => { if (state !== 'play') { en = mkEn(); coins.forEach(c => c.got = false); lives = 3; cn = 0; cp = 0; state = 'play'; t0 = performance.now(); reset(); } });
    raf = requestAnimationFrame(loop);
    stop = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', kd); };
  }

  // ---------------------------------------------------------------- 2. FLATTER-RALLUM
  function flap() {
    const cv = shell('FLATTER-RALLUM'), g = cv.getContext('2d'); let y = 190, vy = 0, sc = 0, over = false, pipes = [], tm = 0, raf, last = performance.now();
    const flapIt = () => { if (over) { y = 190; vy = 0; sc = 0; pipes = []; over = false; tm = 0; return; } vy = -330; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); flapIt(); }); const kd = e => { if (e.key === ' ') flapIt(); }; window.addEventListener('keydown', kd);
    const loop = now => { raf = requestAnimationFrame(loop); const dt = Math.min(0.033, (now - last) / 1000); last = now;
      if (!over) { vy += 900 * dt; y += vy * dt; tm -= dt; if (tm <= 0) { tm = 1.55; pipes.push({ x: 660, gap: 90 + Math.random() * 170, passed: false }); } pipes.forEach(p => p.x -= 150 * dt); pipes = pipes.filter(p => p.x > -60);
        pipes.forEach(p => { if (!p.passed && p.x + 40 < 120) { p.passed = true; sc++; best('flap', sc); } if (120 + 14 > p.x && 120 - 14 < p.x + 50 && (y - 14 < p.gap - 60 || y + 14 > p.gap + 60)) over = true; }); if (y > 384 || y < 0) over = true; }
      g.fillStyle = '#79c8ff'; g.fillRect(0, 0, 640, 384); pipes.forEach(p => { g.fillStyle = '#fff'; g.strokeStyle = '#16162a'; g.lineWidth = 3; g.fillRect(p.x, 0, 50, p.gap - 60); g.strokeRect(p.x, 0, 50, p.gap - 60); g.fillRect(p.x, p.gap + 60, 50, 384); g.strokeRect(p.x, p.gap + 60, 50, 384); g.fillStyle = '#d81018'; g.fillRect(p.x, p.gap - 80, 50, 12); g.fillRect(p.x, p.gap + 68, 50, 12); });
      g.save(); g.translate(120, y); g.rotate(Math.max(-0.5, Math.min(0.9, vy / 500))); g.beginPath(); g.arc(0, 0, 16, 0, 7); g.save(); g.clip(); if (img.complete && img.naturalWidth) g.drawImage(img, -16, -16, 32, 32); g.restore(); g.lineWidth = 3; g.strokeStyle = '#16162a'; g.stroke(); g.restore();
      g.fillStyle = '#16162a'; g.font = '700 28px sans-serif'; g.fillText(sc + '  (Rekord ' + best('flap') + ')', 12, 34); if (over) { g.fillStyle = 'rgba(22,22,42,.75)'; g.fillRect(150, 140, 340, 90); g.fillStyle = '#ffd21a'; g.textAlign = 'center'; g.font = '700 30px sans-serif'; g.fillText('AUS! Antippen = neu', 320, 195); g.textAlign = 'left'; } };
    raf = requestAnimationFrame(loop); stop = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); };
  }

  // ---------------------------------------------------------------- 3. BIERDECKEL-TAPPER
  function tap() {
    const cv = shell('BIERDECKEL-TAPPER'), g = cv.getContext('2d'); let n = 0, t0 = 0, run = false, done = false, raf, pop = 0;
    const draw = now => { raf = requestAnimationFrame(draw); const left = run ? Math.max(0, 15 - (now - t0) / 1000) : 15; if (run && left <= 0) { run = false; done = true; best('tap', n); }
      g.fillStyle = '#e2b06a'; g.fillRect(0, 0, 640, 384); const r = 110 + (pop > 0 ? 12 : 0); pop = Math.max(0, pop - 1); g.beginPath(); g.arc(320, 200, r, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#d81018'; g.stroke(); g.fillStyle = '#16162a'; g.font = '700 70px sans-serif'; g.textAlign = 'center'; g.fillText(String(n), 320, 225);
      g.font = '700 22px sans-serif'; g.fillText(done ? 'Fertig! ' + n + ' Taps. Rekord ' + best('tap') + '. Antippen = neu' : run ? left.toFixed(1) + ' s' : 'Tippe, um zu starten', 320, 40); g.textAlign = 'left'; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); if (done) { n = 0; done = false; run = false; return; } if (!run) { run = true; t0 = performance.now(); n = 0; } n++; pop = 3; });
    raf = requestAnimationFrame(draw); stop = () => cancelAnimationFrame(raf);
  }

  function open() { if (ov) return; ov = document.createElement('div'); ov.id = 'wg'; document.body.appendChild(ov); menu(); }
  return { open, close };
})();
