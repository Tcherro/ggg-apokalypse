// GGG - Apokalypse: host-authoritative multiplayer party game (PeerJS P2P, BroadcastChannel in ?local test mode)
const CHARS = [
  ['Dr. Gosse', '01_dr-gosse'], ['H-2-O-K-O-P-F', '02_h-2-o-k-o-p-f'], ['Tamma Hanken', '03_tamma-hanken'], ['Yen', '04_yen'],
  ['Zlatan', '05_zlatan'], ['Adev', '06_adev'], ['Lücke', '07_luecke'], ['Busfahrer', '08_busfahrer'],
  ['Hooooooopp-E', '09_hooooooopp-e'], ['Schlomo Folterknecht', '10_schlomo'], ['Gaul', '11_gaul'], ['Der Würger', '12_der-wuerger']
].map(([name, f], i) => ({ id: i, name, img: `badges/${f}.png`, fig: `figs/${f}.jpg` }));
const CRIES = ['Diagnose: Du verlierst. Therapie: Trink!', 'Wasser im Namen, Bier im Kopf.', 'Hanken hoch, Gegner runter!', 'Mein Kurs steigt, eurer fällt.',
  'Ich muss nicht gewinnen. Ich bin schon Zlatan.', 'Adev? Ade, Gegner!', 'Ich finde jede Lücke. Auch in deiner Deckung.', 'Einsteigen bitte, Endstation Niederlage!',
  'Hoooooopp und weg ist dein Vorsprung!', 'Schlomo kommt, Schlomo siegt, Schlomo trinkt trotzdem.', 'Einem geschenkten Gaul schaut man nicht in die Punkte.', 'Ich würge jede Führung ab.'];
CHARS.forEach((c, i) => c.cry = CRIES[i]);
const CHAL_ID = 12;
CHARS.push({ id: CHAL_ID, name: 'Herausforderer', img: 'badges/13_herausforderer.png', cry: 'Ich komm von außen und räum euch ab.' });
const PROST = ['Sauber runtergespült!', 'Gluck, gluck, weg!', 'Die Leber grüßt.', 'Schluck-Beweis akzeptiert.', 'Ehrenrunde für dich!', 'Respekt, du Tier!', 'Und nochmal, aber nicht jetzt.'];
const RALF_IMG = 'badges/00_ralf.png', RALF_FIG = 'figs/00_ralf.jpg';
const PREFIX = 'ggg-apokalypse-';
// STUN + TURN: without a relay, WebRTC fails behind carrier NAT or WLANs with client isolation (typical on Samsung phones / venue WLAN)
const ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:staticauth.openrelay.metered.ca:80', 'turn:staticauth.openrelay.metered.ca:80?transport=tcp', 'turn:staticauth.openrelay.metered.ca:443', 'turns:staticauth.openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
], iceCandidatePoolSize: 4 };
let netDiag = '';
const PASS_TASKS = ['{n} Kniebeugen', '{n} Liegestütze', '{n}x Hampelmann', '{n} Sekunden Planke', 'Einen Trinkspruch ausbringen'];
const params = new URLSearchParams(location.search);
const LOCAL = params.has('local');
const app = document.getElementById('app');

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem(k); } catch { } }
};
const rid = n => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// in local test mode each tab gets its own player id (sessionStorage), otherwise stable per device
const PID = LOCAL ? (sessionStorage.getItem('ggg-pid') || (sessionStorage.setItem('ggg-pid', 'p' + rid(8)), sessionStorage.getItem('ggg-pid')))
  : (store.get('ggg-pid') || (store.set('ggg-pid', 'p' + rid(8)), store.get('ggg-pid')));

let me = { pid: PID, host: false, code: null, solo: false };
let S = null, LIVE = {}, QUESTIONS = { schaetzen: [], auswahl: [], orte: [] }, net = null, online = false;
let liveFns = [], gmFns = [], mounted = { key: null, cleanup: null };

fetch('questions.json').then(r => r.json()).then(q => { if (q && q.schaetzen) QUESTIONS = q; }).catch(() => { });

// ------------------------------------------------------------------ helpers
function toast(msg, ms = 2200) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms); }
const P = pid => S && S.players[pid];
const charOf = pid => { const p = P(pid); return p && p.char != null ? CHARS[p.char] : null; };
const cryOf = pid => pid === 'cpu' ? 'Du funktionierst hier nicht!' : ((charOf(pid) || {}).cry || '');
const isChal = pid => { const p = P(pid); return !!(p && p.challenger); };
const dname = pid => { if (pid === 'cpu') return 'Rallum-Geist'; const p = P(pid); if (!p) return '?'; if (p.challenger) return p.nick ? p.nick + ' (Gast)' : 'Herausforderer'; return charOf(pid) ? charOf(pid).name : 'Neuling'; };
const dimg = pid => pid === 'cpu' ? RALF_IMG : ((charOf(pid) || {}).img || 'icons/icon-192.png');
function passTask(sips) { const t = PASS_TASKS[Math.floor(Math.random() * PASS_TASKS.length)]; return t.replace('{n}', sips * 3); }
let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

// ------------------------------------------------------------------ transport
// Two channels in parallel, results de-duplicated: WebRTC (fast, direct, only works in friendly networks) and
// MQTT over WebSocket through public brokers (works from any network, WLAN or mobile). Every message carries an id.
const BROKERS = params.get('mqtt') ? params.get('mqtt').split(',') : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081'];
const FAST = new Set(['inp', 'prog', 'bs', 'live']); // high-rate messages: WebRTC only when it is open
const MYID = rid(6) + '.'; let mseq = 0;
const stampMsg = m => Object.assign({}, m, { _i: MYID + (++mseq) });
const seenIds = new Set();
function fresh(id) { if (!id) return true; if (seenIds.has(id)) return false; seenIds.add(id); if (seenIds.size > 1500) { const it = seenIds.values(); for (let i = 0; i < 500; i++) seenIds.delete(it.next().value); } return true; }
function mqHub(topics, onMsg, onUp) {
  const cl = [];
  if (typeof mqtt !== 'undefined') BROKERS.forEach(url => {
    let c; try { c = mqtt.connect(url, { clientId: 'ggg' + rid(12), clean: true, reconnectPeriod: 2500, connectTimeout: 9000, keepalive: 25, resubscribe: true }); } catch { return; }
    c.on('connect', () => { try { c.subscribe(topics, { qos: 0 }); } catch { } if (onUp) onUp(); });
    c.on('message', (t, buf) => { let m; try { m = JSON.parse(buf.toString()); } catch { return; } onMsg(m); });
    c.on('error', () => { });
    cl.push(c);
  });
  return {
    pub: (topic, msg) => { const s = JSON.stringify(msg); cl.forEach(c => { if (c.connected) { try { c.publish(topic, s, { qos: 0 }); } catch { } } }); },
    n: () => cl.filter(c => c.connected).length
  };
}
function hostNet(code, onMsg, onLeave, onReady, onFail) {
  if (LOCAL) {
    const bc = new BroadcastChannel('ggg-' + code);
    bc.onmessage = e => { const m = e.data; if (m.to !== 'host') return; if (m.msg && m.msg.t === 'bye') onLeave(m.from); else onMsg(m.from, m.msg); };
    setTimeout(onReady, 50);
    return { broadcast: msg => bc.postMessage({ to: '*', msg }), send: (k, msg) => bc.postMessage({ to: k, msg }) };
  }
  const base = 'ggg-apokalypse/' + code.toLowerCase();
  const conns = new Map(), seenAt = {}, gone = {}; let peer, tries = 0, readyFired = false;
  const fireReady = () => { if (!readyFired) { readyFired = true; onReady(); } };
  const handle = m => {
    if (!m || typeof m !== 'object' || !m.pid || !fresh(m._i)) return;
    const pid = m.pid; seenAt[pid] = Date.now();
    if (gone[pid]) { delete gone[pid]; if (m.t !== 'hello') onMsg(pid, { t: 'hello', pid }); }
    if (m.t === 'hb') return;
    if (m.t === 'bye') { gone[pid] = true; onLeave(pid); return; }
    onMsg(pid, m);
  };
  const hub = mqHub([base + '/up'], handle, fireReady);
  const start = () => {
    peer = new Peer(PREFIX + code.toLowerCase(), { debug: 0, config: ICE });
    peer.on('open', fireReady);
    peer.on('connection', c => {
      c.on('data', d => { if (d && d.pid) conns.set(d.pid, c); handle(d); });
      c.on('close', () => { for (const [k, v] of conns) if (v === c) conns.delete(k); });
      c.on('error', () => { });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { } });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries++ < 8) { peer.destroy(); setTimeout(start, 2500); return; } // old host session still registered
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) setTimeout(() => { try { peer.reconnect(); } catch { } }, 4000);
    });
  };
  start();
  const needMq = () => Object.keys(seenAt).some(p => !gone[p] && !(conns.get(p) && conns.get(p).open));
  let lastTick = Date.now();
  const grace = () => { const n = Date.now(); Object.keys(seenAt).forEach(p => { seenAt[p] = n; }); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') grace(); });
  setInterval(() => {
    const now = Date.now();
    if (now - lastTick > 6000) grace(); // host app was suspended: nobody could reach us, so nobody is "gone"
    lastTick = now;
    Object.keys(seenAt).forEach(p => { if (!gone[p] && now - seenAt[p] > 30000) { gone[p] = true; onLeave(p); } });
    out.broadcast({ t: 'hb' });
  }, 4000);
  const out = {
    broadcast: msg => { const o = stampMsg(msg); conns.forEach(c => { if (c.open) c.send(o); }); if (!FAST.has(msg.t) || needMq()) hub.pub(base + '/down', o); },
    send: (pid, msg) => { const o = stampMsg(msg), c = conns.get(pid), rtc = !!(c && c.open); if (rtc) c.send(o); if (!FAST.has(msg.t) || !rtc) hub.pub(base + '/to/' + pid, o); },
    relays: () => hub.n()
  };
  return out;
}
function clientNet(code, onMsg, onStatus) {
  if (LOCAL) {
    const key = 'c' + rid(6), bc = new BroadcastChannel('ggg-' + code);
    bc.onmessage = e => { const m = e.data; if (m.to === '*' || m.to === key) onMsg(m.msg); };
    const send = msg => bc.postMessage({ to: 'host', from: key, msg });
    window.addEventListener('pagehide', () => send({ t: 'bye' }));
    setTimeout(() => onStatus(true), 30);
    return { send };
  }
  const base = 'ggg-apokalypse/' + code.toLowerCase();
  let peer = null, conn = null, retry = null, up = false, lastHost = 0, tick = 0;
  const gotHost = m => {
    if (!m || typeof m !== 'object' || !fresh(m._i)) return;
    lastHost = Date.now(); if (!up) { up = true; onStatus(true); }
    if (m.t === 'hb') return;
    onMsg(m);
  };
  const hub = mqHub([base + '/down', base + '/to/' + me.pid], gotHost, () => send({ t: 'hello' }));
  const rtcOpen = () => !!(conn && conn.open);
  const send = msg => {
    const o = stampMsg(Object.assign({ pid: me.pid }, msg));
    if (rtcOpen()) conn.send(o);
    if (!FAST.has(msg.t) || !rtcOpen()) hub.pub(base + '/up', o);
  };
  const connect = () => {
    clearTimeout(retry);
    if (!peer || peer.destroyed) {
      peer = new Peer({ debug: 0, config: ICE });
      peer.on('open', connect);
      peer.on('error', e => { netDiag = 'WebRTC: ' + e.type; retry = setTimeout(connect, 4000); });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { } });
      return;
    }
    if (!peer.open) return;
    conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
    const c = conn;
    c.on('open', () => send({ t: 'hello' }));
    c.on('data', gotHost);
    c.on('close', () => { retry = setTimeout(connect, 2500); });
    c.on('error', () => { });
    setTimeout(() => { if (c === conn && !c.open) { try { c.close(); } catch { } retry = setTimeout(connect, 800); } }, 12000);
  };
  connect();
  setInterval(() => {
    tick++;
    if (up && Date.now() - lastHost > 20000) { up = false; onStatus(false); }
    if (!up) send({ t: 'hello' }); else if (tick % 2 === 0) send({ t: 'hb' });
    if (!up) { netDiag = 'Relay ' + hub.n() + '/' + BROKERS.length + ' verbunden' + (hub.n() === 0 ? ' (kein Internet oder Server blockiert?)' : ', warte auf Host'); const d = document.getElementById('diag'); if (d) d.textContent = netDiag; }
  }, 2000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { send({ t: 'hello' }); if (!rtcOpen()) connect(); } });
  window.addEventListener('pagehide', () => send({ t: 'bye' }));
  return { send };
}

