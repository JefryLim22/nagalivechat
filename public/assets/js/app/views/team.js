/* Kelola anggota tim agent. */

import { $, api, escapeHtml, initials, timeAgo, toast } from '../../ui.js';
import { loadTeam, store } from '../store.js';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', agent: 'Agent' };
const PRESENCE_LABEL = { online: 'Online', away: 'Away', offline: 'Offline' };

export async function renderTeam(host) {
  const canManage = ['owner', 'admin'].includes(store.me.role);

  host.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div>
          <h1>Tim Agent</h1>
          <p>Setiap agent punya akun sendiri dan bisa membalas chat secara bersamaan.</p>
        </div>
        <div class="spacer"></div>
        ${canManage ? '<button class="btn btn-primary btn-sm" id="addMember">+ Tambah agent</button>' : ''}
      </div>
      <div class="view-scroll">
        <div class="table-card" id="teamList">
          <div class="empty-state"><div class="spinner spinner-dark" style="margin:0 auto"></div></div>
        </div>
      </div>
    </div>`;

  $('#addMember')?.addEventListener('click', openEditor);
  await refresh();
}

async function refresh() {
  try {
    await loadTeam();
    paint();
  } catch (error) {
    $('#teamList').innerHTML = `<div class="empty-state"><h3>Gagal memuat tim</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function paint() {
  const canManage = ['owner', 'admin'].includes(store.me.role);

  $('#teamList').innerHTML = `
    <table class="data">
      <thead><tr><th>Agent</th><th>Peran</th><th>Status</th><th>Chat aktif</th>${canManage ? '<th></th>' : ''}</tr></thead>
      <tbody>
        ${store.team.map((member) => `
          <tr>
            <td>
              <div class="row gap-12">
                <span class="avatar avatar-ring ${member.presence === 'online' ? 'is-online' : member.presence === 'away' ? 'is-away' : ''}"
                      style="background:${escapeHtml(member.avatarColor)}">${escapeHtml(initials(member.name))}</span>
                <div>
                  <b style="font-family:var(--font-display);font-size:14.5px">${escapeHtml(member.name)}</b>
                  <div style="font-size:12.8px;color:var(--slate-400)">${escapeHtml(member.email)} · ${escapeHtml(member.title)}</div>
                </div>
              </div>
            </td>
            <td><span class="badge ${member.role === 'owner' ? 'badge-brand' : ''}">${ROLE_LABEL[member.role]}</span></td>
            <td>
              <span class="badge ${member.presence === 'online' ? 'badge-success' : member.presence === 'away' ? 'badge-warning' : ''} badge-dot">
                ${PRESENCE_LABEL[member.presence]}
              </span>
              ${member.lastSeenAt && member.presence === 'offline'
                ? `<div style="font-size:11.5px;color:var(--slate-300);margin-top:3px">Terakhir ${timeAgo(member.lastSeenAt)}</div>` : ''}
            </td>
            <td><b style="font-family:var(--font-display)">${member.activeChats}</b></td>
            ${canManage ? `<td style="text-align:right">
              ${member.role === 'owner' || member.id === store.me.id ? ''
                : `<button class="act-btn danger" data-del="${member.id}">Hapus</button>`}
            </td>` : ''}
          </tr>`).join('')}
      </tbody>
    </table>`;

  $('#teamList').querySelectorAll('[data-del]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Hapus agent ini dari workspace?')) return;
    try {
      await api(`/api/team/${button.dataset.del}`, { method: 'DELETE' });
      await refresh();
      toast('Agent dihapus.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  }));
}

function openEditor() {
  const modal = $('#modalHost');
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>Tambah agent</h3>
        <p>Agent baru bisa langsung masuk memakai email dan password ini.</p>
      </div>
      <div class="modal-body">
        <div class="field"><label for="tm-name">Nama lengkap</label>
          <input class="input" id="tm-name" placeholder="Sinta Maharani"></div>
        <div class="field"><label for="tm-email">Email</label>
          <input class="input" id="tm-email" type="email" placeholder="sinta@perusahaan.com"></div>
        <div class="field"><label for="tm-title">Jabatan</label>
          <input class="input" id="tm-title" placeholder="Customer Care" value="Support Agent"></div>
        <div class="field"><label for="tm-role">Peran</label>
          <select class="select" id="tm-role">
            <option value="agent">Agent — hanya membalas chat</option>
            <option value="admin">Admin — bisa kelola tim &amp; project</option>
          </select></div>
        <div class="field"><label for="tm-pass">Password awal</label>
          <input class="input" id="tm-pass" type="text" placeholder="Minimal 8 karakter">
          <span class="hint">Bagikan ke agent lewat kanal internal, minta segera diganti.</span></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-cancel>Batal</button>
        <button class="btn btn-primary" data-save>Tambahkan agent</button>
      </div>
    </div>`;
  modal.classList.add('show');

  const close = () => { modal.classList.remove('show'); setTimeout(() => { modal.innerHTML = ''; }, 220); };
  modal.querySelector('[data-cancel]').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });

  modal.querySelector('[data-save]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const payload = {
      name: $('#tm-name').value.trim(),
      email: $('#tm-email').value.trim(),
      title: $('#tm-title').value.trim(),
      role: $('#tm-role').value,
      password: $('#tm-pass').value,
    };
    button.disabled = true;
    try {
      await api('/api/team', { method: 'POST', body: payload });
      close();
      await refresh();
      toast('Agent baru ditambahkan.', 'success');
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });

  setTimeout(() => $('#tm-name').focus(), 140);
}
