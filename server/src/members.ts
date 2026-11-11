/** Reglas de negocio de miembros: toda modificación organizativa crea una versión con fecha efectiva. */
import type { DB } from './db.ts';
import { all, get, run, tx } from './db.ts';
import { HttpError, audit, isDate, today } from './util.ts';
import type { Actor } from './util.ts';

export const VFIELDS = ['title', 'chapter_id', 'grade_id', 'manager_id', 'country', 'city'] as const;
export const IFIELDS = ['name', 'email', 'skills', 'notes'] as const;
type VField = (typeof VFIELDS)[number];
export interface Version { id: number; member_id: number; valid_from: string; valid_to: string | null; title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; country: string; city: string; reason: string }
export interface Member { id: number; name: string; email: string; skills: string; notes: string; hire_date: string; exit_date: string | null; exit_reason: string }
export type VInput = Partial<Pick<Version, VField>>;
export interface MemberInput extends VInput { name?: string; email?: string; skills?: string; notes?: string; hire_date?: string; effective_date?: string; reason?: string; correction?: boolean }

const LABEL: Record<VField, string> = { title: 'título', chapter_id: 'chapter', grade_id: 'grado', manager_id: 'manager', country: 'país', city: 'ciudad' };

export const getMember = (db: DB, id: number) => {
  const m = get<Member>(db, 'SELECT * FROM members WHERE id=?', id);
  if (!m) throw new HttpError(404, 'Miembro no encontrado');
  return m;
};
export const openVersion = (db: DB, id: number) => get<Version>(db, 'SELECT * FROM member_versions WHERE member_id=? AND valid_to IS NULL', id);
export const versionsOf = (db: DB, id: number) => all<Version>(db, 'SELECT * FROM member_versions WHERE member_id=? ORDER BY valid_from, id', id);

function checkRefs(db: DB, v: VInput, selfId?: number) {
  if (v.chapter_id != null && !get(db, 'SELECT 1 FROM chapters WHERE id=?', v.chapter_id)) throw new HttpError(400, 'El chapter no existe');
  if (v.grade_id != null && !get(db, 'SELECT 1 FROM grades WHERE id=?', v.grade_id)) throw new HttpError(400, 'El grado no existe');
  if (v.manager_id != null) {
    if (!get(db, 'SELECT 1 FROM members WHERE id=?', v.manager_id)) throw new HttpError(400, 'El manager no existe');
    for (let cur: number | null = v.manager_id, guard = 0; cur != null && guard < 100; guard++) {   // sin ciclos en la jerarquía
      if (cur === selfId) throw new HttpError(400, 'Una persona no puede reportar a sí misma ni a alguien de su propia rama');
      cur = openVersion(db, cur)?.manager_id ?? null;
    }
  }
}
const insertVersion = (db: DB, memberId: number, from: string, v: Required<VInput>, reason: string, actor: Actor) =>
  run(db, 'INSERT INTO member_versions(member_id,valid_from,title,chapter_id,grade_id,manager_id,country,city,reason,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
    memberId, from, v.title, v.chapter_id, v.grade_id, v.manager_id, v.country, v.city, reason, actor.id);
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
    checkRefs(db, input);
    const id = run(db, 'INSERT INTO members(name,email,skills,notes,hire_date) VALUES(?,?,?,?,?)', name, input.email?.trim() ?? '', input.skills ?? '', input.notes ?? '', hire);
    insertVersion(db, id, hire, full(input), input.reason || 'Alta', actor);
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
    const cur = openVersion(db, id), vch: VInput = {};
    for (const f of VFIELDS) {
      const val = input[f];
      if (val !== undefined && (!cur || val !== cur[f])) { (vch as Record<string, unknown>)[f] = val; }
    }
    const vkeys = Object.keys(vch) as VField[];
    if (vkeys.length) {
      if (!cur) throw new HttpError(409, 'La persona está de baja: reincorpórala antes de cambiar sus datos organizativos');
      checkRefs(db, vch, id);
      const eff = input.effective_date ?? today();
      if (!isDate(eff)) throw new HttpError(400, 'Fecha efectiva no válida');
      for (const f of vkeys) detail[f] = { from: cur[f], to: vch[f] };
      if (input.correction || eff === cur.valid_from) {
        run(db, `UPDATE member_versions SET ${vkeys.map(k => `${k}=?`).join(',')} WHERE id=?`, ...vkeys.map(k => vch[k] as string | number | null), cur.id);
        detail.mode = 'corrección';
      } else {
        if (eff < cur.valid_from) throw new HttpError(400, `La fecha efectiva no puede ser anterior al último cambio (${cur.valid_from}). Usa "corrección" para rectificar sin generar histórico.`);
        run(db, 'UPDATE member_versions SET valid_to=? WHERE id=?', eff, cur.id);
        insertVersion(db, id, eff, full(vch, cur), input.reason ?? '', actor);
        detail.effective_date = eff;
      }
      changed.push(...vkeys);
    }
    if (changed.length) audit(db, actor, 'member', id, 'update', `${m.name}: cambio de ${changed.map(c => LABEL[c as VField] ?? c).join(', ')}`, detail);
    return { changed };
  });
}

export function exitMember(db: DB, actor: Actor, id: number, date: string, reason: string, reassignTo?: number | null, force = false) {
  if (!isDate(date)) throw new HttpError(400, 'Fecha de baja no válida');
  return tx(db, () => {
    const m = getMember(db, id), cur = openVersion(db, id);
    if (!cur) throw new HttpError(409, 'La persona ya está de baja');
    if (date <= cur.valid_from) throw new HttpError(400, `La fecha de baja debe ser posterior al último cambio (${cur.valid_from})`);
    const reports = all<{ member_id: number }>(db, 'SELECT member_id FROM member_versions WHERE manager_id=? AND valid_to IS NULL', id);
    if (reports.length && reassignTo == null && !force) throw new HttpError(400, `Tiene ${reports.length} reporte(s) directo(s): indica a quién se reasignan`);
    if (reassignTo != null) {
      if (reassignTo === id) throw new HttpError(400, 'No se pueden reasignar los reportes a la misma persona');
      for (const r of reports) updateMember(db, actor, r.member_id, { manager_id: reassignTo, effective_date: date, reason: `Baja de ${m.name}` });
      run(db, 'UPDATE vacancies SET manager_id=? WHERE manager_id=? AND closed_at IS NULL', reassignTo, id);
    }
    run(db, 'UPDATE member_versions SET valid_to=? WHERE id=?', date, cur.id);
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
    checkRefs(db, input, id);
    const v = full(input, last);
    if (v.manager_id != null && !openVersion(db, v.manager_id)) v.manager_id = null;
    insertVersion(db, id, date, v, 'Reincorporación', actor);
    run(db, "UPDATE members SET exit_date=NULL, exit_reason='' WHERE id=?", id);
    audit(db, actor, 'member', id, 'rehire', `Reincorporación de ${m.name} con fecha ${date}`);
  });
}

export function deleteMember(db: DB, actor: Actor, id: number) {
  return tx(db, () => {
    const m = getMember(db, id);
    const n = get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM member_versions WHERE manager_id=? AND member_id<>?', id, id)!.n;
    if (n) throw new HttpError(409, 'Aparece como manager en el histórico de otras personas. Dale de baja en lugar de borrarlo.');
    run(db, 'DELETE FROM members WHERE id=?', id);
    audit(db, actor, 'member', id, 'delete', `Borrado definitivo de ${m.name}`);
  });
}
