// Zoom-in explainer for the U2 block. Clicking the block zooms the die into it, then opens an animated
// walk-through of a digital down-converter and up-converter: a live spectrum on top, the samples below.
// Uses svgEl, reducedMotion, jumpTo and the explainers registry from die.js.
{
  const dialog = document.getElementById('explainer-u2');
  const dieSvg = document.querySelector('.die');
  const dieBlock = dieSvg?.querySelector('.blk[data-explain="u2"]');
  if (dialog && dieBlock) {
    const HASH = '#explain-ddc';
    const FS = 4;     // input sample rate, GSPS
    const LO = 1.2;   // NCO frequency and the wanted signal's carrier, GHz
    const BB = 0.04;  // the wanted signal's offset from its carrier, GHz; it sets the wave in the sample view
    // The antenna signal, positive frequencies in GHz. Each also has a mirror image below 0 Hz.
    const SIGNALS = [
      { f: 0.3, w: 0.05, a: 0.5, ph: 0.7 },
      { f: 0.55, w: 0.08, a: 0.62, ph: 2.1 },
      { f: LO, w: 0.07, a: 0.86, ph: 0.3, want: true },
      { f: 1.8, w: 0.06, a: 0.55, ph: 4 },
    ];
    const WANT = SIGNALS.find(s => s.want);
    const STEPS = { ddc: 5, duc: 4 };
    const STEP_MS = 2800;  // how long one step's animation runs
    const TAU = 2 * Math.PI;

    // Plot geometry in SVG units: spectrum panel on top, sample strip below. Narrow screens get a narrower
    // coordinate space, so the 11-unit labels still render at a readable size.
    let W, SP, ST, SP_H, ST_DX;
    function layout(width) {
      const narrow = width < 560;
      W = narrow ? 420 : 720;
      const l = narrow ? 22 : 36, r = W - (narrow ? 14 : 16);
      SP = { l, r, top: 40, base: 246 };
      ST = { l, r, mid: 372, half: 42, count: narrow ? 56 : 96 };
      SP_H = SP.base - SP.top;
      ST_DX = (ST.r - ST.l) / ST.count;
    }

    const clamp01 = v => Math.min(1, Math.max(0, v));
    const ease = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
    const lerp = (a, b, t) => a + (b - a) * t;
    const wrap = (f, half) => ((((f + half) % (2 * half)) + 2 * half) % (2 * half)) - half;  // into [-half, half)
    const fmtRate = n => (FS / n >= 1 ? `${FS / n} GSPS` : `${Math.round((1000 * FS) / n)} MSPS`);
    const fmtBand = n => `${Math.round((1000 * FS) / 2 / n)} MHz`;

    // Sample values. The ADC input is the sum of the signals; mixing multiplies it by the NCO's cosine (the I channel);
    // an ideal filter then leaves only the wanted signal, now a slow wave at BB.
    const raw = n => SIGNALS.reduce((sum, s) => sum + s.a * Math.cos((TAU * (s.f + (s.want ? BB : 0)) * n) / FS + s.ph), 0);
    const mixed = n => raw(n) * Math.cos((TAU * LO * n) / FS);
    const clean = t => Math.cos((TAU * BB * t) / FS + WANT.ph);
    const upmixed = t => Math.cos((TAU * (LO + BB) * t) / FS + WANT.ph);
    let rawMax = 0, mixMax = 0;
    for (let n = 0; n < 4000; n++) {
      rawMax = Math.max(rawMax, Math.abs(raw(n)));
      mixMax = Math.max(mixMax, Math.abs(mixed(n)));
    }

    // Scene state: every visual is driven by a few numbers that tween from step to step.
    let mode = 'ddc', step = 0, aliasOn = false;
    const rate = { from: 8, to: 8 };
    function target() {
      const s = step, band = FS / 2 / rate.to;
      const base = { band, nb: 1, shift: 0, span: 2, mask: 0, atten: 0, mix: 0, filt: 0, dec: 0, send: 0, fold: 0, zeros: 0, mirrors: 0, dac: 0 };
      if (mode === 'ddc') {
        return { ...base, mirrors: 1, shift: s >= 1 ? -LO : 0, mix: +(s >= 1), mask: +(s >= 2), atten: +(s >= 2), filt: +(s >= 2),
          span: s >= 3 ? band : 2, dec: +(s >= 3), send: +(s >= 4), fold: +(aliasOn && s === 3) };
      }
      return { ...base, span: s >= 1 ? 2 : band, zeros: +(s >= 1), mask: +(s === 1), atten: +(s >= 1), filt: +(s >= 1),
        shift: s >= 2 ? LO : 0, mix: +(s >= 2), mirrors: +(s >= 2), dac: +(s >= 3) };
    }
    // When each value moves within a step's animation, as fractions of STEP_MS. Unlisted values move over the whole step.
    const CHOREO = {
      ddc: [null,
        { shift: [0.1, 0.8], mix: [0.1, 0.8] },
        { mask: [0, 0.25], atten: [0.25, 0.8], filt: [0.25, 0.85] },
        { span: [0.1, 0.65], dec: [0.45, 0.85] },
        { send: [0, 0.4] }],
      duc: [null,
        { span: [0, 0.35], zeros: [0.3, 0.45], mask: [0.5, 0.65], atten: [0.6, 0.9], filt: [0.6, 0.9] },
        { mask: [0, 0.2], shift: [0.15, 0.8], mix: [0.15, 0.8], mirrors: [0.5, 0.85] },
        { dac: [0.1, 0.7] }],
    };
    let shown = target();
    let tween = null;
    function retarget(windows = {}, ms = 1000) {
      tween = { from: { ...shown }, to: target(), t0: performance.now(), ms: reducedMotion.matches ? 0 : ms, windows };
    }
    function advance(now) {
      if (!tween) return;
      const p = tween.ms ? clamp01((now - tween.t0) / tween.ms) : 1;
      for (const key of Object.keys(tween.to)) {
        const [a, b] = tween.windows[key] ?? [0, 1];
        shown[key] = lerp(tween.from[key], tween.to[key], ease(clamp01((p - a) / (b - a))));
      }
      if (p === 1) tween = null;
    }

    // Plot elements, rebuilt when the layout changes and updated every frame.
    const plot = dialog.querySelector('.ex-plot');
    const add = (parent, name, attrs = {}, text) => {
      const node = svgEl(name, attrs);
      if (text !== undefined) node.textContent = text;
      parent.append(node);
      return node;
    };
    let el = null;
    let sigPool = [], stems = [], dots = [];
    let tickStep = 0, tickEls = [];
    const noise = Float64Array.from({ length: 168 }, Math.random);
    let offset = 1000;  // scrolls the sample strip

    function build() {
      layout(plot.clientWidth || 720);
      plot.replaceChildren();
      plot.setAttribute('viewBox', `0 0 ${W} 440`);
      plot.dataset.layout = String(W);
      const defs = add(plot, 'defs');
      add(add(defs, 'clipPath', { id: 'xp-clip-spec' }), 'rect', { x: SP.l, y: SP.top - 16, width: SP.r - SP.l, height: SP_H + 16 });
      add(add(defs, 'clipPath', { id: 'xp-clip-strip' }), 'rect', { x: ST.l, y: ST.mid - ST.half - 10, width: ST.r - ST.l, height: 2 * ST.half + 20 });

      el = {};
      add(plot, 'text', { class: 'xp-title', x: SP.l, y: 22 }, 'SPECTRUM');
      el.rateText = add(plot, 'text', { class: 'xp-rate', x: SP.r, y: 22 });
      for (const k of [0.25, 0.5, 0.75]) add(plot, 'line', { class: 'xp-grid', x1: SP.l, x2: SP.r, y1: SP.base - k * SP_H, y2: SP.base - k * SP_H });
      el.tickLayer = add(plot, 'g');
      add(plot, 'line', { class: 'xp-axis', x1: SP.l, x2: SP.r, y1: SP.base, y2: SP.base });
      el.axisTitle = add(plot, 'text', { class: 'xp-axis-title', x: (SP.l + SP.r) / 2, y: 282 });
      const spec = add(plot, 'g', { 'clip-path': 'url(#xp-clip-spec)' });
      el.mask = add(spec, 'rect', { class: 'xp-mask', y: SP.top - 16, height: SP_H + 16 });
      el.floor = add(spec, 'path', { class: 'xp-floor' });
      el.sigLayer = add(spec, 'g');
      const tag = (text, cls = '') => add(spec, 'text', { class: `xp-tag ${cls}` }, text);
      el.tags = {
        want: tag('wanted', 'is-want'),
        mirror: tag('mirror'),
        images: tag('images', 'is-bad'),
        mask: tag('low-pass filter', 'is-want'),
        alias: tag('aliasing: other signals land on the wanted one', 'is-bad'),
        shift: tag(''),
      };

      add(plot, 'text', { class: 'xp-title', x: ST.l, y: 312 }, 'SAMPLES');
      el.stripNote = add(plot, 'text', { class: 'xp-note', x: ST.r, y: 312 });
      add(plot, 'line', { class: 'xp-mid', x1: ST.l, x2: ST.r, y1: ST.mid, y2: ST.mid });
      el.strip = add(plot, 'g', { class: 'xp-strip', 'clip-path': 'url(#xp-clip-strip)' });
      el.wave = add(el.strip, 'path', { class: 'xp-wave' });
      const stemLayer = add(el.strip, 'g');
      const dotLayer = add(el.strip, 'g');
      stems = [];
      dots = [];
      for (let i = 0; i < ST.count; i++) {
        stems.push(add(stemLayer, 'line', { class: 'xp-stem', y1: ST.mid }));
        dots.push(add(dotLayer, 'circle', { class: 'xp-dot', r: 2.6 }));
      }
      el.sendTag = add(plot, 'text', { class: 'xp-tag is-want xp-send', x: ST.r, y: ST.mid + ST.half + 18 }, 'to the FPGA over JESD204 →');
      sigPool = [];
      tickStep = 0;
      tickEls = [];
    }

    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    function place(node, x, y, opacity) {
      node.setAttribute('x', x.toFixed(1));
      node.setAttribute('y', y.toFixed(1));
      node.setAttribute('opacity', opacity.toFixed(3));
      node.setAttribute('visibility', opacity < 0.02 ? 'hidden' : 'visible');
    }

    function drawTicks(span) {
      const stepF = [1, 0.5, 0.25, 0.1, 0.05, 0.025].find(s => Math.floor(span / s + 1e-9) >= 2);
      const mhz = stepF < 0.5;
      if (stepF !== tickStep) {
        tickStep = stepF;
        el.tickLayer.replaceChildren();
        tickEls = [];
        const k = Math.floor(2 / stepF + 1e-9);
        for (let i = -k; i <= k; i++) {
          const v = i * stepF;
          const label = mhz ? Math.round(v * 1000) : Math.round(v * 100) / 100;
          const line = add(el.tickLayer, 'line', { class: i ? 'xp-grid' : 'xp-zero', y1: SP.top, y2: SP.base });
          const text = add(el.tickLayer, 'text', { class: 'xp-tick', y: 262 }, String(label).replace('-', '−'));
          tickEls.push({ v, line, text });
        }
        setText(el.axisTitle, mhz ? 'Frequency (MHz)' : 'Frequency (GHz)');
      }
      for (const { v, line, text } of tickEls) {
        const x = spX(v, span).toFixed(1);
        const on = Math.abs(v) <= span + 1e-6 ? 'visible' : 'hidden';
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        line.setAttribute('visibility', on);
        text.setAttribute('x', x);
        text.setAttribute('visibility', on);
      }
    }
    function spX(f, span) {
      return (SP.l + SP.r) / 2 + (f / span) * ((SP.r - SP.l) / 2);
    }

    const RANK = { other: 0, mirror: 1, image: 2, want: 3, alias: 4 };
    function render() {
      const s = shown, span = s.span, band = s.band, ddc = mode === 'ddc';
      const fx = f => spX(f, span);
      // Low-pass response: flat across the band, rolling off just past its edges.
      const pass = f => {
        const a = Math.abs(f) / band;
        return a <= 0.88 ? 1 : a >= 1.06 ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (a - 0.88)) / 0.18);
      };
      const filtered = f => 1 - s.atten * (1 - pass(f)) * 0.96;
      const flat = () => 1;

      const comps = [];
      if (ddc) {
        for (const sig of SIGNALS) {
          comps.push({ sig, at: wrap(sig.f + s.shift, FS / 2), kind: sig.want ? 'want' : 'other', amp: 1, gain: filtered });
          comps.push({ sig, at: wrap(-sig.f + s.shift, FS / 2), kind: 'mirror', amp: 1, gain: filtered });
        }
        // Decimating without the filter folds everything outside the band back into it.
        if (s.fold > 0.001) {
          for (const c of comps.slice()) {
            if (c.kind !== 'want' && Math.abs(c.at) > band) comps.push({ sig: c.sig, at: wrap(c.at, band), kind: 'alias', amp: s.fold, gain: flat });
          }
        }
      } else {
        comps.push({ sig: WANT, at: s.shift, kind: 'want', amp: 1, gain: flat });
        if (s.mirrors > 0.001) comps.push({ sig: WANT, at: -s.shift, kind: 'mirror', amp: s.mirrors, gain: flat });
        // Zero-stuffing leaves copies of the signal at multiples of the old rate, until the filter removes them.
        const images = s.zeros * (1 - s.atten);
        if (images > 0.001) {
          for (let k = 1; k * 2 * band <= FS / 2 + 0.2; k++) {
            for (const sign of [-1, 1]) comps.push({ sig: WANT, at: sign * k * 2 * band, kind: 'image', amp: images, gain: flat });
          }
        }
      }
      comps.sort((a, b) => RANK[a.kind] - RANK[b.kind]);

      let used = 0;
      for (const c of comps) {
        // The sampled spectrum repeats every FS, so a signal shifted off one edge comes back on the other.
        for (const at of ddc ? [c.at - FS, c.at, c.at + FS] : [c.at]) {
          if (Math.abs(at) > span + 1.5 * c.sig.w) continue;
          const path = (sigPool[used++] ??= add(el.sigLayer, 'path'));
          path.setAttribute('class', `xp-sig is-${c.kind}`);
          const ext = 1.45 * c.sig.w;
          let d = `M${fx(at - ext).toFixed(1)} ${SP.base}`;
          for (let i = 0; i <= 36; i++) {
            const f = at - ext + (2 * ext * i) / 36;
            const amp = c.sig.a * c.amp * Math.exp(-(((f - at) / c.sig.w) ** 4)) * c.gain(f);
            d += `L${fx(f).toFixed(1)} ${(SP.base - amp * SP_H).toFixed(1)}`;
          }
          path.setAttribute('d', `${d}L${fx(at + ext).toFixed(1)} ${SP.base}Z`);
        }
      }
      for (let i = used; i < sigPool.length; i++) sigPool[i].setAttribute('d', '');

      let fd = '';
      for (let i = 0; i < noise.length; i++) {
        const x = SP.l + (i / (noise.length - 1)) * (SP.r - SP.l);
        const f = ((x - (SP.l + SP.r) / 2) / ((SP.r - SP.l) / 2)) * span;
        const level = (0.028 + 0.03 * noise[i]) * (ddc ? (1 - s.atten * (1 - pass(f)) * 0.65) * (1 + 1.4 * s.fold) : 1);
        fd += `${i ? 'L' : 'M'}${x.toFixed(1)} ${(SP.base - level * SP_H).toFixed(1)}`;
      }
      el.floor.setAttribute('d', fd);

      const maskOn = s.mask * (1 - s.fold);
      el.mask.setAttribute('x', fx(-band).toFixed(1));
      el.mask.setAttribute('width', Math.max(0, fx(band) - fx(-band)).toFixed(1));
      el.mask.setAttribute('opacity', maskOn.toFixed(3));
      el.mask.setAttribute('visibility', maskOn < 0.02 ? 'hidden' : 'visible');

      const peak = SP.base - WANT.a * SP_H - 10;
      const cx = (SP.l + SP.r) / 2;
      const { tags } = el;
      place(tags.want, fx(ddc ? wrap(LO + s.shift, FS / 2) : s.shift), peak, 1);
      place(tags.mirror, fx(ddc ? wrap(-LO + s.shift, FS / 2) : -s.shift), peak, ddc ? 1 - s.mix : s.mirrors);
      // Label an image far enough from 0 Hz that it can't collide with the "wanted" label.
      const imageAt = Math.ceil(0.6 / (2 * band)) * 2 * band;
      place(tags.images, fx(imageAt), peak, ddc ? 0 : s.zeros * (1 - s.atten));
      place(tags.mask, cx, SP.top - 3, maskOn);
      place(tags.alias, cx, SP.top - 3, s.fold);
      setText(tags.shift, ddc ? '← the NCO shifts everything down 1.2 GHz' : 'the NCO shifts the signal up 1.2 GHz →');
      place(tags.shift, cx, SP.top - 3, ddc ? s.mix * (1 - s.mask) : s.mix * (1 - s.dac));

      const high = ddc ? s.dec < 0.5 : s.zeros >= 0.5;
      setText(el.rateText, `Sample rate ${high ? fmtRate(1) : fmtRate(rate.to)}`);
      drawTicks(span);

      // Sample strip: one lollipop per sample, scrolling left as time passes.
      const first = Math.floor(offset), frac = offset - first;
      const kept = n => {
        const a = +(n % rate.from === 0), b = +(n % rate.to === 0);
        return a + (b - a) * s.nb;
      };
      for (let i = 0; i < ST.count; i++) {
        const n = first + i;
        const x = ST.l + (i + 0.5 - frac) * ST_DX;
        const k = kept(n);
        let v, opacity;
        if (ddc) {
          const m = mixed(n) / mixMax;
          v = lerp(lerp(raw(n) / rawMax, m, s.mix), clean(n), s.filt);
          v = lerp(v, m, s.fold * k);  // without the filter, the kept samples are of the unfiltered signal
          opacity = 1 - s.dec * (1 - k) * 0.88;
        } else {
          v = lerp(clean(n) * Math.max(k, s.filt), upmixed(n), s.mix);
          opacity = Math.max(k, s.zeros) * (1 - 0.7 * s.dac);
        }
        const y = (ST.mid - v * ST.half).toFixed(1);
        const xs = x.toFixed(1);
        stems[i].setAttribute('x1', xs);
        stems[i].setAttribute('x2', xs);
        stems[i].setAttribute('y2', y);
        stems[i].setAttribute('opacity', opacity.toFixed(3));
        dots[i].setAttribute('cx', xs);
        dots[i].setAttribute('cy', y);
        dots[i].setAttribute('opacity', opacity.toFixed(3));
        dots[i].setAttribute('r', (2.6 + 1.2 * s.send * k).toFixed(2));
        dots[i].classList.toggle('is-kept', k > 0.5);
      }
      el.strip.classList.toggle('is-want', !ddc || s.filt > 0.5);
      el.strip.classList.toggle('is-bad', s.fold > 0.5);

      let wd = '';
      for (let x = ST.l; x <= ST.r; x += 2) {
        const tt = first + (x - ST.l) / ST_DX - 0.5 + frac;
        const v = ddc ? clean(tt) : lerp(clean(tt), upmixed(tt), s.mix);
        wd += `${x === ST.l ? 'M' : 'L'}${x} ${(ST.mid - v * ST.half).toFixed(1)}`;
      }
      el.wave.setAttribute('d', wd);
      el.wave.setAttribute('opacity', (ddc ? 0.5 * s.filt : Math.max(0.45 * (1 - s.mix), s.dac)).toFixed(3));
      el.sendTag.setAttribute('opacity', s.send.toFixed(3));
      el.sendTag.setAttribute('visibility', s.send < 0.02 ? 'hidden' : 'visible');

      const notes = ddc
        ? ['raw ADC samples', 'after mixing (I channel)', 'after the filter', `keeping 1 in ${rate.to}`, `keeping 1 in ${rate.to}`]
        : ['input samples', 'zeros inserted, then filled in', 'after mixing up', 'continuous DAC output'];
      setText(el.stripNote, s.fold > 0.5 ? 'no filter: the kept samples go wrong' : notes[step]);
    }

    // Steps, autoplay and controls.
    const lists = Object.fromEntries([...dialog.querySelectorAll('[data-ex-list]')].map(l => [l.dataset.exList, l]));
    const prevBtn = dialog.querySelector('[data-ex-prev]');
    const nextBtn = dialog.querySelector('[data-ex-next]');
    const playBtn = dialog.querySelector('[data-ex-play]');
    const modeBtns = [...dialog.querySelectorAll('[data-ex-mode]')];
    const rateBtns = [...dialog.querySelectorAll('[data-ex-rate]')];
    const rateLabel = dialog.querySelector('[data-ex-rate-label]');
    const aliasBtn = dialog.querySelector('[data-ex-alias]');
    const live = dialog.querySelector('.ex-live');
    let playing = false, dwellStart = 0;

    const stepButtons = (m = mode) => [...lists[m].querySelectorAll('.ex-step')];
    const says = m => [...dialog.querySelectorAll(`[data-ex-say="${m}"]`)];

    function syncSteps() {
      for (const [m, list] of Object.entries(lists)) {
        list.classList.toggle('is-off', m !== mode);
        stepButtons(m).forEach((btn, i) => {
          const on = m === mode && i === step;
          if (on) btn.setAttribute('aria-current', 'step');
          else btn.removeAttribute('aria-current');
          btn.classList.toggle('is-done', m === mode && i < step);
          btn.style.setProperty('--p', 0);
          says(m)[i].classList.toggle('is-on', on);
        });
      }
      // Keep focus inside the dialog when the focused end button is about to become disabled.
      if (document.activeElement === prevBtn && step === 0) nextBtn.focus();
      if (document.activeElement === nextBtn && step === STEPS[mode] - 1) prevBtn.focus();
      prevBtn.disabled = step === 0;
      nextBtn.disabled = step === STEPS[mode] - 1;
      for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.exMode === mode));
      aliasBtn.setAttribute('aria-pressed', String(aliasOn));
      rateLabel.textContent = mode === 'ddc' ? 'Decimate by' : 'Interpolate by';
    }

    function syncRate() {
      for (const b of rateBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.exRate) === rate.to));
      for (const node of dialog.querySelectorAll('[data-ex-v]')) {
        const v = node.dataset.exV;
        node.textContent = v === 'n' ? String(rate.to) : v === 'out' ? fmtRate(rate.to) : fmtBand(rate.to);
      }
    }

    function announce() {
      const title = stepButtons()[step].querySelector('.ex-t').textContent;
      live.textContent = `${mode === 'ddc' ? 'Receive' : 'Transmit'}, step ${step + 1} of ${STEPS[mode]}: ${title}`;
    }

    // Playing covers all of the explainer's motion: auto-advance, the scrolling samples and the noise flicker.
    // It starts on its own unless the visitor prefers reduced motion; Play still works for them.
    function setPlaying(on) {
      playing = on;
      dwellStart = performance.now();
      playBtn.textContent = playing ? 'Pause' : 'Play';
    }

    function go(next, { auto = false } = {}) {
      next = Math.max(0, Math.min(STEPS[mode] - 1, next));
      if (next === step) return;
      const forward = next === step + 1;
      if (mode === 'ddc' && step === 3) aliasOn = false;  // the aliasing toggle lives in step 4's text
      step = next;
      retarget(forward ? CHOREO[mode][next] : {}, forward ? STEP_MS : 1100);
      if (auto) dwellStart = performance.now();
      else setPlaying(false);
      syncSteps();
      announce();
    }

    function setMode(next) {
      if (next === mode) return;
      mode = next;
      step = 0;
      aliasOn = false;
      shown = target();
      tween = null;
      syncSteps();
      syncRate();
      setPlaying(!reducedMotion.matches);
      announce();
    }

    function setRate(n) {
      if (n === rate.to) return;
      rate.from = rate.to;
      rate.to = n;
      shown.nb = 0;
      retarget({}, 900);
      syncRate();
    }

    // Autoplay stays on a step long enough to read it: about 4 words a second, between 7 and 18 seconds.
    const dwellMs = () => Math.min(18000, Math.max(7000, says(mode)[step].textContent.trim().split(/\s+/).length * 250));
    function autoplay(now) {
      const btn = stepButtons()[step];
      if (!playing) return;
      const p = clamp01((now - dwellStart) / dwellMs());
      btn.style.setProperty('--p', p.toFixed(3));
      if (p < 1) return;
      if (step < STEPS[mode] - 1) go(step + 1, { auto: true });
      else {
        btn.style.setProperty('--p', 0);
        setPlaying(false);
      }
    }

    for (const m of Object.keys(lists)) stepButtons(m).forEach((btn, i) => btn.addEventListener('click', () => go(i)));
    prevBtn.addEventListener('click', () => go(step - 1));
    nextBtn.addEventListener('click', () => go(step + 1));
    playBtn.addEventListener('click', () => {
      if (playing) return setPlaying(false);
      if (step === STEPS[mode] - 1) go(0);
      setPlaying(true);
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      go(step + (event.key === 'ArrowRight' ? 1 : -1));
    });
    for (const b of modeBtns) b.addEventListener('click', () => setMode(b.dataset.exMode));
    for (const b of rateBtns) b.addEventListener('click', () => setRate(Number(b.dataset.exRate)));
    aliasBtn.addEventListener('click', () => {
      aliasOn = !aliasOn;
      setPlaying(false);
      retarget({}, 700);
      syncSteps();
    });

    let raf = 0, last = 0, noiseAt = 0;
    function frame(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (playing && !reducedMotion.matches) {
        offset += dt * 5;
        if (now - noiseAt > 90) {
          noiseAt = now;
          for (let i = 0; i < noise.length; i++) noise[i] = Math.random();
        }
      }
      advance(now);
      autoplay(now);
      render();
      raf = requestAnimationFrame(frame);
    }

    function reset() {
      mode = 'ddc';
      step = 0;
      aliasOn = false;
      rate.from = rate.to = 8;
      shown = target();
      tween = null;
      syncSteps();
      syncRate();
      setPlaying(!reducedMotion.matches);
    }

    // Opening zooms the die into the block, then grows the dialog out of it. Closing reverses both.
    const FULL_VIEW = [0, 0, 640, 640];
    let viewToken = 0;
    function zoomDie(to, ms) {
      const token = ++viewToken;
      const from = dieSvg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      return new Promise(resolve => {
        if (!ms) {
          dieSvg.setAttribute('viewBox', to.join(' '));
          return resolve();
        }
        const t0 = performance.now();
        const tick = now => {
          if (token !== viewToken) return resolve();
          const e = ease(clamp01((now - t0) / ms));
          dieSvg.setAttribute('viewBox', from.map((v, i) => Math.round((v + (to[i] - v) * e) * 100) / 100).join(' '));
          if (e < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    }
    function blockView() {
      const edge = dieBlock.querySelector('.blk-edge');
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(k => Number(edge.getAttribute(k)));
      const size = Math.max(w, h) * 1.22;
      return [x + w / 2 - size / 2, y + h / 2 - size / 2, size, size];
    }
    function morph(rect, closing) {
      const box = dialog.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - (box.left + box.width / 2);
      const dy = rect.top + rect.height / 2 - (box.top + box.height / 2);
      const small = { transform: `translate(${dx}px, ${dy}px) scale(${Math.max(0.05, rect.width / box.width)})`, opacity: 0 };
      const full = { transform: 'none', opacity: 1 };
      return dialog.animate(closing ? [full, small] : [small, full], {
        duration: closing ? 280 : 420,
        easing: closing ? 'cubic-bezier(0.4, 0, 1, 1)' : 'cubic-bezier(0.16, 1, 0.3, 1)',
      }).finished;
    }

    let opener = null, origin = dieBlock, busy = false, closing = false, backPending = false, pendingJump = null;

    async function open(trigger = dieBlock, { push = true } = {}) {
      if (dialog.open || busy) return;
      busy = true;
      opener = document.activeElement !== document.body ? document.activeElement : null;
      origin = trigger;
      if (push) history.pushState({ explainer: 'u2' }, '', HASH);
      reset();
      const motion = !reducedMotion.matches;
      if (trigger === dieBlock) await zoomDie(blockView(), motion ? 480 : 0);
      document.documentElement.classList.add('ex-open');
      dialog.showModal();
      build();
      render();
      last = 0;
      raf = requestAnimationFrame(frame);
      if (motion) await morph(trigger.getBoundingClientRect(), false);
      busy = false;
    }

    async function animateClose() {
      if (!dialog.open || closing) return;
      closing = true;
      if (!reducedMotion.matches) {
        dialog.classList.add('is-closing');
        await morph((origin.isConnected ? origin : dieBlock).getBoundingClientRect(), true);
      }
      dialog.close();
    }

    // Closing goes through history when opening added an entry, so Back and the close button behave the same.
    function requestClose() {
      if (history.state?.explainer === 'u2') {
        backPending = true;
        history.back();
      } else animateClose();
    }

    dialog.addEventListener('close', () => {
      closing = false;
      dialog.classList.remove('is-closing');
      document.documentElement.classList.remove('ex-open');
      cancelAnimationFrame(raf);
      setPlaying(false);
      // Closed without going through history (Chrome can force-close on a repeated Escape): drop our entry.
      if (history.state?.explainer === 'u2' && !backPending) history.back();
      const jump = pendingJump;
      pendingJump = null;
      if (jump) jumpTo(jump);
      else if (opener?.isConnected) opener.focus({ preventScroll: true });
      zoomDie(FULL_VIEW, reducedMotion.matches ? 0 : 420);
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      requestClose();
    });
    dialog.addEventListener('click', event => { if (event.target === dialog) requestClose(); });
    dialog.querySelector('[data-ex-close]').addEventListener('click', requestClose);
    dialog.querySelector('[data-ex-jump]').addEventListener('click', event => {
      event.preventDefault();
      pendingJump = event.currentTarget.getAttribute('href');
      requestClose();
    });
    addEventListener('popstate', () => {
      backPending = false;
      const here = history.state?.explainer === 'u2';
      if (dialog.open && !here) animateClose();
      else if (!dialog.open && here) open(dieBlock, { push: false });
    });

    new ResizeObserver(() => {
      if (!dialog.open || !el) return;
      const before = W;
      layout(plot.clientWidth);
      if (W !== before) {
        build();
        render();
      }
    }).observe(plot);

    explainers.set('u2', { open: trigger => open(trigger) });

    // A shared link straight to the explainer opens it over the page, with Back returning to the page.
    if (location.hash === HASH) {
      history.replaceState(null, '', location.pathname + location.search);
      open();
    }
  }
}
