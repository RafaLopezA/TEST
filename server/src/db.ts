import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;
type P = string | number | null;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE users (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE chapters (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, color TEXT NOT NULL DEFAULT '#5b5bf0');
  CREATE TABLE grades (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE members (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    hire_date TEXT NOT NULL, exit_date TEXT, exit_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  -- Histórico con fecha efectiva: [valid_from, valid_to). valid_to NULL = versión abierta.
  CREATE TABLE member_versions (
    id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    valid_from TEXT NOT NULL, valid_to TEXT,
    title TEXT NOT NULL DEFAULT '', chapter_id INTEGER REFERENCES chapters(id), grade_id INTEGER REFERENCES grades(id),
    manager_id INTEGER REFERENCES members(id) ON DELETE SET NULL, country TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX idx_versions_member ON member_versions(member_id, valid_from);
  CREATE TABLE vacancies (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', chapter_id INTEGER REFERENCES chapters(id), grade_id INTEGER REFERENCES grades(id),
    manager_id INTEGER REFERENCES members(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'Open',
    prf TEXT NOT NULL DEFAULT '', sap TEXT NOT NULL DEFAULT '', target_start TEXT, comments TEXT NOT NULL DEFAULT '',
    opened_at TEXT NOT NULL, closed_at TEXT, filled_by INTEGER REFERENCES members(id) ON DELETE SET NULL);
  CREATE TABLE vacancy_events (id INTEGER PRIMARY KEY, vacancy_id INTEGER NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE, status TEXT NOT NULL, at TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '');
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), user_id INTEGER, user_name TEXT NOT NULL DEFAULT '',
    entity TEXT NOT NULL, entity_id INTEGER, action TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT);
  CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
  `,
  `
  ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
  -- Motivo de baja en la versión que se cierra: así el histórico sobrevive a una reincorporación.
  ALTER TABLE member_versions ADD COLUMN exit_reason TEXT NOT NULL DEFAULT '';
  UPDATE member_versions SET exit_reason = (SELECT m.exit_reason FROM members m WHERE m.id = member_versions.member_id)
   WHERE valid_to IS NOT NULL AND valid_to = (SELECT m.exit_date FROM members m WHERE m.id = member_versions.member_id);
  `,
];

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN'); db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version=${i + 1}`); db.exec('COMMIT');
  }
  return db;
}

export const all = <T>(db: DB, sql: string, ...p: P[]) => db.prepare(sql).all(...p) as T[];
export const get = <T>(db: DB, sql: string, ...p: P[]) => db.prepare(sql).get(...p) as T | undefined;
export const run = (db: DB, sql: string, ...p: P[]) => Number(db.prepare(sql).run(...p).lastInsertRowid);
/** Ejecuta y devuelve el número de filas afectadas. */
export const exec = (db: DB, sql: string, ...p: P[]) => Number(db.prepare(sql).run(...p).changes);

const active = new WeakSet<DB>();
/** Transacción (reentrante por conexión: las anidadas se unen a la exterior). */
export function tx<T>(db: DB, fn: () => T): T {
  if (active.has(db)) return fn();
  db.exec('BEGIN IMMEDIATE'); active.add(db);
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch { /* SQLite ya la había deshecho */ } throw e; }
  finally { active.delete(db); }
}

export function setting(db: DB, key: string, init: () => string): string {
  const row = get<{ value: string }>(db, 'SELECT value FROM settings WHERE key=?', key);
  if (row) return row.value;
  const value = init(); run(db, 'INSERT INTO settings(key,value) VALUES(?,?)', key, value); return value;
}
export const setSetting = (db: DB, key: string, value: string) =>
  run(db, 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
