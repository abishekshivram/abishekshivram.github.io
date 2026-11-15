const WEB3FORMS_ACCESS_KEY = '06aaaafa-e042-4db3-b76c-c989c2615a61';
const EMAIL = 'abishekshivramam@gmail.com';

const root = document.documentElement;
const prefersDark = matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const themeToggle = document.querySelector('.theme-toggle');

function systemTheme() {
  return prefersDark.matches ? 'dark' : 'light';
}

function currentTheme() {
  return root.dataset.theme ?? systemTheme();
}

function syncThemeToggle() {
  const label = `Switch to ${currentTheme() === 'dark' ? 'light' : 'dark'} theme`;
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
}

function setTheme(theme) {
  // Picking the system theme drops the override so the page follows the OS again.
  const override = theme === systemTheme() ? null : theme;
  if (override) root.dataset.theme = override;
  else delete root.dataset.theme;
  try {
    if (override) localStorage.setItem('theme', override);
    else localStorage.removeItem('theme');
  } catch {}
  syncThemeToggle();
}

themeToggle.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  if (document.startViewTransition && !reducedMotion.matches) document.startViewTransition(() => setTheme(next));
  else setTheme(next);
});
prefersDark.addEventListener('change', syncThemeToggle);
syncThemeToggle();

const phoneDialog = document.getElementById('phone-dialog');
const phoneForm = phoneDialog.querySelector('form');
const formStatus = phoneDialog.querySelector('.form-status');
const submitButton = phoneForm.querySelector('[type="submit"]');

for (const trigger of document.querySelectorAll('[data-phone-request]')) {
  trigger.addEventListener('click', event => {
    event.preventDefault();
    phoneDialog.showModal();
  });
}
phoneDialog.querySelector('[data-close]').addEventListener('click', () => phoneDialog.close());
phoneDialog.addEventListener('close', () => formStatus.replaceChildren());

phoneForm.addEventListener('submit', async event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(phoneForm));
  const company = fields.company.trim();
  submitButton.disabled = true;
  formStatus.textContent = 'Sending…';
  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...fields,
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: `Phone number request from ${fields.name}${company ? ` (${company})` : ''}`,
        from_name: 'abishekshivram.github.io',
      }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    phoneForm.reset();
    formStatus.textContent = `Thanks, I'll get back to you at ${fields.email}.`;
  } catch (error) {
    console.error(error);
    const link = Object.assign(document.createElement('a'), { href: `mailto:${EMAIL}`, textContent: EMAIL });
    formStatus.replaceChildren("Sorry, that didn't send. Please email me at ", link, '.');
  } finally {
    submitButton.disabled = false;
  }
});

// Whole years since a YYYY-MM start, so tenure figures never go stale.
for (const el of document.querySelectorAll('[data-years-since]')) {
  const [year, month] = el.dataset.yearsSince.split('-').map(Number);
  const now = new Date();
  const months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  if (months >= 12) el.textContent = String(Math.floor(months / 12));
}

const tocLinks = [...document.querySelectorAll('.toc ol a')];
const sections = tocLinks.map(link => document.querySelector(link.hash)).filter(Boolean);

// A section the reader just jumped to stays marked until they scroll on their own,
// even when the next section is short and also near the top of the window.
let pinned = null;

function setCurrent(id) {
  for (const link of tocLinks) {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}

function markCurrentSection() {
  if (pinned) return setCurrent(pinned);
  const line = innerHeight * 0.3;
  let current = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= line) current = section;
  }
  setCurrent(current.id);
}

for (const link of tocLinks) {
  link.addEventListener('click', () => {
    pinned = link.hash.slice(1);
    setCurrent(pinned);
  });
}
for (const type of ['wheel', 'touchstart', 'keydown']) {
  addEventListener(type, () => { pinned = null; }, { passive: true });
}

let frame = 0;
addEventListener('scroll', () => {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; markCurrentSection(); });
}, { passive: true });
addEventListener('resize', markCurrentSection);
markCurrentSection();

// Pins in the package drawing light up their row in the pin table, and vice versa.
for (const pin of document.querySelectorAll('[data-pin]')) {
  const name = pin.dataset.pin;
  const peers = document.querySelectorAll(`[data-pin="${name}"]`);
  const on = () => peers.forEach(el => el.classList.add('is-lit'));
  const off = () => peers.forEach(el => el.classList.remove('is-lit'));
  pin.addEventListener('pointerenter', on);
  pin.addEventListener('pointerleave', off);
  pin.addEventListener('focusin', on);
  pin.addEventListener('focusout', off);
}
