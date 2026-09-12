import express from 'express';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { all, get, parseJson, run } from '../db/index.js';
import { requireAdmin, requireAuth } from '../lib/auth.js';
import { licenseKey, nowIso, prefixedId } from '../lib/ids.js';
import { DEFAULT_WIDGET_SETTINGS, mergeSettings, sanitizeSettings } from '../lib/widget-settings.js';
import { asyncRoute, str } from '../lib/validate.js';

const router = express.Router();
router.use(requireAuth);

/** Bangun snippet embed + direct chat link untuk sebuah license. */
export function installSnippets(license) {
  const base = config.publicUrl;
  return {
    scriptTag:
      `<!-- NagaLiveChat widget -->\n` +
      `<script src="${base}/widget.js" data-license="${license}" async></script>\n` +
      `<!-- end NagaLiveChat -->`,
    directLink: `${base}/chat/${license}`,
    npmSnippet:
      `window.NagaChat = window.NagaChat || [];\n` +
      `(function () {\n` +
      `  var s = document.createElement('script');\n` +
      `  s.src = '${base}/widget.js';\n` +
      `  s.async = true;\n` +
      `  s.dataset.license = '${license}';\n` +
      `  document.head.appendChild(s);\n` +
      `})();`,
    iframeSnippet: `<iframe src="${base}/chat/${license}?embed=1" style="border:0;width:100%;height:640px" allow="clipboard-write"></iframe>`,
  };
}

const serializeProject = (row) => ({
  id: row.id,
  name: row.name,
  licenseKey: row.license_key,
  domain: row.domain,
  createdAt: row.created_at,
  settings: mergeSettings(parseJson(row.settings)),
  install: installSnippets(row.license_key),
  stats: {
    conversations: get('SELECT COUNT(*) AS n FROM conversations WHERE project_id = ?', row.id).n,
    visitors: get('SELECT COUNT(*) AS n FROM visitors WHERE project_id = ?', row.id).n,
  },
});

router.get('/', (req, res) => {
  const rows = all('SELECT * FROM projects WHERE account_id = ? ORDER BY created_at', req.user.account_id);
  res.json({ projects: rows.map(serializeProject) });
});

router.post('/', requireAdmin, asyncRoute(async (req, res) => {
  const name = str(req.body.name, 80) || 'Website Baru';
  const domain = str(req.body.domain, 160);
  const id = prefixedId('prj');
  run('INSERT INTO projects (id, account_id, name, license_key, domain, settings, created_at) VALUES (?,?,?,?,?,?,?)',
    id, req.user.account_id, name, licenseKey(), domain,
    JSON.stringify({ ...DEFAULT_WIDGET_SETTINGS, companyName: name }), nowIso());
  res.status(201).json({ project: serializeProject(get('SELECT * FROM projects WHERE id = ?', id)) });
}));

function ownedProject(req, res) {
  const row = get('SELECT * FROM projects WHERE id = ? AND account_id = ?', req.params.id, req.user.account_id);
  if (!row) { res.status(404).json({ error: 'Project tidak ditemukan.' }); return null; }
  return row;
}

router.get('/:id', (req, res) => {
  const project = ownedProject(req, res);
  if (project) res.json({ project: serializeProject(project) });
});

router.patch('/:id', asyncRoute(async (req, res) => {
  const project = ownedProject(req, res);
  if (!project) return;

  const name = req.body.name !== undefined ? str(req.body.name, 80) : project.name;
  const domain = req.body.domain !== undefined ? str(req.body.domain, 160) : project.domain;
  const settings = req.body.settings
    ? { ...mergeSettings(parseJson(project.settings)), ...sanitizeSettings(req.body.settings) }
    : parseJson(project.settings);

  run('UPDATE projects SET name = ?, domain = ?, settings = ? WHERE id = ?',
    name || project.name, domain, JSON.stringify(settings), project.id);
  res.json({ project: serializeProject(get('SELECT * FROM projects WHERE id = ?', project.id)) });
}));

router.post('/:id/regenerate-key', requireAdmin, asyncRoute(async (req, res) => {
  const project = ownedProject(req, res);
  if (!project) return;
  run('UPDATE projects SET license_key = ? WHERE id = ?', licenseKey(), project.id);
  res.json({ project: serializeProject(get('SELECT * FROM projects WHERE id = ?', project.id)) });
}));

/** QR code direct chat link — untuk bio Instagram, katalog, atau stiker di toko. */
router.get('/:id/qr.svg', asyncRoute(async (req, res) => {
  const project = ownedProject(req, res);
  if (!project) return;
  const svg = await QRCode.toString(`${config.publicUrl}/chat/${project.license_key}`, {
    type: 'svg',
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
    color: { dark: '#0A0C1B', light: '#FFFFFF' },
  });
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(svg);
}));

router.delete('/:id', requireAdmin, asyncRoute(async (req, res) => {
  const project = ownedProject(req, res);
  if (!project) return;
  const count = get('SELECT COUNT(*) AS n FROM projects WHERE account_id = ?', req.user.account_id).n;
  if (count <= 1) return res.status(400).json({ error: 'Minimal harus ada satu project aktif.' });
  run('DELETE FROM projects WHERE id = ?', project.id);
  res.json({ ok: true });
}));

export default router;
