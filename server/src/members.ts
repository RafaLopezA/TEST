/**
 * Reglas de negocio de miembros. Toda modificación organizativa crea una versión con fecha efectiva.
 * Las versiones de una persona son intervalos [valid_from, valid_to) contiguos; puede haber versiones
 * futuras (cambios planificados), por lo que "la versión abierta" no es necesariamente la vigente hoy.
 */
import type { DB } from './db.ts';
import { all, exec, get, run, tx } from './db.ts';
import { HttpError, audit, isDate, today } from './util.ts';
import type { Actor } from './util.ts';

export const VFIELDS = ['title', 'chapter_id', 'grade_id', 'manager_id', 'country', 'city'] as const;
export const IFIELDS = ['name', 'email', 'skills', 'notes'] as const;
type VField = (typeof VFIELDS)[number];
export interface Version { id: number; member_id: number; valid_from: string; valid_to: string | null; title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; country: string; city: string; reason: string; exit_reason: string }
export interface Member { id: number; name: string; email: string; skills: string; notes: string; hire_date: string; exit_date: string | null; exit_reason: string }
export type VInput = Partial<Pick<Version, VField>>;
export interface MemberInput extends VInput { name?: string; email?: string; skills?: string; notes?: string; hire_date?: string; effective_date?: string; reason?: string; correction?: boolean }

const LABEL: Record<VField, string> = { title: 'título', chapter_id: 'chapter', grade_id: 'grado', manager_id: 'manager', country: 'país', city: 'ciudad' };

export const getMember = (db: DB, id: number) => {
  const m = get<Member>(db, 'SELECT * FROM members WHERE id=?', id);
  if (!m) throw new HttpError(404, 'Miembro no encontrado');
  return m;
};
export const versionsOf = (db: DB, id: number) => all<Version>(db, 'SELECT * FROM member_versions WHERE member_id=? ORDER BY valid_from, id', id);
/** Última versión sin fecha de fin (puede empezar en el futuro). Si no existe, la persona está de baja o tiene una baja planificada. */
export const openVersion = (db: DB, id: number) => get<Version>(db, 'SELECT * FROM member_versions WHERE member_id=? AND valid_to IS NULL', id);
/** Versión vigente en una fecha. */
export const versionAt = (db: DB, id: number, date: string) =>
  get<Version>(db, 'SELECT * FROM member_versions WHERE member_id=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>?)', id, date, date);
/** Versión vigente hoy o, si la persona aún no ha empezado, la primera futura. undefined si ya no está en la organización. */
export const baseVersion = (db: DB, id: number) => versionAt(db, id, today())
  ?? get<Version>(db, 'SELECT * FROM member_versions WHERE member_id=? AND valid_from>? ORDER BY valid_from LIMIT 1', id, today());

