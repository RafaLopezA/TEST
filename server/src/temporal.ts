/** Consultas temporales sobre member_versions: foto a una fecha, serie de headcount y movimientos. */
import type { DB } from './db.ts';
import { all } from './db.ts';

export interface VRow {
  version_id: number; member_id: number; valid_from: string; valid_to: string | null;
  title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; country: string; city: string; reason: string;
  name: string; email: string; skills: string; notes: string; hire_date: string; exit_date: string | null; exit_reason: string;
  /** Motivo de baja registrado en esta versión (si la persona salió al cerrarse). */
  end_reason: string;
}
export interface SnapRow extends VRow { team_id: number | null; state: 'active' | 'exited' | 'future' }

export const loadVersions = (db: DB) => all<VRow>(db, `
  SELECT v.id AS version_id, v.member_id, v.valid_from, v.valid_to, v.title, v.chapter_id, v.grade_id, v.manager_id, v.country, v.city, v.reason, v.exit_reason AS end_reason,
         m.name, m.email, m.skills, m.notes, m.hire_date, m.exit_date, m.exit_reason
  FROM member_versions v JOIN members m ON m.id = v.member_id ORDER BY v.member_id, v.valid_from, v.id`);

const activeAt = (v: VRow, d: string) => v.valid_from <= d && (v.valid_to === null || v.valid_to > d);

/** Equipo = ancestro que reporta directamente a la cabeza de la organización (quien no tiene manager). */
function withTeams(rows: VRow[]): SnapRow[] {
  const by = new Map(rows.map(r => [r.member_id, r]));
  const team = (r: VRow): number | null => {
    let cur = r, guard = 0;
    while (guard++ < 50) {
      const mgr = cur.manager_id != null ? by.get(cur.manager_id) : undefined;
      if (!mgr) return cur === r ? null : cur.member_id;      // r es raíz, o cur cuelga de alguien fuera de la foto
      if (mgr.manager_id == null || !by.has(mgr.manager_id)) return cur.member_id; // cur reporta a una raíz
      cur = mgr;
    }
    return null;
  };
  return rows.map(r => ({ ...r, team_id: team(r), state: 'active' as const }));
}

export function snapshotFrom(versions: VRow[], asOf: string): SnapRow[] {
  return withTeams(versions.filter(v => activeAt(v, asOf)));
}
export const snapshot = (db: DB, asOf: string) => snapshotFrom(loadVersions(db), asOf);

/** Foto + personas que ya salieron o que aún no han entrado a esa fecha (con su versión más cercana). */
export function roster(db: DB, asOf: string): SnapRow[] {
  const versions = loadVersions(db), snap = snapshotFrom(versions, asOf), present = new Set(snap.map(s => s.member_id));
  const extra = new Map<number, SnapRow>();
  for (const v of versions) {
    if (present.has(v.member_id)) continue;
    const past = v.valid_from <= asOf, prev = extra.get(v.member_id);
    if (past) extra.set(v.member_id, { ...v, exit_date: v.valid_to, exit_reason: v.end_reason, team_id: null, state: 'exited' });   // la última pasada gana: su fin es la baja vigente a esa fecha
    else if (!prev) extra.set(v.member_id, { ...v, team_id: null, state: 'future' });     // primera futura si no hay pasada
  }
  return [...snap, ...extra.values()];
}

export type MoveType = 'hire' | 'rehire' | 'exit' | 'promotion' | 'demotion' | 'grade' | 'chapter' | 'manager' | 'title' | 'location';
export interface Movement { date: string; type: MoveType; member_id: number; name: string; from: string; to: string; reason: string; chapter_id: number | null; grade_id: number | null }

