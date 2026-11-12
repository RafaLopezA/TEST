/** Importación desde Excel/CSV (formato peopleTemp): calcula un plan (preview) y lo aplica generando histórico. */
import type { DB } from './db.ts';
import { all, get, run, tx } from './db.ts';
import { baseVersion, createMember, exitMember, openVersion, rehireMember, updateMember, versionAt, versionsOf } from './members.ts';
import type { MemberInput, Version } from './members.ts';
import { audit, isDate, today, HttpError } from './util.ts';
import type { Actor } from './util.ts';

export interface ImportRow { name: string; email?: string; manager?: string; title?: string; grade?: string; chapter?: string; country?: string; city?: string; hiring?: string; prf?: string; sap?: string; comments?: string }
export interface ImportPayload { rows: ImportRow[]; effective_date?: string; exit_missing?: boolean }
interface Change { field: string; from: string; to: string }
export interface ImportPlan {
  effective_date: string; newChapters: string[]; newGrades: string[]; placeholders: string[];
  create: { name: string; chapter: string; grade: string; manager: string }[];
  update: { id: number; name: string; changes: Change[] }[];
  rehire: { id: number; name: string }[];
  unchanged: number;
  /** Activos que no aparecen en el fichero. can_exit = false si la fecha efectiva no permite darlos de baja. */
  missing: { id: number; name: string; can_exit: boolean }[];
  /** Filas que no se aplicarán, con el motivo. */
  skipped: { name: string; reason: string }[];
  vacancies: { create: string[]; update: string[]; unchanged: number };
  /** Bajas realmente aplicadas (solo tras aplicar con exit_missing). */
  exited: number;
}
const PALETTE = ['#5b5bf0', '#12a594', '#f5a524', '#e5484d', '#0091ff', '#a05bf0', '#f76b15', '#30a46c'];
const GRADE_ORDER = ['P4', 'P3', 'P2', 'P1', 'M4', 'M3', 'M2', 'M1'];
export const VACANCY_STATUSES = ['Pending PRF', 'Open', 'Recruiting', 'Offer', 'Filled', 'Cancelled'];
export const isClosing = (status?: string) => status === 'Filled' || status === 'Cancelled';
const key = (s?: string | null) => (s ?? '').trim().toLowerCase();
const isTbh = (r: ImportRow) => /^TBH/i.test(r.name.trim());

interface Ctx {
  people: ImportRow[]; tbh: ImportRow[]; duplicates: string[];
  byEmail: Map<string, number>; byName: Map<string, number>; nameOf: Map<number, string>; emailOf: Map<number, string>;
  chapters: Map<string, { id: number; name: string }>; grades: Map<string, { id: number; code: string }>;
}
function context(db: DB, rows: ImportRow[]): Ctx {
  const clean = rows.filter(r => r && typeof r.name === 'string' && r.name.trim());
  const members = all<{ id: number; name: string; email: string }>(db, 'SELECT id,name,email FROM members');
  // Una persona repetida en el fichero solo se procesa una vez (la primera fila).
  const seen = new Set<string>(), people: ImportRow[] = [], duplicates: string[] = [];
  for (const r of clean.filter(x => !isTbh(x))) {
    const ks = [key(r.name), ...(r.email?.trim() ? ['@' + key(r.email)] : [])];
    if (ks.some(k => seen.has(k))) duplicates.push(r.name.trim()); else { ks.forEach(k => seen.add(k)); people.push(r); }
  }
  return {
    people, tbh: clean.filter(isTbh), duplicates,
    byEmail: new Map(members.filter(m => m.email).map(m => [key(m.email), m.id])), byName: new Map(members.map(m => [key(m.name), m.id])),
    nameOf: new Map(members.map(m => [m.id, m.name])), emailOf: new Map(members.map(m => [m.id, m.email])),
    chapters: new Map(all<{ id: number; name: string }>(db, 'SELECT id,name FROM chapters').map(c => [key(c.name), c])),
    grades: new Map(all<{ id: number; code: string }>(db, 'SELECT id,code FROM grades').map(g => [key(g.code), g])),
  };
}
const findMember = (c: Ctx, r: ImportRow) => (r.email && c.byEmail.get(key(r.email))) || c.byName.get(key(r.name));

