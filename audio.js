// Synthesized retro sounds (Web Audio, no samples)
const SFX = (() => {
  let ctx = null, master = null, sirenNodes = null, muted = false;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 6;
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function unlock() {
    const c = ensure(); if (!c) return;
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
    s.buffer = b; s.connect(master); s.start(0);
  }
  function tone(freq, dur = 0.08, type = 'square', vol = 0.18, when = 0, slideTo = null) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  const blip = () => tone(880, 0.06);
  const tap = () => tone(520 + Math.random() * 120, 0.04, 'square', 0.1);
  const bad = () => tone(180, 0.25, 'sawtooth', 0.2, 0, 90);
  const go = () => { tone(660, 0.12); tone(990, 0.2, 'square', 0.2, 0.12); };
  const count = () => tone(440, 0.1);
  const win = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.18, i * 0.12));

  // Villain laugh "Muhahahaha": deep voiced saw through formants, slow, falling, with cave echo
  function laugh(times = 2) {
    const c = ensure(); if (!c) return;
    const noiseBuf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate), nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // cave echo bus
    const bus = c.createGain(); bus.gain.value = 1;
    const dl = c.createDelay(1); dl.delayTime.value = 0.21; const fb = c.createGain(); fb.gain.value = 0.38; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    bus.connect(master); bus.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
    const shaper = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); } shaper.curve = curve; shaper.connect(bus);
    function syl(t, f0, f1, dur, F1, F2, vol, breath) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(f0 * 0.5, t); o2.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * 0.5), t + dur);
      const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 6; vg.gain.value = f0 * 0.025; vib.connect(vg); vg.connect(o.frequency);
      const a1 = c.createBiquadFilter(); a1.type = 'bandpass'; a1.frequency.value = F1; a1.Q.value = 6;
      const a2 = c.createBiquadFilter(); a2.type = 'bandpass'; a2.frequency.value = F2; a2.Q.value = 7;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const mix = c.createGain(); mix.gain.value = 0.55; o2.connect(mix);
      o.connect(a1); o.connect(a2); mix.connect(a1); a1.connect(g); a2.connect(g); g.connect(shaper);
      if (breath) { const ns = c.createBufferSource(); ns.buffer = noiseBuf; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.8; const ng = c.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); ns.connect(nf); nf.connect(ng); ng.connect(shaper); ns.start(t); ns.stop(t + 0.12); }
      o.start(t); o2.start(t); vib.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    }
    let t = c.currentTime + 0.05;
    for (let r = 0; r < times; r++) {
      syl(t, 118, 92, 0.62, 330, 760, 1.5, false); t += 0.7;                         // "Muuu"
      for (let i = 0; i < 6; i++) { const f = 135 - i * 7; syl(t, f, f * 0.82, 0.26, 640, 1090, 1.5, true); t += 0.33; }   // "ha ha ha ha ha ha"
      syl(t, 112, 62, 1.1, 620, 1000, 1.6, true); t += 1.45;                          // long "haaaaaa"
    }
  }
  function sirenStart() {
    const c = ensure(); if (!c || sirenNodes) return;
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'square'; o.frequency.value = 760; lfo.frequency.value = 1.2; lg.gain.value = 260; g.gain.value = 0.07;
    lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(master); o.start(); lfo.start();
    sirenNodes = { o, lfo, g };
  }
  function sirenStop() {
    if (!sirenNodes) return;
    const { o, lfo, g } = sirenNodes; const t = ctx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.stop(t + 0.35); lfo.stop(t + 0.35); sirenNodes = null;
  }
  function setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.9; }
  function pop() { const c = ensure(); if (!c) return; const t = c.currentTime, b = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900; const g = c.createGain(); g.gain.value = 0.9; s.connect(f); f.connect(g); g.connect(master); s.start(t); tone(160, 0.12, 'sine', 0.3, 0, 60); }
  function pickup() { [660, 880, 1320].forEach((f, i) => tone(f, 0.09, 'square', 0.14, i * 0.07)); }
  function whoosh() { const c = ensure(); if (!c) return; const t = c.currentTime, b = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.25); const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); s.connect(f); f.connect(g); g.connect(master); s.start(t); }
  return { pop, pickup, whoosh, setMuted, muted: () => muted, unlock, blip, tap, bad, go, count, win, laugh, sirenStart, sirenStop };
})();
