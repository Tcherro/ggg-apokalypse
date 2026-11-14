// BALLON-SCHLACHT v2: host-authoritative real-time arena. 3 balloons each, power-ups, dash, shrinking lane.
const BATTLE = (() => {
  const A = 2000, R = 44, BR = 15, RB = 90, LIVES = 3, VIEW = 1000, C = A / 2;
  const OB = (() => { const o = [[C, C, 96]]; [[-420, -420], [420, -420], [-420, 420], [420, 420]].forEach(([x, y]) => o.push([C + x, C + y, 52]));
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; o.push([Math.round(C + 760 * Math.cos(a)), Math.round(C + 760 * Math.sin(a)), 46]); }
    [[330, 330], [1670, 330], [330, 1670], [1670, 1670], [1000, 300], [1000, 1700], [300, 1000], [1700, 1000]].forEach(([x, y]) => o.push([x, y, 38])); return o; })();
  const BP = (() => { const o = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; o.push([Math.round(C + 560 * Math.cos(a)), Math.round(C + 560 * Math.sin(a)), Math.round((a + Math.PI / 2) * 100) / 100]); } [[C, 560, 0], [C, 1440, Math.PI], [560, C, Math.PI / 2], [1440, C, -Math.PI / 2]].forEach(([x, y, d]) => o.push([x, y, d])); return o; })();
  const spawnPos = (i, n) => { const a = (i / n) * Math.PI * 2 + Math.PI / 4; return [Math.round(C + 880 * Math.cos(a)), Math.round(C + 880 * Math.sin(a))]; };
  const COLORS = ['#ff3b3b', '#2f8fff', '#2ad46a', '#ffd21a', '#c06bff', '#ff8a1f', '#19d3d3', '#ff6bb5', '#8bd13a', '#9a7b4f', '#e8e8e8', '#5a63ff'];
  const LIMIT = 170, SUDDEN = 60, SHRINK_MAX = 760;
  const KINDS = ['shield', 'turbo', 'triple', 'heal', 'star', 'banana', 'bomb', 'star'];
  const KNAME = { shield: 'SCHILD', turbo: 'TURBO', triple: 'DREIFACH', heal: 'EXTRA-BALLON', star: 'SUPER-STERN', banana: 'BANANE', bomb: 'BIER-BOMBE' };
  const F = { shield: 1, turbo: 2, triple: 4, inv: 8, dash: 16, alive: 32, star: 64, stun: 128, bomb: 256 };

  // ------------------------------------------------ host engine
  let H = null;
  function hostStart(pids, bots, send, onEnd, onFirstOut) {
    hostStop();
    const P = {};
    pids.forEach((p, i) => { const [x, y] = spawnPos(i, pids.length); P[p] = { x, y, dir: Math.atan2(C - y, C - x), ix: 0, iy: 0, fire: false, dash: false, cd: 2.5, alive: true, lives: LIVES, inv: 0, shield: 0, turbo: 0, triple: 0, star: 0, bomb: 0, stun: 0, dashCd: 0, dashT: 0, dx: 0, dy: 0, kx: 0, ky: 0, bot: bots.includes(p), think: 0, hitAt: 0 }; });
    H = { pids, P, balls: [], items: [], traps: [], mets: [], rb: { x: C, y: C, vx: 150, vy: -190, on: false }, metT: 40, ev: [], out: [], t: 0, over: false, send, onEnd, onFirstOut, last: performance.now(), acc: 0, itemT: 4, fe: null };
    H.iv = setInterval(step, 33);
  }
  function hostStop() { if (H) { clearInterval(H.iv); H = null; } }
  function input(pid, x, y) { if (!H || !H.P[pid]) return; const m = Math.hypot(x, y), k = m > 1 ? 1 / m : 1; H.P[pid].ix = x * k; H.P[pid].iy = y * k; }
  function fire(pid) { if (H && H.P[pid]) H.P[pid].fire = true; }
  function dash(pid) { if (H && H.P[pid]) H.P[pid].dash = true; }
  const margin = () => Math.min(SHRINK_MAX, Math.max(0, (H.t - SUDDEN) * 10));
  function pushOut(o, r, bounce) {
    let hit = false;
    for (const [ox, oy, or] of OB) {
      const dx = o.x - ox, dy = o.y - oy, d = Math.hypot(dx, dy), min = r + or;
      if (d < min && d > 0.001) {
        const nx = dx / d, ny = dy / d; o.x = ox + nx * min; o.y = oy + ny * min; hit = true;
        if (bounce) { const dot = o.vx * nx + o.vy * ny; o.vx -= 2 * dot * nx; o.vy -= 2 * dot * ny; }
      }
    }
    return hit;
  }
  function freeSpot() {
    const m = margin();
    for (let i = 0; i < 30; i++) {
      const x = 140 + m + Math.random() * (A - 280 - 2 * m), y = 140 + m + Math.random() * (A - 280 - 2 * m);
      if (OB.every(([ox, oy, or]) => Math.hypot(x - ox, y - oy) > or + 60) && H.pids.every(q => !H.P[q].alive || Math.hypot(H.P[q].x - x, H.P[q].y - y) > 220)) return [x, y];
    }
    return [A / 2 + 160, A / 2];
  }
  function botThink(pid, p, dt) {
    p.think -= dt;
    const foes = H.pids.filter(q => q !== pid && H.P[q].alive).map(q => H.P[q]); if (!foes.length) return;
    const t = foes.reduce((a, b) => Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a);
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
    // dodge incoming balls
    let danger = null; for (const b of H.balls) { if (b.o === pid) continue; const bx = b.x - p.x, by = b.y - p.y, dist = Math.hypot(bx, by); if (dist < 260 && (b.vx * bx + b.vy * by) < 0) { danger = b; break; } }
    if (danger && p.dashCd <= 0 && Math.random() < 0.5) { p.dash = true; }
    if (p.think <= 0 || danger) {
      p.think = 0.3 + Math.random() * 0.4;
      let ang;
      if (danger) ang = Math.atan2(danger.vy, danger.vx) + (Math.PI / 2) * (Math.random() < 0.5 ? 1 : -1);
      else {
        const it = H.items.find(i => Math.hypot(i.x - p.x, i.y - p.y) < 800);
        if (it && Math.random() < 0.7) ang = Math.atan2(it.y - p.y, it.x - p.x);
        else { const base = Math.atan2(dy, dx); ang = d < 380 ? base + (Math.PI / 2) * (Math.random() < 0.5 ? 1 : -1) : base + (Math.random() - 0.5) * 0.9; }
      }
      const m = 0.6 + Math.random() * 0.35; p.ix = Math.cos(ang) * m; p.iy = Math.sin(ang) * m;
    }
    if (p.cd <= 0 && d < 1000 && Math.random() < dt * 0.3) { p.dir = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2; p.fire = true; p.aimed = true; }
  }
  function spawnBall(p, ang, bspd, bomb) {
    const c = Math.cos(ang), s = Math.sin(ang);
    H.balls.push({ x: p.x + c * (R + BR + 4), y: p.y + s * (R + BR + 4), vx: c * bspd, vy: s * bspd, o: p.id, life: bomb ? 1.5 : 2.6, bounce: 0, bomb: !!bomb });
  }
  function boom(b) {
    if (b.boomed) return; b.boomed = true; b.life = 0; H.ev.push(['boom', 0, Math.round(b.x), Math.round(b.y), b.o]);
    for (const q of H.pids) {
      const p = H.P[q]; if (!p.alive || q === b.o) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) < 190) { if (p.shield > 0 || p.inv > 0) H.ev.push(['block', q, Math.round(p.x), Math.round(p.y)]); else popAt(q, b.o, b); }
    }
  }
  function popAt(pid, by, ball) {
    const p = H.P[pid]; p.lives--; p.inv = 2.6; p.hitAt = H.t;
    const nx = ball ? ball.vx : 0, ny = ball ? ball.vy : 0, m = Math.hypot(nx, ny) || 1; p.kx = nx / m * 520; p.ky = ny / m * 520;
    H.ev.push(['pop', pid, Math.round(p.x), Math.round(p.y), by]);
    if (p.lives <= 0) {
      p.alive = false; H.out.push(pid); H.ev.push(['out', pid, Math.round(p.x), Math.round(p.y), by]);
      if (!H.fe) { H.fe = pid; H.onFirstOut && H.onFirstOut(pid); }
    }
  }
  function step() {
    if (!H) return;
    const now = performance.now(), dt = Math.min(0.06, (now - H.last) / 1000); H.last = now;
    if (!H.over) H.t += dt;
    const sudden = H.t > SUDDEN, bspd = sudden ? 760 : 620, cdT = sudden ? 1.0 : 1.5, m = margin();
    if (!H.over) {
      H.itemT -= dt;
      if (H.itemT <= 0 && H.items.length < Math.min(18, 5 + Math.ceil(H.pids.length * 0.8))) { const [x, y] = freeSpot(); H.items.push({ k: KINDS[Math.floor(Math.random() * KINDS.length)], x, y, id: Math.random() }); H.itemT = Math.max(1.2, (3 + Math.random() * 2) * 4 / Math.max(4, H.pids.length)); H.ev.push(['spawn', 0, Math.round(x), Math.round(y)]); }
      for (const pid of H.pids) {
        const p = H.P[pid]; p.id = pid; if (!p.alive) continue;
        if (p.bot) botThink(pid, p, dt);
        p.star = Math.max(0, p.star - dt); p.stun = Math.max(0, p.stun - dt); if (p.star > 0) p.inv = Math.max(p.inv, 0.2); p.inv = Math.max(0, p.inv - dt); p.shield = Math.max(0, p.shield - dt); p.turbo = Math.max(0, p.turbo - dt); p.triple = Math.max(0, p.triple - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.cd -= dt;
        const mag = Math.hypot(p.ix, p.iy);
        if (!p.aimed && mag > 0.25 && p.stun <= 0) p.dir = Math.atan2(p.iy, p.ix);
        if (p.stun > 0) { p.dash = false; p.fire = false; p.dir += dt * 13; }
        if (p.dash && p.dashCd <= 0) {
          const ang = mag > 0.25 ? Math.atan2(p.iy, p.ix) : p.dir; p.dx = Math.cos(ang); p.dy = Math.sin(ang); p.dashT = 0.2; p.dashCd = 3; p.inv = Math.max(p.inv, 0.35); H.ev.push(['dash', pid, Math.round(p.x), Math.round(p.y)]);
        }
        p.dash = false;
        let vx, vy;
        if (p.dashT > 0) { p.dashT -= dt; vx = p.dx * (p.pad ? 1250 : 1000); vy = p.dy * (p.pad ? 1250 : 1000); }
        else if (p.stun > 0) { vx = 0; vy = 0; }
        else { const sp = 380 * (p.turbo > 0 ? 1.55 : 1) * (p.star > 0 ? 1.3 : 1); vx = p.ix * sp; vy = p.iy * sp; }
        p.x += (vx + p.kx) * dt; p.y += (vy + p.ky) * dt; p.kx *= Math.pow(0.002, dt); p.ky *= Math.pow(0.002, dt);
        p.x = Math.max(m + R, Math.min(A - m - R, p.x)); p.y = Math.max(m + R, Math.min(A - m - R, p.y)); pushOut(p, R, false);
        if (p.fire && p.cd <= 0) {
          p.cd = cdT;
          // soft auto-aim: snap to a foe inside a narrow cone
          let ang = p.dir; if (!p.aimed) { let best = null, bd = 1100; for (const q of H.pids) { if (q === pid || !H.P[q].alive) continue; const e = H.P[q], a = Math.atan2(e.y - p.y, e.x - p.x), diff = Math.abs(Math.atan2(Math.sin(a - p.dir), Math.cos(a - p.dir))), d = Math.hypot(e.x - p.x, e.y - p.y); if (diff < 0.4 && d < bd) { best = a; bd = d; } } if (best !== null) ang = best; }
          if (p.bomb > 0) { p.bomb = 0; spawnBall(p, ang, bspd * 0.75, true); }
          else { spawnBall(p, ang, bspd); if (p.triple > 0) { spawnBall(p, ang - 0.3, bspd); spawnBall(p, ang + 0.3, bspd); } }
          H.ev.push(['shot', pid, Math.round(p.x), Math.round(p.y)]);
        }
        p.fire = false; p.aimed = false;
        for (let i = H.items.length - 1; i >= 0; i--) {
          const it = H.items[i]; if (Math.hypot(it.x - p.x, it.y - p.y) < R + 26) {
            H.items.splice(i, 1);
            if (it.k === 'shield') p.shield = 6; else if (it.k === 'turbo') p.turbo = 6; else if (it.k === 'triple') p.triple = 9;
            else if (it.k === 'star') p.star = 6; else if (it.k === 'bomb') p.bomb = 1;
            else if (it.k === 'banana') H.traps.push({ x: p.x - Math.cos(p.dir) * 75, y: p.y - Math.sin(p.dir) * 75, o: pid, t: 0, life: 20 });
            else if (p.lives < LIVES) p.lives++; else p.shield = 3;
            H.ev.push(['pick', pid, Math.round(it.x), Math.round(it.y), it.k]);
          }
        }
      }
      for (let i = 0; i < H.pids.length; i++) for (let j = i + 1; j < H.pids.length; j++) {
        const a = H.P[H.pids[i]], b = H.P[H.pids[j]]; if (!a.alive || !b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < 2 * R && d > 0.001) { const o = (2 * R - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o; a.kx -= nx * 120; a.ky -= ny * 120; b.kx += nx * 120; b.ky += ny * 120; }
      }
      for (const pid of H.pids) { // star ramming
        const a = H.P[pid]; if (!a.alive || a.star <= 0) continue;
        for (const q of H.pids) { const c = H.P[q]; if (q === pid || !c.alive || c.inv > 0 || c.shield > 0) continue; if (Math.hypot(a.x - c.x, a.y - c.y) < 2 * R + 6) popAt(q, pid, { vx: c.x - a.x, vy: c.y - a.y }); }
      }
      for (const tr of H.traps) { // banana peels
        tr.t += dt; tr.life -= dt;
        for (const pid of H.pids) {
          const p = H.P[pid]; if (!p.alive || tr.life <= 0 || (pid === tr.o && tr.t < 1.2)) continue;
          if (Math.hypot(p.x - tr.x, p.y - tr.y) < R + 18) { tr.life = 0; if (p.shield > 0 || p.inv > 0) H.ev.push(['block', pid, Math.round(p.x), Math.round(p.y)]); else { p.stun = 1.5; H.ev.push(['slip', pid, Math.round(p.x), Math.round(p.y)]); } break; }
        }
      }
      H.traps = H.traps.filter(t => t.life > 0);
      for (const b of H.balls) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        const lo = m + BR, hi = A - m - BR;
        if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx); b.bounce++; } if (b.x > hi) { b.x = hi; b.vx = -Math.abs(b.vx); b.bounce++; }
        if (b.y < lo) { b.y = lo; b.vy = Math.abs(b.vy); b.bounce++; } if (b.y > hi) { b.y = hi; b.vy = -Math.abs(b.vy); b.bounce++; }
        if (pushOut(b, BR, true)) b.bounce++;
        if (b.bounce > 2) b.life = 0;
        for (const pid of H.pids) {
          const p = H.P[pid]; if (!p.alive || b.life <= 0 || (pid === b.o && b.life > 2.3)) continue;
          if (Math.hypot(p.x - b.x, p.y - b.y) < R * 0.9 + BR) {
            b.life = 0;
            if (b.bomb) { boom(b); break; }
            if (p.shield > 0 || p.inv > 0) { H.ev.push(['block', pid, Math.round(p.x), Math.round(p.y)]); }
            else popAt(pid, b.o, b);
            break;
          }
        }
      }
      H.balls.forEach(b => { if (b.bomb && b.life <= 0 && !b.boomed) boom(b); });
      H.balls = H.balls.filter(b => b.life > 0);
      // boost pads
      for (const pid of H.pids) {
        const p = H.P[pid]; if (!p.alive) continue; p.padCd = Math.max(0, (p.padCd || 0) - dt);
        if (p.padCd <= 0 && !(p.dashT > 0)) for (const [px, py, pd] of BP) if (Math.hypot(p.x - px, p.y - py) < R + 36) { p.dx = Math.cos(pd); p.dy = Math.sin(pd); p.dashT = 0.5; p.pad = true; p.padCd = 1.8; H.ev.push(['pad', pid, px, py]); break; }
        if (!(p.dashT > 0)) p.pad = false;
      }
      // Rallum, the roaming wrecking ball
      const rb = H.rb; if (H.t > 20) rb.on = true;
      if (rb.on) {
        const liv = H.pids.filter(q => H.P[q].alive).map(q => H.P[q]);
        if (liv.length) { const tg = liv.reduce((a, c) => Math.hypot(c.x - rb.x, c.y - rb.y) < Math.hypot(a.x - rb.x, a.y - rb.y) ? c : a), dx = tg.x - rb.x, dy = tg.y - rb.y, d = Math.hypot(dx, dy) || 1; rb.vx += dx / d * 140 * dt; rb.vy += dy / d * 140 * dt; }
        const sp = Math.hypot(rb.vx, rb.vy), mx = 300 + Math.min(220, H.t * 1.6); if (sp > mx) { rb.vx *= mx / sp; rb.vy *= mx / sp; }
        rb.x += rb.vx * dt; rb.y += rb.vy * dt; rb.a = Math.atan2(rb.vy, rb.vx); const lo = m + RB, hi = A - m - RB;
        if (rb.x < lo) { rb.x = lo; rb.vx = Math.abs(rb.vx); } if (rb.x > hi) { rb.x = hi; rb.vx = -Math.abs(rb.vx); }
        if (rb.y < lo) { rb.y = lo; rb.vy = Math.abs(rb.vy); } if (rb.y > hi) { rb.y = hi; rb.vy = -Math.abs(rb.vy); }
        pushOut(rb, RB, true); rb.cd = rb.cd || {};
        for (const pid of H.pids) {
          const p = H.P[pid]; if (!p.alive || (rb.cd[pid] || 0) > H.t) continue;
          const dx = p.x - rb.x, dy = p.y - rb.y, d = Math.hypot(dx, dy) || 1;
          if (d < R + RB) {
            rb.cd[pid] = H.t + 0.8; p.kx += dx / d * 700; p.ky += dy / d * 700;
            if (p.shield > 0 || p.inv > 0) H.ev.push(['block', pid, Math.round(p.x), Math.round(p.y)]); else popAt(pid, 'rb', { vx: dx, vy: dy });
          }
        }
      }
      // the tank fires shells at the nearest-looking victim, and every 30 s it rains items
      if (rb.on) { rb.shotT = (rb.shotT == null ? 3 : rb.shotT) - dt; if (rb.shotT <= 0) { rb.shotT = Math.max(2.2, 5 - H.t / 40); const liv = H.pids.filter(q => H.P[q].alive).map(q => H.P[q]); if (liv.length) { const tg = liv[Math.floor(Math.random() * liv.length)]; H.mets.push({ x: Math.max(m + 100, Math.min(A - m - 100, tg.x + (tg.vx || 0) * 0.7)), y: Math.max(m + 100, Math.min(A - m - 100, tg.y + (tg.vy || 0) * 0.7)), t: 1.15 }); H.ev.push(['shot', 0, Math.round(rb.x), Math.round(rb.y)]); } } }
      H.rainT = (H.rainT == null ? 30 : H.rainT) - dt; if (H.rainT <= 0) { H.rainT = 30; for (let q = 0; q < 8; q++) { const [x, y] = freeSpot(); H.items.push({ k: KINDS[Math.floor(Math.random() * KINDS.length)], x, y, id: Math.random() }); } H.ev.push(['rain', 0, 0, 0]); }
      // meteors: marked on the floor, explode after 1.6 s
      H.metT -= dt;
      if (H.t > 40 && H.metT <= 0) {
        H.metT = Math.max(2.2, 8 - H.t / 25 - H.pids.length * 0.15); const liv = H.pids.filter(q => H.P[q].alive);
        if (liv.length) { const tg = H.P[liv[Math.floor(Math.random() * liv.length)]]; H.mets.push({ x: Math.max(m + 120, Math.min(A - m - 120, tg.x + (Math.random() - 0.5) * 260)), y: Math.max(m + 120, Math.min(A - m - 120, tg.y + (Math.random() - 0.5) * 260)), t: 1.6 }); }
      }
      for (const mt of H.mets) {
        mt.t -= dt; if (mt.t > 0) continue;
        H.ev.push(['meteor', 0, Math.round(mt.x), Math.round(mt.y)]);
        for (const pid of H.pids) { const p = H.P[pid]; if (!p.alive || Math.hypot(p.x - mt.x, p.y - mt.y) > 175) continue; if (p.shield > 0 || p.inv > 0) H.ev.push(['block', pid, Math.round(p.x), Math.round(p.y)]); else popAt(pid, 'met', { vx: p.x - mt.x, vy: p.y - mt.y }); }
      }
      H.mets = H.mets.filter(q => q.t > 0);
      const alive = H.pids.filter(q => H.P[q].alive);
      if (alive.length <= 1) finish('last'); else if (H.t >= LIMIT) finish('time');
    }
    H.acc += dt; if (H.acc >= (H.pids.length > 6 ? 0.07 : 0.05)) { H.acc = 0; broadcast(); }
  }
  function finish(reason) {
    if (H.over) return; H.over = true;
    const alive = H.pids.filter(q => H.P[q].alive);
    // ranking: survivors by balloons (then fewest recent hits), then eliminated in reverse order
    const order = alive.sort((a, b) => H.P[b].lives - H.P[a].lives || H.P[a].hitAt - H.P[b].hitAt).concat(H.out.slice().reverse());
    let losers;
    if (H.out.length) losers = [H.out[0]];
    else { const minL = Math.min(...H.pids.map(q => H.P[q].lives)); losers = H.pids.filter(q => H.P[q].lives === minL); }
    if (reason === 'time' && H.out.length === 0 && losers.length === H.pids.length) losers = H.pids.slice();
    H.res = { losers, order, reason, lives: Object.fromEntries(H.pids.map(q => [q, H.P[q].lives])) };
    broadcast();
    const h = H; setTimeout(() => { if (H === h) hostStop(); h.onEnd(h.res); }, 2200);
  }
  function broadcast() {
    H.send({
      t: 'bs', p: H.pids.map(q => { const p = H.P[q]; return [q, Math.round(p.x), Math.round(p.y), Math.round(p.dir * 100), p.lives, (p.shield > 0 ? 1 : 0) | (p.turbo > 0 ? 2 : 0) | (p.triple > 0 ? 4 : 0) | (p.inv > 0 ? 8 : 0) | (p.dashT > 0 ? 16 : 0) | (p.alive ? 32 : 0) | (p.star > 0 ? 64 : 0) | (p.stun > 0 ? 128 : 0) | (p.bomb > 0 ? 256 : 0), Math.round(p.dashCd * 10)]; }),
      b: H.balls.map(b => [Math.round(b.x), Math.round(b.y), b.bomb ? 1 : 0]), tr: H.traps.map(t => [Math.round(t.x), Math.round(t.y)]), rb: H.rb.on ? [Math.round(H.rb.x), Math.round(H.rb.y), Math.round((H.rb.a || 0) * 100) / 100] : null, mt: H.mets.map(q => [Math.round(q.x), Math.round(q.y), Math.round(q.t * 10)]), it: H.items.map(i => [i.k, Math.round(i.x), Math.round(i.y)]), ev: H.ev, tm: Math.round(H.t * 10), sd: H.t > SUDDEN ? 1 : 0, m: Math.round(margin()), ov: H.over ? 1 : 0, fe: H.fe
    });
    H.ev = [];
  }

  // ------------------------------------------------ client view
  let V = null;
  function snap(m) { if (!V) return; V.snaps.push({ m, at: performance.now() }); if (V.snaps.length > 8) V.snaps.shift(); if (m.ev && m.ev.length) V.onEv(m.ev); V.onHud(m); }
  function mount(el, ctx) {
    unmount();
    const imgs = {}; ctx.pids.forEach(p => { const i = new Image(); i.src = ctx.img(p); imgs[p] = i; });
    const hud = ctx.pids.map((p, i) => `<span class="bh" data-p="${p}" style="border-color:${COLORS[i % COLORS.length]}"><img src="${ctx.img(p)}"><b>${ctx.name(p)}</b><i class="bl"></i></span>`).join('');
    el.innerHTML = `<div class="bhud${ctx.pids.length > 6 ? ' many' : ''}">${hud}</div><div class="arena-wrap"><canvas class="arena-c"></canvas><div class="bfeed"></div><div class="bbanner hidden"></div></div>
      ${ctx.isPlayer ? `<div class="bctl"><div class="joy"><div class="knob"></div></div><div class="bbtns"><button class="big gas firebtn">KEGELN!</button><button class="big sec dashbtn">DASH</button></div></div>
      <p class="small center bhelp">Links lenken, KEGELN wirft. DASH weicht aus. Power-Ups: Stern rammt Gegner um, Banane lässt andere ausrutschen, Bier-Bombe sprengt im Umkreis. Gelbe Pfeil-Felder boosten. Rote Kreise = Meteor, raus da! RALLUM im Panzer schießt auf alle.</p>`
        : '<p class="specmsg">DU SCHAUST ZU: Tippe oben auf deinen Favoriten, dann feuere an!</p>'}`;
    if (!ctx.isPlayer && ctx.onFav) el.querySelectorAll('.bh').forEach(h => { h.classList.add('pick'); h.onclick = () => { el.querySelectorAll('.bh').forEach(x => x.classList.toggle('fav', x === h)); ctx.onFav(h.dataset.p); ctx.sfx.blip(); }; });
    const cv = el.querySelector('canvas'), cx = cv.getContext('2d'), feed = el.querySelector('.bfeed'), banner = el.querySelector('.bbanner');
    V = { rimg: (() => { const i = new Image(); i.src = 'badges/00_ralf.png'; return i; })(), snaps: [], raf: 0, clean: [], parts: [], rings: [], shake: 0, flash: 0 };
    const size = () => { const w = Math.min(el.clientWidth - 4, window.innerHeight * 0.5); const d = window.devicePixelRatio || 1; cv.style.width = w + 'px'; cv.style.height = w + 'px'; cv.width = Math.round(w * d); cv.height = Math.round(w * d); };
    size(); window.addEventListener('resize', size); V.clean.push(() => window.removeEventListener('resize', size));
    { const lv = setInterval(() => { if (V && V.snaps.length && V.snaps[V.snaps.length - 1].m.rb) ctx.sfx.laugh(1); }, 3600); V.clean.push(() => clearInterval(lv)); } // Rallum in the tank laughs the whole time
    const say = (txt, cls) => { const d = document.createElement('div'); d.className = 'bf ' + (cls || ''); d.textContent = txt; feed.appendChild(d); while (feed.children.length > 4) feed.firstChild.remove(); setTimeout(() => d.remove(), 3200); };
    const burst = (x, y, col, n, spd, size) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (0.3 + Math.random()) * spd; V.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 + Math.random() * 0.5, max: 1.2, c: col, s: size * (0.5 + Math.random()) }); } };
    const colOf = pid => COLORS[ctx.pids.indexOf(pid) % COLORS.length] || '#fff';
    V.onEv = evs => {
      for (const e of evs) {
        const [k, pid, x, y, extra] = e;
        if (k === 'pop') { burst(x, y - 70, colOf(pid), 22, 360, 9); burst(x, y - 70, '#fff', 8, 240, 5); ctx.sfx.pop(); V.shake = Math.max(V.shake, pid === ctx.me ? 14 : 5); if (pid === ctx.me) { V.flash = 0.35; if (navigator.vibrate) navigator.vibrate(120); } say(`${ctx.name(pid)} verliert einen Ballon!`, 'pop'); }
        else if (k === 'out') { burst(x, y, '#888', 30, 320, 8); say(`${ctx.name(pid)} ist raus!`, 'out'); }
        else if (k === 'shot') { if (pid === ctx.me) ctx.sfx.tap(); }
        else if (k === 'dash') { burst(x, y, '#fff', 8, 180, 6); ctx.sfx.whoosh(); }
        else if (k === 'block') { burst(x, y, '#7ad8ff', 10, 260, 6); ctx.sfx.blip(); }
        else if (k === 'pick') { burst(x, y, '#ffd21a', 16, 300, 7); ctx.sfx.pickup(); say(`${ctx.name(pid)}: ${KNAME[extra]}`, 'pick'); }
        else if (k === 'spawn') { burst(x, y, '#fff', 8, 160, 5); }
        else if (k === 'boom') { burst(x, y, '#ff8a1f', 36, 520, 12); burst(x, y, '#ffd21a', 24, 360, 8); burst(x, y, '#333', 14, 260, 10); V.rings.push({ x, y, r: 20, life: 0.5 }); ctx.sfx.pop(); V.shake = Math.max(V.shake, 13); say('BIER-BOMBE KRACHT!', 'pop'); }
        else if (k === 'shot') { burst(x, y, '#ffd21a', 18, 520, 8); burst(x, y, '#555', 10, 260, 12); ctx.sfx.pop(); V.shake = Math.max(V.shake, 6); }
        else if (k === 'rain') { say('BIER-REGEN! ITEMS ÜBERALL', 'good'); V.banner = { t: performance.now(), txt: 'BIER-REGEN!' }; ctx.sfx.pickup(); }
        else if (k === 'pad') { burst(x, y, '#ffd21a', 14, 380, 7); ctx.sfx.whoosh(); }
        else if (k === 'meteor') { burst(x, y, '#ff3b1a', 44, 640, 13); burst(x, y, '#ffd21a', 26, 420, 9); burst(x, y, '#333', 16, 300, 11); V.rings.push({ x, y, r: 30, life: 0.6 }); ctx.sfx.pop(); V.shake = Math.max(V.shake, 11); }
        else if (k === 'slip') { burst(x, y, '#ffe14a', 14, 240, 7); ctx.sfx.bad(); say(`${ctx.name(pid)} rutscht aus!`, 'pop'); }
      }
    };
    let bannerFor = null, sd = false;
    V.onHud = m => {
      el.querySelectorAll('.bh').forEach(h => {
        const r = m.p.find(q => q[0] === h.dataset.p); if (!r) return; const lv = r[4], alive = r[5] & F.alive;
        h.classList.toggle('dead', !alive); h.querySelector('.bl').innerHTML = Array.from({ length: LIVES }, (_, i) => `<u class="${i < lv ? 'on' : ''}" style="background:${i < lv ? colOf(h.dataset.p) : '#555'}"></u>`).join('');
      });
      if (m.sd && !sd) { sd = true; say('ARENA SCHRUMPFT!', 'sd'); ctx.sfx.bad(); }
      if (m.fe && bannerFor !== m.fe) {
        bannerFor = m.fe; banner.classList.remove('hidden');
        banner.innerHTML = m.fe === ctx.me ? '<b>DU BIST ALS ERSTER RAUS!</b><br>Fang schon mal an: <b>EXEN!</b>' : `<b>${ctx.name(m.fe)}</b> ist als Erster raus und muss <b>EXEN</b>!`;
        setTimeout(() => banner.classList.add('hidden'), 4500);
      }
      const me = m.p.find(q => q[0] === ctx.me); const db = el.querySelector('.dashbtn');
      if (me && db) { db.textContent = me[6] > 0 ? 'DASH ' + (me[6] / 10).toFixed(0) : 'DASH'; db.classList.toggle('ready', me[6] === 0); }
    };
    // controls
    if (ctx.isPlayer) {
      const joy = el.querySelector('.joy'), knob = el.querySelector('.knob'); let pidPtr = null, vx = 0, vy = 0, lastSent = 0;
      let lx0 = 9, ly0 = 9; const sendInp = force => { const n = performance.now(); if ((force && n - lastSent > 70) || n - lastSent > 90 && Math.hypot(vx - lx0, vy - ly0) > 0.12 || (vx === 0 && vy === 0 && (lx0 !== 0 || ly0 !== 0))) { lastSent = n; lx0 = vx; ly0 = vy; ctx.send({ t: 'inp', x: +vx.toFixed(2), y: +vy.toFixed(2) }); } };
      const move = e => { const r = joy.getBoundingClientRect(), cxp = r.left + r.width / 2, cyp = r.top + r.height / 2, max = r.width / 2 - 10; let dx = e.clientX - cxp, dy = e.clientY - cyp; const d = Math.hypot(dx, dy); if (d > max) { dx *= max / d; dy *= max / d; } knob.style.transform = `translate(${dx}px, ${dy}px)`; vx = dx / max; vy = dy / max; sendInp(false); };
      joy.addEventListener('pointerdown', e => { e.preventDefault(); pidPtr = e.pointerId; joy.setPointerCapture(e.pointerId); move(e); });
      joy.addEventListener('pointermove', e => { if (e.pointerId === pidPtr) { e.preventDefault(); move(e); } });
      const up = e => { if (e.pointerId === pidPtr) { pidPtr = null; vx = vy = 0; knob.style.transform = ''; sendInp(true); } };
      joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
      el.querySelector('.firebtn').addEventListener('pointerdown', e => { e.preventDefault(); ctx.send({ t: 'fire' }); });
      el.querySelector('.dashbtn').addEventListener('pointerdown', e => { e.preventDefault(); ctx.send({ t: 'dash' }); });
      const keys = {}; const kd = e => { keys[e.key] = e.type === 'keydown'; if (e.type === 'keydown') { if (e.key === ' ') ctx.send({ t: 'fire' }); if (e.key === 'Shift') ctx.send({ t: 'dash' }); } vx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); vy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0); sendInp(true); };
      window.addEventListener('keydown', kd); window.addEventListener('keyup', kd);
      const iv = setInterval(() => { if (pidPtr != null) { lastSent = 0; sendInp(true); } }, 250);
      V.clean.push(() => { clearInterval(iv); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', kd); });
    }
    let lastT = performance.now(), popShown = false;
    const draw = () => {
      V.raf = requestAnimationFrame(draw);
      const tnow = performance.now(), dt = Math.min(0.05, (tnow - lastT) / 1000); lastT = tnow;
      const W = cv.width, s = W / VIEW, WW = A * s; cx.setTransform(1, 0, 0, 1, 0, 0);
      const sn = V.snaps;
      let shx = 0, shy = 0; if (V.shake > 0.3) { shx = (Math.random() - 0.5) * V.shake * s * 2; shy = (Math.random() - 0.5) * V.shake * s * 2; V.shake *= Math.pow(0.02, dt); }
      cx.translate(shx, shy);
      if (!sn.length) { cx.fillStyle = '#ecc07a'; cx.fillRect(0, 0, W, W); cx.fillStyle = '#16162a'; cx.font = `${44 * s}px Titan, sans-serif`; cx.textAlign = 'center'; cx.fillText('GLEICH GEHT ES LOS', W / 2, W / 2); return; }
      const rt = tnow - 140; let a = sn[sn.length - 1], b = a, k = 1;
      for (let i = sn.length - 1; i > 0; i--) if (sn[i - 1].at <= rt) { a = sn[i - 1]; b = sn[i]; k = Math.max(0, Math.min(1, (rt - a.at) / Math.max(1, b.at - a.at))); break; }
      const pa = {}; a.m.p.forEach(r => pa[r[0]] = r); const tt = tnow / 1000;
      const ipos = r => { const o = pa[r[0]] || r; return [o[1] + (r[1] - o[1]) * k, o[2] + (r[2] - o[2]) * k]; };
      const rowOf = pid => b.m.p.find(q => q[0] === pid);
      let fp = ctx.isPlayer ? rowOf(ctx.me) : null; if (!fp || !(fp[5] & F.alive)) fp = (window.__fav && rowOf(window.__fav) && (rowOf(window.__fav)[5] & F.alive)) ? rowOf(window.__fav) : (b.m.p.find(q => q[5] & F.alive) || b.m.p[0]);
      const [fx, fy] = ipos(fp), hv = VIEW / 2;
      if (V.camx == null) { V.camx = fx; V.camy = fy; } const kk = Math.min(1, dt * 9); V.camx += (fx - V.camx) * kk; V.camy += (fy - V.camy) * kk;
      V.camx = Math.max(hv, Math.min(A - hv, V.camx)); V.camy = Math.max(hv, Math.min(A - hv, V.camy));
      const camx = V.camx - hv, camy = V.camy - hv;
      cx.save(); cx.translate(-camx * s, -camy * s);
      drawLane(cx, s, b.m.m || 0, camx, camy, tt);
      for (const [mx, my, mt] of (b.m.mt || [])) { const pr = 1 - mt / 16; cx.beginPath(); cx.arc(mx * s, my * s, 175 * s, 0, 7); cx.fillStyle = `rgba(255,60,20,${0.1 + 0.25 * pr})`; cx.fill(); cx.lineWidth = 6 * s; cx.setLineDash([18 * s, 12 * s]); cx.strokeStyle = '#ff3b1a'; cx.stroke(); cx.setLineDash([]); cx.beginPath(); cx.arc(mx * s, my * s, 175 * s * Math.max(0.05, pr), 0, 7); cx.fillStyle = 'rgba(255,200,40,.45)'; cx.fill(); cx.font = `${60 * s}px Titan, sans-serif`; cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.fillText('!', mx * s, my * s + 20 * s); }
      // items
      for (const [kind, ix, iy] of b.m.it) drawItem(cx, kind, ix * s, iy * s, s, tt);
      // balls
      for (const [tx, ty] of (b.m.tr || [])) { cx.save(); cx.translate(tx * s, ty * s); cx.rotate(tt * 0.5); cx.fillStyle = '#ffe14a'; cx.strokeStyle = '#16162a'; cx.lineWidth = 3 * s; cx.beginPath(); cx.ellipse(0, 0, 22 * s, 11 * s, 0.4, 0, 7); cx.fill(); cx.stroke(); cx.beginPath(); cx.moveTo(-14 * s, -3 * s); cx.quadraticCurveTo(0, -12 * s, 14 * s, -3 * s); cx.stroke(); cx.restore(); }
      for (const [bx, by, bomb] of b.m.b) {
        if (bomb) { const rr0 = BR * 1.7 * s; cx.beginPath(); cx.arc(bx * s + 3 * s, by * s + 6 * s, rr0, 0, 7); cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fill(); cx.beginPath(); cx.arc(bx * s, by * s, rr0, 0, 7); cx.fillStyle = '#16162a'; cx.fill(); cx.lineWidth = 3 * s; cx.strokeStyle = '#fff'; cx.stroke(); cx.fillStyle = Math.floor(tt * 14) % 2 ? '#ff3b3b' : '#ffd21a'; cx.beginPath(); cx.arc(bx * s + rr0 * 0.7, by * s - rr0 * 0.9, 5 * s, 0, 7); cx.fill(); continue; }
        cx.beginPath(); cx.arc(bx * s + 3 * s, by * s + 5 * s, BR * s, 0, 7); cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fill(); cx.beginPath(); cx.arc(bx * s, by * s, BR * s, 0, 7); const gr = cx.createRadialGradient(bx * s - 5 * s, by * s - 6 * s, 2 * s, bx * s, by * s, BR * s); gr.addColorStop(0, '#666'); gr.addColorStop(1, '#0a0a0a'); cx.fillStyle = gr; cx.fill(); cx.lineWidth = 2.5 * s; cx.strokeStyle = '#fff'; cx.stroke();
      }
      if (b.m.rb) { const [rx, ry, ra] = b.m.rb; cx.save(); cx.translate(rx * s, ry * s);
        cx.beginPath(); cx.ellipse(10 * s, 14 * s, 112 * s, 86 * s, ra, 0, 7); cx.fillStyle = 'rgba(0,0,0,.3)'; cx.fill();
        cx.rotate(ra || 0);
        // tracks
        cx.fillStyle = '#23261c'; rr(cx, -100 * s, -82 * s, 200 * s, 34 * s, 12 * s); cx.fill(); rr(cx, -100 * s, 48 * s, 200 * s, 34 * s, 12 * s); cx.fill();
        cx.strokeStyle = '#6b705a'; cx.lineWidth = 4 * s; for (let q = -90; q < 100; q += 20) { const o = ((tt * 90) % 20); cx.beginPath(); cx.moveTo((q + o) * s, -82 * s); cx.lineTo((q + o) * s, -48 * s); cx.moveTo((q + o) * s, 48 * s); cx.lineTo((q + o) * s, 82 * s); cx.stroke(); }
        // hull
        cx.fillStyle = '#5c6b3a'; cx.strokeStyle = '#16162a'; cx.lineWidth = 5 * s; rr(cx, -88 * s, -52 * s, 176 * s, 104 * s, 16 * s); cx.fill(); cx.stroke();
        cx.fillStyle = '#4a5730'; rr(cx, -70 * s, -36 * s, 100 * s, 72 * s, 10 * s); cx.fill();
        // barrel
        cx.fillStyle = '#2d3320'; cx.fillRect(10 * s, -10 * s, 112 * s, 20 * s); cx.strokeRect(10 * s, -10 * s, 112 * s, 20 * s); cx.fillStyle = '#16162a'; cx.fillRect(116 * s, -14 * s, 14 * s, 28 * s);
        // turret with Ralf (stays upright)
        cx.beginPath(); cx.arc(-8 * s, 0, 38 * s, 0, 7); cx.fillStyle = '#6f8044'; cx.fill(); cx.stroke();
        cx.restore();
        cx.save(); cx.translate((rx - 8 * Math.cos(ra || 0) * 0) * s, ry * s - 4 * s);
        cx.save(); cx.beginPath(); cx.arc(0, 0, 34 * s, 0, 7); cx.clip(); if (V.rimg && V.rimg.complete && V.rimg.naturalWidth) cx.drawImage(V.rimg, -34 * s, -34 * s, 68 * s, 68 * s); cx.restore();
        cx.beginPath(); cx.arc(0, 0, 34 * s, 0, 7); cx.lineWidth = 4 * s; cx.strokeStyle = '#16162a'; cx.stroke();
        const lf = Math.sin(tt * 14) > 0; cx.font = `${24 * s}px Titan, sans-serif`; cx.textAlign = 'center'; cx.lineWidth = 5 * s; cx.strokeStyle = '#111'; cx.fillStyle = '#fff'; const lt = lf ? 'HAHAHA!' : 'MUAHAHA!'; cx.strokeText(lt, 0, -118 * s); cx.fillText(lt, 0, -118 * s);
        cx.font = `${20 * s}px Titan, sans-serif`; cx.fillStyle = '#ffd21a'; cx.strokeText('RALLUM-PANZER', 0, 128 * s); cx.fillText('RALLUM-PANZER', 0, 128 * s); cx.restore(); }
      // karts (dead first so living are on top)
      const rows = b.m.p.slice().sort((x, y) => (x[5] & F.alive) - (y[5] & F.alive));
      for (const r of rows) {
        const [pid, x1, y1, d1, lv, fl] = r, o = pa[pid] || r, x = (o[1] + (x1 - o[1]) * k) * s, y = (o[2] + (y1 - o[2]) * k) * s, dir = d1 / 100, alive = fl & F.alive, col = colOf(pid);
        drawKart(cx, x, y, dir, col, alive, fl, s, tt, imgs[pid], pid === ctx.me);
        if (alive && (fl & (F.turbo | F.star | F.dash)) && V.parts.length < 500) V.parts.push({ x: x / s - Math.cos(dir) * 46, y: y / s - Math.sin(dir) * 46, vx: -Math.cos(dir) * 50 + (Math.random() - 0.5) * 40, vy: -Math.sin(dir) * 50 + (Math.random() - 0.5) * 40, life: 0.45, max: 0.45, c: (fl & F.star) ? `hsl(${(tt * 540 + x) % 360},95%,60%)` : '#ff9a1a', s: 6 + Math.random() * 4 });
        if (alive && (fl & F.bomb)) { cx.beginPath(); cx.arc(x, y - 112 * s, 12 * s, 0, 7); cx.fillStyle = '#16162a'; cx.fill(); cx.lineWidth = 2.5 * s; cx.strokeStyle = '#fff'; cx.stroke(); }
        if (alive && (fl & F.stun)) { for (let q = 0; q < 3; q++) { const a = tt * 7 + q * 2.09; cx.font = `${22 * s}px sans-serif`; cx.textAlign = 'center'; cx.fillStyle = '#ffd21a'; cx.fillText('\u2605', x + Math.cos(a) * 40 * s, y - 56 * s + Math.sin(a) * 10 * s); } }
        if (alive) drawBalloons(cx, x, y, lv, col, s, tt, fl & F.inv);
        else { cx.font = `${54 * s}px Titan, sans-serif`; cx.textAlign = 'center'; cx.lineWidth = 8 * s; cx.strokeStyle = '#111'; cx.strokeText('RAUS', x, Math.max(70 * s, y - 60 * s)); cx.fillStyle = '#ff3b3b'; cx.fillText('RAUS', x, Math.max(70 * s, y - 60 * s)); }
        if (pid === ctx.me && alive) { cx.font = `${28 * s}px Titan, sans-serif`; cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.lineWidth = 5 * s; cx.strokeStyle = '#111'; const dy2 = y + 84 * s > WW - 12 * s ? y - 120 * s : y + 84 * s; cx.strokeText('DU', x, dy2); cx.fillText('DU', x, dy2); }
      }
      // particles
      for (const p of V.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.15, dt); p.vy = p.vy * Math.pow(0.15, dt) + 120 * dt; cx.globalAlpha = Math.max(0, p.life / p.max); cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x * s, p.y * s, p.s * s, 0, 7); cx.fill(); } cx.globalAlpha = 1; V.parts = V.parts.filter(p => p.life > 0);
      for (const rg of V.rings) { rg.life -= dt; rg.r += 520 * dt; cx.globalAlpha = Math.max(0, rg.life * 2); cx.lineWidth = 9 * s; cx.strokeStyle = '#ffb22a'; cx.beginPath(); cx.arc(rg.x * s, rg.y * s, rg.r * s, 0, 7); cx.stroke(); } cx.globalAlpha = 1; V.rings = V.rings.filter(r => r.life > 0);
      cx.restore();
      // off-screen arrows to other karts
      cx.setTransform(1, 0, 0, 1, 0, 0);
      for (const r of b.m.p) { if (r[0] === fp[0] || !(r[5] & F.alive)) continue; const [px, py] = ipos(r), sx = (px - camx) * s, sy = (py - camy) * s, pad = 26 * s; if (sx > 0 && sx < W && sy > 0 && sy < W) continue; const ex = Math.max(pad, Math.min(W - pad, sx)), ey = Math.max(pad, Math.min(W - pad, sy)), an = Math.atan2(sy - ey, sx - ex); cx.save(); cx.translate(ex, ey); cx.rotate(an); cx.beginPath(); cx.moveTo(15 * s, 0); cx.lineTo(-11 * s, -12 * s); cx.lineTo(-11 * s, 12 * s); cx.closePath(); cx.fillStyle = colOf(r[0]); cx.fill(); cx.lineWidth = 3 * s; cx.strokeStyle = '#111'; cx.stroke(); cx.restore(); }
      // minimap
      { const mm = W * 0.27, mx0 = 8 * s * 1.5, my0 = W - mm - 8 * s * 1.5, kz = mm / A; cx.fillStyle = 'rgba(22,22,42,.62)'; cx.fillRect(mx0, my0, mm, mm); const mg = b.m.m || 0; if (mg > 0) { cx.fillStyle = 'rgba(216,16,24,.5)'; cx.fillRect(mx0, my0, mm, mg * kz); cx.fillRect(mx0, my0 + mm - mg * kz, mm, mg * kz); cx.fillRect(mx0, my0, mg * kz, mm); cx.fillRect(mx0 + mm - mg * kz, my0, mg * kz, mm); }
        cx.fillStyle = 'rgba(255,255,255,.4)'; for (const [ox, oy, or] of OB) { cx.beginPath(); cx.arc(mx0 + ox * kz, my0 + oy * kz, Math.max(1.5, or * kz), 0, 7); cx.fill(); }
        cx.fillStyle = '#ffd21a'; for (const [, ix, iy] of b.m.it) cx.fillRect(mx0 + ix * kz - 1.5, my0 + iy * kz - 1.5, 3, 3);
        for (const [mx, my] of (b.m.mt || [])) { cx.strokeStyle = '#ff3b1a'; cx.lineWidth = 2; cx.beginPath(); cx.arc(mx0 + mx * kz, my0 + my * kz, 175 * kz, 0, 7); cx.stroke(); }
        if (b.m.rb) { cx.fillStyle = '#d81018'; cx.beginPath(); cx.arc(mx0 + b.m.rb[0] * kz, my0 + b.m.rb[1] * kz, Math.max(4, RB * kz), 0, 7); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.stroke(); }
        for (const r of b.m.p) { if (!(r[5] & F.alive)) continue; const [px, py] = ipos(r); cx.fillStyle = colOf(r[0]); cx.beginPath(); cx.arc(mx0 + px * kz, my0 + py * kz, r[0] === ctx.me ? 4.5 : 3.5, 0, 7); cx.fill(); cx.strokeStyle = r[0] === ctx.me ? '#fff' : '#111'; cx.lineWidth = r[0] === ctx.me ? 2 : 1; cx.stroke(); }
        cx.strokeStyle = 'rgba(255,255,255,.8)'; cx.lineWidth = 1.5; cx.strokeRect(mx0 + camx * kz, my0 + camy * kz, VIEW * kz, VIEW * kz); cx.strokeStyle = '#000'; cx.lineWidth = 2; cx.strokeRect(mx0, my0, mm, mm); }
      if (V.banner && performance.now() - V.banner.t < 2600) { cx.font = `${64 * s}px Titan, sans-serif`; cx.textAlign = 'center'; cx.lineWidth = 9 * s; cx.strokeStyle = '#16162a'; cx.fillStyle = '#ffd21a'; cx.strokeText(V.banner.txt, W / 2, W * 0.3); cx.fillText(V.banner.txt, W / 2, W * 0.3); }
      // HUD time
      const left = Math.max(0, LIMIT - b.m.tm / 10); cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.font = `${40 * s}px Titan, sans-serif`; cx.textAlign = 'center'; cx.lineWidth = 7 * s; cx.strokeStyle = '#111'; cx.fillStyle = b.m.sd ? '#ff5a5a' : '#fff';
      const ht = b.m.sd ? `SUDDEN DEATH ${Math.ceil(left)}` : `${Math.ceil(left)}`; cx.strokeText(ht, W / 2, 46 * s); cx.fillText(ht, W / 2, 46 * s);
      if (V.flash > 0) { cx.fillStyle = `rgba(255,40,40,${V.flash})`; cx.fillRect(0, 0, W, W); V.flash = Math.max(0, V.flash - dt * 1.2); }
      if (b.m.ov && !popShown) { popShown = true; ctx.sfx.bad(); }
    };
    draw();
    return unmount;
  }
  // ---- drawing helpers
  function drawLane(cx, s, m, vx0, vy0, t) {
    const WW = A * s, x0 = Math.floor(vx0 / 100) * 100, y0 = Math.floor(vy0 / 100) * 100;
    cx.fillStyle = '#e2b06a'; cx.fillRect(0, 0, WW, WW);
    for (let x = x0; x < vx0 + VIEW + 100; x += 100) { if (x < 0 || x >= A) continue; if ((x / 100) % 2 === 0) { cx.fillStyle = 'rgba(120,70,20,.12)'; cx.fillRect(x * s, 0, 100 * s, WW); } cx.strokeStyle = 'rgba(120,70,20,.35)'; cx.lineWidth = 1.5 * s; cx.beginPath(); cx.moveTo(x * s, vy0 * s); cx.lineTo(x * s, (vy0 + VIEW) * s); cx.stroke(); }
    // lane arrows and center bullseye
    cx.fillStyle = 'rgba(90,50,10,.55)'; for (let q = 0; q < 7; q++) { const x = (C - 270 + q * 90) * s, y = (C + 330 - Math.abs(q - 3) * 38) * s; cx.beginPath(); cx.moveTo(x, y - 22 * s); cx.lineTo(x - 13 * s, y + 14 * s); cx.lineTo(x + 13 * s, y + 14 * s); cx.closePath(); cx.fill(); }
    for (const [ax, ay] of [[C, 240], [C, A - 240], [240, C], [A - 240, C]]) { cx.beginPath(); cx.arc(ax * s, ay * s, 14 * s, 0, 7); cx.fill(); }
    cx.beginPath(); cx.arc(C * s, C * s, 250 * s, 0, 7); cx.lineWidth = 8 * s; cx.strokeStyle = 'rgba(216,16,24,.35)'; cx.stroke(); cx.beginPath(); cx.arc(C * s, C * s, 160 * s, 0, 7); cx.stroke();
    cx.strokeStyle = 'rgba(216,16,24,.55)'; cx.lineWidth = 6 * s; cx.beginPath(); cx.moveTo(0, 320 * s); cx.lineTo(WW, 320 * s); cx.moveTo(0, (A - 320) * s); cx.lineTo(WW, (A - 320) * s); cx.stroke();
    // boost pads
    for (const [px, py, pd] of BP) { cx.save(); cx.translate(px * s, py * s); cx.rotate(pd); cx.fillStyle = 'rgba(255,210,26,.95)'; cx.strokeStyle = '#16162a'; cx.lineWidth = 4 * s; rr(cx, -42 * s, -34 * s, 84 * s, 68 * s, 10 * s); cx.fill(); cx.stroke(); cx.strokeStyle = '#16162a'; cx.lineWidth = 7 * s; cx.lineJoin = 'round'; for (let q = -1; q <= 1; q += 2) { cx.beginPath(); cx.moveTo((q * 18 - 8) * s, -20 * s); cx.lineTo((q * 18 + 8) * s, 0); cx.lineTo((q * 18 - 8) * s, 20 * s); cx.stroke(); } cx.restore(); }
    // obstacles: pins seen from above
    for (const [ox, oy, or] of OB) {
      if (ox + or < vx0 || ox - or > vx0 + VIEW || oy + or < vy0 || oy - or > vy0 + VIEW) continue;
      cx.beginPath(); cx.arc(ox * s + 5 * s, oy * s + 8 * s, or * s, 0, 7); cx.fillStyle = 'rgba(0,0,0,.28)'; cx.fill();
      const gr = cx.createRadialGradient(ox * s - or * .3 * s, oy * s - or * .3 * s, or * .1 * s, ox * s, oy * s, or * s); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#cfd2da');
      cx.beginPath(); cx.arc(ox * s, oy * s, or * s, 0, 7); cx.fillStyle = gr; cx.fill(); cx.lineWidth = 4 * s; cx.strokeStyle = '#16162a'; cx.stroke();
      cx.beginPath(); cx.arc(ox * s, oy * s, or * 0.62 * s, 0, 7); cx.lineWidth = 6 * s; cx.strokeStyle = '#d81018'; cx.stroke();
    }
    // shrinking hazard walls
    if (m > 0) {
      cx.save(); cx.beginPath(); cx.rect(0, 0, WW, WW); cx.rect(m * s, m * s, WW - 2 * m * s, WW - 2 * m * s); cx.clip('evenodd');
      cx.fillStyle = '#16162a'; cx.fillRect(0, 0, WW, WW); cx.strokeStyle = '#d81018'; cx.lineWidth = 26 * s; for (let i = -WW; i < WW * 2; i += 70 * s) { cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + WW, WW); cx.stroke(); } cx.restore();
    }
    cx.lineWidth = 12 * s; cx.strokeStyle = '#16162a'; cx.strokeRect((m + 6) * s, (m + 6) * s, WW - 2 * (m + 6) * s, WW - 2 * (m + 6) * s);
    cx.lineWidth = 5 * s; cx.strokeStyle = '#d81018'; cx.strokeRect((m + 14) * s, (m + 14) * s, WW - 2 * (m + 14) * s, WW - 2 * (m + 14) * s);
  }
  function drawItem(cx, kind, x, y, s, t) {
    const bob = Math.sin(t * 4 + x) * 5 * s, r = 30 * s; y += bob;
    cx.beginPath(); cx.arc(x, y + 30 * s, 22 * s, 0, 7); cx.fillStyle = 'rgba(0,0,0,.2)'; cx.fill();
    const col = { shield: '#3cc8ff', turbo: '#ffd21a', triple: '#ff7a2a', heal: '#ff3b6b', star: '#b06bff', banana: '#ffe14a', bomb: '#444' }[kind];
    cx.beginPath(); cx.arc(x, y, r + 5 * s * (0.5 + 0.5 * Math.sin(t * 6)), 0, 7); cx.fillStyle = col + '55'; cx.fill();
    cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fillStyle = col; cx.fill(); cx.lineWidth = 4 * s; cx.strokeStyle = '#16162a'; cx.stroke();
    cx.fillStyle = '#fff'; cx.strokeStyle = '#16162a'; cx.lineWidth = 3 * s;
    if (kind === 'shield') { cx.beginPath(); cx.moveTo(x, y - 17 * s); cx.lineTo(x + 14 * s, y - 10 * s); cx.lineTo(x + 11 * s, y + 8 * s); cx.lineTo(x, y + 18 * s); cx.lineTo(x - 11 * s, y + 8 * s); cx.lineTo(x - 14 * s, y - 10 * s); cx.closePath(); cx.fill(); cx.stroke(); }
    else if (kind === 'turbo') { cx.beginPath(); cx.moveTo(x + 4 * s, y - 19 * s); cx.lineTo(x - 11 * s, y + 3 * s); cx.lineTo(x - 1 * s, y + 3 * s); cx.lineTo(x - 5 * s, y + 19 * s); cx.lineTo(x + 12 * s, y - 5 * s); cx.lineTo(x + 2 * s, y - 5 * s); cx.closePath(); cx.fill(); cx.stroke(); }
    else if (kind === 'triple') { for (const a of [-0.7, 0, 0.7]) { cx.beginPath(); cx.arc(x + Math.sin(a) * 15 * s, y - Math.cos(a) * 12 * s + 8 * s, 6 * s, 0, 7); cx.fill(); cx.stroke(); } }
    else if (kind === 'star') { cx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? 8 * s : 19 * s; cx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } cx.closePath(); cx.fillStyle = '#ffe14a'; cx.fill(); cx.stroke(); }
    else if (kind === 'banana') { cx.beginPath(); cx.arc(x, y - 2 * s, 15 * s, 0.3, Math.PI - 0.3); cx.lineWidth = 9 * s; cx.strokeStyle = '#fff'; cx.stroke(); cx.lineWidth = 3 * s; }
    else if (kind === 'bomb') { cx.beginPath(); cx.arc(x, y + 3 * s, 13 * s, 0, 7); cx.fillStyle = '#16162a'; cx.fill(); cx.strokeStyle = '#fff'; cx.stroke(); cx.beginPath(); cx.moveTo(x + 6 * s, y - 8 * s); cx.lineTo(x + 12 * s, y - 16 * s); cx.stroke(); }
    else { cx.beginPath(); cx.ellipse(x, y - 3 * s, 11 * s, 14 * s, 0, 0, 7); cx.fill(); cx.stroke(); cx.beginPath(); cx.moveTo(x, y + 11 * s); cx.lineTo(x - 4 * s, y + 18 * s); cx.lineTo(x + 4 * s, y + 18 * s); cx.closePath(); cx.fill(); }
  }
  function drawKart(cx, x, y, dir, col, alive, fl, s, t, img, mine) {
    cx.save(); cx.translate(x, y);
    // shield bubble
    if (alive && (fl & F.star)) { cx.beginPath(); cx.arc(0, 0, R * 1.45 * s, 0, 7); cx.lineWidth = 7 * s; cx.strokeStyle = `hsl(${(t * 600) % 360},95%,60%)`; cx.stroke(); }
    if (alive && (fl & F.shield)) { cx.beginPath(); cx.arc(0, 0, R * 1.35 * s, 0, 7); cx.fillStyle = 'rgba(80,200,255,.22)'; cx.fill(); cx.lineWidth = 4 * s; cx.strokeStyle = 'rgba(140,230,255,.9)'; cx.stroke(); }
    if (alive && (fl & F.dash)) { cx.fillStyle = 'rgba(255,255,255,.4)'; cx.beginPath(); cx.ellipse(-Math.cos(dir) * 60 * s, -Math.sin(dir) * 60 * s, 62 * s, 28 * s, dir, 0, 7); cx.fill(); }
    cx.globalAlpha = alive && (fl & F.inv) && !(fl & F.shield) && Math.floor(t * 16) % 2 ? 0.45 : 1;
    cx.rotate(dir);
    cx.beginPath(); cx.ellipse(6 * s, 10 * s, R * 1.15 * s, R * 0.85 * s, 0, 0, 7); cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fill();
    cx.fillStyle = alive ? col : '#777'; cx.strokeStyle = '#111'; cx.lineWidth = 3.5 * s;
    rr(cx, -R * 1.15 * s, -R * 0.8 * s, R * 2.3 * s, R * 1.6 * s, 12 * s); cx.fill(); cx.stroke();
    cx.fillStyle = 'rgba(255,255,255,.35)'; rr(cx, -R * 0.9 * s, -R * 0.65 * s, R * 1.5 * s, R * 0.3 * s, 6 * s); cx.fill();
    cx.fillStyle = '#111'; [[-0.85, -1], [0.55, -1], [-0.85, 0.8], [0.55, 0.8]].forEach(([wx, wy]) => cx.fillRect(wx * R * s, wy * R * s - 4 * s, 18 * s, 10 * s));
    cx.fillStyle = '#ffd21a'; cx.beginPath(); cx.moveTo(R * 1.15 * s, 0); cx.lineTo(R * 0.8 * s, -9 * s); cx.lineTo(R * 0.8 * s, 9 * s); cx.closePath(); cx.fill();
    if (alive && (fl & F.turbo)) { cx.fillStyle = '#ff9a1a'; cx.beginPath(); cx.moveTo(-R * 1.15 * s, 0); cx.lineTo(-R * 1.15 * s - (26 + Math.random() * 18) * s, 0); cx.lineTo(-R * 1.15 * s, 12 * s); cx.lineTo(-R * 1.15 * s, -12 * s); cx.closePath(); cx.fill(); }
    cx.restore(); cx.globalAlpha = 1;
    const rr_ = R * 0.78 * s; cx.save(); cx.beginPath(); cx.arc(x, y, rr_, 0, 7); cx.closePath(); cx.clip();
    if (img && img.complete) { if (!alive) cx.filter = 'grayscale(1)'; cx.drawImage(img, x - rr_, y - rr_, rr_ * 2, rr_ * 2); cx.filter = 'none'; }
    cx.restore(); cx.beginPath(); cx.arc(x, y, rr_, 0, 7); cx.lineWidth = 3 * s; cx.strokeStyle = mine ? '#fff' : '#111'; cx.stroke();
    if (alive && (fl & F.triple)) { cx.fillStyle = '#ff7a2a'; for (const a of [-0.5, 0, 0.5]) { cx.beginPath(); cx.arc(x + Math.cos(dir + a) * 70 * s, y + Math.sin(dir + a) * 70 * s, 5 * s, 0, 7); cx.fill(); } }
  }
  function drawBalloons(cx, x, y, lives, col, s, t, inv) {
    for (let i = 0; i < lives; i++) {
      const off = (i - (lives - 1) / 2), wob = Math.sin(t * 3 + i * 1.7) * 6 * s, bx = x + off * 32 * s + wob, by = y - (78 + (i % 2) * 10) * s + Math.cos(t * 2.4 + i) * 3 * s;
      cx.beginPath(); cx.moveTo(x + off * 8 * s, y - 40 * s); cx.quadraticCurveTo(bx - off * 8 * s, by + 38 * s, bx, by + 27 * s); cx.lineWidth = 1.6 * s; cx.strokeStyle = '#222'; cx.stroke();
      cx.globalAlpha = inv && Math.floor(t * 14) % 2 ? 0.5 : 1;
      cx.beginPath(); cx.ellipse(bx, by, 22 * s, 28 * s, wob * 0.01, 0, 7); cx.fillStyle = col; cx.fill(); cx.lineWidth = 3 * s; cx.strokeStyle = '#111'; cx.stroke();
      cx.beginPath(); cx.moveTo(bx - 4 * s, by + 28 * s); cx.lineTo(bx, by + 34 * s); cx.lineTo(bx + 4 * s, by + 28 * s); cx.closePath(); cx.fillStyle = col; cx.fill(); cx.stroke();
      cx.beginPath(); cx.ellipse(bx - 7 * s, by - 9 * s, 5 * s, 10 * s, -0.4, 0, 7); cx.fillStyle = 'rgba(255,255,255,.6)'; cx.fill(); cx.globalAlpha = 1;
    }
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function unmount() { if (V) { cancelAnimationFrame(V.raf); V.clean.forEach(f => f()); V = null; } }
  return { hostStart, hostStop, input, fire, dash, snap, mount, unmount, COLORS, LIVES };
})();