/** Qué versión de una persona existente modifica la importación con esa fecha efectiva (misma regla en preview y al aplicar). */
type Target = { kind: 'version'; v: Version; correction: boolean } | { kind: 'rehire' } | { kind: 'skip'; reason: string };
function targetOf(db: DB, id: number, eff: string): Target {
  if (!openVersion(db, id)) {
    const last = versionsOf(db, id).at(-1)!;
    return eff >= last.valid_to! ? { kind: 'rehire' } : { kind: 'skip', reason: `tiene una baja con fecha ${last.valid_to}, posterior a la fecha efectiva` };
  }
  const base = baseVersion(db, id)!;
  if (eff < base.valid_from) return { kind: 'version', v: base, correction: true };   // fecha anterior a su último cambio: se rectifica la situación vigente
  const v = versionAt(db, id, eff);
  return v ? { kind: 'version', v, correction: false } : { kind: 'skip', reason: 'no está en la organización en la fecha efectiva' };
}
const canExit = (db: DB, id: number, eff: string) => { const b = baseVersion(db, id); return !!b && !!openVersion(db, id) && eff > b.valid_from; };

export function planImport(db: DB, payload: ImportPayload): ImportPlan {
  const eff = payload.effective_date ?? today();
  if (!isDate(eff)) throw new HttpError(400, 'Fecha efectiva no válida');
  const c = context(db, payload.rows);
  if (!c.people.length && !c.tbh.length) throw new HttpError(400, 'El fichero no contiene filas válidas');
  const plan: ImportPlan = { effective_date: eff, newChapters: [], newGrades: [], placeholders: [], create: [], update: [], rehire: [], unchanged: 0, missing: [], skipped: [], vacancies: { create: [], update: [], unchanged: 0 }, exited: 0 };
  plan.skipped.push(...c.duplicates.map(name => ({ name, reason: 'fila duplicada en el fichero' })));
  const add = (list: string[], v?: string) => { if (v?.trim() && !list.some(x => key(x) === key(v))) list.push(v.trim()); };
  for (const r of [...c.people, ...c.tbh]) {
    if (r.chapter && !c.chapters.has(key(r.chapter))) add(plan.newChapters, r.chapter);
    if (r.grade && !c.grades.has(key(r.grade))) add(plan.newGrades, r.grade);
  }
  const inFile = new Set(c.people.map(r => key(r.name)));
  for (const r of [...c.people, ...c.tbh]) if (r.manager && !inFile.has(key(r.manager)) && !c.byName.has(key(r.manager))) add(plan.placeholders, r.manager);
  const matched = new Set<number>(), chName = new Map([...c.chapters.values()].map(x => [x.id, x.name])), grCode = new Map([...c.grades.values()].map(x => [x.id, x.code]));
  for (const r of c.people) {
    const id = findMember(c, r);
    if (!id) { plan.create.push({ name: r.name.trim(), chapter: r.chapter ?? '', grade: r.grade ?? '', manager: r.manager ?? '' }); continue; }
    matched.add(id);
    const t = targetOf(db, id, eff);
    if (t.kind === 'skip') { plan.skipped.push({ name: r.name.trim(), reason: t.reason }); continue; }
    if (t.kind === 'rehire') { plan.rehire.push({ id, name: r.name.trim() }); continue; }
    const cur = t.v, changes: Change[] = [];
    const cmp = (field: string, from: string, to?: string) => { if (to !== undefined && to.trim() !== '' && key(from) !== key(to)) changes.push({ field, from: from || '—', to: to.trim() }); };
    cmp('email', c.emailOf.get(id) ?? '', r.email); cmp('título', cur.title, r.title); cmp('chapter', chName.get(cur.chapter_id ?? -1) ?? '', r.chapter); cmp('grado', grCode.get(cur.grade_id ?? -1) ?? '', r.grade);
    const mgrId = r.manager ? c.byName.get(key(r.manager)) : undefined;      // un manager que ya no está activo no se asigna (igual que al aplicar)
    if (mgrId === undefined || versionAt(db, mgrId, t.correction ? (cur.valid_from > today() ? cur.valid_from : today()) : eff)) cmp('manager', c.nameOf.get(cur.manager_id ?? -1) ?? '', r.manager);
    cmp('país', cur.country, r.country); cmp('ciudad', cur.city, r.city);
    if (changes.length) plan.update.push({ id, name: r.name.trim(), changes }); else plan.unchanged++;
  }
  const referenced = new Set([...c.people, ...c.tbh].map(r => key(r.manager)));
  for (const m of all<{ id: number; name: string }>(db, 'SELECT m.id, m.name FROM members m JOIN member_versions v ON v.member_id=m.id AND v.valid_to IS NULL'))
    if (!matched.has(m.id) && !referenced.has(key(m.name))) plan.missing.push({ ...m, can_exit: canExit(db, m.id, eff) });
  for (const r of c.tbh) {
    const v = findVacancy(db, r);
    if (!v) plan.vacancies.create.push(r.name.trim());
    else if (vacancyMerge(c, v, r).changed) plan.vacancies.update.push(r.name.trim()); else plan.vacancies.unchanged++;
  }
  return plan;
}