// ------------------------------------------------------------------ host logic
const KEYS = {}; // transport key -> pid
let liveDirty = false, roundTimer = null, ralfTimer = null, cpuTimers = [], botTimers = [];
const HC = makeClock(); // host timers pause during a Rallumkalypse
function newState(code) {
  return {
    code, host: me.pid, phase: 'lobby', players: {}, games: 10, nonce: 0, round: 0, bag: [], lastVar: {}, used: { s: [], c: [], p: [] },
    game: null, subs: {}, results: null, ralf: null, ralfAt: [], ralfCount: 0, sessionStart: null, readyNext: {}, battle: null, ver: 0,
    owed: {}, paid: {}, giveLeft: {}, gifts: [], chal: { on: false, paypal: '', amount: 10, team: 0, ch: 0, paidOut: false }
  };
}
function commit() {
  S.ver++;
  if (!me.solo) store.set('ggg-host', { code: me.code, S });
  if (net) net.broadcast({ t: 'state', s: S });
  render();
}
function hostHandle(pid, m) {
  let p = S.players[pid];
  switch (m.t) {
    case 'hello':
      if (!p) S.players[pid] = p = { char: null, nick: '', pass: false, ready: false, score: 0, sips: 0 };
      p.online = true; break;
    case 'pick': {
      if (!p) return;
      const taken = Object.entries(S.players).some(([q, o]) => q !== pid && o.char === m.char);
      if (taken || m.char < 0 || m.char >= CHARS.length) return;
      if (m.char === CHAL_ID && !S.chal.on) return;
      p.char = m.char; p.challenger = m.char === CHAL_ID; if (p.challenger) p.pass = false;
      if (S.phase !== 'lobby') { if (p.ready || p.fee) p.ready = true; else p.late = true; } break; // latecomers pay the entry fee first
    }
    case 'nick': if (p) p.nick = String(m.v || '').slice(0, 18); break;
    case 'pass': if (p && !p.challenger) p.pass = !!m.v; break;
    case 'ready':
      if (!p || p.char == null) break;
      if (S.phase !== 'lobby' && !p.ready && !p.fee && m.v) { // entry fee for latecomers: 10 sips + one beer ex
        if (!m.fee) return;
        p.fee = true; p.late = false; p.sips = (p.sips || 0) + 10; p.ex = (p.ex || 0) + 1;
      }
      p.ready = !!m.v; break;
    case 'score':
      if (!S.game || m.nonce !== S.game.nonce || S.phase !== 'play' || S.subs[pid]) return;
      S.subs[pid] = { v: m.v, d: m.d };
      if (needed().every(q => S.subs[q])) return finishRound();
      break;
    case 'prog':
      if (S.game && m.nonce === S.game.nonce) { LIVE[pid] = m.p; liveDirty = true; }
      return;
    case 'go':
      if (S.phase !== 'results' || !canGo(pid)) return;
      S.readyNext[pid] = true; commit(); return checkAdvance();
    case 'give': {
      if (S.phase !== 'results' || !(S.giveLeft[pid] > 0)) return;
      const t = S.players[m.to]; if (!t || m.to === pid || t.char == null || t.challenger) return;
      S.giveLeft[pid]--; S.owed[m.to] = (S.owed[m.to] || 0) + 1; S.gifts.push([pid, m.to]); S.readyNext[m.to] = false;
      commit(); return;
    }
    case 'giveskip': if (S.phase === 'results') { S.giveLeft[pid] = 0; commit(); checkAdvance(); } return;
    case 'drank': if (S.phase === 'results') { settleDrink(pid); commit(); checkAdvance(); } return;
    case 'draw': {
      if (!S.game || S.game.key !== 'draw' || m.nonce !== S.game.nonce || S.phase !== 'play' || HD.imgs[pid] || !S.game.parts.includes(pid)) return;
      HD.imgs[pid] = String(m.img || '').slice(0, 70000);
      if (needed().every(q => HD.imgs[q])) sendGallery();
      return;
    }
    case 'vote': {
      if (!S.game || S.game.key !== 'draw' || m.nonce !== S.game.nonce || S.phase !== 'play' || !HD.galSent || HD.votes[pid] || !S.game.parts.includes(pid)) return;
      HD.votes[pid] = m.st && typeof m.st === 'object' ? m.st : {};
      if (needed().every(q => HD.votes[q] || !HD.imgs[q])) finalizeDraw();
      return;
    }
    case 'galreq': { // a client that missed the gallery asks for it again
      if (!S.game || S.game.key !== 'draw' || S.phase !== 'play' || !HD.galSent) return;
      const key = Object.keys(KEYS).find(k => KEYS[k] === pid) || pid;
      galMsgs().forEach(g => { if (pid === me.pid) gmFns.forEach(f => f(g)); else net.send(key, g); }); return;
    }
    case 'brave': if (S.ralf && S.players[pid]) { S.ralf.ok[pid] = true; commit(); checkRalfDone(); } return;
    case 'taunt': { const txt = String(m.txt || '').slice(0, 60); net.broadcast({ t: 'tt', from: pid, txt }); showTaunt(pid, txt); return; }
    case 'inp': if (S.phase === 'battle') BATTLE.input(pid, +m.x || 0, +m.y || 0); return;
    case 'fire': if (S.phase === 'battle') BATTLE.fire(pid); return;
    case 'dash': if (S.phase === 'battle') BATTLE.dash(pid); return;
    case 'exdone': if (S.phase === 'battle' && S.battle && (S.battle.exPids || []).includes(pid)) { S.battle.exDone[pid] = true; commit(); } return;
    default: return;
  }
  commit();
}
// --- Nachmalen (draw game): drawings and votes are kept on the host, not in the broadcast state
let HD = { imgs: {}, votes: {}, order: [], galSent: false, fin: false };
function galMsgs() {
  const nonce = S.game.nonce, n = HD.order.length, ms = HD.voteMs;
  return HD.order.map((p, i) => ({ t: 'gm', k: 'gimg', nonce, n: i, tot: n, ms, img: HD.imgs[p], own: p }));
}
function galBroadcast() { if (!S.game || S.game.key !== 'draw' || !HD.galSent) return; galMsgs().forEach(m => { net.broadcast(m); gmFns.forEach(f => f(m)); }); }
function sendGallery() {
  if (HD.galSent || !S.game || S.game.key !== 'draw') return; HD.galSent = true;
  const nonce = S.game.nonce, pids = shuffle(Object.keys(HD.imgs));
  HD.order = pids; HD.voteMs = Math.max(40000, Math.min(100000, 16000 + 7000 * pids.length));
  galBroadcast(); HC.after(galBroadcast, 4000); HC.after(galBroadcast, 10000); HC.after(galBroadcast, 20000); // repeats: clients ignore images they already have
  Object.keys(S.players).filter(q => S.players[q].bot && S.game.parts.includes(q)).forEach((q, n) => HC.after(() => {
    if (!S.game || S.game.nonce !== nonce || S.phase !== 'play') return;
    const st = {}; pids.forEach((p, i) => { if (p !== q) st[i] = 1 + Math.floor(Math.random() * 5); }); hostHandle(q, { t: 'vote', nonce, st });
  }, 4000 + n * 1500 + Math.random() * 6000));
  HC.after(() => { if (S.game && S.game.nonce === nonce && S.phase === 'play') finalizeDraw(); }, HD.voteMs + 4000);
}
function finalizeDraw() {
  if (HD.fin || !S.game || S.game.key !== 'draw') return; HD.fin = true;
  if (!HD.galSent) HD.galSent = true;
  S.game.parts.forEach(pid => {
    if (!S.players[pid]) return;
    const k = HD.order.indexOf(pid);
    if (k < 0) { S.subs[pid] = { v: null, d: 'nichts gezeichnet' }; return; }
    const votes = Object.entries(HD.votes).filter(([voter]) => voter !== pid).map(([, st]) => +st[k]).filter(x => x >= 1 && x <= 5);
    if (!votes.length) { S.subs[pid] = { v: 0, d: 'keine Bewertung' }; return; }
    const avg = votes.reduce((x, y) => x + y, 0) / votes.length;
    S.subs[pid] = { v: Math.round(avg * 100), d: `Ø ${avg.toFixed(1).replace('.', ',')} Sterne` };
  });
  finishRound();
}
function botScribble() {
  const c = document.createElement('canvas'); c.width = c.height = 200; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200); x.lineCap = 'round'; x.lineWidth = 5 + Math.random() * 4;
  const col = ['#16162a', '#d81018', '#1060e0', '#18a048']; x.strokeStyle = col[Math.floor(Math.random() * 4)];
  x.beginPath(); x.moveTo(30 + Math.random() * 140, 30 + Math.random() * 140);
  for (let i = 0; i < 9; i++) x.lineTo(20 + Math.random() * 160, 20 + Math.random() * 160); x.stroke();
  return c.toDataURL('image/jpeg', 0.5);
}
function dueOf(pid) { return Math.max(0, (S.owed[pid] || 0) - (S.paid[pid] || 0)); }
function canGo(pid) { return dueOf(pid) === 0 && !(S.giveLeft[pid] > 0); }
function settleDrink(pid) {
  const due = dueOf(pid), p = S.players[pid]; if (!due || !p) return;
  S.paid[pid] = S.owed[pid];
  if (p.pass) p.tasks = (p.tasks || 0) + 1; else p.sips += due;
}
function resetDrinks() { S.owed = {}; S.paid = {}; S.giveLeft = {}; S.gifts = []; }
function botResults() {
  const nonce = S.game && S.game.nonce, bots = Object.keys(S.players).filter(q => S.players[q].bot);
  bots.forEach((q, i) => {
    setTimeout(() => {
      if (S.phase !== 'results' || !S.game || S.game.nonce !== nonce) return;
      const targets = Object.keys(S.players).filter(t => t !== q && S.players[t].char != null && !S.players[t].challenger);
      while (S.giveLeft[q] > 0 && targets.length) hostHandle(q, { t: 'give', to: targets[Math.floor(Math.random() * targets.length)] });
    }, 1500 + i * 400);
    const tryDone = k => setTimeout(() => {
      if (S.phase !== 'results' || !S.game || S.game.nonce !== nonce) return;
      if (dueOf(q)) hostHandle(q, { t: 'drank' });
      if (!S.readyNext[q]) S.readyNext[q] = true;
      commit(); checkAdvance(); if (k < 6) tryDone(k + 1);
    }, 3500 + i * 500 + k * 2500);
    tryDone(0);
  });
}
function chalScore(win) { if (!S.chal.on) return null; if (win) S.chal.ch++; else S.chal.team++; return win ? 'ch' : 'team'; }
function participants() { return Object.keys(S.players).filter(q => S.players[q].char != null && S.players[q].ready); }
function needed() {
  const g = S.game; if (!g) return [];
  return g.parts.filter(q => S.players[q] && S.players[q].online !== false);
}
function startSession() {
  // the host pressed START: if he picked a character, he plays (no extra READY needed)
  const hp = S.players[me.pid]; if (hp && hp.char != null && !hp.ready) hp.ready = true;
  const parts = participants(); if (parts.length < 2) return toast('Mindestens 2 Spieler müssen BEREIT sein');
  Object.values(S.players).forEach(p => { p.score = 0; p.sips = 0; p.ex = 0; p.tasks = 0; });
  S.chal.team = 0; S.chal.ch = 0; S.chal.paidOut = false; resetDrinks();
  S.sessionStart = Date.now(); S.fighterDone = false; S.round = 0; S.bag = []; S.ralfCount = 0; S.ralf = null; S.battle = null;
  const n = S.games <= 10 ? 1 : 2, pool = shuffle(Array.from({ length: S.games - 2 }, (_, i) => i + 2));
  S.ralfAt = pool.slice(0, n).sort((a, b) => a - b);
  S.fighterAt = 1 + Math.floor(Math.random() * Math.min(S.games, 6)); // the Kegel-Fighter is guaranteed within the first rounds
  planGame();
}
function planGame(repeat = false) {
  const parts = participants();
  let key, variant;
  if (repeat && S.game) { key = S.game.key; variant = S.game.variant; }
  else {
    for (let guard = 0; guard < 10; guard++) {
      if (!S.bag.length) S.bag = shuffle(Object.keys(GAMES));
      key = S.bag.shift(); if (key !== 'duel' || parts.length >= 2) break;
    }
    let vs = Object.keys(GAMES[key].variants).filter(v => v !== S.lastVar[key]); if (!vs.length) vs = Object.keys(GAMES[key].variants); // single-variant games (seek, draw) may come up twice
    variant = vs[Math.floor(Math.random() * vs.length)]; S.lastVar[key] = variant;
    if (S.round + 1 >= (S.fighterAt || 99) && !S.fighterDone && parts.length >= 2) { key = 'duel'; variant = 'fighter'; S.lastVar.duel = 'fighter'; }
    if (key === 'duel' && variant === 'fighter') S.fighterDone = true;
    S.round++;
  }
  let duels = null, cpu = null, question = null;
  if (key === 'duel') {
    if (repeat && S.game.duels) duels = S.game.duels;
    else { const sh = shuffle(parts); duels = []; for (let i = 0; i < sh.length; i += 2) duels.push([sh[i], sh[i + 1] || 'cpu']); }
    if (duels.some(d => d.includes('cpu'))) {
      const R = (a, b) => Math.round(a + Math.random() * (b - a));
      const r = variant === 'fighter' ? Array.from({ length: 7 }, () => R(0, 2)) : variant === 'quick' ? [R(300, 520), R(300, 520), R(300, 520)] : variant === 'combo' ? [R(2300, 3400), R(2300, 3400), R(2300, 3400)] : [R(30, 44)];
      cpu = { r, total: variant === 'fighter' ? 0 : r.reduce((x, y) => x + y, 0), f: R(0, 4) };
    }
  }
  let questions = null, places = null;
  // least-recently-used across sessions: the host device remembers when each question was last asked
  const pick = (pool, slot, filter, n) => {
    const hist = store.get('ggg-qhist', {}), key = q => slot + ':' + (q.m || '') + q.q;
    const cand = shuffle(pool.filter(filter)).sort((x, y) => (hist[key(x)] || 0) - (hist[key(y)] || 0));
    const fresh = cand.filter(q => !hist[key(q)]), base = fresh.length >= n ? fresh : cand.slice(0, Math.max(n * 3, Math.ceil(cand.length / 3)));
    const out = [], subs = new Set();
    for (const q of base) { if (q.sub && subs.has(q.sub)) continue; if (q.sub) subs.add(q.sub); out.push(q); if (out.length === n) break; }
    for (const q of base.concat(cand)) { if (out.length >= n) break; if (!out.includes(q)) out.push(q); }
    const now = Date.now(); out.forEach(q => hist[key(q)] = now); store.set('ggg-qhist', hist);
    return out;
  };
  if (repeat && S.game) { questions = S.game.questions; places = S.game.places; }
  else if (key === 'guess' && variant !== 'count') questions = pick(QUESTIONS.schaetzen, 's', q => q.cat === (variant === 'gev' ? 'gev' : 'allg'), 3);
  else if (key === 'quiz') questions = pick(QUESTIONS.auswahl, 'c', q => q.cat === variant, variant === 'iq' ? 5 : 3).map(q => { const o = shuffle(q.o.map((t, i) => ({ t, ok: i === q.c }))); return { q: q.q, o: o.map(x => x.t), c: o.findIndex(x => x.ok) }; });
  else if (key === 'geo') places = pick(QUESTIONS.orte, 'p', q => q.m === variant, 3);
  S.game = { key, variant, seed: Math.floor(Math.random() * 2 ** 31), nonce: ++S.nonce, dur: GAMES[key].variants[variant].dur, startDelay: 10000, duels, cpu, questions, places, parts };
  S.subs = {}; S.results = null; S.phase = 'play'; S.readyNext = {}; LIVE = {};
  HC.cancel(roundTimer); HC.cancel(ralfTimer); cpuTimers.forEach(HC.cancel); cpuTimers = [];
  const nonce = S.game.nonce;
  if (!repeat && S.ralfAt.includes(S.round)) ralfTimer = HC.after(() => { if (S.phase === 'play' && S.game.nonce === nonce) triggerRalf(); }, S.game.startDelay + 3000 + Math.random() * Math.min(15000, S.game.dur * 0.5));
  if (cpu) cpu.r.forEach((_, i) => cpuTimers.push(HC.after(() => {
    if (!S.game || S.game.nonce !== nonce) return; LIVE.cpu = { r: cpu.r.slice(0, i + 1), f: cpu.f }; liveDirty = true;
  }, S.game.startDelay + (variant === 'fighter' ? 8000 + 5500 * i : variant === 'mash' ? 8000 : (variant === 'combo' ? 6500 : 4500) * (i + 1)))));
  if (cpu && variant === 'fighter') cpuTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce) { LIVE.cpu = { r: [], f: cpu.f }; liveDirty = true; } }, S.game.startDelay + 1000));
  roundTimer = HC.after(() => { if (S.phase === 'play' && S.game.nonce === nonce && !S.ralf) finishRound(); }, S.game.startDelay + S.game.dur + 5000);
  if (key === 'draw') {
    HD = { imgs: {}, votes: {}, order: [], galSent: false, fin: false };
    parts.filter(q => S.players[q] && S.players[q].bot).forEach(q => { HD.imgs[q] = botScribble(); });
    HC.after(() => { if (S.game && S.game.nonce === nonce && S.phase === 'play') sendGallery(); }, S.game.startDelay + GAMES.draw.DRAW_MS + 9000);
  }
  botPlay();
  commit();
}
function finishRound() {
  if (S.game && S.game.key === 'draw' && !HD.fin) return finalizeDraw();
  HC.cancel(roundTimer);
  const g = S.game, better = GAMES[g.key].variants[g.variant].better;
  if (g.key === 'duel') return finishDuels();
  const pids = g.parts;
  const rows = pids.filter(q => S.players[q]).map(q => ({ pid: q, v: S.subs[q] ? S.subs[q].v : null, d: S.subs[q] ? S.subs[q].d : 'nicht abgegeben' }));
  rows.sort((x, y) => { if (x.v == null) return 1; if (y.v == null) return -1; return better === 'high' ? y.v - x.v : x.v - y.v; });
  const n = rows.length; let give = 0;
  rows.forEach(r => { r.sips = 0; r.pts = 0; });
  // ties share the better rank; sips go to everyone tied with the losing position
  const rankOf = i => { let k = i; while (k > 0 && rows[k - 1].v === rows[i].v) k--; return k; };
  let tie = false;
  if (g.key === 'duel') {
    if (n === 2 && rows[0].v != null && rows[0].v === rows[1].v) { rows[0].sips = rows[1].sips = 2; rows[0].pts = rows[1].pts = 1; tie = true; }
    else if (n === 2) { rows[1].sips = 3; rows[0].pts = 3; give = 2; }
  } else {
    rows.forEach((r, i) => { const k = rankOf(i); r.pts = n - 1 - k + (k === 0 && n > 1 ? 1 : 0); });
    // sips only among GGG players (a remote challenger never drinks)
    const T = rows.filter(r => !S.players[r.pid].challenger), nT = T.length;
    const rankT = i => { let k = i; while (k > 0 && T[k - 1].v === T[i].v) k--; return k; };
    const sipFor = [[1, nT >= 6 ? 3 : 2], [2, nT >= 4 ? 1 : 0]];
    if (nT >= 2) sipFor.forEach(([back, amount]) => {
      if (!amount) return; const i = nT - back; if (i <= 0) return;
      const k = rankT(i); if (k === 0) return; // nobody drinks if tied with the best team player
      T.forEach((r, j) => { if (rankT(j) === k && !r.sips) r.sips = amount; });
    });
    give = n >= 4 ? 2 : 1;
    if (nT >= 2 && T[nT - 1].v != null && rankT(nT - 1) === 0) { tie = true; T.forEach(r => { r.sips = 1; }); }
  }
  resetDrinks();
  rows.forEach(r => {
    const p = S.players[r.pid]; p.score += r.pts;
    if (p.challenger) { if (r.sips) r.chalNote = true; r.sips = 0; return; }
    if (r.sips) { S.owed[r.pid] = r.sips; if (p.pass) r.task = passTask(r.sips); }
  });
  let chal = null;
  const ci = rows.findIndex(r => S.players[r.pid].challenger);
  if (S.chal.on && ci >= 0 && n >= 2) chal = chalScore(rows[ci].v != null && rankOf(ci) < Math.floor(n / 2));
  let answer = null, answers = null;
  if (g.key === 'guess' && g.variant === 'count') answer = `${15 + Math.floor(mulberry32(g.seed)() * 26)} Kegel`;
  if (g.questions && g.key === 'guess') answers = g.questions.map(q => [q.q, `${fmtNum(q.a, q.unit)} ${q.unit || ''}`]);
  if (g.questions && g.key === 'quiz') answers = g.questions.map(q => [q.q, q.o[q.c]]);
  const winner = !tie && rows[0] && rows[0].v != null ? rows[0].pid : null;
  if (winner && give) S.giveLeft[winner] = give;
  S.results = { rows, give, tie, winner, answer, answers, chal };
  S.phase = 'results'; S.readyNext = {};
  commit(); botResults();
}
function botPlay() {
  botTimers.forEach(HC.cancel); botTimers = [];
  const g = S.game, nonce = g.nonce, R = (a, b) => Math.round(a + Math.random() * (b - a));
  Object.keys(S.players).filter(q => S.players[q].bot && g.parts.includes(q)).forEach(q => {
    if (g.key === 'draw') return;
    let v, d, t = g.startDelay + R(g.dur * 0.35, g.dur * 0.8);
    const k = g.key + '/' + g.variant;
    if (g.key === 'race') { const ms = R(7000, 14000); v = 100000 - ms; d = (ms / 1000).toFixed(2) + ' s'; t = g.startDelay + Math.min(ms, g.dur - 500);
      for (let i = 1; i <= 10; i++) botTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce) { LIVE[q] = { f: i / 10 }; liveDirty = true; } }, g.startDelay + ms * i / 10)); }
    else if (k === 'duel/quick') { const r = [R(280, 600), R(280, 600), R(280, 600)]; v = r[0] + r[1] + r[2]; d = (v / 1000).toFixed(3) + ' s';
      r.forEach((_, i) => botTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce) { LIVE[q] = { r: r.slice(0, i + 1) }; liveDirty = true; } }, g.startDelay + 4500 * (i + 1)))); t = g.startDelay + 14000; }
    else if (k === 'duel/combo') { const r = [R(2200, 3600), R(2200, 3600), R(2200, 3600)]; v = r[0] + r[1] + r[2]; d = (v / 1000).toFixed(3) + ' s';
      r.forEach((_, i) => botTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce) { LIVE[q] = { r: r.slice(0, i + 1) }; liveDirty = true; } }, g.startDelay + 6500 * (i + 1)))); t = g.startDelay + 20000; }
    else if (k === 'duel/fighter') { const r = Array.from({ length: 7 }, () => R(0, 3)), f = R(0, 4); v = R(-40, 40); d = 'Bot'; t = g.startDelay + 56000;
      botTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce) { LIVE[q] = { r: [], f }; liveDirty = true; } }, g.startDelay + 1500));
      r.forEach((_, i) => botTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce) { LIVE[q] = { r: r.slice(0, i + 1), f }; liveDirty = true; } }, g.startDelay + 8000 + 5500 * i))); }
    else if (k === 'duel/mash') { v = R(36, 60); d = v + ' Hits'; t = g.startDelay + 8200; botTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce) { LIVE[q] = { r: [v] }; liveDirty = true; } }, t)); }
    else if (k === 'guess/count') { v = R(0, 3500); d = 'Bot-Schätzung'; t = g.startDelay + R(6000, 20000); }
    else if (g.key === 'guess') { v = R(800, 7000); d = `Ø ${Math.round(v / 100)} % daneben`; t = g.startDelay + R(30000, 70000); }
    else if (g.key === 'quiz') { const nq = g.questions.length, c = R(0, nq); v = c * 100000 - R(15000, 45000); d = `${c}/${nq} richtig`; t = g.startDelay + R(20000, 55000 + (nq - 3) * 12000); }
    else if (g.key === 'geo') { const km = { de: [60, 250], eu: [150, 900], world: [600, 4000] }[g.variant]; v = R(km[0] * 3, km[1] * 3); d = `Ø ${Math.round(v / 3)} km daneben`; t = g.startDelay + R(40000, 85000); }
    else if (g.key === 'seek') { v = R(12000, 52000); d = `Ø ${(v / 3000).toFixed(1).replace('.', ',')} s, ${R(1, 3)}/3 gefunden`; t = g.startDelay + R(45000, 70000); }
    else if (k === 'party/react') { v = R(260, 620); d = v + ' ms'; }
    else if (k === 'party/color') { v = R(3, 11); d = v + ' Punkte'; }
    else { v = R(5000, 12000); d = (v / 1000).toFixed(2) + ' s'; }
    botTimers.push(HC.after(() => { if (S.game && S.game.nonce === nonce && S.phase === 'play' && !S.ralf) hostHandle(q, { t: 'score', nonce, v, d }); }, t));
  });
}
function finishDuels() {
  const g = S.game, better = GAMES.duel.variants[g.variant].better;
  const fmt = v => v == null ? 'nicht fertig' : (g.variant === 'fighter' ? (v > 0 ? '+' : '') + v + ' HP' : g.variant === 'mash' ? v + ' Hits' : (v / 1000).toFixed(3) + ' s');
  const val = p => p === 'cpu' ? g.cpu.total : (S.subs[p] ? S.subs[p].v : null);
  const rows = [], duels = []; let chal = null;
  resetDrinks();
  g.duels.forEach(([a, b]) => {
    let va = val(a), vb = val(b); let w = null, tie = false;
    if (g.variant === 'fighter') { const isB = p => p === 'cpu' || (S.players[p] && S.players[p].bot); if (isB(a) && !isB(b)) va = vb == null ? null : -vb; else if (isB(b) && !isB(a)) vb = va == null ? null : -va; }
    if (va == null && vb == null) tie = true; else if (va == null) w = b; else if (vb == null) w = a;
    else if (va === vb) tie = true; else w = better === 'high' ? (va > vb ? a : b) : (va < vb ? a : b);
    const l = w === a ? b : (w === b ? a : null);
    const d = { a, b, da: fmt(va), db: fmt(vb), w, l, tie, tasks: {} };
    [a, b].forEach(p => {
      if (p === 'cpu') return; const pl = S.players[p]; if (!pl) return;
      const row = { pid: p, d: p === a ? d.da : d.db, pts: tie ? 1 : (p === w ? 3 : 0), sips: tie ? 1 : (p === l ? 2 : 0) };
      pl.score += row.pts;
      if (pl.challenger) { row.sips = 0; if (!tie) chal = chalScore(p === w); }
      else if (row.sips) { S.owed[p] = row.sips; if (pl.pass) { row.task = passTask(row.sips); d.tasks[p] = row.task; } }
      if (p === w && !tie) S.giveLeft[p] = 1;
      rows.push(row);
    });
    duels.push(d);
  });
  rows.sort((x, y) => y.pts - x.pts);
  S.results = { rows, duels, give: 1, duel: true, winner: null, answer: null, chal };
  S.phase = 'results'; S.readyNext = {}; commit(); botResults();
}
function checkAdvance(force = false) {
  if (S.phase !== 'results' || S.ralf) return;
  const need = Object.keys(S.players).filter(q => { const p = S.players[q]; return p.char != null && p.ready && p.online !== false && !p.bot; });
  if (force || need.every(q => S.readyNext[q] && canGo(q))) nextRound();
}
function nextRound() {
  if (S.round >= S.games) startBattle(); else planGame();
}
function startBattle() {
  const parts = participants().filter(q => S.players[q].online !== false && !S.players[q].challenger);
  if (parts.length < 2) { S.phase = 'final'; S.game = null; return commit(); }
  const pids = shuffle(parts).sort((a, b) => S.players[a].score - S.players[b].score).slice(0, 14); // everyone plays the finale
  S.phase = 'battle'; S.game = null; S.battle = { pids, nonce: ++S.nonce, startDelay: 9500, over: false, losers: [], order: [], exPids: [], exDone: {} };
  const nonce = S.battle.nonce;
  setTimeout(() => {
    if (S.phase !== 'battle' || S.battle.nonce !== nonce) return;
    BATTLE.hostStart(pids, pids.filter(q => S.players[q].bot), msg => { net.broadcast(msg); BATTLE.snap(msg); },
      res => {
        if (S.phase !== 'battle' || S.battle.nonce !== nonce) return;
        S.battle.pts = {}; (res.order || []).forEach((q, i) => { const pts = [8, 5, 3, 2, 1][i] || 0; S.battle.pts[q] = pts; if (S.players[q]) S.players[q].score += pts; }); // the finale moves the standings
        S.battle.over = true; S.battle.losers = res.losers; S.battle.order = res.order; S.battle.reason = res.reason; S.battle.exPids = res.losers;
        res.losers.forEach(q => { if (S.players[q]) S.players[q].ex = (S.players[q].ex || 0) + 1; });
        S.battle.exDone = Object.fromEntries(res.losers.filter(q => S.players[q] && S.players[q].bot).map(q => [q, true]));
        commit();
      },
      first => { if (S.phase !== 'battle' || S.battle.nonce !== nonce) return; S.battle.exPids = [first]; if (S.players[first] && S.players[first].bot) S.battle.exDone[first] = true; commit(); });
  }, S.battle.startDelay);
  commit();
}
function triggerRalf() {
  if (S.ralf || !['play', 'results'].includes(S.phase)) return;
  S.ralfCount++; S.ralf = { n: S.ralfCount, ok: {} };
  Object.keys(S.players).forEach(q => { if (S.players[q].bot) S.ralf.ok[q] = true; });
  HC.pause(); commit();
}
function ralfWho() { return Object.keys(S.players).filter(q => { const p = S.players[q]; return p.char != null && p.ready && p.online !== false && !p.bot; }); }
function checkRalfDone() { if (S.ralf && ralfWho().every(q => S.ralf.ok[q])) endRalf(); }
function endRalf() {
  if (!S.ralf) return; S.ralf = null; HC.resume();
  Object.values(S.players).forEach(p => { if (p.char != null && p.ready && !p.pass && !p.challenger) p.sips += 2; });
  commit(); checkAdvance();
}
setInterval(() => {
  if (!me.host || !S) return;
  updateStatus();
}, 1000);
setInterval(() => { if (me.host && liveDirty && net) { liveDirty = false; net.broadcast({ t: 'live', l: LIVE }); liveFns.forEach(f => f(LIVE)); } }, 150);

