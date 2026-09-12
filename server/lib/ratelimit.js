/** Rate limiter in-memory sederhana untuk endpoint publik. */
const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 60, key = (req) => req.ip } = {}) {
  return (req, res, next) => {
    const id = key(req);
    const now = Date.now();
    const bucket = buckets.get(id);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' });
    }
    bucket.count += 1;
    next();
  };
}

// Bersihkan bucket kedaluwarsa tiap 5 menit agar memori tidak tumbuh.
setInterval(() => {
  const now = Date.now();
  for (const [id, bucket] of buckets) if (now > bucket.resetAt) buckets.delete(id);
}, 5 * 60_000).unref();
