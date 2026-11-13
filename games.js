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
      copy: { name: 'Nachmalen und Bewerten', desc: 'Male das berühmte Kunstwerk mit dem Finger so gut du kannst nach (75 Sekunden, schwer!). Danach bewertet ihr alle Zeichnungen anonym mit 1 bis 5 Sternen. Die schlechteste Zeichnung trinkt.', dur: 185000, better: 'high' }
    },
    DRAW_MS: 75000, VOTE_MS: 40000,
    REFS: [
      ['Sternennacht (Van Gogh)', '<path d="M0 74Q18 64 38 72T76 68T100 66V100H0Z" stroke-width="1.4"/><path d="M12 100Q3 72 9 52Q7 42 13 32Q18 46 20 58Q24 80 18 100M13 40Q15 52 15 64" stroke-width="1.6"/><path d="M0 42Q14 32 28 42T56 40T84 38T100 40M0 52Q14 44 28 52T56 50T84 48T100 50M6 31Q22 22 36 30T66 28" stroke-width="1.3"/><path d="M26 30C26 20 42 18 46 26C50 34 40 40 36 36C32 32 38 28 41 31"/><path d="M62 38C60 30 70 26 74 32C78 38 70 42 68 38"/><circle cx="85" cy="16" r="6.5"/><path d="M82 11a5.5 5.5 0 1 0 5 10a4.5 4.5 0 1 1-5-10Z" fill="#16162a"/><circle cx="85" cy="16" r="10" stroke-dasharray="2 2.5"/><g stroke-width="1.2"><circle cx="58" cy="12" r="2.5"/><circle cx="58" cy="12" r="5" stroke-dasharray="1.5 2"/><circle cx="70" cy="22" r="2.2"/><circle cx="70" cy="22" r="4.5" stroke-dasharray="1.5 2"/><circle cx="46" cy="8" r="2"/><circle cx="46" cy="8" r="4" stroke-dasharray="1.5 2"/><circle cx="30" cy="14" r="2"/></g><path d="M58 82V70L62 58L66 70V82M44 84V77H52V84M70 84V78H78V84M84 84V79H92V84M30 86V80H38V86" stroke-width="1.4"/>'],
      ['Der Schrei (Munch)', '<path d="M0 12Q20 4 40 14T80 10T100 14M0 24Q20 16 40 26T80 22T100 26M0 36Q20 28 40 38T80 34T100 38" stroke-width="1.5"/><path d="M0 52Q22 46 44 56T88 52T100 54" stroke-width="1.3"/><path d="M0 100L64 52M0 88L56 50M10 100L66 56M22 100L68 60" stroke-width="1.5"/><path d="M14 64Q30 60 46 68M0 74Q20 68 40 74" stroke-width="1.2"/><path d="M68 100Q64 80 68 62Q70 52 80 52Q90 52 90 64Q92 82 88 100" stroke-width="1.7"/><ellipse cx="79" cy="40" rx="8.5" ry="11.5"/><ellipse cx="75.5" cy="37" rx="2.4" ry="3"/><ellipse cx="83" cy="37" rx="2.4" ry="3"/><ellipse cx="79" cy="47" rx="3" ry="5" fill="#16162a"/><path d="M70 50Q64 46 70 38M88 50Q94 46 88 38" stroke-width="1.5"/><path d="M26 54L28 62M34 56L33 64" stroke-width="2"/>'],
      ['Die große Welle (Hokusai)', '<path d="M0 100V78C6 60 18 36 40 26C56 20 72 24 76 38C70 32 62 32 56 38C66 38 70 48 64 58C58 50 50 50 46 58C54 56 56 66 48 72C40 66 32 68 30 76" stroke-width="1.8"/><path d="M40 26C44 18 52 16 58 20M48 24C52 18 60 18 62 22M56 28C62 22 68 24 70 28M34 32C36 26 42 24 46 26" stroke-width="1.3"/><path d="M0 84Q16 76 30 82T60 82T100 78M0 92Q18 86 34 92T68 90T100 88M0 100Q20 94 40 100T80 98T100 96" stroke-width="1.4"/><path d="M74 66L86 52L98 66" stroke-width="1.8"/><path d="M82 58L86 52L90 58" stroke-width="1.2"/><path d="M72 84Q84 80 98 82L96 86Q84 88 74 88Z M4 92Q16 88 28 90L26 94Q14 96 6 95Z" stroke-width="1.4"/>'],
      ['Mona Lisa (da Vinci)', '<path d="M0 46Q20 40 34 48M66 48Q80 42 100 46M0 54Q22 50 34 56M66 56Q82 52 100 56" stroke-width="1.3"/><path d="M10 100Q22 80 50 76Q78 80 90 100" stroke-width="1.7"/><path d="M34 62Q22 70 28 90M66 62Q78 70 72 90" stroke-width="1.5"/><path d="M50 76Q44 74 40 70M50 76Q56 74 60 70" stroke-width="1.5"/><ellipse cx="50" cy="42" rx="14" ry="18"/><path d="M36 38Q34 14 50 12Q66 14 64 38M36 38Q30 50 32 66M64 38Q70 50 68 66" stroke-width="1.7"/><path d="M42 36Q45 34 48 36M52 36Q55 34 58 36" stroke-width="1.4"/><circle cx="45" cy="38" r="1.2" fill="#16162a"/><circle cx="55" cy="38" r="1.2" fill="#16162a"/><path d="M50 40V47Q48 49 46 48M50 47Q52 49 54 48" stroke-width="1.3"/><path d="M44 54Q50 57 56 53" stroke-width="1.6"/><path d="M34 90Q44 80 56 86Q64 90 72 86M36 96Q46 88 58 92" stroke-width="1.5"/><path d="M10 60Q4 76 14 86M90 60Q96 76 86 86" stroke-width="1.2"/><path d="M0 62C8 60 8 70 16 68" stroke-width="1.2"/>'],
      ['Der Kuss (Klimt)', '<path d="M30 100Q24 60 36 40Q50 30 66 42Q76 62 68 100Z" stroke-width="1.7"/><circle cx="48" cy="26" r="9"/><circle cx="60" cy="30" r="8"/><path d="M38 22Q40 12 50 14Q60 12 64 22M44 12l-2-5M52 11l1-5M60 13l3-4" stroke-width="1.4"/><path d="M48 35Q54 42 58 36" stroke-width="1.4"/><g stroke-width="1.2"><circle cx="40" cy="58" r="3.5"/><circle cx="50" cy="66" r="3.5"/><circle cx="60" cy="58" r="3.5"/><circle cx="46" cy="80" r="3.5"/><circle cx="58" cy="76" r="3.5"/><rect x="36" y="68" width="6" height="9"/><rect x="62" y="64" width="6" height="9"/><rect x="50" y="48" width="6" height="8"/><path d="M34 90H70M32 96H72"/></g><path d="M0 100H100M4 94l2-8M12 94l-1-9M80 94l2-8M90 94l-1-9M96 94l1-6" stroke-width="1.3"/><path d="M0 0H100V100H0Z" stroke-width="1" stroke-dasharray="3 3"/>'],
      ['Komposition (Mondrian)', '<rect x="4" y="4" width="34" height="46" fill="#d81018" stroke="none"/><rect x="74" y="74" width="22" height="22" fill="#1060e0" stroke="none"/><rect x="4" y="84" width="22" height="12" fill="#f0b800" stroke="none"/><path d="M4 4H96V96H4Z M38 4V96 M4 50H96 M74 50V96 M4 84H74 M26 84V96 M38 18H96 M60 18V50" stroke="#16162a" stroke-width="2.6" stroke-linecap="butt"/>'],
      ['Mädchen mit dem Perlenohrring (Vermeer)', '<path d="M32 40Q28 12 52 10Q76 12 70 40" stroke-width="1.8"/><path d="M34 22Q50 14 68 24M32 30Q50 22 70 32" stroke-width="1.3"/><path d="M68 18Q86 30 84 60Q82 72 74 70M70 24Q80 36 78 58" stroke-width="1.5"/><ellipse cx="52" cy="48" rx="15" ry="19"/><path d="M42 44Q46 41 50 44M56 44Q60 41 64 44" stroke-width="1.4"/><circle cx="46" cy="46" r="1.5" fill="#16162a"/><circle cx="60" cy="46" r="1.5" fill="#16162a"/><path d="M53 48L51 55Q53 57 56 55" stroke-width="1.3"/><path d="M45 61Q52 65 59 61Q52 58 45 61Z" stroke-width="1.5"/><path d="M38 66Q36 76 24 84Q18 94 22 100M66 66Q70 76 82 84Q88 94 84 100" stroke-width="1.7"/><path d="M40 70Q52 78 64 70" stroke-width="1.4"/><circle cx="68" cy="62" r="3.4" fill="#fff"/><path d="M66 60l1.5-1.5" stroke-width="1.3"/><path d="M0 100H100" stroke-width="1.2"/>'],
      ['Sonnenblumen (Van Gogh)', '<path d="M38 100Q32 82 38 68H62Q68 82 62 100Z M38 78H62 M44 70V66H56V70" stroke-width="1.6"/><g stroke-width="1.3"><circle cx="30" cy="30" r="9"/><circle cx="30" cy="30" r="15" stroke-dasharray="4 2.5"/><circle cx="62" cy="22" r="9"/><circle cx="62" cy="22" r="15" stroke-dasharray="4 2.5"/><circle cx="48" cy="46" r="8"/><circle cx="48" cy="46" r="14" stroke-dasharray="4 2.5"/><circle cx="80" cy="46" r="7"/><circle cx="80" cy="46" r="12" stroke-dasharray="4 2.5"/><circle cx="16" cy="58" r="6"/><circle cx="16" cy="58" r="10" stroke-dasharray="4 2.5"/></g><path d="M44 66Q40 58 36 44M54 66Q58 56 62 34M58 68Q70 60 76 52M42 68Q28 64 20 62" stroke-width="1.6"/><path d="M8 98H92" stroke-width="1.3"/>'],
      ['Der vitruvianische Mensch (da Vinci)', '<circle cx="50" cy="52" r="42" stroke-width="1.5"/><rect x="12" y="10" width="76" height="76" stroke-width="1.5"/><circle cx="50" cy="26" r="6"/><path d="M50 32V58M50 36L14 42M50 36L86 42M50 38L22 24M50 38L78 24" stroke-width="1.6"/><path d="M50 58L38 86M50 58L62 86M50 58L28 80M50 58L72 80" stroke-width="1.6"/><path d="M42 36Q50 44 58 36M44 46H56" stroke-width="1.3"/>']
    ],
    play(el, ctx) {
      const clean = [], pick = ctx.rng(), refs = GAMES.draw.REFS, ref = refs[Math.floor(pick * refs.length) % refs.length];
      const D = GAMES.draw.DRAW_MS, V = GAMES.draw.VOTE_MS; let sent = false, voted = false, galleryShown = false;
      const refSvg = `<svg viewBox="0 0 100 100" class="drawref" fill="none" stroke="#16162a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ref[1]}</svg>`;
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
        const t = document.createElement('canvas'); t.width = 280; t.height = 280; const x = t.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 280, 280); x.drawImage(cv, 0, 0, 280, 280);
        ctx.send({ t: 'draw', img: t.toDataURL('image/jpeg', 0.6) });
        showWait('Zeichnung abgegeben!<br><small>Warte auf die anderen Künstler ...</small>'); ctx.sfx.win();
      };
      clean.push(onTap(el.querySelector('#ddone'), sendDraw));
      const to1 = ctx.after(sendDraw, D);
      let galPoll = null; const rate = {}, have = new Set(), list = []; let built = false, tot = 0, go = null, to2 = null, gallery = null;
      const submit = () => {
        if (voted) return; voted = true; clearInterval(galPoll); if (to2) ctx.cancel(to2);
        list.forEach(x => { if (rate[x.k] == null) rate[x.k] = 3; });
        ctx.send({ t: 'vote', st: rate }); showWait('Stimmen abgegeben!<br><small>Gleich gibt es das Ergebnis ...</small>'); ctx.sfx.win();
      };
      const upd = () => { const r = el.querySelector('#vcount'); if (r) r.textContent = Object.keys(rate).length + ' bewertet, ' + (have.size - (have.has(-1) ? 1 : 0)) + ' von ' + tot + ' Bildern da'; };
      const addCard = x => {
        const card = document.createElement('div'); card.className = 'gcard'; card.dataset.k = x.k;
        card.innerHTML = `<img src="${x.img}"><div class="stars">${[1, 2, 3, 4, 5].map(s => `<button data-s="${s}">&#9733;</button>`).join('')}</div>`;
        const nxt = [...gallery.children].find(c => +c.dataset.k > x.k); gallery.insertBefore(card, nxt || null);
        card.querySelectorAll('button').forEach(b => clean.push(onTap(b, () => {
          if (voted) return; const s = +b.dataset.s; rate[x.k] = s; ctx.sfx.tap();
          card.querySelectorAll('button').forEach(y => y.classList.toggle('on', +y.dataset.s <= s));
          upd();
        })));
      };
      // Pictures arrive one message each (robust on slow links); unrated pictures count as 3 stars, the vote can be sent any time
      const buildUI = ms => {
        built = true; ctx.cancel(to1); if (!sent) { sent = true; stopBar(); }
        el.innerHTML = `<div class="qhead">ABSTIMMUNG</div><p class="small">Gib jeder Zeichnung 1 bis 5 Sterne. Deine eigene fehlt. Alle Bilder laden nach, einfach scrollen. Nicht bewertet = 3 Sterne. <b id="vcount"></b></p>
          <div class="gallery" id="gal"></div><button class="big green" id="vgo">ABSTIMMEN</button>`;
        gallery = el.querySelector('#gal'); go = el.querySelector('#vgo');
        const stopV = timerBar(el, ms, ctx.now(), ctx); clean.push(stopV);
        clean.push(onTap(go, submit)); to2 = ctx.after(submit, ms); clean.push(() => ctx.cancel(to2));
      };
      ctx.onGm(m => {
        if (m.k !== 'gimg' || voted) return;
        if (!built) buildUI(m.ms || V);
        tot = m.tot || tot; if (built && !galPoll) startPoll(); if (have.has(m.n)) return; have.add(m.n);
        if (m.own !== ctx.me) { const x = { k: m.n, img: m.img }; list.push(x); addCard(x); }
        upd(); if (have.size >= tot) { clearInterval(galPoll); if (!list.length) submit(); }
      });
      const startPoll = () => { clearInterval(galPoll); galPoll = setInterval(() => { if (sent && !voted && (!built || have.size < tot)) ctx.send({ t: 'galreq' }); }, 4000); clean.push(() => clearInterval(galPoll)); };
      startPoll();
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

