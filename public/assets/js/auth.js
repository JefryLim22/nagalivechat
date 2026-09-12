import { $, api } from './ui.js';

const alertBox = $('#alert');
const alertText = $('#alertText');
const submitBtn = $('#submitBtn');

function showError(message) {
  alertText.textContent = message;
  alertBox.classList.add('show');
  alertBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
const clearError = () => alertBox.classList.remove('show');

function setLoading(loading, label) {
  submitBtn.disabled = loading;
  submitBtn.innerHTML = loading ? '<span class="spinner"></span> Memproses…' : label;
}

/* Tombol lihat/sembunyikan password */
const pwToggle = $('#pwToggle');
pwToggle?.addEventListener('click', () => {
  const input = $('#password');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  pwToggle.setAttribute('aria-label', visible ? 'Tampilkan password' : 'Sembunyikan password');
  pwToggle.innerHTML = visible
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="m1 1 22 22"/></svg>';
  input.focus();
});

/* ------------------------------ Login ------------------------------ */
$('#loginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) return showError('Email dan password wajib diisi.');

  setLoading(true);
  try {
    await api('/api/auth/login', { method: 'POST', body: { email, password } });
    location.href = '/app';
  } catch (error) {
    showError(error.message);
    setLoading(false, 'Masuk ke workspace');
  }
});

$('#fillDemo')?.addEventListener('click', () => {
  $('#email').value = 'demo@nagalivechat.com';
  $('#password').value = 'demo12345';
  $('#loginForm').requestSubmit();
});

/* ----------------------------- Signup ------------------------------ */
$('#signupForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const payload = {
    name: $('#name').value.trim(),
    company: $('#company').value.trim(),
    email: $('#email').value.trim(),
    password: $('#password').value,
  };
  if (!payload.name) return showError('Nama lengkap wajib diisi.');
  if (!payload.email) return showError('Email wajib diisi.');
  if (payload.password.length < 8) return showError('Password minimal 8 karakter.');

  setLoading(true);
  try {
    await api('/api/auth/signup', { method: 'POST', body: payload });
    location.href = '/app?welcome=1';
  } catch (error) {
    showError(error.message);
    setLoading(false, 'Buat akun &amp; ambil license key');
  }
});
