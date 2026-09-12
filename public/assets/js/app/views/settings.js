/* Pengaturan profil agent & informasi workspace. */

import { $, $$, api, copyText, escapeHtml, initials, toast } from '../../ui.js';
import { store } from '../store.js';

const COLORS = ['#6D5EF8', '#5B48F0', '#9B51E0', '#2D9CDB', '#12B886', '#F5A524', '#FF7A45', '#F2385A'];

export async function renderSettings(host) {
  const me = store.me;
  const account = store.account;

  host.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div>
          <h1>Pengaturan</h1>
          <p>Kelola profil Anda dan informasi workspace.</p>
        </div>
      </div>
      <div class="view-scroll">
        <div class="settings-grid">

          <div class="panel">
            <div class="panel-head"><h3>Profil agent</h3><p>Nama dan warna ini terlihat oleh pengunjung saat Anda membalas.</p></div>
            <div class="panel-body">
              <div class="row gap-16" style="margin-bottom:22px">
                <span class="avatar avatar-lg" id="profilePreview" style="background:${escapeHtml(me.avatarColor)}">${escapeHtml(initials(me.name))}</span>
                <div>
                  <b style="font-family:var(--font-display);font-size:16px;display:block">${escapeHtml(me.name)}</b>
                  <span style="font-size:13px;color:var(--slate-400)">${escapeHtml(me.email)}</span>
                </div>
              </div>
              <div class="field"><label for="pf-name">Nama tampilan</label>
                <input class="input" id="pf-name" value="${escapeHtml(me.name)}"></div>
              <div class="field"><label for="pf-title">Jabatan</label>
                <input class="input" id="pf-title" value="${escapeHtml(me.title)}"></div>
              <div class="field">
                <label>Warna avatar</label>
                <div class="color-row" id="avatarColors">
                  ${COLORS.map((color) => `<button class="color-dot ${color === me.avatarColor ? 'active' : ''}" style="background:${color}" data-color="${color}" aria-label="Warna ${color}"></button>`).join('')}
                </div>
              </div>
            </div>
            <div class="panel-foot">
              <button class="btn btn-primary" id="saveProfile">Simpan profil</button>
            </div>
          </div>

          <div>
            <div class="panel" style="margin-bottom:22px">
              <div class="panel-head"><h3>Workspace</h3><p>Informasi akun dan paket berlangganan.</p></div>
              <div class="panel-body">
                <div class="dt-row"><span class="k">Nama</span><span class="v">${escapeHtml(account.name)}</span></div>
                <div class="dt-row"><span class="k">Paket</span><span class="v"><span class="badge badge-brand">${escapeHtml(account.plan)}</span></span></div>
                <div class="dt-row"><span class="k">Dibuat</span><span class="v">${new Date(account.createdAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}</span></div>
                <div class="dt-row"><span class="k">Peran Anda</span><span class="v">${escapeHtml(me.role)}</span></div>
                <div class="dt-row"><span class="k">Project</span><span class="v">${store.projects.length} website aktif</span></div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-head"><h3>Akses cepat</h3><p>Tautan yang sering dipakai tim.</p></div>
              <div class="panel-body">
                ${store.projects.map((project) => `
                  <div class="setting-row">
                    <div class="sr-text">
                      <b>${escapeHtml(project.name)}</b>
                      <span style="font-family:var(--font-mono);font-size:12px">${escapeHtml(project.licenseKey)}</span>
                    </div>
                    <a class="act-btn" href="/chat/${encodeURIComponent(project.licenseKey)}" target="_blank" rel="noopener">Buka chat</a>
                    <button class="act-btn" data-copy-link="${escapeHtml(project.licenseKey)}">Salin link</button>
                  </div>`).join('')}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>`;

  let pickedColor = me.avatarColor;

  $$('#avatarColors [data-color]').forEach((dot) => dot.addEventListener('click', () => {
    $$('#avatarColors [data-color]').forEach((d) => d.classList.remove('active'));
    dot.classList.add('active');
    pickedColor = dot.dataset.color;
    $('#profilePreview').style.background = pickedColor;
  }));

  $('#pf-name').addEventListener('input', (event) => {
    $('#profilePreview').textContent = initials(event.target.value || '?');
  });

  $('#saveProfile').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { user } = await api('/api/auth/me', {
        method: 'PATCH',
        body: { name: $('#pf-name').value.trim(), title: $('#pf-title').value.trim(), avatarColor: pickedColor },
      });
      store.me = { ...store.me, ...user };
      $('#meAvatar').textContent = initials(user.name);
      $('#meAvatar').style.background = user.avatarColor;
      $('#meName').textContent = user.name;
      toast('Profil diperbarui.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $$('[data-copy-link]').forEach((button) => button.addEventListener('click', async () => {
    await copyText(`${location.origin}/chat/${button.dataset.copyLink}`);
    toast('Direct chat link disalin.', 'success');
  }));
}