function checkRefs(db: DB, v: VInput, at: string, selfId?: number) {
  if (v.chapter_id != null && !get(db, 'SELECT 1 FROM chapters WHERE id=?', v.chapter_id)) throw new HttpError(400, 'El chapter no existe');
  if (v.grade_id != null && !get(db, 'SELECT 1 FROM grades WHERE id=?', v.grade_id)) throw new HttpError(400, 'El grado no existe');
  if (v.manager_id != null) {
    if (!get(db, 'SELECT 1 FROM members WHERE id=?', v.manager_id)) throw new HttpError(400, 'El manager no existe');
    if (!versionAt(db, v.manager_id, at)) throw new HttpError(400, `El manager no está activo en la fecha indicada (${at})`);
    for (let cur: number | null = v.manager_id, guard = 0; cur != null && guard < 100; guard++) {   // sin ciclos en la jerarquía
      if (cur === selfId) throw new HttpError(400, 'Una persona no puede reportar a sí misma ni a alguien de su propia rama');
      cur = (versionAt(db, cur, at) ?? openVersion(db, cur))?.manager_id ?? null;
    }
  }
}
const insertVersion = (db: DB, memberId: number, from: string, to: string | null, v: Required<VInput>, reason: string, actor: Actor) =>
  run(db, 'INSERT INTO member_versions(member_id,valid_from,valid_to,title,chapter_id,grade_id,manager_id,country,city,reason,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    memberId, from, to, v.title, v.chapter_id, v.grade_id, v.manager_id, v.country, v.city, reason, actor.id);
const full = (v: VInput, base?: Version): Required<VInput> => ({
  title: v.title ?? base?.title ?? '', chapter_id: v.chapter_id !== undefined ? v.chapter_id : base?.chapter_id ?? null,
  grade_id: v.grade_id !== undefined ? v.grade_id : base?.grade_id ?? null, manager_id: v.manager_id !== undefined ? v.manager_id : base?.manager_id ?? null,
  country: v.country ?? base?.country ?? '', city: v.city ?? base?.city ?? '',
});

export function createMember(db: DB, actor: Actor, input: MemberInput): number {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  const hire = input.hire_date ?? today();
  if (!isDate(hire)) throw new HttpError(400, 'Fecha de alta no válida');
  return tx(db, () => {
    checkRefs(db, input, hire);
    const id = run(db, 'INSERT INTO members(name,email,skills,notes,hire_date) VALUES(?,?,?,?,?)', name, input.email?.trim() ?? '', input.skills ?? '', input.notes ?? '', hire);
    insertVersion(db, id, hire, null, full(input), input.reason || 'Alta', actor);
    audit(db, actor, 'member', id, 'create', `Alta de ${name} con fecha ${hire}`);
    return id;
  });
}

export function updateMember(db: DB, actor: Actor, id: number, input: MemberInput): { changed: string[] } {
  return tx(db, () => {
    const m = getMember(db, id), changed: string[] = [], detail: Record<string, unknown> = {};
    for (const f of IFIELDS) {
      const val = input[f];
      if (val !== undefined && val !== m[f]) {
        if (f === 'name' && !val.trim()) throw new HttpError(400, 'El nombre es obligatorio');
        run(db, `UPDATE members SET ${f}=? WHERE id=?`, val, id); changed.push(f); detail[f] = { from: m[f], to: val };
      }
    }
    if (input.hire_date !== undefined && input.hire_date !== m.hire_date) {
      if (!isDate(input.hire_date)) throw new HttpError(400, 'Fecha de alta no válida');
      const first = versionsOf(db, id)[0];
      if (first.valid_to !== null && input.hire_date >= first.valid_to) throw new HttpError(400, 'La fecha de alta debe ser anterior al primer cambio registrado');
      run(db, 'UPDATE member_versions SET valid_from=? WHERE id=?', input.hire_date, first.id);
      run(db, 'UPDATE members SET hire_date=? WHERE id=?', input.hire_date, id);
      changed.push('hire_date'); detail.hire_date = { from: m.hire_date, to: input.hire_date };
    }

    const eff = input.effective_date ?? today();
    if (!isDate(eff)) throw new HttpError(400, 'Fecha efectiva no válida');
    // Una corrección rectifica la situación vigente; un cambio se aplica sobre la versión vigente en su fecha efectiva.
    const base = baseVersion(db, id), target = input.correction ? base : versionAt(db, id, eff);
    const vch: VInput = {};
    for (const f of VFIELDS) {
      const val = input[f];
      if (val !== undefined && (!target || val !== target[f])) (vch as Record<string, unknown>)[f] = val;
    }
    const vkeys = Object.keys(vch) as VField[];
    if (vkeys.length) {
      if (!base) throw new HttpError(409, 'La persona está de baja: reincorpórala antes de cambiar sus datos organizativos');
      if (!input.correction && eff < base.valid_from) throw new HttpError(400, `La fecha efectiva no puede ser anterior al último cambio (${base.valid_from}). Usa "corrección" para rectificar sin generar histórico.`);
      if (!target) throw new HttpError(409, `La persona no está en la organización en la fecha indicada (${eff})`);
      checkRefs(db, vch, input.correction ? (target.valid_from > today() ? target.valid_from : today()) : eff, id);
      for (const f of vkeys) detail[f] = { from: target[f], to: vch[f] };
      let editedFrom = target.valid_from;
      if (input.correction || eff === target.valid_from) {
        run(db, `UPDATE member_versions SET ${vkeys.map(k => `${k}=?`).join(',')} WHERE id=?`, ...vkeys.map(k => vch[k] as string | number | null), target.id);
        if (input.correction) detail.mode = 'corrección'; else detail.effective_date = eff;
      } else {
        // Parte la versión vigente en [inicio, eff) y [eff, fin): las versiones futuras ya planificadas se conservan.
        run(db, 'UPDATE member_versions SET valid_to=? WHERE id=?', eff, target.id);
        insertVersion(db, id, eff, target.valid_to, full(vch, target), input.reason ?? '', actor);
        detail.effective_date = eff; editedFrom = eff;
      }
      // El cambio se arrastra a las versiones posteriores contiguas mientras conserven el valor anterior
      // (si un cambio planificado ya modificaba ese campo, se respeta).
      const later = all<Version>(db, 'SELECT * FROM member_versions WHERE member_id=? AND valid_from>? ORDER BY valid_from', id, editedFrom);
      for (const f of vkeys) {
        let end = target.valid_to;
        for (const lv of later) {
          if (lv.valid_from !== end || lv[f] !== target[f]) break;
          run(db, `UPDATE member_versions SET ${f}=? WHERE id=?`, vch[f] as string | number | null, lv.id); end = lv.valid_to;
        }
      }
      changed.push(...vkeys);
    }
    if (changed.length) audit(db, actor, 'member', id, 'update', `${m.name}: cambio de ${changed.map(c => LABEL[c as VField] ?? c).join(', ')}`, detail);
    return { changed };
  });
}

/** Mueve a `toId` a quienes reportan (o tienen planificado reportar) a `fromId` a partir de `date`. */
function reassignReports(db: DB, actor: Actor, fromId: number, toId: number, fallback: number | null, date: string, why: string) {
  const rows = all<Version>(db, 'SELECT * FROM member_versions WHERE manager_id=? AND member_id<>? AND (valid_to IS NULL OR valid_to>?) ORDER BY member_id, valid_from', fromId, fromId, date);
  for (const v of rows) {
    const to = v.member_id === toId ? fallback : toId;      // quien sustituye al manager pasa a reportar al manager de este
    if (v.valid_from >= date) run(db, 'UPDATE member_versions SET manager_id=? WHERE id=?', to, v.id);
    else {
      run(db, 'UPDATE member_versions SET valid_to=? WHERE id=?', date, v.id);
      insertVersion(db, v.member_id, date, v.valid_to, { ...full({}, v), manager_id: to }, why, actor);
      audit(db, actor, 'member', v.member_id, 'update', `${getMember(db, v.member_id).name}: cambio de manager`, { manager_id: { from: fromId, to }, effective_date: date, reason: why });
    }
  }
}

export function exitMember(db: DB, actor: Actor, id: number, date: string, reason: string, reassignTo?: number | null, force = false) {
  if (!isDate(date)) throw new HttpError(400, 'Fecha de baja no válida');
  return tx(db, () => {
    const m = getMember(db, id), base = baseVersion(db, id);
    if (!openVersion(db, id) || !base) throw new HttpError(409, m.exit_date ? `La persona ya tiene una baja registrada con fecha ${m.exit_date}` : 'La persona ya está de baja');
    if (date <= base.valid_from) throw new HttpError(400, `La fecha de baja debe ser posterior al último cambio (${base.valid_from})`);
    const cur = versionAt(db, id, date)!;
    const reports = all<{ member_id: number }>(db, 'SELECT DISTINCT member_id FROM member_versions WHERE manager_id=? AND member_id<>? AND (valid_to IS NULL OR valid_to>?)', id, id, date);
    if (reports.length && reassignTo == null && !force) throw new HttpError(400, `Tiene ${reports.length} reporte(s) directo(s): indica a quién se reasignan`);
    if (reassignTo != null) {
      if (reassignTo === id) throw new HttpError(400, 'No se pueden reasignar los reportes a la misma persona');
      const nv = versionAt(db, reassignTo, date);
      if (!nv) throw new HttpError(400, 'La persona a la que se reasignan los reportes no está activa en esa fecha');
      for (let up = nv.manager_id, guard = 0; up != null && guard < 100; guard++) {   // evita ciclos: solo vale un reporte directo o alguien de fuera de su rama
        if (up === id && nv.manager_id !== id) throw new HttpError(400, 'Elige un reporte directo o alguien de fuera de su rama para reasignar el equipo');
        up = versionAt(db, up, date)?.manager_id ?? null;
      }
      reassignReports(db, actor, id, reassignTo, cur.manager_id, date, `Baja de ${m.name}`);
    }
    // Las vacantes abiertas no pueden quedar colgando de alguien que ya no está.
    run(db, 'UPDATE vacancies SET manager_id=? WHERE manager_id=? AND closed_at IS NULL', reassignTo ?? cur.manager_id, id);
    run(db, 'DELETE FROM member_versions WHERE member_id=? AND valid_from>=?', id, date);     // los cambios planificados para después de la baja se anulan
    run(db, 'UPDATE member_versions SET valid_to=?, exit_reason=? WHERE id=?', date, reason, cur.id);
    run(db, 'UPDATE members SET exit_date=?, exit_reason=? WHERE id=?', date, reason, id);
    audit(db, actor, 'member', id, 'exit', `Baja de ${m.name} con fecha ${date}`, { reason, reassignTo: reassignTo ?? null });
  });
}

export function rehireMember(db: DB, actor: Actor, id: number, date: string, input: VInput) {
  if (!isDate(date)) throw new HttpError(400, 'Fecha no válida');
  return tx(db, () => {
    const m = getMember(db, id);
    if (openVersion(db, id)) throw new HttpError(409, 'La persona está activa');
    const last = versionsOf(db, id).at(-1)!;
    if (date < last.valid_to!) throw new HttpError(400, `La reincorporación debe ser igual o posterior a la baja (${last.valid_to})`);
    const v = full(input, last);
    if (input.manager_id === undefined && v.manager_id != null && !versionAt(db, v.manager_id, date)) v.manager_id = null;   // su antiguo manager ya no está
    checkRefs(db, v, date, id);
    insertVersion(db, id, date, null, v, 'Reincorporación', actor);
    run(db, "UPDATE members SET exit_date=NULL, exit_reason='' WHERE id=?", id);     // el motivo de la baja anterior queda en la versión cerrada
    audit(db, actor, 'member', id, 'rehire', `Reincorporación de ${m.name} con fecha ${date}`);
  });
}

export function deleteMember(db: DB, actor: Actor, id: number) {
  return tx(db, () => {
    const m = getMember(db, id);
    const n = get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM member_versions WHERE manager_id=? AND member_id<>?', id, id)!.n;
    if (n) throw new HttpError(409, 'Aparece como manager en el histórico de otras personas. Dale de baja en lugar de borrarlo.');
    exec(db, 'DELETE FROM members WHERE id=?', id);
    audit(db, actor, 'member', id, 'delete', `Borrado definitivo de ${m.name}`);
  });
}
