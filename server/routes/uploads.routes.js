/* Unggah gambar (logo, avatar, banner eyecatcher, banner sambutan).

   Berkas dikirim sebagai data URL agar tidak perlu dependency parser
   multipart; isinya diperiksa lewat magic bytes, bukan nama file atau
   content-type yang dikirim browser — keduanya mudah dipalsukan. */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';
import { prefixedId } from '../lib/ids.js';
import { asyncRoute } from '../lib/validate.js';

const router = express.Router();
router.use(requireAuth);

const MAX_BYTES = 2 * 1024 * 1024;

/* SVG sengaja tidak diterima: berkas SVG bisa memuat <script> dan disajikan
   dari origin yang sama dengan dashboard. */
const SIGNATURES = [
  { ext: 'png',  mime: 'image/png',  test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'jpg',  mime: 'image/jpeg', test: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'gif',  mime: 'image/gif',  test: (b) => b.subarray(0, 3).toString('latin1') === 'GIF' },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

router.post('/', asyncRoute(async (req, res) => {
  const dataUrl = String(req.body?.file || '');
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'Format berkas tidak dikenali.' });

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return res.status(400).json({ error: 'Berkas kosong.' });
  if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'Ukuran gambar maksimal 2 MB.' });

  const kind = SIGNATURES.find((signature) => signature.test(buffer));
  if (!kind) return res.status(415).json({ error: 'Hanya gambar PNG, JPG, GIF, atau WebP yang didukung.' });

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = `${prefixedId('img')}.${kind.ext}`;
  fs.writeFileSync(path.join(config.uploadDir, name), buffer);

  res.status(201).json({ url: `/uploads/${name}`, bytes: buffer.length, type: kind.mime });
}));

export default router;
