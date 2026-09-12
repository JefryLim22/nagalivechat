import http from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config.js';
import './db/index.js';
import { userFromRequest } from './lib/auth.js';
import authRoutes from './routes/auth.routes.js';
import cannedRoutes from './routes/canned.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import projectRoutes from './routes/projects.routes.js';
import publicRoutes from './routes/public.routes.js';
import reportRoutes from './routes/reports.routes.js';
import teamRoutes from './routes/team.routes.js';
import { attachRealtime } from './realtime/index.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());

/* ------------------------------- API ------------------------------- */
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/canned', cannedRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/public', publicRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'nagalivechat', time: new Date().toISOString() }));

/* --------------------------- Aset statis --------------------------- */
const page = (file) => path.join(config.publicDir, file);

// Loader widget: boleh di-embed lintas domain, cache pendek agar update cepat tersebar.
app.get('/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(page('widget.js'));
});

// Frame chat yang dimuat di dalam iframe widget.
app.get('/widget/frame', (req, res) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.sendFile(page('widget-frame.html'));
});

// Direct chat link — halaman chat penuh yang bisa dibagikan.
app.get('/chat/:license', (req, res) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.sendFile(page('chat.html'));
});

/* ------------------------------ Halaman ---------------------------- */
/* Didaftarkan sebelum express.static agar pengecekan sesi tidak terlewati. */
app.get('/', (req, res) => res.sendFile(page('index.html')));
app.get('/login', (req, res) => (userFromRequest(req) ? res.redirect('/app') : res.sendFile(page('login.html'))));
app.get('/signup', (req, res) => (userFromRequest(req) ? res.redirect('/app') : res.sendFile(page('signup.html'))));
app.get('/app', (req, res) => (userFromRequest(req) ? res.sendFile(page('app.html')) : res.redirect('/login')));
app.get('/app/*splat', (req, res) => (userFromRequest(req) ? res.sendFile(page('app.html')) : res.redirect('/login')));
app.get('/demo', (req, res) => res.sendFile(page('demo.html')));

/* Berkas .html hanya boleh diakses lewat route halaman di atas, bukan lewat
   tebakan nama file (mis. /app.html yang akan melewati pengecekan sesi). */
app.use((req, res, next) =>
  (req.path.endsWith('.html') ? res.status(404).sendFile(page('404.html')) : next()));

/* Aset statis. */
app.use(express.static(config.publicDir, {
  index: false,
  maxAge: config.isProd ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

/* ------------------------- 404 & error handler --------------------- */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  res.status(404).sendFile(page('404.html'));
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error('[naga]', err);
  res.status(status).json({ error: status >= 500 ? 'Terjadi kesalahan pada server.' : err.message });
});

/* ------------------------------ Start ------------------------------ */
const server = http.createServer(app);
attachRealtime(server);

server.listen(config.port, () => {
  const banner = [
    '',
    '  🐉  NagaLiveChat siap digunakan',
    '  ─────────────────────────────────────────────',
    `  Landing page   : ${config.publicUrl}`,
    `  Agent workspace: ${config.publicUrl}/app`,
    `  Demo widget    : ${config.publicUrl}/demo`,
    `  Database       : ${config.databaseFile}`,
    '',
  ].join('\n');
  console.log(banner);
});

const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server };