function act(m) { // local player's action
  if (me.host) hostHandle(me.pid, m); else if (net) net.send(Object.assign({ pid: me.pid }, m));
}

// ------------------------------------------------------------------ session start
function becomeHost(code, resume, solo = false) {
  me.host = true; me.code = code; me.solo = solo;
  S = resume || newState(code);
  S.host = me.pid;
  S.owed = S.owed || {}; S.paid = S.paid || {}; S.giveLeft = S.giveLeft || {}; S.gifts = S.gifts || [];
  S.chal = S.chal || { on: false, paypal: '', amount: 10, team: 0, ch: 0, paidOut: false };
  Object.values(S.players).forEach(p => p.online = !!p.bot);
  if (!S.players[me.pid]) S.players[me.pid] = { char: null, nick: '', pass: false, ready: false, score: 0, sips: 0 };
  S.players[me.pid].online = true;
  if (solo) {
    const free = shuffle(CHARS.map(c => c.id).filter(id => id !== CHAL_ID && !Object.values(S.players).some(p => p.char === id)));
    ['bot1', 'bot2'].forEach((b, i) => { if (!S.players[b]) S.players[b] = { char: free[i], nick: '', pass: false, ready: true, score: 0, sips: 0, online: true, bot: true }; });
  }
  if (S.phase === 'play' && !S.ralf) setTimeout(() => planGame(true), 300); // restart interrupted round
  if (solo) { net = { broadcast() { }, send() { } }; setTimeout(() => { setStatus(true); commit(); }, 50); try { history.replaceState(null, '', '?solo=1'); } catch { } render(); return; }
  net = hostNet(code, (key, m) => {
    if (!m) return;
    if (m.t === 'hello') { KEYS[key] = m.pid; hostHandle(m.pid, m); net.send(key, { t: 'state', s: S }); return; }
    const pid = KEYS[key]; if (pid) hostHandle(pid, m);
  }, key => { const pid = KEYS[key]; if (pid && S.players[pid]) { S.players[pid].online = false; delete KEYS[key]; if (S.phase === 'play' && needed().every(q => S.subs[q])) finishRound(); else commit(); } },
    () => { setStatus(true); commit(); }, err => { toast(err); });
  try { history.replaceState(null, '', `?room=${code}${LOCAL ? '&local=1' : ''}`); } catch { }
  render();
}
function joinRoom(code) {
  me.host = false; me.code = code; store.set('ggg-last-room', code);
  net = clientNet(code, m => {
    if (m.t === 'state') { const first = !S; S = m.s; if (first) updateStatus(); render(); }
    else if (m.t === 'live') { LIVE = m.l; liveFns.forEach(f => f(LIVE)); }
    else if (m.t === 'bs') BATTLE.snap(m);
    else if (m.t === 'tt') showTaunt(m.from, m.txt);
    else if (m.t === 'gm') gmFns.forEach(f => f(m));
  }, ok => { setStatus(ok); if (ok) net.send({ t: 'hello', pid: me.pid }); });
  try { history.replaceState(null, '', `?room=${code}${LOCAL ? '&local=1' : ''}`); } catch { }
  render();
}