interface Vac { id: number; code: string; title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; status: string; prf: string; sap: string; comments: string; closed_at: string | null }
/** Busca la vacante por posición SAP o por código; si hay varias, prefiere la abierta y, después, la más reciente. */
const findVacancy = (db: DB, r: ImportRow) =>
  (r.sap?.trim() && get<Vac>(db, 'SELECT * FROM vacancies WHERE sap=? ORDER BY (closed_at IS NOT NULL), id DESC LIMIT 1', r.sap.trim()))
  || get<Vac>(db, 'SELECT * FROM vacancies WHERE code=? ORDER BY (closed_at IS NOT NULL), id DESC LIMIT 1', r.name.trim());
const vacStatus = (s?: string) => VACANCY_STATUSES.find(x => key(x) === key(s));
/** Valores resultantes de aplicar una fila sobre una vacante: una celda vacía conserva el valor existente. */
function vacancyMerge(c: Ctx, v: Vac | undefined, r: ImportRow) {
  const next = {
    title: r.title?.trim() || v?.title || '', chapter_id: (r.chapter?.trim() ? c.chapters.get(key(r.chapter))?.id : undefined) ?? v?.chapter_id ?? null,
    grade_id: (r.grade?.trim() ? c.grades.get(key(r.grade))?.id : undefined) ?? v?.grade_id ?? null, manager_id: (r.manager?.trim() ? c.byName.get(key(r.manager)) : undefined) ?? v?.manager_id ?? null,
    status: vacStatus(r.hiring) ?? v?.status ?? 'Open', prf: r.prf?.trim() || v?.prf || '', sap: r.sap?.trim() || v?.sap || '', comments: r.comments?.trim() || v?.comments || '',
  };
  const changed = !v || (Object.keys(next) as (keyof typeof next)[]).some(k => next[k] !== v[k]);
  return { next, changed };
}

