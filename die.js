const SVG_NS = 'http://www.w3.org/2000/svg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

// Bond pads around the die edge, skipping the slots used by the labeled link pads.
function drawPads(group) {
  const linkSlots = new Set(['top:222', 'top:308', 'top:394', 'bottom:222', 'bottom:394']);
  for (let x = 50; x <= 566; x += 43) {
    for (const [side, y] of [['top', 30], ['bottom', 586]]) {
      if ([...linkSlots].some(s => s.startsWith(side) && Math.abs(Number(s.split(':')[1]) - x) < 30)) continue;
      group.append(svgEl('rect', { class: 'pad', x, y, width: 24, height: 24 }));
    }
  }
  for (let y = 93; y <= 523; y += 43) {
    for (const x of [30, 586]) group.append(svgEl('rect', { class: 'pad', x, y, width: 24, height: 24 }));
  }
  for (const pad of group.querySelectorAll('.pad')) {
    const x = Number(pad.getAttribute('x')), y = Number(pad.getAttribute('y'));
    const cx = x + 12, cy = y + 12;
    const tx = Math.min(Math.max(cx, 88), 552), ty = Math.min(Math.max(cy, 88), 552);
    group.append(svgEl('path', { class: 'pad-wire', d: `M${cx} ${cy}L${tx} ${ty}` }));
  }
}

// Vertical and horizontal power straps across the core.
function drawStraps(group) {
  for (const x of [190, 316, 446]) group.append(svgEl('rect', { class: 'strap', x: x - 2, y: 98, width: 4, height: 444 }));
  for (const y of [252, 380]) group.append(svgEl('rect', { class: 'strap', x: 98, y: y - 2, width: 444, height: 4 }));
}

function flash(target) {
  target.classList.remove('is-flash');
  void target.offsetWidth;
  target.classList.add('is-flash');
  const clear = () => target.classList.remove('is-flash');
  if (reducedMotion.matches) setTimeout(clear, 1800);
  else target.addEventListener('animationend', clear, { once: true });
}

// Zoom-in explainers by block id (filled by explain.js). A block with one opens it on click instead of jumping.
const explainers = new Map();

// Scrolls to an in-page target, highlights it and moves focus there. Returns false if there is no such target.
function jumpTo(hash) {
  const target = document.querySelector(hash);
  if (!target) return false;
  history.pushState(null, '', hash);
  target.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  flash(target);
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return true;
}