// ------------------------------------------------------------------ status bar
function setStatus(ok) { online = ok; updateStatus(); }
function updateStatus() {
  const el = document.getElementById('status'); if (!me.code) { el.innerHTML = ''; return; }
  let t = '';
  if (S && S.sessionStart && ['play', 'results'].includes(S.phase)) t = `<span class="clock">SPIEL ${S.round}/${S.games}</span>`;
  if (S && S.phase === 'battle') t = '<span class="clock">FINALE</span>';
  el.innerHTML = `<span class="dot ${online ? 'on' : ''}"></span>${me.solo ? 'SOLO-TEST' : 'RAUM ' + me.code}${me.host && !me.solo ? ' · HOST' : ''} ${t}`;
}

// ------------------------------------------------------------------ rendering
function render() {
  renderRalf(); updateStatus();
  if (!me.code) return renderStart();
  if (!S) { cleanupMount(); app.innerHTML = '<div class="card center"><div class="spinner"></div><p>Verbinde mit Raum ' + me.code + ' ...</p><p class="small">Host-Handy muss die App offen und entsperrt haben. Die Verbindung läuft über das Internet, WLAN oder Mobilfunk ist egal.</p><p class="small" id="diag">' + esc(netDiag) + '</p><button class="pill" id="rejoin">NEU VERBINDEN</button></div>'; const rj = document.getElementById('rejoin'); if (rj) rj.onclick = () => location.reload(); return; }
  const mine = P(me.pid);
  const watchOnly = me.host && S.phase !== 'lobby' && (!mine || mine.char == null) && !pickMode; // host without a character stays game master
  if ((!mine || mine.char == null || S.phase === 'lobby') && !watchOnly) return renderLobby();
  if (S.phase === 'play') return renderPlay();
  if (S.phase === 'results') return renderResults();
  if (S.phase === 'battle') return renderBattle();
  if (S.phase === 'final') return renderFinal();
}
function cleanupMount() { if (mounted.cleanup) { try { mounted.cleanup(); } catch { } } mounted = { key: null, cleanup: null }; liveFns = []; gmFns = []; }
function view(key, build, update) {
  if (mounted.key !== key) { cleanupMount(); mounted.key = key; mounted.cleanup = build() || null; }
  if (update) update();
}

function renderStart() {
  cleanupMount(); mounted.key = 'start';
  const last = params.get('room') || store.get('ggg-last-room') || '';
  const hostRec = store.get('ggg-host');
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const mp = typeof Peer !== 'undefined';
  app.innerHTML = `
    <div class="start">
      <img src="icons/logo.png" class="logo" alt="GGG">
      <h1>GGG - APOKALYPSE</h1><div style="text-align:center;font:700 15px Titan,sans-serif;color:#ffd21a;margin:-6px 0 10px;text-shadow:0 2px 0 #16162a">VERSION v24</div>
      ${mp ? '<button class="big gas" id="bHost">NEUES SPIEL (HOST)</button>' : '<p class="hint">Vorschau-Version: nur Solo-Test. Multiplayer läuft in der hochgeladenen Version.</p>'}
      <button class="big sec" id="bSolo">SOLO-TEST MIT 2 BOTS</button>
      ${mp && hostRec && hostRec.code ? `<button class="big sec" id="bResume">HOST-SPIEL ${hostRec.code} FORTSETZEN</button>` : ''}
      ${mp ? `<div class="joinrow"><input id="code" maxlength="4" placeholder="CODE" value="${esc((last || 'ADEV').toUpperCase())}" autocapitalize="characters"><button class="big green" id="bJoin">BEITRETEN</button></div>` : ''}
      <p class="small">Ton an! Das Spiel ist laut.</p>
      ${standalone ? '' : `<p class="hint">${ios ? 'Installieren: Teilen-Symbol, dann "Zum Home-Bildschirm".' : 'Installieren: Browser-Menü, dann "App installieren" bzw. "Zum Startbildschirm".'}</p>`}
    </div>`;
  const unlock = () => { SFX.unlock(); keepAwake(); };
  if (mp) document.getElementById('bHost').onclick = () => { unlock(); becomeHost('ADEV'); adevLaugh(); };
  document.getElementById('bSolo').onclick = () => { unlock(); becomeHost('TEST', null, true); };
  const r = document.getElementById('bResume'); if (r) r.onclick = () => { unlock(); becomeHost(hostRec.code, hostRec.S); };
  if (mp) document.getElementById('bJoin').onclick = () => {
    const c = document.getElementById('code').value.trim().toUpperCase(); if (c.length !== 4) return toast('Bitte 4-stelligen Code eingeben');
    unlock(); if (c === 'ADEV') adevLaugh(); joinRoom(c);
  };
}

const MOVES = ['m-groove', 'm-groove2', 'm-groove3'];
function showFigure(c) {
  const m = document.createElement('div'); m.className = 'figmodal';
  const mv = MOVES[Math.floor(Math.random() * MOVES.length)];
  m.innerHTML = `<div class="figcard"><div class="figstage"><img src="${c.fig || c.img}" class="figimg ${mv} ${c.fig ? '' : 'round'}" draggable="false"></div>
    <div class="pname">${esc(c.name)}</div><div class="cry">"${esc(c.cry || '')}"</div><p class="small">Loslassen zum Schließen</p></div>`;
  document.body.appendChild(m); SFX.win(); if (navigator.vibrate) navigator.vibrate(30);
  requestAnimationFrame(() => m.classList.add('on'));
  return () => { m.classList.remove('on'); setTimeout(() => m.remove(), 180); };
}
function qrModal() {
  const url = `${location.origin}${location.pathname}?room=${me.code}${LOCAL ? '&local=1' : ''}`;
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card center"><h2>RAUM ${me.code}</h2><div class="qr">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}</div><p class="small">${esc(url)}</p><button class="big sec">SCHLIESSEN</button></div>`;
  m.querySelector('button').onclick = () => m.remove(); document.body.appendChild(m);
}

