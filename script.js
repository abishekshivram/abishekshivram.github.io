const WEB3FORMS_ACCESS_KEY = '06aaaafa-e042-4db3-b76c-c989c2615a61';
const EMAIL = 'abishekshivramam@gmail.com';

const root = document.documentElement;
const prefersDark = matchMedia('(prefers-color-scheme: dark)');
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
  const animate = document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animate) document.startViewTransition(() => setTheme(next));
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