export function movements(db: DB, from: string, to: string): Movement[] {
  const versions = loadVersions(db);
  const chapters = new Map(all<{ id: number; name: string }>(db, 'SELECT id,name FROM chapters').map(c => [c.id, c.name]));
  const grades = new Map(all<{ id: number; code: string; level: number }>(db, 'SELECT id,code,level FROM grades').map(g => [g.id, g]));
  const names = new Map(all<{ id: number; name: string }>(db, 'SELECT id,name FROM members').map(m => [m.id, m.name]));
  const out: Movement[] = [];
  const push = (date: string, type: MoveType, v: VRow, f: string, t: string, reason = v.reason) => {
    if (date >= from && date <= to) out.push({ date, type, member_id: v.member_id, name: v.name, from: f, to: t, reason, chapter_id: v.chapter_id, grade_id: v.grade_id });
  };
  for (let i = 0; i < versions.length; i++) {
    const v = versions[i];
    const prev = i > 0 && versions[i - 1].member_id === v.member_id ? versions[i - 1] : null;
    const next = i + 1 < versions.length && versions[i + 1].member_id === v.member_id ? versions[i + 1] : null;
    const where = `${chapters.get(v.chapter_id ?? -1) ?? '—'} · ${grades.get(v.grade_id ?? -1)?.code ?? '—'}`;
    if (!prev) push(v.valid_from, 'hire', v, '', where);
    else if (prev.valid_to !== v.valid_from) push(v.valid_from, 'rehire', v, '', where);
    else {
      if (prev.grade_id !== v.grade_id) {
        const a = grades.get(prev.grade_id ?? -1), b = grades.get(v.grade_id ?? -1);
        const type: MoveType = a && b ? (b.level > a.level ? 'promotion' : b.level < a.level ? 'demotion' : 'grade') : 'grade';
        push(v.valid_from, type, v, a?.code ?? '—', b?.code ?? '—');
      }
      if (prev.chapter_id !== v.chapter_id) push(v.valid_from, 'chapter', v, chapters.get(prev.chapter_id ?? -1) ?? '—', chapters.get(v.chapter_id ?? -1) ?? '—');
      if (prev.manager_id !== v.manager_id) push(v.valid_from, 'manager', v, names.get(prev.manager_id ?? -1) ?? '—', names.get(v.manager_id ?? -1) ?? '—');
      if (prev.title !== v.title) push(v.valid_from, 'title', v, prev.title || '—', v.title || '—');
      if (prev.city !== v.city || prev.country !== v.country) push(v.valid_from, 'location', v, [prev.city, prev.country].filter(Boolean).join(', ') || '—', [v.city, v.country].filter(Boolean).join(', ') || '—');
    }
    if (v.valid_to !== null && (!next || next.valid_from !== v.valid_to)) push(v.valid_to, 'exit', v, where, '', v.end_reason);
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));
}

export interface TimelinePoint { date: string; total: number; groups: Record<string, number>; hires: number; exits: number }
const monthStart = (d: string) => d.slice(0, 7) + '-01';
const nextMonth = (d: string) => { const [y, m] = d.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };

/** Serie mensual: headcount al final de cada mes (o a `to` en el último), con altas y bajas del mes. */
export function timeline(db: DB, from: string, to: string, groupBy: 'chapter' | 'grade' | 'team' | 'none'): TimelinePoint[] {
  const versions = loadVersions(db), moves = movements(db, monthStart(from), to), points: TimelinePoint[] = [];
  for (let m = monthStart(from), n = 0; m <= to && n < 240; m = nextMonth(m), n++) {
    const end = nextMonth(m), last = new Date(Date.parse(end) - 86400000).toISOString().slice(0, 10), date = last > to ? to : last;
    const snap = snapshotFrom(versions, date), groups: Record<string, number> = {};
    if (groupBy !== 'none') for (const r of snap) {
      const k = String((groupBy === 'chapter' ? r.chapter_id : groupBy === 'grade' ? r.grade_id : r.team_id ?? r.member_id) ?? 0);
      groups[k] = (groups[k] || 0) + 1;
    }
    const inMonth = moves.filter(x => x.date >= m && x.date < end);
    points.push({ date, total: snap.length, groups, hires: inMonth.filter(x => x.type === 'hire' || x.type === 'rehire').length, exits: inMonth.filter(x => x.type === 'exit').length });
  }
  return points;
}
