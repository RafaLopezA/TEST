import type { DB } from './db.ts';
import { run } from './db.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const today = () => new Date().toISOString().slice(0, 10);
/** Fecha de calendario real en formato AAAA-MM-DD (rechaza 2026-02-31 o 2026-99-99). */
export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** Suma años; el 29 de febrero se ajusta al 28 cuando el año destino no es bisiesto. */
export function addYears(d: string, n: number): string {
  const r = `${String(Number(d.slice(0, 4)) + n).padStart(4, '0')}${d.slice(4)}`;
  const valid: boolean = isDate(r);
  return valid ? r : `${r.slice(0, 8)}28`;
}
export const dateOr = (s: unknown, fallback: string) => (isDate(s) ? s : fallback);
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export interface Actor { id: number | null; name: string; role: 'admin' | 'editor' | 'viewer' }
export const SYSTEM: Actor = { id: null, name: 'sistema', role: 'admin' };

export function audit(db: DB, actor: Actor, entity: string, entityId: number | null, action: string, summary: string, detail?: unknown) {
  run(db, 'INSERT INTO audit_log(user_id,user_name,entity,entity_id,action,summary,detail) VALUES(?,?,?,?,?,?,?)',
    actor.id, actor.name, entity, entityId, action, summary, detail === undefined ? null : JSON.stringify(detail));
}
