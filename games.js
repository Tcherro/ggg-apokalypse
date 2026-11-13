// Minigames. Each game: variants with name/desc/dur(ms)/better('high'|'low'), play(el, ctx) -> cleanup
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function onTap(el, fn) {
  const h = e => { e.preventDefault(); fn(e); };
  el.addEventListener('pointerdown', h);
  return () => el.removeEventListener('pointerdown', h);
}
function timerBar(el, dur, startAt, clk) {
  const bar = document.createElement('div'); bar.className = 'timebar'; bar.innerHTML = '<i></i>';
  el.prepend(bar); const i = bar.firstChild; let raf, stop = false;
  const loop = () => { if (stop) return; const f = Math.max(0, 1 - (clk.now() - startAt) / dur); i.style.width = (f * 100) + '%'; if (f > 0) raf = requestAnimationFrame(loop); };
  loop(); return () => { stop = true; cancelAnimationFrame(raf); };
}
// Pausable clock: all minigame timing runs on it, so a Rallumkalypse can freeze and resume a running game.
function makeClock() {
  let paused = false, pausedAt = 0, offset = 0; const timers = new Set();
  const now = () => (paused ? pausedAt : performance.now()) - offset;
  const arm = t => { clearTimeout(t.id); t.id = setTimeout(() => { timers.delete(t); if (!t.dead) t.fn(); }, Math.max(0, t.due - now())); };
  function after(fn, ms) { const t = { due: now() + (ms || 0), fn }; timers.add(t); if (!paused) arm(t); return t; }
  function every(fn, ms) { const h = { rep: true, cur: null }; const tick = () => { if (h.dead) return; fn(); if (!h.dead) h.cur = after(tick, ms); }; h.cur = after(tick, ms); return h; }
  function cancel(t) { if (!t) return; t.dead = true; if (t.rep) { if (t.cur) cancel(t.cur); return; } clearTimeout(t.id); timers.delete(t); }
  function pause() { if (paused) return; paused = true; pausedAt = performance.now(); timers.forEach(t => clearTimeout(t.id)); }
  function resume() { if (!paused) return; offset += performance.now() - pausedAt; paused = false; timers.forEach(arm); }
  function clear() { timers.forEach(t => { t.dead = true; clearTimeout(t.id); }); timers.clear(); }
  return { now, after, every, cancel, pause, resume, clear, get paused() { return paused; } };
}