const die = document.querySelector('.die');
if (die) {
  drawPads(die.querySelector('.die-pads'));
  drawStraps(die.querySelector('.die-straps'));

  const readout = document.querySelector('.die-readout');
  const roId = readout.querySelector('.ro-id');
  const roName = readout.querySelector('.ro-name');
  const roCap = readout.querySelector('.ro-cap');
  const roHint = readout.querySelector('.ro-hint');
  const idle = { id: roId.textContent, name: roName.textContent, cap: roCap.textContent };
  const legendLinks = [...document.querySelectorAll('.die-legend a')];
  const art = die.querySelector('.chip-art');

  function describe(blockId) {
    if (blockId === 'art') return { id: 'ART', name: art.dataset.name, cap: art.dataset.cap };
    const item = legendLinks.find(a => a.dataset.block === blockId);
    return item && { id: item.querySelector('.lg-id').textContent, name: item.querySelector('.lg-name').textContent, cap: item.querySelector('.lg-cap').textContent };
  }

  const EXPLAIN_HINT = 'Click to zoom in.';

  // Lay out every caption, hidden, under the live one so the readout keeps one height (see .ro-sizer).
  const liveRow = readout.querySelector('.ro-row');
  for (const info of [idle, ...legendLinks.map(a => describe(a.dataset.block)), describe('art')]) {
    const sizer = liveRow.cloneNode(true);
    sizer.classList.add('ro-sizer');
    sizer.querySelector('.ro-id').textContent = info.id;
    sizer.querySelector('.ro-name').textContent = info.name;
    sizer.querySelector('.ro-cap').textContent = info.cap;
    // Any block may gain an explainer, so every sizer leaves room for the hint.
    sizer.querySelector('.ro-hint').textContent = EXPLAIN_HINT;
    readout.append(sizer);
  }

  function show(blockId) {
    const info = describe(blockId) ?? idle;
    for (const el of document.querySelectorAll('[data-block]')) el.classList.toggle('is-active', el.dataset.block === blockId);
    roId.textContent = info.id;
    roName.textContent = info.name;
    roCap.textContent = info.cap;
    roHint.textContent = explainers.has(blockId) ? EXPLAIN_HINT : '';
    readout.classList.toggle('is-active', info !== idle);
    // Phones show the legend instead of the readout, but the legend has no entry for the chip art.
    readout.classList.toggle('is-art', blockId === 'art');
  }

  // On touch there is no hover, so the first tap on the chip art opens the loupe and a second tap follows its link.
  let tapType = 'mouse';
  let pinned = false;
  art.addEventListener('pointerdown', event => { tapType = event.pointerType; });
  art.addEventListener('keydown', () => { tapType = 'keyboard'; });
  document.addEventListener('pointerdown', event => {
    if (pinned && !art.contains(event.target)) {
      pinned = false;
      show(null);
    }
  });

  for (const el of document.querySelectorAll('.die [data-block], .die-legend [data-block]')) {
    el.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(el.dataset.block); });
    el.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch' && !pinned) show(null); });
    el.addEventListener('focus', () => show(el.dataset.block));
    el.addEventListener('blur', () => {
      pinned = false;
      show(null);
    });
    el.addEventListener('click', event => {
      if (el === art && tapType === 'touch' && !pinned) {
        event.preventDefault();
        pinned = true;
        show('art');
        return;
      }
      const explainer = explainers.get(el.dataset.explain);
      if (explainer) {
        event.preventDefault();
        explainer.open(el);
        return;
      }
      if (jumpTo(el.getAttribute('href'))) event.preventDefault();
    });
  }

  // Mini floorplan that follows the page once the big die scrolls away, lighting the block being read.
  const minimap = document.querySelector('.minimap');
  if (minimap) {
    const map = minimap.querySelector('.mm-map');
    const mini = minimap.querySelector('.mm-die');
    const sectionLabel = minimap.querySelector('.mm-section');
    const blockLabel = minimap.querySelector('.mm-block');
    const topbar = document.querySelector('.topbar');
    const hero = document.querySelector('.hero');
    const sections = [...document.querySelectorAll('main > section')];

    mini.append(svgEl('rect', { class: 'mm-sub', width: 640, height: 640, rx: 14 }));
    for (const pad of die.querySelectorAll('.pad')) {
      mini.append(svgEl('rect', { class: 'mm-pad', x: pad.getAttribute('x'), y: pad.getAttribute('y'), width: 24, height: 24 }));
    }
    mini.append(svgEl('rect', { class: 'mm-ring', x: 88, y: 88, width: 464, height: 464 }));
    const blocks = [...die.querySelectorAll('.blk')].map(blk => {
      const edge = blk.querySelector('.blk-edge');
      const info = describe(blk.dataset.block);
      const label = `${info.id} ${info.name}`;
      const href = blk.getAttribute('href');
      const link = svgEl('a', { class: ['mm-blk', ...[...blk.classList].filter(c => c !== 'blk')].join(' '), href, 'aria-label': label });
      link.append(svgEl('rect', Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, edge.getAttribute(k)]))));
      link.addEventListener('click', event => { if (jumpTo(href)) event.preventDefault(); });
      // Pointing at a mini block names it; leaving goes back to naming the block being read.
      for (const type of ['pointerenter', 'focus']) link.addEventListener(type, () => { blockLabel.textContent = label; });
      for (const type of ['pointerleave', 'blur']) link.addEventListener(type, () => schedule());
      mini.append(link);
      return { link, label, target: document.querySelector(href) };
    });

    // Below 1260px the navigator is a single link back to the floorplan, so its blocks step out of the way.
    const wide = matchMedia('(min-width: 1260px)');
    const syncWide = () => { map.inert = !wide.matches; };
    wide.addEventListener('change', syncWide);
    syncWide();

    let frame = 0;
    const update = () => {
      frame = 0;
      const top = topbar.getBoundingClientRect().bottom;
      const on = hero.getBoundingClientRect().bottom < top;
      minimap.classList.toggle('is-on', on);
      document.documentElement.classList.toggle('mm-on', on);
      // The reading line sits mid-screen, where jumps from the floorplan land.
      const line = (top + innerHeight) / 2;
      const section = sections.findLast(s => s.getBoundingClientRect().top <= line);
      let lit = null, nearest = 32;
      for (const block of blocks) {
        const r = block.target.getBoundingClientRect();
        const gap = Math.max(r.top - line, line - r.bottom, 0);
        if (gap < nearest) [lit, nearest] = [block, gap];
      }
      for (const block of blocks) block.link.classList.toggle('is-lit', block === lit);
      sectionLabel.textContent = section ? section.querySelector('h2').textContent.trim() : 'Top';
      blockLabel.textContent = lit ? lit.label : '';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    minimap.hidden = false;
    update();
  }
}

