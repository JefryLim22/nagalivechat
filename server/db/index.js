import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

export const db = new DatabaseSync(config.databaseFile);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

/* Migrasi ringan: CREATE TABLE IF NOT EXISTS tidak menambah kolom baru pada
   database yang sudah ada, jadi kolom tambahan dipasang di sini. */
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('conversations', 'prechat', `TEXT NOT NULL DEFAULT '[]'`);

/** Ambil satu baris, atau null. */
export function get(sql, ...params) {
  return db.prepare(sql).get(...params) ?? null;
}

/** Ambil semua baris sebagai array objek biasa. */
export function all(sql, ...params) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

/** Jalankan INSERT/UPDATE/DELETE. */
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

/** Bungkus beberapa operasi dalam satu transaksi. */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
