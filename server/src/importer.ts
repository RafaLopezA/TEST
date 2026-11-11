/** Importación desde Excel/CSV (formato peopleTemp): calcula un plan (preview) y lo aplica generando histórico. */
import type { DB } from './db.ts';
import { all, get, run, tx } from './db.ts';
import { createMember, exitMember, openVersion, rehireMember, updateMember } from './members.ts';
import type { MemberInput } from './members.ts';
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
  unchanged: number; missing: { id: number; name: string }[];
  vacancies: { create: string[]; update: string[]; unchanged: number };
}
const PALETTE = ['#5b5bf0', '#12a594', '#f5a524', '#e5484d', '#0091ff', '#a05bf0', '#f76b15', '#30a46c'];
const GRADE_ORDER = ['P4', 'P3', 'P2', 'P1', 'M4', 'M3', 'M2', 'M1'];
export const VACANCY_STATUSES = ['Pending PRF', 'Open', 'Recruiting', 'Offer', 'Filled', 'Cancelled'];
const key = (s?: string | null) => (s ?? '').trim().toLowerCase();
const isTbh = (r: ImportRow) => /^TBH/i.test(r.name.trim());

interface Ctx {
  people: ImportRow[]; tbh: ImportRow[];
  byEmail: Map<string, number>; byName: Map<string, number>; nameOf: Map<number, string>;
  chapters: Map<string, { id: number; name: string }>; grades: Map<string, { id: number; code: string }>;
}
function context(db: DB, rows: ImportRow[]): Ctx {
  const clean = rows.filter(r => r && typeof r.name === 'string' && r.name.trim());
  const members = all<{ id: number; name: string; email: string }>(db, 'SELECT id,name,email FROM members');
  return {
    people: clean.filter(r => !isTbh(r)), tbh: clean.filter(isTbh),
    byEmail: new Map(members.filter(m => m.email).map(m => [key(m.email), m.id])), byName: new Map(members.map(m => [key(m.name), m.id])),
    nameOf: new Map(members.map(m => [m.id, m.name])),
    chapters: new Map(all<{ id: number; name: string }>(db, 'SELECT id,name FROM chapters').map(c => [key(c.name), c])),
    grades: new Map(all<{ id: number; code: string }>(db, 'SELECT id,code FROM grades').map(g => [key(g.code), g])),
  };
}
const findMember = (c: Ctx, r: ImportRow) => (r.email && c.byEmail.get(key(r.email))) || c.byName.get(key(r.name));

export function planImport(db: DB, payload: ImportPayload): ImportPlan {
  const eff = payload.effective_date ?? today();
  if (!isDate(eff)) throw new HttpError(400, 'Fecha efectiva no válida');
  const c = context(db, payload.rows);
  if (!c.people.length && !c.tbh.length) throw new HttpError(400, 'El fichero no contiene filas válidas');
  const plan: ImportPlan = { effective_date: eff, newChapters: [], newGrades: [], placeholders: [], create: [], update: [], rehire: [], unchanged: 0, missing: [], vacancies: { create: [], update: [], unchanged: 0 } };
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
    const cur = openVersion(db, id);
    if (!cur) { plan.rehire.push({ id, name: r.name.trim() }); continue; }
    const changes: Change[] = [];
    const cmp = (field: string, from: string, to?: string) => { if (to !== undefined && to.trim() !== '' && key(from) !== key(to)) changes.push({ field, from: from || '—', to: to.trim() }); };
    cmp('título', cur.title, r.title); cmp('chapter', chName.get(cur.chapter_id ?? -1) ?? '', r.chapter); cmp('grado', grCode.get(cur.grade_id ?? -1) ?? '', r.grade);
    cmp('manager', c.nameOf.get(cur.manager_id ?? -1) ?? '', r.manager); cmp('país', cur.country, r.country); cmp('ciudad', cur.city, r.city);
    if (changes.length) plan.update.push({ id, name: r.name.trim(), changes }); else plan.unchanged++;
  }
  const referenced = new Set([...c.people, ...c.tbh].map(r => key(r.manager)));
  for (const m of all<{ id: number; name: string }>(db, 'SELECT m.id, m.name FROM members m JOIN member_versions v ON v.member_id=m.id AND v.valid_to IS NULL'))
    if (!matched.has(m.id) && !referenced.has(key(m.name))) plan.missing.push(m);
  for (const r of c.tbh) {
    const v = findVacancy(db, r);
    if (!v) plan.vacancies.create.push(r.name.trim());
    else if (vacancyDiff(db, c, v, r)) plan.vacancies.update.push(r.name.trim()); else plan.vacancies.unchanged++;
  }
  return plan;
}

