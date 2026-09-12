/* Kelola balasan cepat (canned responses). */

import { $, api, escapeHtml, toast } from '../../ui.js';
import { loadCanned, store } from '../store.js';

export async function renderCanned(host) {
  host.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div>
          <h1>Balasan Cepat</h1>
          <p>Ketik <b class="kbd">#</b> di kolom balasan untuk menyisipkan template ini.</p>
        </div>
        <div class="spacer"></div>
        <button class="btn btn-primary btn-sm" id="addCanned">+ Balasan baru</button>
      </div>
      <div class="view-scroll">
        <div class="table-card" id="cannedList">
          <div class="empty-state"><div class="spinner spinner-dark" style="margin:0 auto"></div></div>
        </div>
      </div>
    </div>`;

  $('#addCanned').addEventListener('click', () => openEditor());
  await refresh();
}

async function refresh() {
  try {
    await loadCanned();
    paint();
  } catch (error) {
    $('#cannedList').innerHTML = `<div class="empty-state"><h3>Gagal memuat</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function paint() {
  const host = $('#cannedList');
  if (!store.canned.length) {
    host.innerHTML = `
      <div class="empty-state">
        <div class="es-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <h3>Belum ada balasan cepat</h3>
        <p>Buat template untuk pertanyaan yang paling sering masuk agar tim membalas lebih cepat.</p>
      </div>`;
    return;
  }

  host.innerHTML = store.canned.map((item) => `
    <div class="list-row">
      <span class="badge badge-brand" style="font-family:var(--font-mono)">${escapeHtml(item.shortcut)}</span>
      <div class="lr-main">
        <b>${escapeHtml(item.title)}</b>
        <span>${escapeHtml(item.body)}</span>
      </div>
      <div class="lr-actions">
        <button class="act-btn" data-edit="${item.id}">Ubah</button>
        <button class="act-btn danger" data-del="${item.id}">Hapus</button>
      </div>
    </div>`).join('');

  host.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () =>
    openEditor(store.canned.find((c) => c.id === button.dataset.edit))));

  host.querySelectorAll('[data-del]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Hapus balasan cepat ini?')) return;
    try {
      await api(`/api/canned/${button.dataset.del}`, { method: 'DELETE' });
      await refresh();
      toast('Balasan cepat dihapus.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  }));
}

function openEditor(item = null) {
  const modal = $('#modalHost');
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>${item ? 'Ubah balasan cepat' : 'Balasan cepat baru'}</h3>
        <p>Gunakan shortcut pendek agar mudah diingat saat mengetik.</p>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="cr-title">Judul</label>
          <input class="input" id="cr-title" placeholder="Info ongkir" value="${escapeHtml(item?.title || '')}">
        </div>
        <div class="field">
          <label for="cr-shortcut">Shortcut</label>
          <input class="input" id="cr-shortcut" placeholder="#ongkir" value="${escapeHtml(item?.shortcut || '')}">
          <span class="hint">Diawali tanda pagar, tanpa spasi. Contoh: <code>#ongkir</code></span>
        </div>
        <div class="field">
          <label for="cr-body">Isi balasan</label>
          <textarea class="textarea" id="cr-body" placeholder="Tulis template balasan…">${escapeHtml(item?.body || '')}</textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-cancel>Batal</button>
        <button class="btn btn-primary" data-save>${item ? 'Simpan' : 'Tambahkan'}</button>
      </div>
    </div>`;
  modal.classList.add('show');

  const close = () => { modal.classList.remove('show'); setTimeout(() => { modal.innerHTML = ''; }, 220); };
  modal.querySelector('[data-cancel]').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });

  modal.querySelector('[data-save]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const payload = {
      title: $('#cr-title').value.trim(),
      shortcut: $('#cr-shortcut').value.trim(),
      body: $('#cr-body').value.trim(),
    };
    if (!payload.title || !payload.body) return toast('Judul dan isi balasan wajib diisi.', 'error');

    button.disabled = true;
    try {
      if (item) await api(`/api/canned/${item.id}`, { method: 'PATCH', body: payload });
      else await api('/api/canned', { method: 'POST', body: payload });
      close();
      await refresh();
      toast('Balasan cepat tersimpan.', 'success');
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });

  setTimeout(() => $('#cr-title').focus(), 140);
}
