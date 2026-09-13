/* Widget & Kode: license key, snippet pemasangan, dan kustomisasi widget. */

import { $, $$, api, copyText, escapeHtml, toast } from '../../ui.js';
import { store } from '../store.js';

const COLORS = ['#6D5EF8', '#5B48F0', '#9B51E0', '#2D9CDB', '#12B886', '#F5A524', '#FF7A45', '#F2385A', '#131730'];

let projects = [];
let current = null;
let dirty = false;

export async function renderInstall(host) {
  host.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div>
          <h1>Widget &amp; Kode Pemasangan</h1>
          <p>Pasang live chat di website Anda, atau bagikan direct chat link.</p>
        </div>
        <div class="spacer"></div>
        <select class="select" id="projectPicker" style="width:230px;height:40px"></select>
        <button class="btn btn-ghost btn-sm" id="newProject">+ Project baru</button>
      </div>
      <div class="view-scroll" id="installBody">
        <div class="empty-state"><div class="spinner spinner-dark" style="margin:0 auto"></div></div>
      </div>
    </div>`;

  try {
    const data = await api('/api/projects');
    projects = data.projects;
    current = projects[0];
  } catch (error) {
    $('#installBody').innerHTML = `<div class="empty-state"><h3>Gagal memuat</h3><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }

  const picker = $('#projectPicker');
  picker.innerHTML = projects.map((project) =>
    `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('');
  picker.addEventListener('change', () => {
    current = projects.find((p) => p.id === picker.value);
    paint();
  });

  $('#newProject').addEventListener('click', createProject);
  paint();
}

async function createProject() {
  const name = prompt('Nama project / website baru:');
  if (!name?.trim()) return;
  try {
    const { project } = await api('/api/projects', { method: 'POST', body: { name: name.trim() } });
    projects.push(project);
    current = project;
    $('#projectPicker').innerHTML = projects.map((p) =>
      `<option value="${p.id}" ${p.id === current.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    paint();
    toast('Project baru dibuat beserta license key-nya.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

/* ---------------------------------------------------------------------- */

function paint() {
  const settings = current.settings;

  $('#installBody').innerHTML = `
    <!-- License & snippet -->
    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head">
        <h3>1. License key Anda</h3>
        <p>Kunci unik yang menghubungkan widget di website dengan workspace ini.</p>
      </div>
      <div class="panel-body">
        <div class="license-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B48F0" stroke-width="2" stroke-linecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/></svg>
          <code id="licenseText">${escapeHtml(current.licenseKey)}</code>
          <button class="btn btn-soft btn-sm" data-copy-text="${escapeHtml(current.licenseKey)}">Salin</button>
          <button class="btn btn-ghost btn-sm" id="regenKey">Buat ulang</button>
        </div>
        <p class="hint" style="margin-top:10px">Membuat ulang kunci akan menonaktifkan snippet lama di semua website.</p>
      </div>
    </div>

    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head">
        <h3>2. Pilih cara pemasangan</h3>
        <p>Gunakan salah satu — semuanya terhubung ke inbox yang sama.</p>
      </div>
      <div class="panel-body">
        <div class="code-tabs" style="margin-bottom:0">
          <button class="ct active" data-snip="script">Script HTML</button>
          <button class="ct" data-snip="link">Direct Link</button>
          <button class="ct" data-snip="react">React / Next.js</button>
          <button class="ct" data-snip="iframe">iFrame</button>
        </div>
        <div class="snippet-box">
          <button class="snippet-copy" id="snippetCopy">Salin</button>
          <pre><code id="snippetCode"></code></pre>
        </div>
        <div id="snippetNote" style="margin-top:14px"></div>
      </div>
    </div>

    <!-- Kustomisasi -->
    <div class="settings-grid">
      <div class="panel">
        <div class="panel-head">
          <h3>3. Kustomisasi tampilan widget</h3>
          <p>Perubahan langsung terlihat di pratinjau sebelah kanan.</p>
        </div>
        <div class="panel-body">
          <div class="field">
            <label>Warna utama</label>
            <div class="color-row" id="colorRow">
              ${COLORS.map((color) => `<button class="color-dot ${color === settings.themeColor ? 'active' : ''}" style="background:${color}" data-color="${color}" aria-label="Warna ${color}"></button>`).join('')}
              <input type="color" class="color-dot" id="customColor" value="${escapeHtml(settings.themeColor)}" style="padding:0;border:none" aria-label="Warna kustom">
            </div>
          </div>

          <div class="setting-row">
            <div class="sr-text"><b>Gradien warna</b><span>Tampilan lebih modern dengan gradasi lembut.</span></div>
            <label class="switch"><input type="checkbox" data-set="useGradient" ${settings.useGradient ? 'checked' : ''}><span class="track"></span></label>
          </div>

          <div class="setting-row">
            <div class="sr-text"><b>Posisi widget</b><span>Sudut tempat tombol chat muncul.</span></div>
            <div class="seg" id="positionSeg">
              <button data-pos="left" class="${settings.position === 'left' ? 'active' : ''}">Kiri</button>
              <button data-pos="right" class="${settings.position === 'right' ? 'active' : ''}">Kanan</button>
            </div>
          </div>

          <hr class="divider">

          <div class="field">
            <label for="f-company">Nama yang ditampilkan</label>
            <input class="input" id="f-company" data-set="companyName" value="${escapeHtml(settings.companyName)}">
          </div>
          <div class="field">
            <label for="f-tagline">Tagline</label>
            <input class="input" id="f-tagline" data-set="tagline" value="${escapeHtml(settings.tagline)}">
          </div>
          <div class="row gap-12">
            <div class="field grow">
              <label for="f-emoji">Avatar (emoji)</label>
              <input class="input" id="f-emoji" data-set="avatarEmoji" maxlength="4" value="${escapeHtml(settings.avatarEmoji)}">
            </div>
            <div class="field grow">
              <label for="f-label">Teks tombol</label>
              <input class="input" id="f-label" data-set="launcherLabel" value="${escapeHtml(settings.launcherLabel)}">
            </div>
          </div>
          <div class="field">
            <label for="f-welcome">Pesan sambutan</label>
            <textarea class="textarea" id="f-welcome" data-set="welcomeMessage" style="min-height:76px">${escapeHtml(settings.welcomeMessage)}</textarea>
          </div>
          <div class="field">
            <label for="f-offline">Pesan saat tim offline</label>
            <textarea class="textarea" id="f-offline" data-set="offlineMessage" style="min-height:76px">${escapeHtml(settings.offlineMessage)}</textarea>
          </div>

          <hr class="divider">

          <div class="setting-row">
            <div class="sr-text"><b>Form sebelum chat</b><span>Minta nama &amp; email sebelum percakapan dimulai.</span></div>
            <label class="switch"><input type="checkbox" data-set="preChatForm" ${settings.preChatForm ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="setting-row">
            <div class="sr-text"><b>Email wajib diisi</b><span>Berguna untuk menindaklanjuti chat yang terputus.</span></div>
            <label class="switch"><input type="checkbox" data-set="preChatRequireEmail" ${settings.preChatRequireEmail ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="setting-row">
            <div class="sr-text"><b>Sapaan proaktif</b><span>Muncul otomatis setelah pengunjung beberapa detik di halaman.</span></div>
            <label class="switch"><input type="checkbox" data-set="proactiveEnabled" ${settings.proactiveEnabled ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="field" style="margin-top:12px">
            <label for="f-proactive">Isi sapaan proaktif</label>
            <input class="input" id="f-proactive" data-set="proactiveMessage" value="${escapeHtml(settings.proactiveMessage)}">
          </div>
          <div class="field">
            <label for="f-delay">Tampil setelah (detik)</label>
            <input class="input" id="f-delay" type="number" min="2" max="120" data-set="proactiveDelay" value="${Number(settings.proactiveDelay)}">
          </div>
          <hr class="divider">

          <div class="setting-row">
            <div class="sr-text"><b>Eyecatcher</b><span>Gambar atau banner penarik perhatian di atas tombol chat.</span></div>
            <label class="switch"><input type="checkbox" data-set="eyecatcherEnabled" ${settings.eyecatcherEnabled ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="field" style="margin-top:12px">
            <label for="f-eye-img">URL gambar eyecatcher</label>
            <input class="input" id="f-eye-img" data-set="eyecatcherImageUrl" placeholder="https://situsanda.com/img/promo.png" value="${escapeHtml(settings.eyecatcherImageUrl)}">
            <span class="hint">Kosongkan bila ingin banner teks saja. Ukuran ideal 480×320 px, hanya http/https.</span>
          </div>
          <div class="field">
            <label for="f-eye-text">Teks eyecatcher</label>
            <input class="input" id="f-eye-text" data-set="eyecatcherText" value="${escapeHtml(settings.eyecatcherText)}">
          </div>
          <div class="row gap-12">
            <div class="field grow">
              <label for="f-eye-delay">Tampil setelah (detik)</label>
              <input class="input" id="f-eye-delay" type="number" min="0" max="120" data-set="eyecatcherDelay" value="${Number(settings.eyecatcherDelay)}">
            </div>
          </div>
          <div class="setting-row">
            <div class="sr-text"><b>Tampilkan sekali per sesi</b><span>Setelah ditutup pengunjung, tidak muncul lagi sampai tab dibuka ulang.</span></div>
            <label class="switch"><input type="checkbox" data-set="eyecatcherOncePerSession" ${settings.eyecatcherOncePerSession ? 'checked' : ''}><span class="track"></span></label>
          </div>

          <hr class="divider">

          <div class="setting-row">
            <div class="sr-text"><b>Rating percakapan</b><span>Pengunjung menilai chat setelah selesai.</span></div>
            <label class="switch"><input type="checkbox" data-set="ratingEnabled" ${settings.ratingEnabled ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="setting-row">
            <div class="sr-text"><b>Suara notifikasi</b><span>Bunyi singkat saat ada pesan baru.</span></div>
            <label class="switch"><input type="checkbox" data-set="soundEnabled" ${settings.soundEnabled ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="setting-row">
            <div class="sr-text"><b>Tampilkan branding</b><span>Tulisan “Didukung oleh NagaLiveChat” di bawah widget.</span></div>
            <label class="switch"><input type="checkbox" data-set="showBranding" ${settings.showBranding ? 'checked' : ''}><span class="track"></span></label>
          </div>
        </div>
        <div class="panel-foot">
          <button class="btn btn-primary" id="saveSettings">Simpan perubahan</button>
          <span class="hint" id="saveHint">Belum ada perubahan.</span>
        </div>
      </div>

      <!-- Pratinjau -->
      <div>
        <div class="preview-wrap">
          <div class="preview-label">Pratinjau langsung</div>
          <div class="preview-frame" id="preview"></div>
          <div class="pv-eye" id="previewEye"></div>
          <div class="pv-launcher" id="previewLauncher"></div>
        </div>

        <div class="panel" style="margin-top:22px">
          <div class="panel-head"><h3>QR direct chat</h3><p>Cetak untuk toko fisik, katalog, atau kartu nama.</p></div>
          <div class="panel-body">
            <div class="qr-card">
              <img class="qr" src="/api/projects/${current.id}/qr.svg" alt="QR code direct chat link" loading="lazy">
              <div>
                <p class="hint" style="margin:0 0 10px">Arahkan kamera ponsel ke kode ini untuk membuka ruang chat Anda.</p>
                <a class="btn btn-ghost btn-sm" href="/api/projects/${current.id}/qr.svg" download="qr-nagalivechat.svg">Unduh SVG</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  bindSnippets();
  bindCustomizer();
  paintPreview();
}

/* ------------------------------ Snippet ------------------------------- */
function snippetFor(kind) {
  const install = current.install;
  return {
    script: install.scriptTag,
    link: install.directLink,
    react: `useEffect(() => {\n  const s = document.createElement('script');\n  s.src = '${new URL(install.directLink).origin}/widget.js';\n  s.dataset.license = '${current.licenseKey}';\n  s.async = true;\n  document.body.appendChild(s);\n  return () => s.remove();\n}, []);`,
    iframe: install.iframeSnippet,
  }[kind];
}

const SNIPPET_NOTES = {
  script: 'Tempel tepat sebelum tag <code>&lt;/body&gt;</code> pada setiap halaman yang ingin dipasangi live chat. Berlaku untuk HTML statis, WordPress, Shopify, Laravel, dan Webflow.',
  link: 'Bagikan tautan ini di bio Instagram, WhatsApp, tanda tangan email, atau QR code. Pengunjung tidak perlu punya akun untuk memulai chat.',
  react: 'Letakkan di dalam komponen root (mis. <code>app/layout.tsx</code> atau <code>_app.jsx</code>) agar widget dimuat sekali saja.',
  iframe: 'Gunakan bila Anda ingin chat tertanam langsung di dalam halaman, bukan sebagai tombol mengambang.',
};

function bindSnippets() {
  const code = $('#snippetCode');
  const note = $('#snippetNote');
  let active = 'script';

  const paintSnippet = () => {
    code.textContent = snippetFor(active);
    note.innerHTML = `<p class="hint" style="margin:0">${SNIPPET_NOTES[active]}</p>`;
  };
  paintSnippet();

  $$('[data-snip]').forEach((tab) => tab.addEventListener('click', () => {
    $$('[data-snip]').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    active = tab.dataset.snip;
    paintSnippet();
  }));

  $('#snippetCopy').addEventListener('click', async (event) => {
    await copyText(snippetFor(active));
    const button = event.currentTarget;
    button.textContent = 'Tersalin ✓';
    button.classList.add('done');
    setTimeout(() => { button.textContent = 'Salin'; button.classList.remove('done'); }, 1800);
  });

  $$('[data-copy-text]').forEach((button) => button.addEventListener('click', async () => {
    await copyText(button.dataset.copyText);
    toast('Disalin ke clipboard.', 'success');
  }));

  $('#regenKey').addEventListener('click', async () => {
    if (!confirm('Buat ulang license key? Snippet lama akan berhenti berfungsi.')) return;
    try {
      const { project } = await api(`/api/projects/${current.id}/regenerate-key`, { method: 'POST' });
      const index = projects.findIndex((p) => p.id === project.id);
      projects[index] = project;
      current = project;
      paint();
      toast('License key baru dibuat. Perbarui snippet di website Anda.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  });
}

/* ---------------------------- Kustomisasi ----------------------------- */
function bindCustomizer() {
  const markDirty = () => {
    dirty = true;
    $('#saveHint').textContent = 'Ada perubahan yang belum disimpan.';
    $('#saveHint').style.color = 'var(--warning-500)';
  };

  $$('[data-set]').forEach((input) => {
    const event = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(event, () => {
      const key = input.dataset.set;
      current.settings[key] = input.type === 'checkbox' ? input.checked
        : (input.type === 'number' ? Number(input.value) : input.value);
      markDirty();
      paintPreview();
    });
  });

  $$('[data-color]').forEach((dot) => dot.addEventListener('click', () => {
    $$('[data-color]').forEach((d) => d.classList.remove('active'));
    dot.classList.add('active');
    current.settings.themeColor = dot.dataset.color;
    $('#customColor').value = dot.dataset.color;
    markDirty();
    paintPreview();
  }));

  $('#customColor').addEventListener('input', (event) => {
    $$('[data-color]').forEach((d) => d.classList.remove('active'));
    current.settings.themeColor = event.target.value;
    markDirty();
    paintPreview();
  });

  $$('[data-pos]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-pos]').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    current.settings.position = button.dataset.pos;
    markDirty();
    paintPreview();
  }));

  $('#saveSettings').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { project } = await api(`/api/projects/${current.id}`, {
        method: 'PATCH',
        body: { settings: current.settings },
      });
      const index = projects.findIndex((p) => p.id === project.id);
      projects[index] = project;
      current = project;
      dirty = false;
      $('#saveHint').textContent = 'Tersimpan. Widget di website akan ikut berubah.';
      $('#saveHint').style.color = 'var(--success-500)';
      toast('Pengaturan widget tersimpan.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

/* ----------------------------- Pratinjau ------------------------------ */
function paintPreview() {
  const settings = current.settings;
  const color = settings.themeColor || '#6D5EF8';
  const header = settings.useGradient
    ? `linear-gradient(135deg, ${shade(color, 14)} 0%, ${color} 60%, ${shade(color, -12)} 100%)`
    : color;

  $('#preview').innerHTML = `
    <div class="pv-head" style="background:${header}">
      <div class="pv-top">
        <div class="pv-av">${escapeHtml(settings.avatarEmoji || '💬')}</div>
        <div><b>${escapeHtml(settings.companyName || 'Live Chat')}</b><i>${escapeHtml(settings.tagline || '')}</i></div>
      </div>
    </div>
    <div class="pv-body">
      <div class="pv-bub" style="border-radius:14px 14px 14px 5px">${escapeHtml(settings.welcomeMessage || '')}</div>
      <div class="pv-bub out" style="background:${header};border-radius:14px 14px 5px 14px">Halo, saya mau tanya 🙌</div>
    </div>
    <div class="pv-foot">${escapeHtml(settings.placeholder || 'Tulis pesan Anda…')}</div>
    ${settings.showBranding ? '<div class="pv-foot" style="text-align:center;font-size:11px;border-top:0;padding-top:0">Didukung oleh NagaLiveChat</div>' : ''}`;

  const eye = $('#previewEye');
  const eyeUrl = String(settings.eyecatcherImageUrl || '').trim();
  const eyeVisible = settings.eyecatcherEnabled && (eyeUrl || settings.eyecatcherText);
  eye.style.display = eyeVisible ? 'block' : 'none';
  eye.style.justifySelf = settings.position === 'left' ? 'start' : 'end';
  eye.innerHTML = eyeVisible
    ? `${/^(https?:\/\/|\/)/i.test(eyeUrl) ? `<img src="${escapeHtml(eyeUrl)}" alt="" loading="lazy">` : ''}
       ${settings.eyecatcherText ? `<span style="border-left:4px solid ${color}">${escapeHtml(settings.eyecatcherText)}</span>` : ''}`
    : '';

  const launcher = $('#previewLauncher');
  launcher.style.flexDirection = settings.position === 'left' ? 'row-reverse' : 'row';
  launcher.innerHTML = `
    ${settings.showLauncherLabel && settings.launcherLabel ? `<span class="pvl-label">${escapeHtml(settings.launcherLabel)}</span>` : ''}
    <span class="pvl-btn" style="background:${header}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    </span>`;
}

function shade(hex, percent) {
  let clean = String(hex || '').replace('#', '');
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  const int = parseInt(clean, 16);
  if (Number.isNaN(int)) return hex;
  const amount = Math.round(255 * percent / 100);
  const clamp = (value) => Math.max(0, Math.min(255, value));
  return `#${[clamp(((int >> 16) & 255) + amount), clamp(((int >> 8) & 255) + amount), clamp((int & 255) + amount)]
    .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
