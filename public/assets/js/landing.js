import { $, $$, copyText } from './ui.js';

/* Navbar: efek glass saat di-scroll + menu mobile */
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 12);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

const toggle = $('#navToggle');
const links = $('.nav-links');
toggle?.addEventListener('click', () => {
  const open = links.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
});
$$('.nav-links a').forEach((link) => link.addEventListener('click', () => {
  links.classList.remove('is-open');
  toggle?.setAttribute('aria-expanded', 'false');
}));

/* Tab snippet pemasangan */
$$('.ct').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.ct').forEach((t) => t.classList.remove('active'));
    $$('.code-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`[data-pane="${tab.dataset.tab}"]`)?.classList.add('active');
  });
});

/* Tombol salin kode */
$('[data-copy]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const pane = $('.code-pane.active code');
  if (!pane) return;
  await copyText(pane.innerText);
  button.textContent = 'Tersalin ✓';
  button.classList.add('done');
  setTimeout(() => { button.textContent = 'Salin'; button.classList.remove('done'); }, 1900);
});

/* Animasi angka statistik */
const animateCount = (element) => {
  const target = Number(element.dataset.count);
  const duration = 1300;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased).toLocaleString('id-ID');
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/* Reveal on scroll + trigger counter */
const revealTargets = $$('.section-head, .bento-card, .step, .quote, .price-card, .faq details, .install-copy, .install-demo');
revealTargets.forEach((element, index) => {
  element.classList.add('reveal');
  element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
});

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('in');
    if (entry.target.dataset.count !== undefined) animateCount(entry.target);
    observer.unobserve(entry.target);
  }
}, { threshold: 0.12, rootMargin: '0px 0px -40px' });

[...revealTargets, ...$$('[data-count]')].forEach((element) => observer.observe(element));

/* Tahun berjalan di footer */
const year = $('#year');
if (year) year.textContent = String(new Date().getFullYear());