function renderLobby() {
  const mine = P(me.pid) || {}, late = S.phase !== 'lobby';
  view('lobby' + late + S.chal.on, () => {
    app.innerHTML = `
      <div class="roombar"><span>Raum <b>${me.code}</b></span>${me.solo ? '<span class="pill">SOLO-TEST</span>' : '<button class="pill" id="bQR">QR / EINLADEN</button>'}</div>
      ${late ? '<div class="banner">Spiel läuft. Wähle deinen Charakter, zahle die Einstiegsgebühr (10 Schlücke und 1 Bier auf Ex) und du bist ab dem nächsten Spiel dabei.</div>' : ''}
      <h2 class="section">WÄHLE DEINEN CHARAKTER</h2>
      <div class="grid" id="grid">${CHARS.filter(c => c.id !== CHAL_ID || S.chal.on).map(c => `<div class="slot" data-c="${c.id}"><img src="${c.img}" alt=""><span class="nm">${esc(c.name)}</span><span class="tk"></span></div>`).join('')}</div>
      <div class="panel" id="panel"></div>
      <div class="plist" id="plist"></div>
      <div id="hostbox"></div>`;
    const bq = document.getElementById('bQR'); if (bq) bq.onclick = qrModal;
    const grid = document.getElementById('grid'); let lpT = null, lp = false, closeFig = null, sxy = null;
    const endLP = () => { clearTimeout(lpT); lpT = null; if (closeFig) { closeFig(); closeFig = null; } };
    grid.addEventListener('pointerdown', e => {
      const sl = e.target.closest('.slot'); if (!sl) return; lp = false; sxy = [e.clientX, e.clientY];
      lpT = setTimeout(() => { lp = true; closeFig = showFigure(CHARS[+sl.dataset.c]); document.addEventListener('pointerup', endLP, { once: true }); document.addEventListener('pointercancel', endLP, { once: true }); }, 380);
    });
    grid.addEventListener('pointermove', e => { if (lpT && sxy && Math.hypot(e.clientX - sxy[0], e.clientY - sxy[1]) > 12) { clearTimeout(lpT); lpT = null; } });
    grid.addEventListener('pointerup', () => { if (!closeFig) { clearTimeout(lpT); lpT = null; } });
    grid.addEventListener('contextmenu', e => e.preventDefault());
    grid.onclick = e => {
      if (lp) { lp = false; return; }
      const sl = e.target.closest('.slot'); if (!sl || sl.classList.contains('taken')) return;
      SFX.blip(); act({ t: 'pick', char: +sl.dataset.c });
    };
  }, () => {
    const takenBy = {}; Object.entries(S.players).forEach(([q, o]) => { if (o.char != null) takenBy[o.char] = q; });
    document.querySelectorAll('#grid .slot').forEach(s => {
      const c = +s.dataset.c, q = takenBy[c];
      s.classList.toggle('mine', q === me.pid); s.classList.toggle('taken', !!q && q !== me.pid);
      s.querySelector('.tk').textContent = q && q !== me.pid ? (S.players[q].ready ? 'BEREIT' : 'GEWÄHLT') : (q === me.pid ? 'P1' : '');
    });
    const panel = document.getElementById('panel');
    if (mine.char == null) { panel.innerHTML = '<p class="small center">Tippe auf deinen Kopf.</p>'; panel.dataset.c = ''; }
    else {
      if (panel.dataset.c !== String(mine.char)) {
        panel.dataset.c = mine.char; const c = CHARS[mine.char];
        const chal = c.id === CHAL_ID;
        panel.innerHTML = `<img src="${c.img}" class="bigbadge"><div class="pinfo"><div class="pname">${esc(c.name)}</div>
          <div class="cry">"${esc(c.cry)}"</div>
          ${chal ? `<label>Dein Name <input id="nick" maxlength="18" placeholder="z. B. Onkel Jürgen"></label>
            <p class="small">Du spielst aus der Ferne gegen die GGG. Verlierst du die Wertung, spendest du ${esc(S.chal.amount)} € per PayPal.</p>`
          : '<div class="toggle"><button data-pass="0">VOLL</button><button data-pass="1">PASS (alkoholfrei)</button></div>'}
          ${late ? '<p class="small feenote"><b>Einstiegsgebühr:</b> 10 Schlücke und 1 Bier auf Ex (PASS: alkoholfreie Variante). Erst trinken, dann tippen.</p>' : ''}
          <button class="big green" id="bReady">BEREIT!</button></div>`;
        const nick = panel.querySelector('#nick'); if (nick) { nick.value = mine.nick || ''; nick.onchange = () => act({ t: 'nick', v: nick.value }); }
        panel.querySelectorAll('[data-pass]').forEach(b => b.onclick = () => { SFX.blip(); act({ t: 'pass', v: b.dataset.pass === '1' }); });
        panel.querySelector('#bReady').onclick = () => { SFX.go(); if (nick) act({ t: 'nick', v: nick.value }); const pp = P(me.pid); act({ t: 'ready', v: !pp.ready, fee: S.phase !== 'lobby' }); };
      }
      panel.querySelectorAll('[data-pass]').forEach(b => b.classList.toggle('on', (b.dataset.pass === '1') === !!mine.pass));
      const br = panel.querySelector('#bReady'); br.textContent = mine.ready ? (late ? 'DABEI!' : 'BEREIT ✓') : (late ? '10 SCHLÜCKE + EX GETRUNKEN: DABEI!' : 'BEREIT!'); br.classList.toggle('done', !!mine.ready);
    }
    document.getElementById('plist').innerHTML = Object.keys(S.players).filter(q => S.players[q].char != null).map(q =>
      `<span class="chip ${S.players[q].ready ? 'ok' : ''} ${S.players[q].online === false ? 'off' : ''}"><img src="${dimg(q)}">${esc(dname(q))}${S.players[q].bot ? ' (Bot)' : ''}${S.players[q].pass ? ' (P)' : ''}</span>`).join('');
    const myChal = mine.char === CHAL_ID;
    const hb = document.getElementById('hostbox');
    const hsig = [participants().length, S.games, S.chal.on, S.chal.paypal, S.chal.amount, me.host, late, mine.char == null, !!mine.ready].join('|');
    if (hb.dataset.sig === hsig) return; hb.dataset.sig = hsig;
    if (me.host && !late) {
      const n = participants().length;
      hb.innerHTML = `<div class="hostpanel"><div class="small">ANZAHL SPIELE: 3 oder 5 = Express (danach Ballon-Finale)</div><div class="toggle dur">${[3, 5, 10, 20, 30].map(d => `<button data-d="${d}" class="${S.games === d ? 'on' : ''}">${d} SPIELE</button>`).join('')}</div>
        <div class="small" style="margin-top:10px">HERAUSFORDERER-MODUS</div>
        <div class="toggle"><button data-ch="0" class="${S.chal.on ? '' : 'on'}">AUS</button><button data-ch="1" class="${S.chal.on ? 'on' : ''}">AN (externer Gast)</button></div>
        ${S.chal.on ? `<div class="chalcfg"><label>PayPal.me-Name <input id="ppName" maxlength="40" placeholder="z. B. ggg-kasse" value="${esc(S.chal.paypal)}"></label>
          <label>Einsatz in € <input id="ppAmt" inputmode="decimal" maxlength="6" value="${esc(S.chal.amount)}"></label>
          <p class="small">Der Gast öffnet denselben Link, tippt den Raumcode ein und wählt das Fragezeichen.</p></div>` : ''}
        <button class="big gas" id="bStart" ${n >= 2 ? '' : 'disabled'}>${n >= 2 ? `SPIEL STARTEN (${n} bereit)` : 'MIND. 2 SPIELER BEREIT'}</button>
        ${mine.char == null ? '<p class="small hostnote">Du hast noch keinen Charakter gewählt: Du bist dann nur Spielleiter und spielst nicht mit. Wähle oben einen Kopf, wenn du mitspielen willst.</p>' : (!mine.ready ? '<p class="small hostnote">Mit dem Start spielst du automatisch mit.</p>' : '')}</div>`;
      hb.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { S.games = +b.dataset.d; SFX.blip(); commit(); });
      hb.querySelector('#bStart').onclick = () => { if (n >= 2) startSession(); };
      hb.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => {
        SFX.blip(); S.chal.on = b.dataset.ch === '1';
        if (!S.chal.on) Object.values(S.players).forEach(p => { if (p.challenger) { p.char = null; p.challenger = false; p.ready = false; } });
        commit();
      });
      const pn = hb.querySelector('#ppName'); if (pn) pn.onchange = () => { S.chal.paypal = pn.value.trim().replace(/^https?:\/\/(www\.)?paypal\.me\//i, '').replace(/[^A-Za-z0-9._-]/g, ''); commit(); };
      const pa = hb.querySelector('#ppAmt'); if (pa) pa.onchange = () => { const v = parseFloat(pa.value.replace(',', '.')); S.chal.amount = isNaN(v) || v <= 0 ? 10 : Math.round(v * 100) / 100; commit(); };
    } else if (!late) hb.innerHTML = '<p class="small center">Warte, bis der Host startet ...</p>';
    else hb.innerHTML = '';
  });
}

function scoreboard() {
  const ids = Object.keys(S.players).filter(q => S.players[q].char != null).sort((x, y) => S.players[y].score - S.players[x].score);
  return `<div class="board">${ids.map((q, i) => `<div class="brow place${i + 1}"><span class="rk">${i + 1}</span><img src="${dimg(q)}"><span class="bn">${esc(dname(q))}</span><span class="bs">${S.players[q].score} P</span><span class="bd">${S.players[q].challenger ? 'Gast' : (S.players[q].pass ? 'Pass' : S.players[q].sips + ' Schl.')}</span></div>`).join('')}</div>`;
}

