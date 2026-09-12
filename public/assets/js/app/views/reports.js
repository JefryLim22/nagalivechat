/* Laporan performa tim support. */

import { $, $$, api, escapeHtml, formatDuration, initials } from '../../ui.js';

const RANGES = [['24h', '24 jam'], ['7d', '7 hari'], ['30d', '30 hari'], ['90d', '90 hari']];

export async function renderReports(host) {
  host.innerHTML = `
    <div class="view">
      <div class="page-head">
        <div>
          <h1>Laporan</h1>
          <p>Ukur beban kerja, kecepatan respons, dan kepuasan pelanggan.</p>
        </div>
        <div class="spacer"></div>
        <div class="seg" id="rangeSeg">
          ${RANGES.map(([key, label], index) =>
            `<button data-range="${key}" class="${index === 1 ? 'active' : ''}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="view-scroll" id="reportBody">
        <div class="empty-state"><div class="spinner spinner-dark" style="margin:0 auto"></div></div>
      </div>
    </div>`;

  $$('[data-range]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-range]').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    load(button.dataset.range);
  }));

  load('7d');
}

async function load(range) {
  const host = $('#reportBody');
  try {
    const data = await api(`/api/reports/summary?range=${range}`);
    paint(host, data);
  } catch (error) {
    host.innerHTML = `<div class="empty-state"><h3>Gagal memuat laporan</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function paint(host, data) {
  const { totals, series, hourly, agents } = data;
  const maxSeries = Math.max(1, ...series.map((point) => point.value));
  const maxHour = Math.max(1, ...hourly);
  const answered = totals.conversations - totals.unanswered;

  host.innerHTML = `
    <div class="stat-grid">
      ${statCard('Total percakapan', totals.conversations, `${answered} sudah dibalas`, '#6D5EF8',
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')}
      ${statCard('Rata-rata respons pertama', formatDuration(totals.avgFirstResponse), 'Sejak chat dimulai', '#FF7A45',
        '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')}
      ${statCard('Skor kepuasan', totals.satisfaction === null ? '—' : `${totals.satisfaction}%`,
        `${totals.good} puas · ${totals.bad} kurang`, '#12B886',
        '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>')}
      ${statCard('Pengunjung baru', totals.visitors, `${totals.messages} pesan terkirim`, '#2D9CDB',
        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')}
    </div>

    <div class="chart-card" style="margin-bottom:24px">
      <h3>Volume percakapan</h3>
      <p class="ch-sub">Jumlah chat baru yang masuk per hari.</p>
      <div class="bar-chart">
        ${series.map((point) => `
          <div class="bar-col">
            <div class="bar-track">
              <div class="bar-fill" style="height:${Math.round((point.value / maxSeries) * 100)}%">
                <span>${point.value}</span>
              </div>
            </div>
            <em>${new Date(point.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</em>
          </div>`).join('')}
      </div>
    </div>

    <div class="settings-grid">
      <div class="table-card">
        <div class="tc-head"><h3>Performa agent</h3></div>
        <table class="data">
          <thead><tr><th>Agent</th><th>Chat</th><th>Pesan</th><th>Rating baik</th></tr></thead>
          <tbody>
            ${agents.length ? agents.map((agent) => `
              <tr>
                <td>
                  <div class="row gap-8">
                    <span class="avatar avatar-sm" style="background:${escapeHtml(agent.color)}">${escapeHtml(initials(agent.name))}</span>
                    <b style="font-family:var(--font-display);font-size:14px">${escapeHtml(agent.name)}</b>
                  </div>
                </td>
                <td>${agent.chats}</td>
                <td>${agent.messages}</td>
                <td>${agent.good ? `<span class="badge badge-success">👍 ${agent.good}</span>` : '<span style="color:var(--slate-300)">—</span>'}</td>
              </tr>`).join('')
              : '<tr><td colspan="4" style="text-align:center;color:var(--slate-400);padding:28px">Belum ada data pada rentang ini.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="chart-card">
        <h3>Jam tersibuk</h3>
        <p class="ch-sub">Distribusi chat masuk per jam (UTC).</p>
        <div class="heat">
          ${hourly.map((value) => {
            const intensity = value / maxHour;
            const background = value === 0 ? 'var(--slate-100)'
              : `color-mix(in srgb, var(--brand-500) ${Math.round(18 + intensity * 82)}%, #EDEFF5)`;
            return `<i style="background:${background}" title="${value} chat"></i>`;
          }).join('')}
        </div>
        <div class="heat-labels"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>

        <hr class="divider">
        <div class="dt-row"><span class="k" style="width:auto;flex:1">Percakapan selesai</span><span class="v">${totals.closed}</span></div>
        <div class="dt-row"><span class="k" style="width:auto;flex:1">Belum pernah dibalas</span>
          <span class="v" style="color:${totals.unanswered ? 'var(--danger-500)' : 'var(--success-500)'}">${totals.unanswered}</span></div>
      </div>
    </div>`;
}

const statCard = (label, value, sub, color, icon) => `
  <div class="stat-card" style="--ic:${color}">
    <div class="sc-top">
      <span class="sc-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
      <span>${label}</span>
    </div>
    <b>${escapeHtml(String(value))}</b>
    <i>${escapeHtml(sub)}</i>
  </div>`;