export function applyImport(db: DB, actor: Actor, payload: ImportPayload): ImportPlan {
  return tx(db, () => {
    const plan = planImport(db, payload), eff = plan.effective_date;
    plan.newChapters.forEach((name, i) => run(db, 'INSERT INTO chapters(name,color) VALUES(?,?)', name, PALETTE[(i + get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM chapters')!.n) % PALETTE.length]));
    for (const code of plan.newGrades) run(db, 'INSERT INTO grades(code,level) VALUES(?,?)', code, GRADE_ORDER.indexOf(code.toUpperCase()) + 1);
    for (const name of plan.placeholders) createMember(db, actor, { name, hire_date: eff, reason: 'Creado por importación (referenciado como manager)' });
    let c = context(db, payload.rows);
    const fields = (r: ImportRow): MemberInput => ({
      title: r.title?.trim() || undefined, chapter_id: r.chapter ? c.chapters.get(key(r.chapter))?.id : undefined, grade_id: r.grade ? c.grades.get(key(r.grade))?.id : undefined,
      country: r.country?.trim() || undefined, city: r.city?.trim() || undefined,
    });
    for (const r of c.people) if (!findMember(c, r)) createMember(db, actor, { name: r.name.trim(), email: r.email?.trim(), hire_date: eff, reason: 'Importación', ...fields(r) });
    c = context(db, payload.rows);
    for (const r of c.people) {
      const id = findMember(c, r)!;
      let t = targetOf(db, id, eff);
      if (t.kind === 'skip') continue;
      if (t.kind === 'rehire') { rehireMember(db, actor, id, eff, {}); t = targetOf(db, id, eff); if (t.kind !== 'version') continue; }
      const mgr = r.manager ? c.byName.get(key(r.manager)) : undefined;
      // Un manager que no está activo en la fecha efectiva (p. ej. de baja) no se asigna: se conserva el actual.
      const mgrOk = mgr !== undefined && mgr !== id && !!versionAt(db, mgr, t.correction ? (t.v.valid_from > today() ? t.v.valid_from : today()) : eff);
      updateMember(db, actor, id, { ...fields(r), email: r.email?.trim() || undefined, manager_id: mgrOk ? mgr : undefined, effective_date: eff, correction: t.correction, reason: 'Importación' });
    }
    if (payload.exit_missing) for (const m of plan.missing) {
      if (!canExit(db, m.id, eff)) continue;
      exitMember(db, actor, m.id, eff, 'No aparece en la importación', null, true); plan.exited++;
    }
    const descs = all<{ id: number }>(db, "SELECT id FROM grades WHERE description=''");
    for (const g of descs) {                                               // descripción del grado = título más frecuente
      const t = get<{ title: string }>(db, "SELECT title FROM member_versions WHERE grade_id=? AND valid_to IS NULL AND title<>'' GROUP BY title ORDER BY COUNT(*) DESC LIMIT 1", g.id);
      if (t) run(db, 'UPDATE grades SET description=? WHERE id=?', t.title, g.id);
    }
    for (const r of c.tbh) {
      const v = findVacancy(db, r), { next, changed } = vacancyMerge(c, v, r);
      const closedAt = isClosing(next.status) ? (v?.closed_at ?? eff) : null;
      if (!v) {
        const id = run(db, 'INSERT INTO vacancies(code,title,chapter_id,grade_id,manager_id,status,prf,sap,comments,opened_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          r.name.trim(), next.title, next.chapter_id, next.grade_id, next.manager_id, next.status, next.prf, next.sap, next.comments, eff, closedAt);
        run(db, 'INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,?,?,?)', id, next.status, eff, actor.name);
      } else if (changed) {
        run(db, 'UPDATE vacancies SET title=?,chapter_id=?,grade_id=?,manager_id=?,status=?,prf=?,sap=?,comments=?,closed_at=?,filled_by=CASE WHEN ? IS NULL THEN NULL ELSE filled_by END WHERE id=?',
          next.title, next.chapter_id, next.grade_id, next.manager_id, next.status, next.prf, next.sap, next.comments, closedAt, closedAt, v.id);
        if (v.status !== next.status) run(db, 'INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,?,?,?)', v.id, next.status, eff, actor.name);
      }
    }
    audit(db, actor, 'import', null, 'import', `Importación con fecha ${eff}: ${plan.create.length} altas, ${plan.update.length} cambios, ${plan.rehire.length} reincorporaciones, ${plan.exited} bajas, ${plan.vacancies.create.length + plan.vacancies.update.length} vacantes${plan.skipped.length ? `, ${plan.skipped.length} filas omitidas` : ''}`);
    return plan;
  });
}