let playClock = null, pickMode = false;
const TAUNTS = ['Schneller, du Schnecke!', 'Ich werd hier alt!', 'Mein Bier wird warm!', 'Brauchst du einen Joker?', 'Tick, tack, Gossenkopp!', 'Heute noch?', 'Die Kegel schlafen schon ein!', 'Hopp, hopp, hopp!'];
function renderPlay() {
  const g = S.game;
  const key = 'play' + g.nonce;
  view(key, () => {
    const mod = GAMES[g.key], v = mod.variants[g.variant];
    const isPart = g.parts.includes(me.pid);
    const clk = playClock = makeClock(); if (S.ralf) clk.pause();
    app.innerHTML = `<div class="gamehead"><span class="glabel">RUNDE ${S.round} · ${esc(mod.label)}</span><h2>${esc(mod.title)}</h2><div class="vname">${esc(v.name)}</div></div><div class="stage" id="stage"></div><div id="waitbar" class="waitbar hidden"><div id="wbstatus"></div><div id="wbfun"></div></div>`;
    const stage = document.getElementById('stage');
    if (!isPart) {
      const mp = P(me.pid) || {};
      const why = me.host && mp.char == null ? ['SPIELLEITER-ANSICHT', 'Du spielst nicht mit, weil du keinen Charakter gewählt hast. Du siehst hier, wer fertig ist. Mitspielen kannst du ab dem nächsten Spiel, wenn du unten einen Charakter wählst.']
        : mp.char == null ? ['DU BIST NOCH NICHT DABEI', 'Wähle unten einen Charakter, dann spielst du ab dem nächsten Spiel mit.']
        : !mp.ready ? ['DU BIST NICHT BEREIT', 'Einstiegsgebühr: 10 Schlücke und 1 Bier auf Ex (PASS: alkoholfrei). Erst trinken, dann unten tippen, dann bist du ab dem nächsten Spiel dabei.']
        : ['DU STEIGST SPÄTER EIN', 'Dieses Spiel läuft schon ohne dich. Ab dem nächsten Spiel bist du dabei.'];
      stage.innerHTML = `<div class="specbox"><div class="gtitle">${why[0]}</div><p>${why[1]}</p><div id="specstat" class="plist"></div>
        ${mp.char != null && !mp.ready ? '<button class="big green" id="bJoinNow">GETRUNKEN: ICH SPIEL MIT</button>' : ''}${me.host && mp.char == null ? '<button class="big sec" id="bPickNow">CHARAKTER WÄHLEN UND MITSPIELEN</button>' : ''}</div>` + scoreboard();
      const jn = stage.querySelector('#bJoinNow'); if (jn) jn.onclick = () => { SFX.go(); act({ t: 'ready', v: true, fee: true }); };
      const pk = stage.querySelector('#bPickNow'); if (pk) pk.onclick = () => { pickMode = true; render(); };
      return () => clk.clear();
    }
    const startAt = clk.now() + g.startDelay;
    const pair = g.duels ? g.duels.find(d => d.includes(me.pid)) : null;
    const duelNote = pair ? `<div class="duelists"><img src="${dimg(pair[0])}"><b>VS</b><img src="${dimg(pair[1])}"></div><p class="vsnames">${esc(dname(pair[0]))} gegen ${esc(dname(pair[1]))}</p><p class="cry">"${esc(cryOf(pair[0]))}"<br>"${esc(cryOf(pair[1]))}"</p>` : '';
    stage.innerHTML = `<div class="intro"><div class="gpv">${gamePreview(g.key, g.variant)}</div>${duelNote}<p class="desc">${esc(v.desc)}</p><div class="lights"><i></i><i></i><i></i></div><div class="count" id="cnt"></div></div>`;
    let gameCleanup = null, last = null;
    const tick = clk.every(() => {
      const left = Math.ceil((startAt - clk.now()) / 1000);
      if (left !== last && left <= 3 && left > 0) { SFX.count(); }
      last = left; const c = document.getElementById('cnt'); if (c) c.textContent = left > 0 && left <= 3 ? left : '';
      document.querySelectorAll('.lights i').forEach((l, i) => l.classList.toggle('on', left <= 3 && i < 4 - left));
    }, 100);
    clk.after(() => {
      clk.cancel(tick); SFX.go(); stage.innerHTML = '';
      const los = document.createElement('div'); los.className = 'losflash'; los.textContent = 'LOS!'; document.body.appendChild(los); setTimeout(() => los.remove(), 900);
      const ctx = {
        variant: g.variant, seed: g.seed, rng: mulberry32(g.seed), dur: g.dur, startAt: clk.now(), me: me.pid,
        now: clk.now, after: clk.after, every: clk.every, cancel: clk.cancel,
        players: g.parts.filter(q => S.players[q]).concat(pair && pair.includes('cpu') ? ['cpu'] : []).map(q => ({ pid: q, name: dname(q), img: dimg(q) })),
        duelists: pair, isDuelist: !!pair, bots: g.parts.filter(q => S.players[q] && S.players[q].bot), cpu: g.cpu, questions: g.questions, places: g.places, sfx: SFX, cry: cryOf,
        submit: (val, d) => act({ t: 'score', nonce: g.nonce, v: val, d }),
        progress: p => { if (me.host) { LIVE[me.pid] = p; liveDirty = true; } else net.send({ t: 'prog', nonce: g.nonce, p }); },
        wrong: () => schlomoLaugh(),
        onLive: fn => liveFns.push(fn),
        send: m => act(Object.assign({ nonce: g.nonce }, m)), onGm: fn => gmFns.push(fn)
      };
      gameCleanup = mod.play(stage, ctx);
    }, g.startDelay);
    return () => { clk.clear(); if (gameCleanup) gameCleanup(); if (playClock === clk) playClock = null; };
  }, () => {
    // Rallumkalypse freezes the running game and resumes it afterwards
    if (playClock) { if (S.ralf) playClock.pause(); else playClock.resume(); }
    const ss = document.getElementById('specstat');
    if (ss) ss.innerHTML = g.parts.filter(q => S.players[q]).map(q => `<span class="chip ${S.subs[q] ? 'ok' : 'due'}"><img src="${dimg(q)}">${esc(dname(q))}${S.subs[q] ? ' ✓ fertig' : ' spielt ...'}</span>`).join('');
    const w = document.getElementById('waitbar'); if (!w) return;
    const list = g.parts.filter(q => S.players[q] && S.players[q].online !== false), done = list.filter(q => S.subs[q]);
    if (!S.subs[me.pid] || !g.parts.includes(me.pid)) { w.classList.add('hidden'); return; }
    const open = list.filter(q => !S.subs[q]);
    w.classList.remove('hidden');
    document.getElementById('wbstatus').innerHTML = `<div class="wbhead">${open.length ? `FERTIG! WARTE AUF ${open.length} VON ${list.length}` : 'ALLE FERTIG!'}</div>
      <div class="wbbar"><i style="width:${Math.round(done.length / Math.max(1, list.length) * 100)}%"></i></div>
      <div class="wblist">${open.map(q => `<span class="chip due"><img src="${dimg(q)}">${esc(dname(q))}</span>`).join('')}${done.map(q => `<span class="chip ok"><img src="${dimg(q)}">✓</span>`).join('')}</div>`;
    const fun = document.getElementById('wbfun');
    if (open.length && !fun.dataset.built) { fun.dataset.built = '1'; buildWaitFun(fun); }
    if (!open.length) fun.innerHTML = '';
  });
}
function buildWaitFun(el) {
  el.innerHTML = `<div class="funtabs"><div class="ftitle">ZEIT TOTSCHLAGEN</div>
    <div class="ftabs"><button class="ftab on" data-t="stk">BIERDECKEL-TURM</button><button class="ftab" data-t="tnt">SPRÜCHE AN DIE LAHMEN</button><button class="ftab" data-t="run">RALLUM-LAUF</button></div>
    <div class="fpane" id="pStk"></div><div class="fpane hidden" id="pTnt"><p class="small">Alle sehen deinen Spruch sofort auf ihrem Bildschirm.</p>
    <div class="taunts">${shuffle(TAUNTS).slice(0, 6).map(t => `<button class="taunt">${esc(t)}</button>`).join('')}</div></div></div>`;
  el.querySelectorAll('.ftab').forEach(b => b.onclick = () => { SFX.tap(); el.querySelectorAll('.ftab').forEach(x => x.classList.toggle('on', x === b)); el.querySelector('#pStk').classList.toggle('hidden', b.dataset.t !== 'stk'); el.querySelector('#pTnt').classList.toggle('hidden', b.dataset.t !== 'tnt'); });
  el.querySelector('.ftab[data-t="run"]').onclick = () => { SFX.tap(); WAITG.open('mario'); };
  let last = 0;
  el.querySelectorAll('.taunt').forEach(b => b.onclick = () => {
    const n = Date.now(); if (n - last < 2500) return toast('Langsam, Großmaul!'); last = n;
    SFX.blip(); act({ t: 'taunt', txt: b.textContent }); b.classList.add('sent'); toast('Gesendet an alle!', 1200); setTimeout(() => b.classList.remove('sent'), 600);
  });
  buildStack(el.querySelector('#pStk'));
}
// Stack game: a sliding beer coaster drops onto the tower, overhang is cut off
function buildStack(box) {
  const W = 300, LH = 16, BASE = 150;
  box.innerHTML = `<div class="stk"><div class="stkscore"><span id="stkS">0</span><small id="stkB"></small></div><div class="stkmsg" id="stkM">TIPPEN = FALLEN LASSEN</div><div class="stkview" id="stkV"></div></div>`;
  const view = box.querySelector('#stkV'), sc = box.querySelector('#stkS'), bestEl = box.querySelector('#stkB'), msg = box.querySelector('#stkM'), root = box.querySelector('.stk');
  let layers, cur, dir, h, run, raf, t0, combo, over;
  const best = () => store.get('ggg-tower', 0);
  const mkEl = (x, w, i, moving) => { const d = document.createElement('i'); d.style.cssText = `left:${x}px;width:${w}px;bottom:${i * LH}px;`; d.className = (moving ? 'mv ' : '') + (i % 2 ? 'c1' : 'c2'); view.appendChild(d); return d; };
  const scroll = () => { const off = Math.max(0, (layers.length - 8)) * LH; view.style.transform = `translateY(${off}px)`; };
  function start() {
    view.innerHTML = ''; layers = [{ x: (W - BASE) / 2, w: BASE }]; mkEl(layers[0].x, BASE, 0); combo = 0; over = false; h = 0; sc.textContent = '0'; bestEl.textContent = 'Rekord ' + best(); msg.textContent = 'TIPPEN = FALLEN LASSEN'; spawn(); scroll();
  }
  function spawn() { const top = layers[layers.length - 1]; cur = { w: top.w, x: 0, el: null }; dir = Math.random() < 0.5 ? 1 : -1; cur.x = dir > 0 ? 0 : W - cur.w; cur.el = mkEl(cur.x, cur.w, layers.length, true); t0 = performance.now(); cancelAnimationFrame(raf); loop(); }
  function loop() {
    let prev = performance.now();
    const f = () => {
      if (over) return; const n = performance.now(), dt = (n - prev) / 1000; prev = n;
      const sp = 150 + layers.length * 12; cur.x += dir * sp * dt;
      if (cur.x <= 0) { cur.x = 0; dir = 1; } else if (cur.x + cur.w >= W) { cur.x = W - cur.w; dir = -1; }
      cur.el.style.left = cur.x + 'px'; raf = requestAnimationFrame(f);
    }; raf = requestAnimationFrame(f);
  }
  function drop() {
    if (over) { start(); return; }
    cancelAnimationFrame(raf); const top = layers[layers.length - 1];
    const l = Math.max(cur.x, top.x), r = Math.min(cur.x + cur.w, top.x + top.w), ov = r - l;
    if (ov <= 1) { // miss: coaster falls
      over = true; cur.el.classList.add('fall'); SFX.bad(); const sco = layers.length - 1, rec = Math.max(best(), sco); store.set('ggg-tower', rec);
      msg.textContent = `DANEBEN! ${sco} Deckel · ${sco >= rec && sco > 0 ? 'NEUER REKORD! ' : ''}Tippen = nochmal`; bestEl.textContent = 'Rekord ' + rec; return;
    }
    let nx = l, nw = ov;
    if (Math.abs(cur.x - top.x) < 5) { nx = top.x; nw = top.w; combo++; SFX.pickup(); msg.textContent = combo > 1 ? `PERFEKT x${combo}!` : 'PERFEKT!'; if (combo >= 3) { nw = Math.min(BASE, nw + 6); nx = Math.max(0, Math.min(W - nw, nx - 3)); } }
    else { combo = 0; SFX.tap(); msg.textContent = 'TIPPEN = FALLEN LASSEN'; }
    cur.el.className = (layers.length % 2 ? 'c1' : 'c2'); cur.el.style.left = nx + 'px'; cur.el.style.width = nw + 'px';
    layers.push({ x: nx, w: nw }); const sco = layers.length - 1; sc.textContent = sco; scroll(); spawn();
  }
  root.addEventListener('pointerdown', e => { e.preventDefault(); drop(); });
  start();
}
function showTaunt(from, txt) {
  if (from === me.pid) return;
  const b = document.createElement('div'); b.className = 'tauntpop';
  b.innerHTML = `<img src="${dimg(from)}"><span><b>${esc(dname(from))}:</b> ${esc(txt)}</span>`;
  document.body.appendChild(b); SFX.blip(); if (navigator.vibrate) navigator.vibrate(80); setTimeout(() => b.remove(), 3600);
}