// ------------------------------------------------------------------ preview pictures for the intro screen (inline SVG, 200x120)
function gamePreview(key, variant) {
  const K = '#16162a', Y = '#f0b800', R = '#d81018', B = '#1060e0', G = '#18a048', W = '#fff';
  const frame = inner => `<svg viewBox="0 0 200 120" class="gpvsvg" role="img" aria-hidden="true"><rect width="200" height="120" rx="10" fill="#fff6d6"/>${inner}</svg>`;
  const btn = (x, y, w, h, t, c, tc = W) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${c}" stroke="${K}" stroke-width="2.5"/><text x="${x + w / 2}" y="${y + h / 2 + 4.5}" text-anchor="middle" font-size="12" font-weight="900" fill="${tc}" font-family="Arial Black,Arial,sans-serif">${t}</text>`;
  const kart = (x, y, c) => `<g transform="translate(${x},${y})"><rect x="0" y="4" width="26" height="12" rx="5" fill="${c}" stroke="${K}" stroke-width="2.5"/><circle cx="5" cy="17" r="4" fill="${K}"/><circle cx="21" cy="17" r="4" fill="${K}"/><circle cx="13" cy="3" r="4.5" fill="#ffd9a8" stroke="${K}" stroke-width="2"/></g>`;
  const q = (lines) => `<rect x="14" y="10" width="172" height="34" rx="8" fill="${W}" stroke="${K}" stroke-width="2.5"/>` + lines;
  const ans = (hi) => [0, 1, 2, 3].map(i => btn(14 + (i % 2) * 88, 54 + Math.floor(i / 2) * 31, 84, 26, ['A', 'B', 'C', 'D'][i], i === hi ? G : B)).join('');
  const P = {
    race: {
      tap: frame(`<rect x="10" y="14" width="180" height="16" fill="#bbb" stroke="${K}" stroke-width="2"/>${kart(20, 12, R)}<rect x="10" y="38" width="180" height="16" fill="#bbb" stroke="${K}" stroke-width="2"/>${kart(60, 36, B)}<path d="M176 10V58" stroke="${K}" stroke-width="4" stroke-dasharray="4 4"/><circle cx="100" cy="92" r="22" fill="${R}" stroke="${K}" stroke-width="3"/><text x="100" y="97" text-anchor="middle" font-size="14" font-weight="900" fill="${W}" font-family="Arial Black,Arial">GAS</text>`),
      lr: frame(`${kart(86, 8, R)}<rect x="22" y="44" width="68" height="64" rx="10" fill="${Y}" stroke="${K}" stroke-width="3"/><rect x="110" y="44" width="68" height="64" rx="10" fill="#ccc" stroke="${K}" stroke-width="3"/><text x="56" y="84" text-anchor="middle" font-size="22" font-weight="900" fill="${K}">&#9664;</text><text x="144" y="84" text-anchor="middle" font-size="22" font-weight="900" fill="${K}">&#9654;</text>`),
      turbo: frame(`${kart(20, 14, R)}<rect x="14" y="62" width="172" height="22" rx="11" fill="#ddd" stroke="${K}" stroke-width="3"/><rect x="92" y="62" width="34" height="22" fill="${G}" stroke="${K}" stroke-width="3"/><path d="M118 52L118 94" stroke="${R}" stroke-width="5"/>${btn(62, 94, 76, 20, 'BOOST', Y, K)}`)
    },
    duel: {
      quick: frame(`<circle cx="44" cy="52" r="24" fill="#ffd9a8" stroke="${K}" stroke-width="3"/><circle cx="156" cy="52" r="24" fill="#ffd9a8" stroke="${K}" stroke-width="3"/><text x="100" y="60" text-anchor="middle" font-size="22" font-weight="900" fill="${R}">VS</text>${btn(50, 88, 100, 26, 'SCHLAG!', R)}`),
      combo: frame(`<text x="100" y="26" text-anchor="middle" font-size="12" font-weight="900" fill="${K}">COMBO</text>${['&#9664;', '&#9650;', '&#9654;', '&#9660;'].map((a, i) => `<rect x="${24 + i * 40}" y="36" width="34" height="34" rx="8" fill="${i < 2 ? G : W}" stroke="${K}" stroke-width="3"/><text x="${41 + i * 40}" y="60" text-anchor="middle" font-size="18" fill="${K}">${a}</text>`).join('')}${btn(40, 84, 50, 26, '&#9664;', B)}${btn(110, 84, 50, 26, '&#9654;', B)}`),
      mash: frame(`<rect x="86" y="14" width="28" height="64" rx="6" fill="#8a5a2b" stroke="${K}" stroke-width="3" transform="rotate(-25 100 60)"/><rect x="64" y="8" width="72" height="26" rx="6" fill="#999" stroke="${K}" stroke-width="3" transform="rotate(-25 100 60)"/>${btn(50, 86, 100, 26, 'HAUEN!', R)}`)
    },
    guess: {
      mix: frame(q(`<text x="100" y="32" text-anchor="middle" font-size="12" font-weight="900" fill="${K}">Wie viele ...?</text>`) + `<rect x="50" y="56" width="100" height="26" rx="6" fill="${W}" stroke="${K}" stroke-width="3"/><text x="100" y="75" text-anchor="middle" font-size="16" font-weight="900" fill="${K}">1234</text>${btn(50, 90, 100, 24, 'ABGEBEN', G)}`),
      count: frame(`${[[40, 30], [90, 22], [150, 36], [64, 68], [120, 62], [166, 84], [30, 94]].map(([x, y]) => `<path d="M${x} ${y + 24}q-8-10-4-22q4-4 8 0q4 12-4 22Z" fill="${W}" stroke="${K}" stroke-width="2.5"/>`).join('')}<text x="100" y="116" text-anchor="middle" font-size="11" font-weight="900" fill="${R}">3 SEKUNDEN, DANN ZÄHLEN</text>`)
    },
    quiz: frame(q(`<rect x="28" y="20" width="144" height="5" rx="2" fill="#bbb"/><rect x="28" y="30" width="96" height="5" rx="2" fill="#bbb"/>`) + ans(2)),
    geo: frame(`<rect x="10" y="8" width="180" height="82" rx="8" fill="#7cc4ff" stroke="${K}" stroke-width="3"/><path d="M70 22L110 18L130 30L124 56L136 70L100 82L82 66L60 62L58 38Z" fill="#e9d47a" stroke="${K}" stroke-width="2"/><path d="M10 30H190M10 56H190M60 8V90M110 8V90M150 8V90" stroke="#fff" stroke-width="1" opacity=".7"/><path d="M104 36q-9-14 0-20q9 6 0 20Z" fill="${R}" stroke="${K}" stroke-width="2"/>${btn(10, 96, 60, 20, 'ZOOM', Y, K)}${btn(80, 96, 110, 20, 'NADEL SETZEN', G)}`),
    seek: frame(`${Array.from({ length: 34 }, (_, i) => `<circle cx="${14 + (i * 47) % 176}" cy="${14 + (i * 31) % 92}" r="${6 + (i % 3) * 2}" fill="${[R, B, G, Y, '#c070e0', '#ff8040'][i % 6]}" stroke="${K}" stroke-width="1.5" opacity=".85"/>`).join('')}<circle cx="128" cy="62" r="13" fill="${W}" stroke="${R}" stroke-width="3"/><image href="badges/00_ralf.png" x="117" y="51" width="22" height="22"/><text x="100" y="116" text-anchor="middle" font-size="11" font-weight="900" fill="${K}" stroke="${W}" stroke-width="3" paint-order="stroke">FINDE RALLUM</text>`),
    draw: frame(`<rect x="12" y="8" width="176" height="84" rx="8" fill="${W}" stroke="${K}" stroke-width="3"/><g transform="translate(16 12) scale(.42)" fill="none" stroke="${K}" stroke-width="3" stroke-linecap="round"><path d="M20 85V52H80V85ZM20 52L80 85M80 52L20 85M20 52L50 22L80 52"/></g><path d="M80 70Q100 30 120 62T164 50" fill="none" stroke="${R}" stroke-width="5" stroke-linecap="round"/>${[K, R, B, G, Y].map((c, i) => `<circle cx="${30 + i * 18}" cy="106" r="7" fill="${c}" stroke="${K}" stroke-width="2"/>`).join('')}${btn(128, 98, 62, 20, 'FERTIG', G)}`),
    party: {
      react: frame(`<circle cx="100" cy="52" r="38" fill="${G}" stroke="${K}" stroke-width="4"/><text x="100" y="58" text-anchor="middle" font-size="18" font-weight="900" fill="${W}">JETZT!</text><text x="100" y="110" text-anchor="middle" font-size="11" font-weight="900" fill="${K}">WARTEN, BIS ES GRÜN WIRD</text>`),
      color: frame(`<text x="100" y="62" text-anchor="middle" font-size="40" font-weight="900" fill="${B}" font-family="Arial Black,Arial">ROT</text>${btn(20, 82, 74, 28, 'PASST', G)}${btn(106, 82, 74, 28, 'FALSCH', R)}`),
      pins: frame(`${Array.from({ length: 12 }, (_, i) => `<path d="M${28 + (i % 6) * 28} ${50 + Math.floor(i / 6) * 38}q-8-10-4-24q4-4 8 0q4 14-4 24Z" fill="${W}" stroke="${K}" stroke-width="2.5"/>`).join('')}<text x="100" y="112" text-anchor="middle" font-size="11" font-weight="900" fill="${K}">ALLE 12 ANTIPPEN</text>`)
    },
    battle: frame(`<rect x="8" y="8" width="184" height="104" rx="10" fill="#555" stroke="${K}" stroke-width="3"/><path d="M30 30H170V90H30Z" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6 6"/>${kart(40, 38, R)}${kart(120, 62, B)}${kart(130, 26, G)}<circle cx="100" cy="60" r="6" fill="${Y}" stroke="${K}" stroke-width="2"/><path d="M70 50L96 56" stroke="${Y}" stroke-width="3" stroke-dasharray="3 3"/>`)
  };
  const g = P[key]; const s = typeof g === 'string' ? g : (g && (g[variant] || Object.values(g)[0]));
  return s || '';
}