interface Vac { id: number; code: string; title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; status: string; prf: string; sap: string; comments: string }
const findVacancy = (db: DB, r: ImportRow) =>
  (r.sap?.trim() && get<Vac>(db, 'SELECT * FROM vacancies WHERE sap=? AND closed_at IS NULL', r.sap.trim())) || get<Vac>(db, 'SELECT * FROM vacancies WHERE code=? AND closed_at IS NULL', r.name.trim());
const vacStatus = (s?: string) => VACANCY_STATUSES.find(x => key(x) === key(s)) ?? 'Open';
function vacancyDiff(db: DB, c: Ctx, v: Vac, r: ImportRow): boolean {
  return v.status !== vacStatus(r.hiring) || (!!r.prf && v.prf !== r.prf.trim()) || (!!r.title && v.title !== r.title.trim()) || (!!r.comments && v.comments !== r.comments.trim())
    || (!!r.chapter && v.chapter_id !== c.chapters.get(key(r.chapter))?.id) || (!!r.grade && v.grade_id !== c.grades.get(key(r.grade))?.id) || (!!r.manager && v.manager_id !== c.byName.get(key(r.manager)));
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
      let cur = openVersion(db, id);
      if (!cur) { rehireMember(db, actor, id, eff, {}); cur = openVersion(db, id)!; }
      const mgr = r.manager ? c.byName.get(key(r.manager)) : undefined;
      updateMember(db, actor, id, { ...fields(r), email: r.email?.trim() || undefined, manager_id: mgr !== undefined && mgr !== id ? mgr : undefined,
        effective_date: eff, correction: eff <= cur.valid_from, reason: 'Importación' });
    }
    if (payload.exit_missing) for (const m of plan.missing) {
      const cur = openVersion(db, m.id);
      if (cur && eff > cur.valid_from) exitMember(db, actor, m.id, eff, 'No aparece en la importación', null, true);
    }
    const descs = all<{ id: number }>(db, "SELECT id FROM grades WHERE description=''");
    for (const g of descs) {                                               // descripción del grado = título más frecuente
      const t = get<{ title: string }>(db, "SELECT title FROM member_versions WHERE grade_id=? AND valid_to IS NULL AND title<>'' GROUP BY title ORDER BY COUNT(*) DESC LIMIT 1", g.id);
      if (t) run(db, 'UPDATE grades SET description=? WHERE id=?', t.title, g.id);
    }
    for (const r of c.tbh) {
      const v = findVacancy(db, r), status = vacStatus(r.hiring);
      const vals = [r.title?.trim() ?? '', c.chapters.get(key(r.chapter))?.id ?? null, c.grades.get(key(r.grade))?.id ?? null, c.byName.get(key(r.manager)) ?? null, status, r.prf?.trim() ?? '', r.sap?.trim() ?? '', r.comments?.trim() ?? ''] as const;
      if (!v) {
        const id = run(db, 'INSERT INTO vacancies(code,title,chapter_id,grade_id,manager_id,status,prf,sap,comments,opened_at) VALUES(?,?,?,?,?,?,?,?,?,?)', r.name.trim(), ...vals, eff);
        run(db, 'INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,?,?,?)', id, status, eff, actor.name);
      } else if (vacancyDiff(db, c, v, r)) {
        run(db, 'UPDATE vacancies SET title=?,chapter_id=?,grade_id=?,manager_id=?,status=?,prf=?,sap=?,comments=? WHERE id=?', ...vals, v.id);
        if (v.status !== status) run(db, 'INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,?,?,?)', v.id, status, eff, actor.name);
      }
    }
    audit(db, actor, 'import', null, 'import', `Importación con fecha ${eff}: ${plan.create.length} altas, ${plan.update.length} cambios, ${plan.rehire.length} reincorporaciones, ${payload.exit_missing ? plan.missing.length : 0} bajas, ${plan.vacancies.create.length + plan.vacancies.update.length} vacantes`);
    return plan;
  });
}