function renderResults() {
  const r = S.results, g = S.game, mod = GAMES[g.key];
  view('res' + g.nonce, () => {
    if (!renderResults._played || renderResults._played !== g.nonce) { renderResults._played = g.nonce; if (r.winner === me.pid) SFX.win(); else if (r.rows.some(x => x.pid === me.pid && x.sips)) SFX.bad(); }
    app.innerHTML = `<div class="gamehead"><span class="glabel">ERGEBNIS RUNDE ${S.round}</span><h2>${esc(mod.title)}</h2><div class="vname">${esc(mod.variants[g.variant].name)}</div></div>
      ${r.answer ? `<div class="answer">Richtig: <b>${esc(r.answer)}</b></div>` : ''}
      ${r.duel ? `<div class="duels">${r.duels.map(d => `<div class="dcard"><div class="dside ${d.w === d.a ? 'win' : ''}"><img src="${dimg(d.a)}"><b>${esc(dname(d.a))}</b><small>${esc(d.da)}</small></div><div class="dvs">VS</div><div class="dside ${d.w === d.b ? 'win' : ''}"><img src="${dimg(d.b)}"><b>${esc(dname(d.b))}</b><small>${esc(d.db)}</small></div>
        <div class="dout">${d.tie ? 'Unentschieden: beide trinken 1' : `<b>${esc(dname(d.w))}</b> gewinnt${d.w === 'cpu' ? '' : ' und verteilt 1'} · ${d.l === 'cpu' ? 'Rallum-Geist trinkt nicht, er funktioniert ja nicht' : `<b>${esc(dname(d.l))}</b> ${d.tasks[d.l] ? 'PASS: ' + esc(d.tasks[d.l]) : 'trinkt 2'}`}`}</div></div>`).join('')}</div>` : ''}
      ${r.tie ? `<div class="winner"><div><b>UNENTSCHIEDEN!</b><br>${g.key === 'duel' ? 'Beide trinken 1 Schluck.' : 'Alle gleichauf, alle trinken 1 Schluck.'}</div></div>` : ''}
      ${r.winner ? `<div class="winner"><img src="${dimg(r.winner)}"><div><b>${esc(dname(r.winner))}</b> gewinnt<br>und verteilt <b>${r.give} Schl${r.give === 1 ? 'uck' : 'ücke'}</b>!</div></div>` : ''}
      ${r.duel ? '' : `<div class="res">${r.rows.map((x, i) => `<div class="rrow place${i + 1} ${x.pid === me.pid ? 'me' : ''}" style="animation-delay:${i * 0.08}s"><span class="rk">${i + 1}</span><img src="${dimg(x.pid)}"><span class="bn">${esc(dname(x.pid))}<small>${esc(x.d || '')}</small></span>
        <span class="sip">${x.chalNote ? 'Gast trinkt nicht' : (x.sips ? (x.task ? 'PASS: ' + esc(x.task) : x.sips + (x.sips === 1 ? ' SCHLUCK' : ' SCHLÜCKE')) : '')}</span><span class="pt">+${x.pts}</span></div>`).join('')}</div>`}
      ${r.chal ? `<div class="chalbar ${r.chal}"><span>${r.chal === 'ch' ? 'Punkt für den Herausforderer!' : 'Punkt für die GGG!'}</span><b>GAST ${S.chal.ch} : ${S.chal.team} GGG</b></div>` : ''}
      ${r.answers ? `<details class="answers"><summary>Richtige Antworten anzeigen</summary>${r.answers.map(([q, a]) => `<div><small>${esc(q)}</small><b>${esc(a)}</b></div>`).join('')}</details>` : ''}
      <div id="readybox"></div>
      <h3 class="section">GESAMTWERTUNG</h3>${scoreboard()}`;
  }, () => {
    const box = document.getElementById('readybox'); if (!box) return;
    const last = S.round >= S.games;
    const need = Object.keys(S.players).filter(q => { const p = S.players[q]; return p.char != null && p.ready && p.online !== false; });
    const mp = P(me.pid) || {}, iam = need.includes(me.pid), due = dueOf(me.pid), gl = S.giveLeft[me.pid] || 0, mineReady = !!S.readyNext[me.pid];
    const gotFrom = S.gifts.filter(([, to]) => to === me.pid).map(([f]) => dname(f));
    // my action area: only rebuilt when my own situation changes (so a running hold is not interrupted)
    const sig = [iam, due, gl, mineReady, gotFrom.length, mp.pass, last].join('|');
    let mine = box.querySelector('#myact');
    if (!mine) { box.innerHTML = '<div id="myact"></div><div id="dstatus" class="plist"></div><div id="hostact"></div>'; mine = box.querySelector('#myact'); }
    if (mine.dataset.sig !== sig) {
      mine.dataset.sig = sig; let h = '';
      if (gotFrom.length) h += `<div class="giftnote">Du hast ${gotFrom.length} Schl${gotFrom.length === 1 ? 'uck' : 'ücke'} bekommen von ${esc([...new Set(gotFrom)].join(', '))}!</div>`;
      if (iam && gl > 0) {
        const targets = need.filter(q => q !== me.pid && !S.players[q].challenger);
        h += `<div class="givebox"><div class="gtitle">VERTEILE NOCH ${gl} SCHL${gl === 1 ? 'UCK' : 'ÜCKE'}</div><p class="small">Antippen = 1 Schluck für diese Person.</p>
          <div class="gtargets">${targets.map(q => `<button class="gt" data-to="${q}"><img src="${dimg(q)}"><span>${esc(dname(q))}</span></button>`).join('')}</div>
          <button class="linkbtn" id="bSkip">Rest verfallen lassen</button></div>`;
      }
      if (iam && due > 0) {
        h += mp.pass
          ? `<div class="drinkbox"><div class="gtitle">PASS-AUFGABE FÜR ${due} SCHL${due === 1 ? 'UCK' : 'ÜCKE'}</div><p>${esc(((S.results.rows.find(x => x.pid === me.pid) || {}).task) || passTask(due))}</p><button class="big green" id="bTask">AUFGABE ERLEDIGT</button></div>`
          : `<div class="drinkbox"><div class="gtitle">DU TRINKST ${due} SCHL${due === 1 ? 'UCK' : 'ÜCKE'}</div>
             <div class="glass"><div class="beer" id="beer"><i></i><i></i><i></i></div><div class="foam"></div></div>
             <button class="big gas holdbtn" id="bHold">HALTEN ZUM TRINKEN</button><p class="small">Gedrückt halten, bis das Glas leer ist. Schluck-Beweis!</p></div>`;
      }
      if (iam) {
        const block = due > 0 ? 'ERST TRINKEN!' : (gl > 0 ? 'ERST VERTEILEN!' : null);
        h += `<button class="big ${mineReady ? 'done' : 'green'}" id="bGo" ${block ? 'disabled' : ''}>${block || (mineReady ? 'BEREIT ✓ WARTE AUF ANDERE' : (last ? 'BEREIT FÜRS FINALE' : 'BEREIT FÜR DIE NÄCHSTE RUNDE'))}</button>`;
      }
      mine.innerHTML = h;
      mine.querySelectorAll('.gt').forEach(b => b.onclick = () => { SFX.tap(); act({ t: 'give', to: b.dataset.to }); });
      const sk = mine.querySelector('#bSkip'); if (sk) sk.onclick = () => act({ t: 'giveskip' });
      const tk = mine.querySelector('#bTask'); if (tk) tk.onclick = () => { SFX.win(); act({ t: 'drank' }); toast('Brav! Aufgabe abgehakt.'); };
      const hold = mine.querySelector('#bHold');
      if (hold) {
        const beer = mine.querySelector('#beer'); let t0 = 0, raf = 0, done = false, gulp = 0; const HOLD = 1400 + due * 450;
        const loop = () => {
          const f = Math.min(1, (performance.now() - t0) / HOLD); beer.style.height = (100 - f * 100) + '%';
          if (performance.now() - gulp > 380) { gulp = performance.now(); SFX.tap(); }
          if (f >= 1 && !done) { done = true; clearInterval(raf); SFX.win(); if (navigator.vibrate) navigator.vibrate(120); act({ t: 'drank' }); toast(PROST[Math.floor(Math.random() * PROST.length)]); }
        };
        const down = e => { e.preventDefault(); if (done) return; clearInterval(raf); t0 = performance.now(); hold.textContent = 'GLUCK GLUCK GLUCK ...'; raf = setInterval(loop, 40); };
        const up = () => { if (done) return; clearInterval(raf); beer.style.height = '100%'; hold.textContent = 'NICHT ABSETZEN! NOCHMAL'; };
        hold.addEventListener('pointerdown', down); hold.addEventListener('pointerup', up); hold.addEventListener('pointerleave', up); hold.addEventListener('pointercancel', up);
      }
      const b = mine.querySelector('#bGo'); if (b) b.onclick = () => { if (!mineReady && canGo(me.pid)) { SFX.go(); act({ t: 'go' }); } };
    }
    box.querySelector('#dstatus').innerHTML = need.map(q => {
      const d = dueOf(q), g = S.giveLeft[q] || 0, ok = S.readyNext[q] && !d && !g;
      const st = d ? `trinkt ${d}` : (g ? `verteilt ${g}` : (S.readyNext[q] ? '✓' : '...'));
      return `<span class="chip ${ok ? 'ok' : (d ? 'due' : '')}"><img src="${dimg(q)}">${esc(dname(q))} · ${st}</span>`;
    }).join('');
    const ha = box.querySelector('#hostact');
    if (me.host && !ha.innerHTML) { ha.innerHTML = '<button class="big sec" id="bForce">OHNE DIE ANDEREN WEITER</button>'; ha.querySelector('#bForce').onclick = () => { SFX.blip(); checkAdvance(true); }; }
  });
}

function renderBattle() {
  const B = S.battle;
  view('battle' + B.nonce, () => {
    const isP = B.pids.includes(me.pid);
    app.innerHTML = `<div class="gamehead"><span class="glabel">FINALE · ALLE ${B.pids.length} SPIELEN MIT</span><h2>BALLON-SCHLACHT</h2><div class="vname">3 Ballons · Power-Ups · wer zuerst raus ist, muss EXEN!</div></div>
      <div class="stage" id="bstage"><div class="intro"><div class="gpv">${gamePreview('battle')}</div><div class="bplayers">${B.pids.map((q, i) => `<span class="chip" style="border-color:${BATTLE.COLORS[i % BATTLE.COLORS.length]}"><img src="${dimg(q)}">${esc(dname(q))}</span>`).join('')}</div>
        <p class="desc">Alle gegen alle, jeder hat 3 Ballons. Links lenken, KEGELN wirft, DASH weicht aus. Sammle Power-Ups: Stern (rammt Gegner um), Banane (andere rutschen aus), Bier-Bombe (sprengt im Umkreis), Schild, Turbo, Dreifach. Wer als Erster alle Ballons verliert, muss EXEN. Die Bahn ist doppelt so groß: du siehst nur deinen Ausschnitt, die Minimap zeigt alle. Gelbe Felder boosten, rote Kreise sind Meteore, und RALLUM jagt im Panzer alle. Nach 60 Sekunden schrumpft die Bahn.</p><div class="lights"><i></i><i></i><i></i></div><div class="count" id="cnt"></div></div></div><div id="cheer"></div><div id="bover" class="bover"></div>`;
    let fav = null;
    const stage = document.getElementById('bstage'), startAt = performance.now() + B.startDelay; let last = null, cleanup = null;
    const tick = setInterval(() => {
      const left = Math.ceil((startAt - performance.now()) / 1000);
      if (left !== last && left <= 3 && left > 0) SFX.count(); last = left;
      const c = document.getElementById('cnt'); if (c) c.textContent = left > 0 && left <= 3 ? left : '';
      document.querySelectorAll('#bstage .lights i').forEach((l, i) => l.classList.toggle('on', left <= 3 && i < 4 - left));
      if (left <= 0) {
        clearInterval(tick); SFX.go(); stage.innerHTML = '';
        cleanup = BATTLE.mount(stage, { pids: B.pids, me: me.pid, isPlayer: isP, img: dimg, name: dname, sfx: SFX, onFav: p => { fav = p; window.__fav = p; }, send: m => { if (me.host) hostHandle(me.pid, m); else net.send(Object.assign({ pid: me.pid }, m)); } });
      }
    }, 100);
    return () => { clearInterval(tick); if (cleanup) cleanup(); };
  }, () => {
    const o = document.getElementById('bover'); if (!o) return;
    const ex = B.exPids || [], iamEx = ex.includes(me.pid), done = B.exDone || {};
    const cheer = document.getElementById('cheer'), watching = !B.pids.includes(me.pid) || iamEx;
    if (cheer && watching && !cheer.dataset.built) {
      cheer.dataset.built = '1'; let lastC = 0;
      cheer.innerHTML = `<div class="cheerbar">${['Buh!', 'EX! EX! EX!', 'Weiter so!', 'Kegel ihn!', 'Prost!'].map(t => `<button class="cheerbtn">${esc(t)}</button>`).join('')}</div>`;
      cheer.querySelectorAll('.cheerbtn').forEach(bt => bt.onclick = () => { const n = Date.now(); if (n - lastC < 1500) return toast('Nicht so schnell!', 900); lastC = n; SFX.blip(); act({ t: 'taunt', txt: bt.textContent }); toast('Gesendet!', 700); });
    }
    if (cheer && !watching) cheer.innerHTML = '';
    const sig = [B.over, Object.keys(B.pts || {}).length, ex.join(','), Object.keys(done).join(','), me.host, iamEx].join('|');
    if (o.dataset.sig === sig) return; o.dataset.sig = sig;
    if (!B.over && !iamEx) { o.innerHTML = ''; return; }
    const allDone = ex.every(q => done[q]);
    let h = '';
    if (iamEx) h += `<div class="exbanner">${B.over ? 'DU MUSST EXEN!' : 'DU BIST RAUS: EXEN!'}<button class="big ${done[me.pid] ? 'done' : 'green'}" id="bEx" ${done[me.pid] ? 'disabled' : ''}>${done[me.pid] ? 'EX GETRUNKEN ✓' : 'ICH HABE GEEXT'}</button></div>`;
    if (B.over) {
      const names = (B.losers || []).map(q => esc(dname(q))).join(', ');
      if (!B.pids.includes(me.pid) && window.__fav) { const win = (B.order || [])[0]; h += `<div class="winner"><div>Dein Tipp: <b>${esc(dname(window.__fav))}</b><br>${window.__fav === win ? 'RICHTIG! Du darfst 1 Schluck verteilen.' : `Leider falsch. Gewonnen hat <b>${esc(dname(win))}</b>.`}</div></div>`; }
      if (!iamEx) h += `<div class="exbanner big-ex">${B.losers.length === B.pids.length ? 'ZEIT UM! ALLE EXEN!' : `<b>${names}</b> MUSS EXEN!`}</div>`;
      h += `<div class="rank">${(B.order || []).map((q, i) => `<span class="chip ${i === 0 ? 'ok' : ''}"><b>${i + 1}.</b><img src="${dimg(q)}">${esc(dname(q))} <i>+${(B.pts || {})[q] || 0} P</i></span>`).join('')}</div>`;
      h += me.host ? `<button class="big gas" id="bFinal" ${allDone ? '' : 'disabled'}>${allDone ? 'ZUR SIEGEREHRUNG' : 'WARTE AUF DEN EX ...'}</button>${allDone ? '' : '<button class="linkbtn" id="bFinalForce">Host: ohne Ex weiter</button>'}` : '<p class="small center">Der Host startet die Siegerehrung, sobald gegext wurde.</p>';
    }
    o.innerHTML = h;
    const be = o.querySelector('#bEx'); if (be) be.onclick = () => { SFX.win(); if (me.host) hostHandle(me.pid, { t: 'exdone' }); else net.send({ pid: me.pid, t: 'exdone' }); };
    const goFinal = () => { BATTLE.hostStop(); S.phase = 'final'; commit(); };
    const bf = o.querySelector('#bFinal'); if (bf) bf.onclick = goFinal; const bff = o.querySelector('#bFinalForce'); if (bff) bff.onclick = goFinal;
    if (B.over && !o.dataset.laughed) { o.dataset.laughed = '1'; SFX.laugh(1); }
  });
}