// Logic-analyzer view of the career, one signal per role, built from the role elements' data attributes.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SIGNAL_COLORS = { TI_DESIGN: '--l-diff', TI_INTERN: '--l-m1', CELERIX: '--l-m2', XYMA: '--l-poly', IIT_MADRAS: '--l-top' };

function monthIndex(value) {
  const [year, month] = value.split('-').map(Number);
  return year * 12 + (month - 1);
}

function formatMonth(index) {
  return `${MONTHS[((index % 12) + 12) % 12]} ${Math.floor(index / 12)}`;
}

const la = document.querySelector('.la');
const roles = [...document.querySelectorAll('.role[data-signal]')];
if (la && roles.length) {
  const now = new Date();
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  const start = monthIndex('2018-01');
  const end = nowIndex + 3;
  const W = 760, LEFT = 104, RIGHT = 16, ROW = 34, TOP = 24, HIGH = 18;
  const x = m => LEFT + ((m - start) / (end - start)) * (W - LEFT - RIGHT);
  const H = TOP + roles.length * ROW + 10;

  const svg = svgEl('svg', { class: 'la-svg', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Career timeline as logic-analyzer signals. Focus a signal to highlight its role.' });
  const plot = svgEl('g', {});
  const names = svgEl('g', { class: 'la-names' });
  names.append(svgEl('rect', { class: 'la-names-bg', x: 0, y: TOP - 8, width: LEFT - 6, height: H - TOP + 8 }));
  svg.append(plot, names);
  for (let year = 2018; year <= now.getFullYear(); year++) {
    const gx = x(year * 12);
    plot.append(svgEl('line', { class: 'la-grid-line', x1: gx, x2: gx, y1: TOP - 6, y2: H - 6 }));
    if (Math.abs(gx - x(nowIndex)) < 34) continue;
    const label = svgEl('text', { class: 'la-year', x: gx, y: 12 });
    label.textContent = String(year);
    plot.append(label);
  }
  plot.append(svgEl('line', { class: 'la-axis-line', x1: LEFT, x2: W - RIGHT, y1: TOP - 6, y2: TOP - 6 }));

  const order = ['TI_DESIGN', 'CELERIX', 'TI_INTERN', 'XYMA', 'IIT_MADRAS'];
  const sorted = [...roles].sort((a, b) => order.indexOf(a.dataset.signal) - order.indexOf(b.dataset.signal));
  const read = la.querySelector('.la-read');
  const idleRead = read.textContent;
  sorted.forEach((role, row) => {
    const color = `var(${SIGNAL_COLORS[role.dataset.signal] ?? '--accent'})`;
    role.style.setProperty('--ch', color);
    const s = monthIndex(role.dataset.start);
    const ongoing = !role.dataset.end;
    const xe = ongoing ? W - RIGHT : x(monthIndex(role.dataset.end) + 1);
    const base = TOP + row * ROW + 24;
    const top = base - HIGH;
    const g = svgEl('g', { class: 'la-sig', tabindex: '0', role: 'button', 'aria-label': `${role.dataset.label}. Show details.` });
    g.style.setProperty('--ch', color);
    g.append(svgEl('rect', { class: 'la-hit', x: 2, y: top - 6, width: W - 4, height: HIGH + 12, rx: 4 }));
    g.append(svgEl('rect', { class: 'la-high', x: x(s), y: top, width: Math.max(2, xe - x(s)), height: HIGH }));
    const fall = ongoing ? '' : `V${base}H${W - RIGHT}`;
    g.append(svgEl('path', { class: 'la-wave', d: `M${LEFT} ${base}H${x(s)}V${top}H${xe}${fall}` }));
    plot.append(g);
    // Signal names live in a separate layer that stays pinned left when the trace scrolls sideways.
    const name = svgEl('text', { class: 'la-name', x: 10, y: base - 4, 'aria-hidden': 'true' });
    name.textContent = role.dataset.signal;
    name.style.setProperty('--ch', color);
    names.append(name);

    const hot = on => {
      g.classList.toggle('is-hot', on);
      name.classList.toggle('is-hot', on);
      role.classList.toggle('is-hot', on);
    };
    g.addEventListener('pointerenter', () => hot(true));
    g.addEventListener('pointerleave', () => hot(false));
    g.addEventListener('focus', () => {
      hot(true);
      read.textContent = role.dataset.label;
    });
    g.addEventListener('blur', () => {
      hot(false);
      read.textContent = idleRead;
    });
    const jump = () => {
      role.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      flash(role);
    };
    g.addEventListener('click', jump);
    g.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); jump(); }
    });
  });

  const nx = x(nowIndex);
  plot.append(svgEl('line', { class: 'la-now', x1: nx, x2: nx, y1: TOP - 10, y2: H - 6 }));
  const nowLabel = svgEl('text', { class: 'la-now-label', x: nx, y: 12, 'text-anchor': 'middle' });
  nowLabel.textContent = 'NOW';
  plot.append(nowLabel);
  const cursor = svgEl('line', { class: 'la-cursor', x1: 0, x2: 0, y1: TOP - 10, y2: H - 6 });
  plot.append(cursor);

  function track(event) {
    const box = svg.getBoundingClientRect();
    const sx = ((event.clientX - box.left) / box.width) * W;
    if (sx < LEFT || sx > W - RIGHT) return untrack();
    const m = Math.min(nowIndex, Math.round(start + ((sx - LEFT) / (W - LEFT - RIGHT)) * (end - start)));
    cursor.setAttribute('x1', sx);
    cursor.setAttribute('x2', sx);
    cursor.classList.add('is-on');
    const active = sorted.filter(r => {
      const s = monthIndex(r.dataset.start);
      const e = r.dataset.end ? monthIndex(r.dataset.end) : nowIndex;
      return m >= s && m <= e;
    }).map(r => r.dataset.signal);
    read.replaceChildren(Object.assign(document.createElement('strong'), { textContent: formatMonth(Math.min(m, nowIndex)) }), ` · ${active.length ? active.join(', ') + ' high' : 'all low'}`);
  }
  function untrack() {
    cursor.classList.remove('is-on');
    read.textContent = idleRead;
  }
  svg.addEventListener('pointermove', track);
  svg.addEventListener('pointerdown', track);
  svg.addEventListener('pointerleave', untrack);

  la.querySelector('.la-grid').replaceWith(svg);
  la.hidden = false;
  // On narrow screens the trace scrolls sideways: start at the newest end, and keep the names column pinned.
  const scroller = la.querySelector('.la-scroll');
  const pinNames = () => {
    const unit = W / svg.getBoundingClientRect().width;
    const shift = scroller.scrollLeft * unit;
    names.setAttribute('transform', `translate(${shift} 0)`);
    // Once scrolled, the pinned column also covers the year labels that pass beneath it.
    names.querySelector('.la-names-bg').setAttribute('y', shift > 0 ? 0 : TOP - 8);
    names.querySelector('.la-names-bg').setAttribute('height', shift > 0 ? H : H - TOP + 8);
  };
  scroller.addEventListener('scroll', pinNames, { passive: true });
  addEventListener('resize', pinNames);
  scroller.scrollLeft = scroller.scrollWidth;
  pinNames();
}