function haversine(a, b, c, d) { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
const fmtNum = (v, unit) => unit === '' ? String(Math.round(v * 100) / 100).replace('.', ',') : Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const readNum = el => {
  const i = el.querySelector('input.num'); if (!i || i.value.trim() === '') return null;
  let s = i.value.trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = parseFloat(s); return isNaN(v) ? null : v;
};
function numInput(c, cb, clean) {
  c.innerHTML = '<input class="num" type="text" inputmode="decimal" placeholder="Deine Zahl"><button class="big gas">ABGEBEN</button>';
  const inp = c.querySelector('input'); setTimeout(() => inp.focus(), 50);
  clean.push(onTap(c.querySelector('button'), () => { const v = readNum(c); if (v == null) return; inp.blur(); cb(v); }));
}
const GAMES = {
  // ---------------------------------------------------------------- RACE
  race: {
    title: 'GOSSEN-GRAND-PRIX', label: 'Kart-Rennen',
    variants: {
      tap: { name: 'Tap-Sprint', desc: 'So geht es: Hämmere mit dem Finger auf den roten GAS-Knopf. Jeder Tipp schiebt dein Kart ein Stück nach vorn. 70 Tipps bis ins Ziel, wer zuerst da ist, gewinnt.', dur: 24000, better: 'high' },
      lr: { name: 'Links-Rechts-Pedal', desc: 'So geht es: Tritt abwechselnd in das linke und das rechte Pedal. Das leuchtende Pedal ist als Nächstes dran. Zweimal dieselbe Seite zählt nicht. 55 Tritte bis ins Ziel.', dur: 24000, better: 'high' },
      turbo: { name: 'Turbo-Timing', desc: 'So geht es: Eine gelbe Nadel pendelt hin und her. Tippe BOOST, wenn sie im GRÜNEN Feld ist: +3 Meter. Daneben nur +1. Ziel sind 60 Meter.', dur: 26000, better: 'high' }
    },
    play(el, ctx) {
      const v = ctx.variant, target = { tap: 70, lr: 55, turbo: 60 }[v];
      let dist = 0, done = false, last = null, cool = 0, finishMs = null;
      const lanes = ctx.players.map(p => `<div class="lane ${p.pid === ctx.me ? 'mine' : ''}" data-pid="${p.pid}"><span class="lname">${esc(p.name)}</span><div class="kart"><img src="${p.img}"><i class="body"></i></div></div>`).join('');
      const HOW = { tap: 'TIPPE SO SCHNELL DU KANNST AUF GAS!', lr: 'ABWECHSELND LINKS - RECHTS TRETEN', turbo: 'BOOST NUR IM GRÜNEN FELD DRÜCKEN!' }[v];
      el.innerHTML = `<div class="track">${lanes}<div class="finish"></div></div>
        <div class="racehud"><div class="dist">0 / ${target}</div><div class="place p1">1.</div></div><div class="howto" id="howto">${HOW}</div><div class="controls"></div>`;
      const howEl = el.querySelector('#howto');
      const say = (t, cls) => { howEl.textContent = t; howEl.className = 'howto ' + (cls || ''); };
      const ctr = el.querySelector('.controls'), distEl = el.querySelector('.dist');
      const clean = [timerBar(el, ctx.dur, ctx.startAt, ctx)];
      const add = n => {
        if (done) return; dist = Math.min(target, dist + n); ctx.sfx.tap();
        distEl.textContent = `${dist} / ${target}`; ctx.progress({ f: dist / target });
        setLane(ctx.me, dist / target);
        if (dist >= target) { finishMs = ctx.now() - ctx.startAt; end(); }
      };
      const pos = {}; const placeEl = () => el.querySelector('.place');
      const setLane = (pid, f) => {
        pos[pid] = f; const k = el.querySelector(`.lane[data-pid="${pid}"] .kart`); if (k) k.style.left = `calc(${(f * 100).toFixed(1)}% * 0.8)`;
        const mineF = pos[ctx.me] || 0, rank = 1 + Object.keys(pos).filter(q => q !== ctx.me && pos[q] > mineF).length, pe = placeEl();
        if (pe && !done) { pe.textContent = rank + '.'; pe.className = 'place p' + Math.min(rank, 4); }
      };
      ctx.onLive(live => { for (const pid in live) if (pid !== ctx.me && live[pid] && live[pid].f != null) setLane(pid, live[pid].f); });
      if (v === 'tap') {
        ctr.innerHTML = '<button class="big gas pulse">GAS!</button>';
        clean.push(onTap(ctr.firstChild, () => { add(1); ctr.firstChild.classList.remove('pulse'); }));
      } else if (v === 'lr') {
        ctr.innerHTML = '<button class="big half l pedal next">LINKS<small>Pedal</small></button><button class="big half r pedal">RECHTS<small>Pedal</small></button>';
        const L = ctr.querySelector('.l'), Rr = ctr.querySelector('.r');
        const mark = nxt => { L.classList.toggle('next', nxt === 'l'); Rr.classList.toggle('next', nxt === 'r'); };
        const step = side => { if (last !== side) { add(1); last = side; mark(side === 'l' ? 'r' : 'l'); say(side === 'l' ? 'JETZT RECHTS!' : 'JETZT LINKS!'); } else { ctx.sfx.bad(); say('FALSCHE SEITE! ANDERES PEDAL!', 'bad'); (side === 'l' ? L : Rr).classList.add('shake'); ctx.after(() => (side === 'l' ? L : Rr).classList.remove('shake'), 300); } };
        clean.push(onTap(L, () => step('l'))); clean.push(onTap(Rr, () => step('r')));
      } else {
        ctr.innerHTML = '<div class="gauge"><div class="zone"><span>HIER!</span></div><div class="needle"></div></div><button class="big gas">BOOST!</button>';
        const needle = ctr.querySelector('.needle'); let raf, pos = 0;
        const zs = 0.30 + ctx.rng() * 0.3, zw = 0.24; const zone = ctr.querySelector('.zone'); zone.style.left = (zs * 100) + '%'; zone.style.width = (zw * 100) + '%';
        const loop = () => { const t = (ctx.now() - ctx.startAt) / 1000; pos = (Math.sin(t * 3.0) + 1) / 2; needle.style.left = (pos * 100) + '%'; raf = requestAnimationFrame(loop); };
        loop(); clean.push(() => cancelAnimationFrame(raf));
        clean.push(onTap(ctr.querySelector('.gas'), () => {
          const now = ctx.now(); if (now < cool) return; cool = now + 220;
          if (pos >= zs && pos <= zs + zw) { add(3); say('PERFEKT! +3', 'good'); zone.classList.add('hit'); ctx.after(() => zone.classList.remove('hit'), 250); }
          else { add(1); say('Daneben, nur +1. Warte aufs Grüne!', 'bad'); }
        }));
      }
      function end() {
        if (done) return; done = true; ctr.innerHTML = `<div class="waitmsg">${finishMs != null ? 'IM ZIEL! ' + (finishMs / 1000).toFixed(2) + ' s' : 'ZEIT UM!'}</div>`;
        const score = finishMs != null ? 100000 - Math.round(finishMs) : dist * 100;
        ctx.submit(score, finishMs != null ? `${(finishMs / 1000).toFixed(2)} s` : `${dist}/${target}`);
      }
      const to = ctx.after(end, ctx.dur);
      return () => { ctx.cancel(to); clean.forEach(f => f()); };
    }
  },

  // ---------------------------------------------------------------- DUEL
  duel: {
    title: 'KEGEL-KOMBAT', label: 'Prügelduell 1:1', duel: true,
    variants: {
      quick: { name: 'Schnellziehen', desc: '3 Runden: Warte auf "SCHLAG!" und tippe sofort. Fehlstart kostet 1,5 s. Schnellste Gesamtzeit gewinnt.', dur: 24000, better: 'low' },
      combo: { name: 'Combo-Kette', desc: '3 Runden: Gib die Pfeil-Kombo so schnell wie möglich ein. Falscher Pfeil +0,4 s.', dur: 30000, better: 'low' },
      mash: { name: 'Hammer-Mash', desc: '8 Sekunden lang so oft wie möglich auf den Hammer hauen.', dur: 11000, better: 'high' }
    },
    play(el, ctx) {
      const [a, b] = ctx.duelists, pa = ctx.players.find(p => p.pid === a), pb = ctx.players.find(p => p.pid === b);
      const rounds = ctx.variant === 'mash' ? 1 : 3;
      const cry = p => (ctx.cry ? ctx.cry(p) : '');
      el.innerHTML = `<div class="duel"><div class="fighter left" data-pid="${a}"><div class="fimg"><img src="${pa.img}"></div><b>${esc(pa.name)}</b><div class="hp"><i></i></div><div class="rv"></div><i class="fcry">"${esc(cry(a))}"</i></div>
        <div class="vs">VS</div><div class="fighter right" data-pid="${b}"><div class="fimg"><img src="${pb.img}"></div><b>${esc(pb.name)}</b><div class="hp"><i></i></div><div class="rv"></div><i class="fcry">"${esc(cry(b))}"</i></div></div>
        <div class="fightflash">FIGHT!</div><div class="arena"></div>`;
      ctx.after(() => { const f = el.querySelector('.fightflash'); if (f) f.remove(); }, 1100);
      const POW = ['POW!', 'KLATSCH!', 'BAMM!', 'WUMMS!', 'KAWUMM!', 'ZACK!', 'BUMM!', 'PATSCH!'];
      let shown = 0, koDone = false, lastLead = null;
      const fEl = p => el.querySelector(`.fighter[data-pid="${p}"]`);
      const replay = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
      const hit = (w, l, big) => {
        const fw = fEl(w), fl = fEl(l); if (!fw || !fl) return;
        replay(fw, w === a ? 'atk-r' : 'atk-l'); replay(fl, 'hit');
        const p = document.createElement('span'); p.className = 'pow' + (big ? ' big' : ''); p.textContent = POW[Math.floor(Math.random() * POW.length)];
        p.style.left = (20 + Math.random() * 40) + '%'; fl.querySelector('.fimg').appendChild(p); ctx.after(() => p.remove(), 900);
        ctx.sfx.bad(); if (navigator.vibrate && (w === ctx.me || l === ctx.me)) navigator.vibrate(60);
      };
      const ko = l => {
        if (koDone) return; koDone = true; const fl = fEl(l); if (fl) fl.classList.add('ko');
        const k = document.createElement('div'); k.className = 'kobanner'; k.textContent = 'K.O.!'; el.querySelector('.duel').appendChild(k);
      };
      const arena = el.querySelector('.arena'); const clean = [];
      const better = this.variants[ctx.variant].better;
      const fmtV = v => ctx.variant === 'mash' ? v + ' Hits' : (v / 1000).toFixed(3) + ' s';
      const live = {}, pos = {}; live[a] = []; live[b] = []; pos[a] = 0; pos[b] = 0;
      const dmg = { [a]: [], [b]: [] }; let mashLast = { [a]: 0, [b]: 0 };
      // live HP: every resolved round hits the slower fighter, harder the bigger the gap; mash drains HP continuously
      function renderHP() {
        let hpA = 100, hpB = 100;
        if (ctx.variant === 'mash') {
          const va = live[a][0] || 0, vb = live[b][0] || 0;
          hpA = 100 - Math.max(0, vb - va) * 4; hpB = 100 - Math.max(0, va - vb) * 4;
          [[a, va], [b, vb]].forEach(([p, v]) => { if (v - mashLast[p] >= 4) { mashLast[p] = v; hit(p, p === a ? b : a, false); } });
        } else {
          let done = 0;
          for (let r = 0; r < rounds; r++) {
            const va = live[a][r], vb = live[b][r]; if (va == null || vb == null) break;
            done = r + 1; const d = Math.round(18 + Math.min(24, Math.abs(va - vb) / 20));
            if (va < vb) hpB -= d; else if (vb < va) hpA -= d;
          }
          while (shown < done) {
            const va = live[a][shown], vb = live[b][shown];
            if (va !== vb) { const w = va < vb ? a : b, l = va < vb ? b : a; hit(w, l, true); floatTxt(l, '-' + Math.round(18 + Math.min(24, Math.abs(va - vb) / 20))); floatTxt(w, 'SCHNELLER!', 'good'); }
            shown++;
          }
          if (done === rounds && hpA !== hpB) ctx.after(() => ko(hpA < hpB ? a : b), 700);
        }
        hpA = Math.max(0, hpA); hpB = Math.max(0, hpB);
        if ((hpA <= 0 || hpB <= 0) && ctx.variant !== 'mash') ctx.after(() => ko(hpA <= 0 ? a : b), 500);
        setHP(a, hpA); setHP(b, hpB);
        [a, b].forEach(p => {
          const done = live[p].filter(x => x != null).map(fmtV).join(' | ');
          const prog = ctx.variant === 'combo' && pos[p] > 0 && live[p].length < rounds ? ` · Kombo ${'●'.repeat(pos[p])}${'○'.repeat(Math.max(0, 5 - pos[p]))}` : '';
          el.querySelector(`.fighter[data-pid="${p}"] .rv`).textContent = (ctx.variant === 'mash' ? (live[p][0] || 0) + ' Hits' : done) + prog;
        });
      }
      const setHP = (p, hp) => { const i = el.querySelector(`.fighter[data-pid="${p}"] .hp i`); i.style.width = hp + '%'; i.classList.toggle('low', hp < 35); };
      const floatTxt = (p, txt, cls) => { const f = fEl(p); if (!f) return; const s = document.createElement('span'); s.className = 'dmg ' + (cls || ''); s.textContent = txt; f.querySelector('.fimg').appendChild(s); ctx.after(() => s.remove(), 1100); };
      ctx.onLive(l => { [a, b].forEach(p => { if (l[p]) { if (l[p].r) { const before = live[p].length; live[p] = l[p].r; if (live[p].length > before && p !== ctx.me && ctx.variant !== 'mash') floatTxt(p, fmtV(live[p][live[p].length - 1]), 'time'); } pos[p] = l[p].p || 0; } }); renderHP(); });
      if (ctx.variant === 'mash') { const kt = ctx.after(() => { const va = live[a][0] || 0, vb = live[b][0] || 0; if (va !== vb) ko(va < vb ? a : b); }, 9500); clean.push(() => ctx.cancel(kt)); }
      if (!ctx.isDuelist) {
        arena.innerHTML = '<div class="waitmsg">Zuschauen und anfeuern!<br><small>Tipp: Wettet einen Schluck auf euren Favoriten.</small></div>';
        return () => clean.forEach(f => f());
      }
      const mine = [];
      let myPos = 0, lastSend = 0, sendT = null;
      const report = (force = true) => {
        live[ctx.me] = mine.slice(); pos[ctx.me] = myPos; renderHP();
        const n = ctx.now(); if (!force && n - lastSend < 120) { if (!sendT) sendT = ctx.after(() => { sendT = null; report(true); }, 130); return; }
        lastSend = n; ctx.progress({ r: mine.slice(), p: myPos });
      };
      let finished = false;
      const finish = () => {
        if (finished) return; finished = true;
        const total = ctx.variant === 'mash' ? (mine[0] || 0) : mine.reduce((s, x) => s + (x == null ? 3000 : x), 0) + (rounds - mine.length) * 3000;
        arena.innerHTML = `<div class="waitmsg">Fertig: ${fmtV(total)}</div>`;
        ctx.submit(total, fmtV(total));
      };
      if (ctx.variant === 'mash') {
        let hits = 0; arena.innerHTML = '<div class="dist">0</div><button class="big gas hammer">HAU DRAUF!</button>';
        const d = arena.querySelector('.dist');
        clean.push(onTap(arena.querySelector('button'), () => { if (finished) return; hits++; d.textContent = hits; ctx.sfx.tap(); mine[0] = hits; report(false); }));
        const t = ctx.after(() => { mine[0] = hits; report(); finish(); }, 8000); clean.push(() => ctx.cancel(t));
      } else if (ctx.variant === 'quick') {
        let r = 0, state = 'wait', sigAt = 0, tmr;
        arena.innerHTML = '<button class="big signal wait">BEREIT ...</button>';
        const btn = arena.querySelector('button');
        const next = () => {
          if (r >= rounds) return finish();
          state = 'wait'; btn.className = 'big signal wait'; btn.textContent = `RUNDE ${r + 1}: BEREIT ...`;
          tmr = ctx.after(() => { state = 'go'; sigAt = ctx.now(); btn.className = 'big signal go'; btn.textContent = 'SCHLAG!'; ctx.sfx.go(); }, 1500 + ctx.rng() * 2500);
        };
        clean.push(onTap(btn, () => {
          if (state === 'wait') { ctx.cancel(tmr); ctx.sfx.bad(); mine[r] = 1500; btn.textContent = 'FEHLSTART! +1,5 s'; btn.className = 'big signal bad'; }
          else if (state === 'go') { mine[r] = Math.round(ctx.now() - sigAt); ctx.sfx.blip(); btn.textContent = `${mine[r]} ms`; btn.className = 'big signal done'; }
          else return;
          state = 'pause'; report(); r++; tmr = ctx.after(next, 1400);
        }));
        next(); clean.push(() => ctx.cancel(tmr));
      } else {
        const AR = ['⬆', '➡', '⬇', '⬅'];
        let r = 0, seq, cpos, t0, pen;
        arena.innerHTML = '<div class="seq"></div><div class="pad">' + AR.map((x, i) => `<button class="arrow" data-i="${i}">${x}</button>`).join('') + '</div>';
        const seqEl = arena.querySelector('.seq');
        const draw = () => { seqEl.innerHTML = seq.map((x, i) => `<span class="${i < cpos ? 'ok' : ''}">${AR[x]}</span>`).join(''); };
        const next = () => {
          if (r >= rounds) return finish();
          seq = Array.from({ length: 5 }, () => Math.floor(ctx.rng() * 4)); cpos = 0; pen = 0; t0 = ctx.now(); draw();
        };
        arena.querySelectorAll('.arrow').forEach(bt => clean.push(onTap(bt, () => {
          if (finished || !seq) return; const i = +bt.dataset.i;
          if (i === seq[cpos]) { cpos++; myPos = cpos; ctx.sfx.tap(); draw(); report(false); if (cpos === seq.length) { mine[r] = Math.round(ctx.now() - t0 + pen); myPos = 0; report(); r++; seq = null; seqEl.innerHTML = `<span class="ok">${(mine[r - 1] / 1000).toFixed(2)} s</span>`; ctx.after(next, 900); } }
          else { pen += 400; ctx.sfx.bad(); }
        })));
        next();
      }
      const hard = ctx.after(finish, ctx.dur - 300); clean.push(() => ctx.cancel(hard));
      return () => clean.forEach(f => f());
    }
  },

  // ---------------------------------------------------------------- GUESS
  guess: {
    title: 'SCHÄTZ-SCHLACHT', label: 'Schätzspiel',
    variants: {
      mix: { name: 'Schätzfragen', desc: '3 Fragen: Zahl schätzen und abgeben. Kein Stress, du hast pro Frage 25 Sekunden. Wer insgesamt am weitesten daneben liegt, trinkt.', dur: 86000, better: 'low' },
      gev: { name: 'Gevelsberg in Zahlen', desc: '3 Schätzfragen rund um Gevelsberg. Pro Frage 25 Sekunden. Wer am weitesten daneben liegt, trinkt.', dur: 86000, better: 'low' },
      count: { name: 'Blitz-Zählen', desc: 'Kegel blitzen 3 Sekunden auf. Wie viele waren es?', dur: 30000, better: 'low' }
    },
    play(el, ctx) {
      const clean = []; let done = false;
      if (ctx.variant === 'count') {
        const n = 15 + Math.floor(ctx.rng() * 26);
        let pins = ''; for (let i = 0; i < n; i++) pins += `<span class="pin" style="left:${(ctx.rng() * 88).toFixed(1)}%;top:${(ctx.rng() * 82).toFixed(1)}%;transform:rotate(${(ctx.rng() * 50 - 25).toFixed(0)}deg)"></span>`;
        el.innerHTML = `<div class="question">Wie viele Kegel?</div><div class="field">${pins}</div><div class="controls"></div>`;
        const fin = val => {
          if (done) return; done = true; const err = val == null || isNaN(val) ? 1.5 : Math.min(1.5, Math.abs(val - n) / n);
          el.querySelector('.controls').innerHTML = `<div class="waitmsg">Deine Zahl: ${val == null ? '–' : esc(val)}</div>`;
          ctx.submit(Math.round(err * 10000), val == null ? '–' : String(val));
        };
        const t = ctx.after(() => {
          el.querySelector('.field').innerHTML = '<div class="waitmsg">???</div>';
          numInput(el.querySelector('.controls'), fin, clean);
          const t2 = ctx.after(() => fin(readNum(el)), ctx.dur - 3500); clean.push(() => ctx.cancel(t2));
        }, 3000);
        clean.push(() => ctx.cancel(t));
        return () => clean.forEach(f => f());
      }
      const qs = ctx.questions || []; let i = 0, total = 0;
      const next = () => {
        if (i >= qs.length) { done = true; const avg = total / Math.max(1, qs.length); el.innerHTML = `<div class="waitmsg">Fertig!<br><small>Im Schnitt ${Math.round(avg * 100)} % daneben</small></div>`; return ctx.submit(Math.round(avg * 10000), `Ø ${Math.round(avg * 100)} % daneben`); }
        const q = qs[i]; let answered = false;
        el.innerHTML = `<div class="qhead">FRAGE ${i + 1} / ${qs.length}</div><div class="question">${esc(q.q)}${q.unit ? `<small>(in ${esc(q.unit)})</small>` : ''}</div><div class="controls"></div>`;
        const stopBar = timerBar(el, 25000, ctx.now(), ctx);
        const answer = val => {
          if (answered) return; answered = true; stopBar(); ctx.cancel(to);
          const err = val == null || isNaN(val) ? 1.5 : Math.min(1.5, Math.abs(val - q.a) / Math.max(1, Math.abs(q.a))); total += err;
          ctx.sfx[err < 0.1 ? 'win' : 'blip']();
          el.querySelector('.controls').innerHTML = `<div class="feedback ${err < 0.1 ? 'good' : ''}">Richtig: <b>${fmtNum(q.a, q.unit)} ${esc(q.unit || '')}</b><br>Du: ${val == null || isNaN(val) ? '–' : fmtNum(val, q.unit)} · ${Math.round(err * 100)} % daneben</div>`;
          const t = ctx.after(() => { i++; next(); }, 2600); clean.push(() => ctx.cancel(t));
        };
        numInput(el.querySelector('.controls'), answer, clean);
        const to = ctx.after(() => answer(readNum(el)), 25000); clean.push(() => ctx.cancel(to));
      };
      next();
      return () => clean.forEach(f => f());
    }
  },

  // ---------------------------------------------------------------- QUIZ (multiple choice)
  quiz: {
    title: 'KNEIPEN-QUIZ', label: 'Quiz',
    variants: {
      gev: { name: 'Gevelsberg-Special', desc: '3 Fragen zu Gevelsberg mit je 4 Antworten. Richtige Antworten zählen, bei Gleichstand gewinnt der Schnellere.', dur: 68000, better: 'high' },
      buli: { name: 'Bundesliga', desc: '3 Fragen zur Bundesliga mit je 4 Antworten. Richtige Antworten zählen, bei Gleichstand gewinnt der Schnellere.', dur: 68000, better: 'high' },
      alk: { name: 'Prost-Wissen', desc: '3 Fragen rund um Bier, Schnaps und Brauereien. Richtige Antworten zählen, bei Gleichstand gewinnt der Schnellere.', dur: 68000, better: 'high' },
      iq: { name: 'GGG-IQ-Test', desc: '5 Denkaufgaben mit je 4 Antworten: Zahlenreihen, Logik, Fangfragen. Die meisten richtigen Antworten gewinnen. Wer den niedrigsten IQ hat, trinkt.', dur: 110000, better: 'high' },
      regeln: { name: 'Verrückte Regelkunde', desc: '3 Fragen zu den Regeln von Sportarten. Richtige Antworten zählen, bei Gleichstand gewinnt der Schnellere.', dur: 68000, better: 'high' },
      pokemon: { name: 'Pokémon-Rätsel', desc: '3 Pokémon-Rätsel aus den ersten 151. Du bekommst Pokédex-Nummer, Typ und einen Hinweis. Richtige Antworten zählen, bei Gleichstand gewinnt der Schnellere.', dur: 68000, better: 'high' },
      serien: { name: 'Serien der 90er', desc: '3 Serien aus den 90ern, erkennbar an Emojis und einem Hinweis. Richtige Antworten zählen, bei Gleichstand gewinnt der Schnellere.', dur: 68000, better: 'high' }
    },
    play(el, ctx) {
      const clean = []; const qs = ctx.questions || []; let i = 0, right = 0, ms = 0;
      const next = () => {
        if (i >= qs.length) { el.innerHTML = `<div class="waitmsg">${right} von ${qs.length} richtig!</div>`; return ctx.submit(right * 100000 - Math.round(ms), ctx.variant === 'iq' ? `IQ ${Math.round(55 + 75 * right / Math.max(1, qs.length))} (${right}/${qs.length} richtig)` : `${right}/${qs.length} richtig`); }
        const q = qs[i], t0 = ctx.now(); let answered = false;
        el.innerHTML = `<div class="qhead">FRAGE ${i + 1} / ${qs.length}</div><div class="question">${esc(q.q)}</div><div class="choices">${q.o.map((o, k) => `<button class="choice" data-k="${k}">${esc(o)}</button>`).join('')}</div>`;
        const stopBar = timerBar(el, 20000, t0, ctx);
        const pick = k => {
          if (answered) return; answered = true; stopBar(); ctx.cancel(to);
          ms += Math.min(20000, ctx.now() - t0);
          if (k === q.c) { right++; ctx.sfx.win(); } else ctx.sfx.bad();
          el.querySelectorAll('.choice').forEach(b => { const kk = +b.dataset.k; b.classList.add(kk === q.c ? 'right' : (kk === k ? 'wrong' : 'dim')); });
          const t = ctx.after(() => { i++; next(); }, 1800); clean.push(() => ctx.cancel(t));
        };
        el.querySelectorAll('.choice').forEach(b => clean.push(onTap(b, () => pick(+b.dataset.k))));
        const to = ctx.after(() => pick(-1), 20000); clean.push(() => ctx.cancel(to));
      };
      next();
      return () => clean.forEach(f => f());
    }
  },

  // ---------------------------------------------------------------- GEO (pin on map)
  geo: {
    title: 'WO ZUM GEIER?', label: 'Karten-Schätzen',
    variants: {
      de: { name: 'Deutschland', desc: '3 Orte: Setz die Nadel so nah wie möglich. Mit ZOOM kannst du die Karte vergrößern. Entfernungen werden addiert, wer am weitesten daneben liegt, trinkt.', dur: 101000, better: 'low' },
      eu: { name: 'Europa', desc: '3 Orte in Europa: Nadel setzen, bestätigen. Mit ZOOM kannst du die Karte vergrößern. Wer insgesamt am weitesten daneben liegt, trinkt.', dur: 101000, better: 'low' },
      world: { name: 'Weltreise', desc: '3 Orte auf der Weltkarte. Mit ZOOM vergrößern, Karte wischen, Nadel setzen, bestätigen.', dur: 101000, better: 'low' }
    },
    play(el, ctx) {
      const clean = []; const M = MAPS[ctx.variant], qs = ctx.places || []; let i = 0, total = 0;
      const pen = { de: 800, eu: 3000, world: 15000 }[ctx.variant];
      const toXY = (lat, lon) => [((lon - M.lon[0]) * M.kx * M.sx) / M.W * 100, ((M.lat[1] - lat) * M.sx) / M.H * 100];
      const toLL = (px, py) => [M.lat[1] - (py / 100 * M.H) / M.sx, M.lon[0] + (px / 100 * M.W) / (M.kx * M.sx)];
      const next = () => {
        if (i >= qs.length) { const avg = Math.round(total / Math.max(1, qs.length)); el.innerHTML = `<div class="waitmsg">Fertig!<br><small>Im Schnitt ${avg} km daneben</small></div>`; return ctx.submit(Math.round(total), `Ø ${avg} km daneben`); }
        const q = qs[i]; let pin = null, answered = false;
        el.innerHTML = `<div class="qhead">ORT ${i + 1} / ${qs.length}</div><div class="question small-q">Wo liegt <b>${esc(q.q)}</b>?</div>
          <div class="zoomrow"><button class="pill zoombtn">ZOOM x1</button></div>
          <div class="mapwrap ${ctx.variant}"><div class="mapinner" style="aspect-ratio:${M.W}/${M.H}">${M.svg}<span class="mpin hidden"></span><span class="tpin hidden"></span></div></div>
          <div class="controls"><button class="big green" disabled>NADEL SETZEN</button></div>`;
        const stopBar = timerBar(el, 30000, ctx.now(), ctx);
        const wrap = el.querySelector('.mapwrap'), inner = el.querySelector('.mapinner'), mp = el.querySelector('.mpin'), btn = el.querySelector('.controls button');
        { // reference grid (degrees), so a zoomed map still has landmarks without revealing any answer
          const step = { de: 1, eu: 5, world: 15 }[ctx.variant]; let ln = '', lab = '';
          for (let lo = Math.ceil(M.lon[0] / step) * step; lo <= M.lon[1]; lo += step) { const x = toXY(M.lat[1], lo)[0]; ln += `<line x1="${x}" y1="0" x2="${x}" y2="100"/>`; for (let t = 4; t < 100; t += 16) lab += `<span class="glab" style="left:${x}%;top:${t}%">${Math.abs(lo)}°${lo < 0 ? 'W' : 'O'}</span>`; }
          for (let la = Math.ceil(M.lat[0] / step) * step; la <= M.lat[1]; la += step) { const y = toXY(la, M.lon[0])[1]; ln += `<line x1="0" y1="${y}" x2="100" y2="${y}"/>`; for (let t = 2; t < 100; t += 16) lab += `<span class="glab" style="left:${t}%;top:${y}%">${Math.abs(la)}°${la < 0 ? 'S' : 'N'}</span>`; }
          inner.insertAdjacentHTML('beforeend', `<svg class="grat" viewBox="0 0 100 100" preserveAspectRatio="none">${ln}</svg>${lab}`);
        }
        const zb = el.querySelector('.zoombtn'), LV = [1, 2.5, 4.5, 7]; let zoom = 1;
        const focus = (px, py) => { // keep a map point centred after zooming
          requestAnimationFrame(() => {
            const cx = px == null ? 50 : px, cy = py == null ? 50 : py;
            wrap.scrollLeft = Math.max(0, inner.scrollWidth * cx / 100 - wrap.clientWidth / 2);
            wrap.scrollTop = Math.max(0, inner.scrollHeight * cy / 100 - wrap.clientHeight / 2);
          });
        };
        const setZoom = (z, ax, ay) => { // zoom around a screen point (pinch centre); null = view centre
          z = Math.max(1, Math.min(7, z));
          const wr = wrap.getBoundingClientRect(), r = inner.getBoundingClientRect();
          const sx = ax == null ? wr.left + wr.width / 2 : ax, sy = ay == null ? wr.top + wr.height / 2 : ay;
          const fx = (sx - r.left) / r.width, fy = (sy - r.top) / r.height;
          zoom = z; inner.style.width = (z * 100) + '%'; wrap.classList.toggle('zoomed', z > 1.02);
          zb.textContent = 'ZOOM x' + (Math.round(z * 10) / 10).toString().replace('.', ',');
          wrap.scrollLeft = fx * inner.scrollWidth - (sx - wr.left);
          wrap.scrollTop = fy * inner.scrollHeight - (sy - wr.top);
        };
        const place = (cx, cy) => {
          if (answered) return; const r = inner.getBoundingClientRect();
          pin = [(cx - r.left) / r.width * 100, (cy - r.top) / r.height * 100];
          mp.style.left = pin[0] + '%'; mp.style.top = pin[1] + '%'; mp.classList.remove('hidden'); btn.disabled = false; ctx.sfx.tap();
        };
        zb.onclick = () => {
          const nx = LV.find(l => l > zoom + 0.05) || 1; ctx.sfx.tap();
          setZoom(nx, null, null); if (pin) focus(pin[0], pin[1]);
        };
        // touch: two fingers = pinch zoom (+ pan with the pinch centre), one finger = pan when zoomed / page scroll when not, short tap = pin
        { let mode = null, d0 = 0, z0 = 1, lx = 0, ly = 0, sx0 = 0, sy0 = 0, moved = 0, lastTouch = 0;
          const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
          const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
          wrap.style.touchAction = 'none';
          wrap.addEventListener('touchstart', e => {
            if (e.touches.length >= 2) { mode = 'pinch'; d0 = dist(e.touches) || 1; z0 = zoom; [lx, ly] = mid(e.touches); moved = 99; }
            else { mode = 'one'; lx = sx0 = e.touches[0].clientX; ly = sy0 = e.touches[0].clientY; moved = 0; }
          }, { passive: true });
          wrap.addEventListener('touchmove', e => {
            if (!mode) return; e.preventDefault();
            if (e.touches.length >= 2) {
              if (mode !== 'pinch') { mode = 'pinch'; d0 = dist(e.touches) || 1; z0 = zoom; [lx, ly] = mid(e.touches); }
              const [mx, my] = mid(e.touches); setZoom(z0 * dist(e.touches) / d0, mx, my);
              wrap.scrollLeft -= mx - lx; wrap.scrollTop -= my - ly; lx = mx; ly = my; moved = 99;
            } else if (mode === 'one') {
              const x = e.touches[0].clientX, y = e.touches[0].clientY; moved += Math.abs(x - lx) + Math.abs(y - ly);
              if (zoom > 1.02) { wrap.scrollLeft -= x - lx; wrap.scrollTop -= y - ly; } else window.scrollBy(0, -(y - ly));
              lx = x; ly = y;
            }
          }, { passive: false });
          wrap.addEventListener('touchend', e => {
            if (e.touches.length === 0) {
              if (mode === 'one' && moved < 12) { e.preventDefault(); lastTouch = Date.now(); place(sx0, sy0); }
              mode = null;
            } else if (e.touches.length === 1) { mode = 'one'; lx = e.touches[0].clientX; ly = e.touches[0].clientY; moved = 99; }
          }, { passive: false });
          wrap.addEventListener('touchcancel', () => { mode = null; });
          inner.addEventListener('click', e => { if (Date.now() - lastTouch < 600) return; place(e.clientX, e.clientY); });
        }
        const answer = () => {
          if (answered) return; answered = true; stopBar(); ctx.cancel(to);
          const [tx, ty] = toXY(q.lat, q.lon), tp = el.querySelector('.tpin');
          tp.style.left = tx + '%'; tp.style.top = ty + '%'; tp.classList.remove('hidden');
          let km = pen;
          if (pin) { const [la, lo] = toLL(pin[0], pin[1]); km = Math.min(pen, haversine(la, lo, q.lat, q.lon)); }
          total += km; ctx.sfx[km < pen * 0.08 ? 'win' : 'blip']();
          el.querySelector('.controls').innerHTML = `<div class="feedback ${km < pen * 0.08 ? 'good' : ''}">${pin ? `<b>${Math.round(km)} km</b> daneben` : 'Keine Nadel gesetzt'}</div>`;
          if (zoom > 1.02) focus(tx, ty);
          const t = ctx.after(() => { i++; next(); }, 2800); clean.push(() => ctx.cancel(t));
        };
        clean.push(onTap(btn, () => { if (pin) answer(); }));
        const to = ctx.after(answer, 30000); clean.push(() => ctx.cancel(to));
      };
      next();
      return () => clean.forEach(f => f());
    }
  },

  // ---------------------------------------------------------------- SEEK (Wimmelbild)
  seek: {
    title: 'WHERE IS RALLUM?', label: 'Wimmelbild',
    variants: {
      ralf: { name: 'Such den Rallum', desc: '3 Wimmelbilder. Finde Rallum in der Menge und tippe ihn an. Falsch getippt kostet 1,5 Sekunden. Wer insgesamt am längsten sucht, trinkt.', dur: 80000, better: 'low' }
    },
    play(el, ctx) {
      const clean = [], N = 3, LIM = 22000, PEN = 1500;
      const FACES = ['01_dr-gosse', '02_h-2-o-k-o-p-f', '03_tamma-hanken', '04_yen', '05_zlatan', '06_adev', '07_luecke', '08_busfahrer', '09_hooooooopp-e', '10_schlomo', '11_gaul', '12_der-wuerger'].map(f => `badges/${f}.png`);
      const PROPS = ['🍺', '🍻', '🎳', '🥨', '🧢', '🥃', '🍗', '🎯'];
      const rng = ctx.rng; let i = 0, total = 0, found = 0;
      const next = () => {
        if (i >= N) { const avg = (total / N / 1000).toFixed(1).replace('.', ','); el.innerHTML = `<div class="waitmsg">Fertig!<br><small>Ø ${avg} s pro Suche</small></div>`; return ctx.submit(Math.round(total), `Ø ${avg} s, ${found}/${N} gefunden`); }
        const R = () => rng();
        const rx = 8 + R() * 84, ry = 8 + R() * 84; // Rallum's centre in %
        const items = []; let guard = 0;
        const total_items = 78;
        for (let k = 0; k < total_items && guard < 600; guard++) {
          const x = 4 + R() * 92, y = 4 + R() * 92, late = k > total_items * 0.55;
          if (late && Math.hypot(x - rx, (y - ry) * 1.15) < 7.5) continue; // nothing may fully cover Rallum
          const prop = R() < 0.22, sz = prop ? 8 + R() * 3 : 10.5 + R() * 3;
          items.push({ x, y, sz, prop, f: prop ? PROPS[Math.floor(R() * PROPS.length)] : FACES[Math.floor(R() * FACES.length)], rot: Math.round((R() - 0.5) * 50), flip: R() < 0.5 });
          k++;
        }
        const mid = Math.floor(items.length * 0.55);
        const html = items.map((t, k) => `${k === mid ? `<img class="sk r" data-r="1" src="badges/00_ralf.png" style="left:${rx}%;top:${ry}%;width:11.5%;transform:translate(-50%,-50%) rotate(${Math.round((R() - 0.5) * 30)}deg)">` : ''}${t.prop
          ? `<span class="sk p" style="left:${t.x}%;top:${t.y}%;font-size:${t.sz * 3.1}px;transform:translate(-50%,-50%) rotate(${t.rot}deg)">${t.f}</span>`
          : `<img class="sk" src="${t.f}" style="left:${t.x}%;top:${t.y}%;width:${t.sz}%;transform:translate(-50%,-50%) rotate(${t.rot}deg) scaleX(${t.flip ? -1 : 1})">`}`).join('');
        el.innerHTML = `<div class="qhead">SUCHE ${i + 1} / ${N}</div><div class="seekhint"><img src="badges/00_ralf.png"><span>Finde <b>Rallum</b>!</span><i id="skclock">0,0 s</i></div><div class="seekscene" id="scene">${html}</div><div class="seekmsg" id="skmsg"></div>`;
        const scene = el.querySelector('#scene'), clk = el.querySelector('#skclock'), msg = el.querySelector('#skmsg'), t0 = ctx.now(); let done = false, wrong = 0, lastWrong = -1e9, pen = 0;
        const fin = (ok) => {
          if (done) return; done = true; ctx.cancel(to); ctx.cancel(tick);
          const ms = ok ? Math.min(LIM, ctx.now() - t0) + pen : LIM + pen; total += ms; if (ok) found++;
          const r = scene.querySelector('[data-r]'); r.classList.add('hit');
          scene.insertAdjacentHTML('beforeend', `<span class="skring" style="left:${rx}%;top:${ry}%"></span>`);
          msg.innerHTML = ok ? `<div class="feedback good">GEFUNDEN! <b>${(ms / 1000).toFixed(1).replace('.', ',')} s</b>${wrong ? ` (inkl. ${wrong} Fehlgriffe)` : ''}</div>` : `<div class="feedback">Zeit um! Da war er.</div>`;
          ctx.sfx[ok ? 'win' : 'bad'](); const t = ctx.after(() => { i++; next(); }, 2200); clean.push(() => ctx.cancel(t));
        };
        const onDown = e => {
          if (done) return; e.preventDefault();
          if (e.target.dataset && e.target.dataset.r) return fin(true);
          const n = ctx.now(); if (n - lastWrong < 450) return; lastWrong = n; wrong++; pen += PEN; ctx.sfx.bad(); scene.classList.add('shake'); setTimeout(() => scene.classList.remove('shake'), 250);
        };
        scene.addEventListener('pointerdown', onDown); clean.push(() => scene.removeEventListener('pointerdown', onDown));
        const tick = ctx.every(() => { if (!done) clk.textContent = ((ctx.now() - t0 + pen) / 1000).toFixed(1).replace('.', ',') + ' s'; }, 100);
        const to = ctx.after(() => fin(false), LIM);
      };
      next();
      return () => clean.forEach(f => f());
    }
  },

  // ---------------------------------------------------------------- DRAW (Nachmalen mit Abstimmung)
  draw: {
    title: 'KRITZEL-KRIEG', label: 'Nachmalen',
    variants: {
      copy: { name: 'Nachmalen und Bewerten', desc: 'Male das Bild mit dem Finger so gut du kannst nach (45 Sekunden). Danach bewertet ihr alle Zeichnungen anonym mit 1 bis 5 Sternen. Die schlechteste Zeichnung trinkt.', dur: 105000, better: 'high' }
    },
    DRAW_MS: 45000, VOTE_MS: 40000,
    REFS: [
      ['Haus vom Nikolaus', '<path d="M20 85V52H80V85ZM20 52L80 85M80 52L20 85M20 52L50 22L80 52"/>'],
      ['Kegel', '<path d="M42 14q8-7 16 0q5 12-2 21q16 19 13 47q-19 8-38 0q-3-28 13-47q-7-9-2-21Z"/><path d="M38 52q12 6 24 0M36 62q14 7 28 0" stroke="#d81018"/>'],
      ['Bierkrug', '<path d="M26 32H66V84H26Z"/><path d="M66 42H76q9 0 9 10V62q0 10-9 10H66"/><path d="M26 32q-4-12 8-12q4-8 14-4q10-4 14 6q6 2 4 10"/><path d="M36 44V74M46 44V74M56 44V74"/>'],
      ['Burg', '<path d="M14 86V40H26V30H34V40H42V30H50V40H58V30H66V40H74V30H82V40H86V86ZM42 86V64q8-10 16 0V86"/><path d="M14 40V24l8-8l8 8V40"/>'],
      ['Rakete', '<path d="M50 10q16 18 12 50H38q-4-32 12-50Z"/><circle cx="50" cy="38" r="6"/><path d="M38 60L24 76L38 72M62 60L76 76L62 72M44 66Q50 90 56 66"/>'],
      ['Fisch', '<path d="M18 50Q42 22 70 50Q42 78 18 50Z"/><path d="M70 50L88 34V66Z"/><circle cx="32" cy="46" r="3"/><path d="M46 38Q52 50 46 62"/>'],
      ['Segelboot', '<path d="M18 70H82L72 86H28Z"/><path d="M50 70V14"/><path d="M50 16L78 64H50ZM46 28L24 64H46Z"/>'],
      ['Katze', '<path d="M24 44L26 14L42 28Q50 26 58 28L74 14L76 44Q82 70 50 80Q18 70 24 44Z"/><circle cx="40" cy="46" r="3"/><circle cx="60" cy="46" r="3"/><path d="M46 56H54L50 61ZM14 54L34 58M14 66L34 62M86 54L66 58M86 66L66 62"/>'],
      ['Stern mit Gesicht', '<path d="M50 8L61 38L92 38L67 57L77 88L50 69L23 88L33 57L8 38L39 38Z"/><circle cx="42" cy="46" r="2.5"/><circle cx="58" cy="46" r="2.5"/><path d="M40 58Q50 68 60 58"/>']
    ],
    play(el, ctx) {
      const clean = [], pick = ctx.rng(), refs = GAMES.draw.REFS, ref = refs[Math.floor(pick * refs.length) % refs.length];
      const D = GAMES.draw.DRAW_MS, V = GAMES.draw.VOTE_MS; let sent = false, voted = false, galleryShown = false;
      const refSvg = `<svg viewBox="0 0 100 100" class="drawref" fill="none" stroke="#16162a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ref[1]}</svg>`;
      el.innerHTML = `<div class="qhead">MALE: <b>${esc(ref[0])}</b></div><div class="drawbox"><div class="drawrefbox">${refSvg}</div>
        <canvas id="dcv" width="400" height="400"></canvas></div>
        <div class="palette" id="pal">${['#16162a', '#d81018', '#1060e0', '#18a048', '#f0b800'].map((c, k) => `<button class="sw ${k ? '' : 'on'}" data-c="${c}" style="background:${c}"></button>`).join('')}<button class="pill" id="dclr">WEG DAMIT</button></div>
        <button class="big green" id="ddone">FERTIG</button>`;
      const stopBar = timerBar(el, D, ctx.now(), ctx); clean.push(stopBar);
      const cv = el.querySelector('#dcv'), c2 = cv.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, 400, 400); c2.lineCap = 'round'; c2.lineJoin = 'round'; c2.lineWidth = 7; c2.strokeStyle = '#16162a';
      let drawing = false, lx = 0, ly = 0;
      const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 400, (e.clientY - r.top) / r.height * 400]; };
      const down = e => { if (sent) return; e.preventDefault(); drawing = true; [lx, ly] = pos(e); c2.beginPath(); c2.moveTo(lx, ly); c2.lineTo(lx + .1, ly + .1); c2.stroke(); try { cv.setPointerCapture(e.pointerId); } catch { } };
      const move = e => { if (!drawing || sent) return; e.preventDefault(); const [x, y] = pos(e); c2.beginPath(); c2.moveTo(lx, ly); c2.lineTo(x, y); c2.stroke(); lx = x; ly = y; };
      const up = () => { drawing = false; };
      cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      el.querySelectorAll('.sw').forEach(b => clean.push(onTap(b, () => { c2.strokeStyle = b.dataset.c; el.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); ctx.sfx.tap(); })));
      clean.push(onTap(el.querySelector('#dclr'), () => { if (sent) return; c2.fillStyle = '#fff'; c2.fillRect(0, 0, 400, 400); ctx.sfx.blip(); }));
      const showWait = txt => { el.innerHTML = `<div class="waitmsg">${txt}</div>`; };
      const sendDraw = () => {
        if (sent) return; sent = true; stopBar(); ctx.cancel(to1);
        const t = document.createElement('canvas'); t.width = 200; t.height = 200; const x = t.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200); x.drawImage(cv, 0, 0, 200, 200);
        ctx.send({ t: 'draw', img: t.toDataURL('image/jpeg', 0.55) });
        showWait('Zeichnung abgegeben!<br><small>Warte auf die anderen Künstler ...</small>'); ctx.sfx.win();
      };
      clean.push(onTap(el.querySelector('#ddone'), sendDraw));
      const to1 = ctx.after(sendDraw, D);
      ctx.onGm(m => {
        if (m.k !== 'gal' || galleryShown) return; galleryShown = true; ctx.cancel(to1); if (!sent) { sent = true; stopBar(); }
        const list = (m.list || []).filter(x => x.own !== ctx.me), rate = {};
        el.innerHTML = `<div class="qhead">ABSTIMMUNG</div><p class="small">Vergib 1 bis 5 Sterne. Deine eigene Zeichnung ist nicht dabei.</p>
          <div class="gallery">${list.map(x => `<div class="gcard" data-k="${x.k}"><img src="${x.img}"><div class="stars">${[1, 2, 3, 4, 5].map(s => `<button data-s="${s}">&#9733;</button>`).join('')}</div></div>`).join('')}</div>
          <button class="big green" id="vgo" ${list.length ? 'disabled' : ''}>ABSTIMMEN</button>`;
        const stopV = timerBar(el, V, ctx.now(), ctx); clean.push(stopV);
        const go = el.querySelector('#vgo');
        const submit = () => {
          if (voted) return; voted = true; stopV(); ctx.cancel(to2);
          list.forEach(x => { if (rate[x.k] == null) rate[x.k] = 3; });
          ctx.send({ t: 'vote', st: rate }); showWait('Stimmen abgegeben!<br><small>Gleich gibt es das Ergebnis ...</small>'); ctx.sfx.win();
        };
        el.querySelectorAll('.gcard').forEach(card => card.querySelectorAll('button').forEach(b => clean.push(onTap(b, () => {
          if (voted) return; const s = +b.dataset.s; rate[card.dataset.k] = s; ctx.sfx.tap();
          card.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.s <= s));
          go.disabled = Object.keys(rate).length < list.length;
        }))));
        clean.push(onTap(go, () => { if (!go.disabled) submit(); }));
        const to2 = ctx.after(submit, V); clean.push(() => ctx.cancel(to2));
        if (!list.length) submit();
      });
      return () => { clean.forEach(f => f()); ctx.cancel(to1); cv.removeEventListener('pointerdown', down); };
    }
  },

  // ---------------------------------------------------------------- PARTY
  party: {
    title: 'KNEIPEN-KIRMES', label: 'Party-Minigame',
    variants: {
      react: { name: 'Reflex-Riesenrad', desc: '5 Mal: Sobald es GRÜN wird, tippen. Zu früh kostet 0,6 s. Langsamster trinkt.', dur: 30000, better: 'low' },
      color: { name: 'Farb-Falle', desc: 'So geht es: Es erscheint ein Farbwort in einer Farbe. Steht dort ROT in roter Farbe, drücke PASST. Steht ROT aber in blauer Farbe, drücke PASST NICHT. Richtig +1, falsch -1, nichts drücken 0.', dur: 34000, better: 'high' },
      pins: { name: 'Kegel-Abräumen', desc: 'Räum alle 12 Kegel so schnell wie möglich ab. Einfach antippen.', dur: 25000, better: 'low' }
    },
    play(el, ctx) {
      const clean = [timerBar(el, ctx.dur, ctx.startAt, ctx)]; let done = false;
      const fin = (score, detail) => { if (done) return; done = true; ctx.submit(score, detail); };
      if (ctx.variant === 'react') {
        el.insertAdjacentHTML('beforeend', '<button class="big signal wait full">WARTEN ...</button>');
        const btn = el.querySelector('.full'); let i = 0, state, sig, tmr; const times = [];
        const next = () => {
          if (i >= 5) { const avg = Math.round(times.reduce((s, x) => s + x, 0) / times.length); btn.className = 'big signal done full'; btn.textContent = `Schnitt: ${avg} ms`; return fin(avg, `${avg} ms`); }
          state = 'wait'; btn.className = 'big signal wait full'; btn.textContent = `${i + 1}/5 WARTEN ...`;
          tmr = ctx.after(() => { state = 'go'; sig = ctx.now(); btn.className = 'big signal go full'; btn.textContent = 'JETZT!'; }, 1000 + ctx.rng() * 2500);
        };
        clean.push(onTap(btn, () => {
          if (state === 'wait') { ctx.cancel(tmr); times.push(1200); ctx.sfx.bad(); btn.textContent = 'ZU FRÜH!'; btn.className = 'big signal bad full'; }
          else if (state === 'go') { const rt = Math.round(ctx.now() - sig); times.push(rt); ctx.sfx.blip(); btn.textContent = rt + ' ms'; btn.className = 'big signal done full'; }
          else return;
          state = 'pause'; i++; tmr = ctx.after(next, 900);
        }));
        next(); clean.push(() => ctx.cancel(tmr));
        const hard = ctx.after(() => { if (!done) { while (times.length < 5) times.push(1500); const avg = Math.round(times.reduce((s, x) => s + x, 0) / 5); fin(avg, `${avg} ms`); } }, ctx.dur - 300); clean.push(() => ctx.cancel(hard));
      } else if (ctx.variant === 'color') {
        const C = [['ROT', '#D81018'], ['GELB', '#F8D808'], ['GRÜN', '#16b24a'], ['BLAU', '#4a8cff']];
        const N = 18;
        const items = Array.from({ length: N }, () => { const w = Math.floor(ctx.rng() * 4); const m = ctx.rng() < 0.5; const c = m ? w : (w + 1 + Math.floor(ctx.rng() * 3)) % 4; return [w, c]; });
        el.insertAdjacentHTML('beforeend', `<div class="colorbox"><div class="cq">Passt die FARBE zum WORT?</div><div class="word">BEREIT</div><div class="cfb">&nbsp;</div></div>
          <div class="dist">0 Punkte · 0 / ${N}</div><div class="controls colorbtns"><button class="big green yes">PASST</button><button class="big no">PASST NICHT</button></div>`);
        const word = el.querySelector('.word'), sc = el.querySelector('.dist'), fb = el.querySelector('.cfb'); let idx = -1, score = 0, answered = false, tmo = null;
        const next = () => {
          ctx.cancel(tmo); idx++;
          if (idx >= N) { word.textContent = 'ENDE'; word.style.color = '#fff'; el.querySelector('.colorbtns').innerHTML = ''; return fin(score, `${score} Punkte`); }
          answered = false; fb.innerHTML = '&nbsp;'; const [w, c] = items[idx]; word.textContent = C[w][0]; word.style.color = C[c][1];
          sc.textContent = `${score} Punkte · ${idx + 1} / ${N}`;
          tmo = ctx.after(() => { if (!answered) { fb.textContent = 'zu langsam: 0'; fb.className = 'cfb'; ctx.after(next, 450); answered = true; } }, 2600);
        };
        const answer = yes => {
          if (done || answered || idx < 0 || idx >= N) return; answered = true; ctx.cancel(tmo);
          const [w, c] = items[idx], ok = (w === c) === yes;
          score += ok ? 1 : -1; ok ? ctx.sfx.blip() : ctx.sfx.bad();
          fb.textContent = ok ? 'RICHTIG +1' : 'FALSCH -1'; fb.className = 'cfb ' + (ok ? 'good' : 'bad');
          sc.textContent = `${score} Punkte · ${idx + 1} / ${N}`;
          ctx.after(next, 450);
        };
        clean.push(onTap(el.querySelector('.yes'), () => answer(true))); clean.push(onTap(el.querySelector('.no'), () => answer(false)));
        clean.push(() => ctx.cancel(tmo));
        ctx.after(next, 600);
      } else {
        el.insertAdjacentHTML('beforeend', '<div class="field pinfield"></div><div class="dist">0 / 12</div>');
        const f = el.querySelector('.pinfield'), d = el.querySelector('.dist'); let k = 0;
        const spots = Array.from({ length: 12 }, () => [8 + ctx.rng() * 80, 6 + ctx.rng() * 76]);
        const spawn = () => {
          if (k >= 12) { const t = Math.round(ctx.now() - ctx.startAt); f.innerHTML = `<div class="waitmsg">ALLE NEUNE ... äh, ZWÖLFE!<br><small>${(t / 1000).toFixed(2)} s</small></div>`; ctx.sfx.win(); return fin(t, (t / 1000).toFixed(2) + ' s'); }
          f.innerHTML = `<span class="pin big-pin" style="left:${spots[k][0]}%;top:${spots[k][1]}%"></span>`;
          const p = f.firstChild; let hitOnce = false;
          onTap(p, () => { if (hitOnce || done) return; hitOnce = true; k++; d.textContent = `${k} / 12`; ctx.sfx.tap(); spawn(); });
        };
        spawn();
        const hard = ctx.after(() => { if (!done) { f.innerHTML = ''; fin(25000 + (12 - k) * 2000, `${k}/12`); } }, ctx.dur - 300); clean.push(() => ctx.cancel(hard));
      }
      return () => clean.forEach(f => f());
    }
  }
};