function sipCounter() {
  const ids = Object.keys(S.players).filter(q => S.players[q].char != null && !S.players[q].challenger).sort((a, b) => (S.players[b].sips + 10 * (S.players[b].ex || 0)) - (S.players[a].sips + 10 * (S.players[a].ex || 0)));
  const tot = ids.reduce((x, q) => x + S.players[q].sips, 0), ex = ids.reduce((x, q) => x + (S.players[q].ex || 0), 0);
  const liters = (tot * 0.03 + ex * 0.33).toFixed(1).replace('.', ',');
  const max = Math.max(1, ...ids.map(q => S.players[q].sips));
  return `<h3 class="section">SCHLUCKZÄHLER</h3><div class="sipcount">
    <div class="sctot"><b>${tot}</b> Schlücke${ex ? ` + <b>${ex}</b> Ex` : ''}<small>ca. ${liters} Liter (geschätzt: 1 Schluck ≈ 30 ml, 1 Ex ≈ 0,33 l)</small></div>
    ${ids.map(q => { const p = S.players[q]; return `<div class="scrow"><img src="${dimg(q)}"><span class="bn">${esc(dname(q))}${p.ex ? ` <em>+${p.ex} EX</em>` : ''}${p.pass ? ` <em>PASS · ${p.tasks || 0} Aufgaben</em>` : ''}</span>
      <span class="scbar"><i style="width:${Math.round(p.sips / max * 100)}%"></i></span><span class="bs">${p.sips}</span></div>`; }).join('')}</div>`;
}
function chalFinal() {
  if (!S.chal.on) return '';
  const c = Object.keys(S.players).find(q => S.players[q].challenger); if (!c) return '';
  const lost = S.chal.team >= S.chal.ch, amt = String(S.chal.amount).replace('.', ',');
  const url = S.chal.paypal ? `https://www.paypal.me/${encodeURIComponent(S.chal.paypal)}/${S.chal.amount}EUR` : null;
  return `<div class="chalfinal ${lost ? 'lost' : 'won'}"><img src="${dimg(c)}"><div><div class="gtitle">GAST ${S.chal.ch} : ${S.chal.team} GGG</div>
    ${lost ? `<b>${esc(dname(c))}</b> hat verloren und spendet <b>${amt} €</b>!
      ${url ? `<a class="big green paylink" href="${url}" target="_blank" rel="noopener">JETZT ${amt} € PER PAYPAL SPENDEN</a><small>${esc(url)}</small>` : '<small>Der Host hat keinen PayPal.me-Namen hinterlegt.</small>'}
      ${S.chal.paidOut ? '<div class="paidok">SPENDE EINGEGANGEN ✓</div>' : (me.host ? '<button class="big sec" id="bPaid">SPENDE IST EINGEGANGEN</button>' : '')}`
    : `<b>${esc(dname(c))}</b> hat die GGG geschlagen! Strafe: Alle GGG trinken 2 Schlücke.`}</div></div>`;
}
function renderFinal() {
  view('final' + S.sessionStart + S.chal.paidOut, () => {
    const ids = Object.keys(S.players).filter(q => S.players[q].char != null).sort((x, y) => S.players[y].score - S.players[x].score);
    const thirsty = ids.filter(q => !S.players[q].pass).sort((x, y) => S.players[y].sips - S.players[x].sips)[0];
    const pod = [ids[1], ids[0], ids[2]];
    SFX.win();
    app.innerHTML = `<h2 class="section">SIEGEREHRUNG</h2>
      <div class="podium">${pod.map((q, i) => q ? `<div class="pod p${[2, 1, 3][i]}"><img src="${dimg(q)}"><b>${esc(dname(q))}</b><div class="step">${[2, 1, 3][i]}</div><small>${S.players[q].score} P</small></div>` : '<div class="pod"></div>').join('')}</div>
      ${S.battle && S.battle.pts ? `<div class="fpts"><b>FINALE-PUNKTE</b>${Object.entries(S.battle.pts).filter(([, p]) => p > 0).map(([q, p]) => `<span><img src="${dimg(q)}">${esc(dname(q))} <i>+${p}</i></span>`).join('')}</div>` : ''}
      ${S.battle && S.battle.over ? `<div class="exbanner">EX-STRAFE: <b>${(S.battle.losers || []).map(q => esc(dname(q))).join(', ')}</b></div>` : ''}
      ${thirsty && S.players[thirsty].sips ? `<div class="winner"><img src="${dimg(thirsty)}"><div>DURST-KÖNIG: <b>${esc(dname(thirsty))}</b><br>${S.players[thirsty].sips} Schlücke</div></div>` : ''}
      ${S.ralfCount ? `<p class="center small">Rallumkalypsen überlebt: ${S.ralfCount}</p>` : ''}
      ${chalFinal()}
      ${sipCounter()}
      <h3 class="section">GESAMTWERTUNG</h3>
      ${scoreboard()}
      ${me.host ? '<button class="big gas" id="bAgain">NOCHMAL (ZUR LOBBY)</button>' : ''}`;
    const bp = document.getElementById('bPaid'); if (bp) bp.onclick = () => { S.chal.paidOut = true; commit(); };
    const b = document.getElementById('bAgain'); if (b) b.onclick = () => { S.phase = 'lobby'; S.sessionStart = null; S.game = null; S.results = null; S.battle = null; Object.values(S.players).forEach(p => p.ready = !!p.bot); commit(); };
  });
}

// Wer Schlomo spielt und falsch antwortet, wird von allen anderen ausgelacht
let laughAt = 0;
function adevLaugh() {
  const el = document.createElement('div'); el.id = 'laughov'; el.innerHTML = '<div class="lt">MUHAHAHAHA!</div>';
  document.body.appendChild(el); SFX.laugh(3); setTimeout(() => SFX.laugh(2), 2600); if (navigator.vibrate) navigator.vibrate([200, 80, 200, 80, 400]); setTimeout(() => el.remove(), 4200);
}
function schlomoLaugh() {
  const c = charOf(me.pid); if (!c || !/schlomo/i.test(c.name) || Date.now() - laughAt < 6000 || !S) return; laughAt = Date.now();
  const others = participants().filter(q => q !== me.pid).slice(0, 12), el = document.createElement('div'); el.id = 'laughov';
  el.innerHTML = `<div class="lt">HAHAHA, DU TROTTEL!</div><div class="lfaces">${others.map((q, i) => `<div class="lf" style="animation-delay:${(i % 5) * 0.08}s"><img src="${dimg(q)}"><b>HAHA</b></div>`).join('')}</div>`;
  document.body.appendChild(el); SFX.laugh(1); if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 240]); setTimeout(() => el.remove(), 2800);
}
// ------------------------------------------------------------------ RALLUMKALYPSE
let ralfShown = null;
function renderRalf() {
  const el = document.getElementById('ralf');
  const on = S && S.ralf;
  if (!on) { if (ralfShown) { el.classList.add('hidden'); el.innerHTML = ''; SFX.sirenStop(); ralfShown = null; } return; }
  const who = ralfWho(), ok = S.ralf.ok || {}, mine = !!ok[me.pid], iam = who.includes(me.pid);
  if (ralfShown !== S.ralf.n) {
    ralfShown = S.ralf.n;
    el.innerHTML = `<div class="alarm"></div><div class="rcontent"><div class="rtitle">RALLUMKALYPSE!</div><img src="${RALF_FIG}" class="rface rfig">
      <div class="rtext">Du funktionierst hier nicht!<br>Trink, Pause!<br><small>Alle trinken 2 Schlücke</small></div>
      <div id="rbrave"></div></div>`;
    el.classList.remove('hidden');
    SFX.sirenStart(); SFX.laugh(2);
    if (navigator.vibrate) navigator.vibrate([400, 120, 400, 120, 800]);
  }
  const box = el.querySelector('#rbrave'), sig = [mine, iam, who.map(q => ok[q] ? 1 : 0).join(''), me.host].join('|');
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  const left = who.filter(q => !ok[q]).length;
  box.innerHTML = `${iam ? `<button class="big ${mine ? 'done' : 'green'} bravebtn" id="bBrave" ${mine ? 'disabled' : ''}>${mine ? 'BRAV, MEIN GEBIETER ✓' : 'Ich bin ein Braveheart, mein Gebieter'}</button>` : ''}
    <div class="small rwait">${left ? `Warte auf ${left} von ${who.length} Braveheart${left === 1 ? '' : 's'}` : 'ALLE BRAV!'}</div>
    <div class="plist rlist">${who.map(q => `<span class="chip ${ok[q] ? 'ok' : 'due'}"><img src="${dimg(q)}">${esc(dname(q))}${ok[q] ? ' ✓' : ''}</span>`).join('')}</div>
    ${me.host && left ? '<button class="linkbtn rforce" id="bRForce">Host: ohne die Lahmen weiter</button>' : ''}`;
  const b = box.querySelector('#bBrave'); if (b) b.onclick = () => { SFX.blip(); if (navigator.vibrate) navigator.vibrate(60); act({ t: 'brave' }); };
  const f = box.querySelector('#bRForce'); if (f) f.onclick = () => endRalf();
}
// Host easter egg: triple-tap the title triggers Ralf manually
(() => { let taps = []; document.getElementById('title').addEventListener('click', () => { const t = Date.now(); taps = taps.filter(x => t - x < 800); taps.push(t); if (taps.length >= 3 && me.host && S) { taps = []; triggerRalf(); } }); })();

// ------------------------------------------------------------------ sound toggle
(() => {
  const top = document.getElementById('top'); const b = document.createElement('button'); b.id = 'snd'; b.setAttribute('aria-label', 'Ton an/aus');
  const icon = m => `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="#fff" stroke="#16162a" stroke-width="1.5"/>${m ? '<path d="M16 9l5 6M21 9l-5 6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' : '<path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'}</svg>`;
  const set = m => { SFX.setMuted(m); b.innerHTML = icon(m); b.classList.toggle('muted', m); store.set('ggg-mute', m); };
  set(!!store.get('ggg-mute', false));
  b.onclick = () => { SFX.unlock(); const m = !SFX.muted(); set(m); if (!m) { SFX.win(); if (/iphone|ipad|ipod/i.test(navigator.userAgent)) toast('Kein Ton? Stummschalter am iPhone ausschalten und laut machen.', 3500); } };
  top.appendChild(b);
})();
// ------------------------------------------------------------------ intro video
let introDone = false;
function showIntro() {
  if (introDone) return; introDone = true;                      // never twice per page load
  if (navigator.webdriver || params.has('nointro') || (LOCAL && !params.has('introtest'))) return;
  if (window.name === 'ggg-intro-seen') return;                  // reload inside the same tab/frame: no intro again
  window.name = 'ggg-intro-seen';
  // only on a real app start: a reload/resume within 10 minutes of the last activity (screen lock, tab restore, rejoin) skips it
  if (BOOT_LASTSEEN && Date.now() - BOOT_LASTSEEN < 10 * 60 * 1000) return;
  const el = document.createElement('div'); el.id = 'intro';
  el.innerHTML = `<video playsinline webkit-playsinline preload="auto" poster="media/intro-poster.jpg"><source src="media/intro.mp4" type="video/mp4"></video>
    <button id="introSkip">ÜBERSPRINGEN ▸</button><button id="introSnd" class="hidden"></button><div id="introTap" class="hidden">TIPPEN ZUM STARTEN</div>`;
  document.body.appendChild(el);
  const v = el.querySelector('video'), snd = el.querySelector('#introSnd'), tap = el.querySelector('#introTap'); let ended = false;
  const done = () => { if (ended) return; ended = true; try { sessionStorage.setItem('ggg-intro', '1'); } catch { } el.classList.add('out'); try { v.pause(); } catch { } setTimeout(() => el.remove(), 450); };
  const label = () => { snd.textContent = v.muted ? 'TON AN' : 'TON AUS'; snd.classList.remove('hidden'); };
  v.addEventListener('ended', done); v.addEventListener('error', done);
  el.querySelector('#introSkip').onclick = done;
  snd.onclick = () => { SFX.unlock(); v.muted = !v.muted; if (!v.muted) { SFX.setMuted(false); } label(); if (v.paused) v.play().catch(() => { }); };
  const wantSound = !store.get('ggg-mute', false);
  v.muted = false;
  v.play().then(() => { label(); if (!wantSound) { v.muted = true; label(); } }).catch(() => {
    v.muted = true;
    v.play().then(label).catch(() => { tap.classList.remove('hidden'); el.onclick = e => { if (e.target.id === 'introSkip') return; tap.classList.add('hidden'); v.muted = false; v.play().then(label).catch(done); el.onclick = null; }; });
  });
  setTimeout(() => { if (!ended && v.readyState < 2 && v.paused && tap.classList.contains('hidden')) done(); }, 9000);
}
// remember activity so a reload during play is not mistaken for an app start
const BOOT_LASTSEEN = +store.get('ggg-lastseen', 0);
(() => { const touch = () => store.set('ggg-lastseen', Date.now()); touch(); setInterval(touch, 5000); document.addEventListener('visibilitychange', touch); window.addEventListener('pagehide', touch); })();
// ------------------------------------------------------------------ boot
{ const wb = document.createElement('button'); wb.id = 'wgOpen'; wb.textContent = 'WARTESPIELE'; wb.onclick = () => WAITG.open(); document.body.appendChild(wb);
  setInterval(() => { const ph = typeof S !== 'undefined' && S ? S.phase : 'home'; wb.style.display = ['lobby', 'results', 'final', 'home', undefined].includes(ph) || (ph === 'battle' && S.battle && S.battle.over) ? 'block' : 'none'; }, 800); }
if ('serviceWorker' in navigator && !LOCAL && location.protocol === 'https:') { const VER = 'v24'; window.GGG_VER = VER; { const v = document.createElement('div'); v.textContent = VER; v.style.cssText = 'position:fixed;right:6px;bottom:3px;font:10px sans-serif;color:rgba(255,255,255,.55);z-index:5;pointer-events:none'; document.body.appendChild(v); } navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { reg.update(); setInterval(() => reg.update().catch(() => { }), 60000); }).catch(() => { });
  let had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had) { had = true; return; } const idle = typeof S === 'undefined' || !S || !S.phase || S.phase === 'lobby' || !S.game; if (idle) location.reload(); else window.__pendingReload = true; }); }
render();
showIntro();
