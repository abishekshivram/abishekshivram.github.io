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

const die = document.querySelector('.die');
if (die) {
  drawPads(die.querySelector('.die-pads'));
  drawStraps(die.querySelector('.die-straps'));

  const readout = document.querySelector('.die-readout');
  const roId = readout.querySelector('.ro-id');
  const roName = readout.querySelector('.ro-name');
  const roCap = readout.querySelector('.ro-cap');
  const idle = { id: roId.textContent, name: roName.textContent, cap: roCap.textContent };
  const legendLinks = [...document.querySelectorAll('.die-legend a')];

  function show(blockId) {
    const item = legendLinks.find(a => a.dataset.block === blockId);
    for (const el of document.querySelectorAll('[data-block]')) el.classList.toggle('is-active', el.dataset.block === blockId);
    if (!item) {
      roId.textContent = idle.id;
      roName.textContent = idle.name;
      roCap.textContent = idle.cap;
      readout.classList.remove('is-active');
      return;
    }
    roId.textContent = item.querySelector('.lg-id').textContent;
    roName.textContent = item.querySelector('.lg-name').textContent;
    roCap.textContent = item.querySelector('.lg-cap').textContent;
    readout.classList.add('is-active');
  }

  for (const el of document.querySelectorAll('.die [data-block], .die-legend [data-block]')) {
    el.addEventListener('pointerenter', () => show(el.dataset.block));
    el.addEventListener('pointerleave', () => show(null));
    el.addEventListener('focus', () => show(el.dataset.block));
    el.addEventListener('blur', () => show(null));
    el.addEventListener('click', event => {
      const target = document.querySelector(el.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      history.pushState(null, '', el.getAttribute('href'));
      target.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      flash(target);
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
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
