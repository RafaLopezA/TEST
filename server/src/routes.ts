import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import type { DB } from './db.ts';
import { all, exec, get, run, setSetting, setting, tx } from './db.ts';
import { authenticate, clearSession, hashPassword, loginBlocked, loginResult, requireRole, setSession, verifyPassword } from './auth.ts';
import type { User } from './auth.ts';
import { applyImport, isClosing, planImport, VACANCY_STATUSES } from './importer.ts';
import { createMember, deleteMember, exitMember, getMember, rehireMember, updateMember, versionAt, versionsOf } from './members.ts';
import { movements, roster, snapshot, timeline } from './temporal.ts';
import { HttpError, addYears, audit, dateOr, isDate, today } from './util.ts';

const date = z.string().refine(isDate, 'Fecha no válida (AAAA-MM-DD)');
const idn = z.number().int().positive().nullable();
const str = (max = 300) => z.string().trim().max(max);
const memberBody = z.object({
  name: str(200), email: str(200), skills: str(1000), notes: str(4000), hire_date: date, title: str(200),
  chapter_id: idn, grade_id: idn, manager_id: idn, country: str(100), city: str(100),
  effective_date: date, reason: str(500), correction: z.boolean(),
}).partial();
const vacancyBody = z.object({
  code: str(200), title: str(200), chapter_id: idn, grade_id: idn, manager_id: idn, status: z.enum(VACANCY_STATUSES as [string, ...string[]]),
  prf: str(50), sap: str(50), target_start: date.nullable(), comments: str(2000), opened_at: date,
}).partial();
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200);
const role = z.enum(['admin', 'editor', 'viewer']);
const found = (changes: number, what: string) => { if (!changes) throw new HttpError(404, `${what} no encontrado`); };
const pid = (req: Request) => { const n = Number(req.params.id); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador no válido'); return n; };
const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active });

export function apiRouter(db: DB): Router {
  const r = Router();
  const editor = requireRole('editor'), admin = requireRole('admin');

  /* ---------- sesión ---------- */
  r.post('/auth/login', (req, res) => {
    const { email, password: pw } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const ip = req.ip ?? '', who = email.toLowerCase();
    loginBlocked(ip, who);
    const u = get<User>(db, 'SELECT * FROM users WHERE email=? AND active=1', email);
    const ok = !!u && verifyPassword(pw, u.password_hash);
    loginResult(ip, who, ok);
    if (!ok) throw new HttpError(401, 'Email o contraseña incorrectos');
    setSession(db, res, u!);
    res.json(publicUser(u!));
  });
  r.post('/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

  r.use(authenticate(db));
  r.get('/auth/me', (req, res) => { res.json(publicUser(req.user!)); });
  r.post('/auth/password', (req, res) => {
    const b = z.object({ current: z.string(), next: password }).parse(req.body);
    if (!verifyPassword(b.current, req.user!.password_hash)) throw new HttpError(400, 'La contraseña actual no es correcta');
    // Invalida el resto de sesiones del usuario y renueva la actual.
    run(db, 'UPDATE users SET password_hash=?, token_version=token_version+1 WHERE id=?', hashPassword(b.next), req.user!.id);
    setSession(db, res, { id: req.user!.id, token_version: req.user!.token_version + 1 });
    audit(db, req.actor, 'user', req.user!.id, 'password', `${req.user!.name} cambió su contraseña`);
    res.json({ ok: true });
  });

  /* ---------- catálogos ---------- */
  r.get('/meta', (_req, res) => {
    res.json({
      org_name: setting(db, 'org_name', () => 'Mi organización'), today: today(), vacancy_statuses: VACANCY_STATUSES,
      chapters: all(db, 'SELECT * FROM chapters ORDER BY name'), grades: all(db, 'SELECT * FROM grades ORDER BY level DESC, code'),
      first_date: get<{ d: string | null }>(db, 'SELECT MIN(valid_from) AS d FROM member_versions')?.d ?? today(),
    });
  });
  r.put('/settings', admin, (req, res) => {
    const b = z.object({ org_name: str(100).min(1) }).parse(req.body);
    setSetting(db, 'org_name', b.org_name); audit(db, req.actor, 'settings', null, 'update', `Nombre de la organización: ${b.org_name}`);
    res.json({ ok: true });
  });
  const chapterBody = z.object({ name: str(100).min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
  r.post('/chapters', editor, (req, res) => {
    const b = chapterBody.parse(req.body);
    if (get(db, 'SELECT 1 FROM chapters WHERE name=?', b.name)) throw new HttpError(409, 'Ya existe un chapter con ese nombre');
    const id = run(db, 'INSERT INTO chapters(name,color) VALUES(?,?)', b.name, b.color);
    audit(db, req.actor, 'chapter', id, 'create', `Nuevo chapter: ${b.name}`); res.status(201).json({ id });
  });
  r.put('/chapters/:id', editor, (req, res) => {
    const b = chapterBody.parse(req.body), id = pid(req);
    if (get(db, 'SELECT 1 FROM chapters WHERE name=? AND id<>?', b.name, id)) throw new HttpError(409, 'Ya existe un chapter con ese nombre');
    found(exec(db, 'UPDATE chapters SET name=?, color=? WHERE id=?', b.name, b.color, id), 'Chapter');
    audit(db, req.actor, 'chapter', id, 'update', `Chapter actualizado: ${b.name}`); res.json({ ok: true });
  });
  r.delete('/chapters/:id', editor, (req, res) => {
    const id = pid(req);
    if (get(db, 'SELECT 1 FROM member_versions WHERE chapter_id=? UNION SELECT 1 FROM vacancies WHERE chapter_id=?', id, id)) throw new HttpError(409, 'El chapter está en uso (actualmente o en el histórico) y no se puede borrar');
    found(exec(db, 'DELETE FROM chapters WHERE id=?', id), 'Chapter'); audit(db, req.actor, 'chapter', id, 'delete', 'Chapter borrado'); res.json({ ok: true });
  });
  const gradeBody = z.object({ code: str(20).min(1), description: str(200), level: z.number().int().min(0).max(100) });
  r.post('/grades', editor, (req, res) => {
    const b = gradeBody.parse(req.body);
    if (get(db, 'SELECT 1 FROM grades WHERE code=?', b.code)) throw new HttpError(409, 'Ya existe un grado con ese código');
    const id = run(db, 'INSERT INTO grades(code,description,level) VALUES(?,?,?)', b.code, b.description, b.level);
    audit(db, req.actor, 'grade', id, 'create', `Nuevo grado: ${b.code}`); res.status(201).json({ id });
  });
  r.put('/grades/:id', editor, (req, res) => {
    const b = gradeBody.parse(req.body), id = pid(req);
    if (get(db, 'SELECT 1 FROM grades WHERE code=? AND id<>?', b.code, id)) throw new HttpError(409, 'Ya existe un grado con ese código');
    found(exec(db, 'UPDATE grades SET code=?, description=?, level=? WHERE id=?', b.code, b.description, b.level, id), 'Grado');
    audit(db, req.actor, 'grade', id, 'update', `Grado actualizado: ${b.code}`); res.json({ ok: true });
  });
  r.delete('/grades/:id', editor, (req, res) => {
    const id = pid(req);
    if (get(db, 'SELECT 1 FROM member_versions WHERE grade_id=? UNION SELECT 1 FROM vacancies WHERE grade_id=?', id, id)) throw new HttpError(409, 'El grado está en uso (actualmente o en el histórico) y no se puede borrar');
    found(exec(db, 'DELETE FROM grades WHERE id=?', id), 'Grado'); audit(db, req.actor, 'grade', id, 'delete', 'Grado borrado'); res.json({ ok: true });
  });

  /* ---------- miembros ---------- */
  r.get('/members', (req, res) => {
    const asOf = dateOr(req.query.asOf, today());
    res.json(req.query.all === '1' ? roster(db, asOf) : snapshot(db, asOf));
  });
  r.get('/members/:id', (req, res) => {
    const id = pid(req);
    res.json({ member: getMember(db, id), versions: versionsOf(db, id),
      audit: all(db, "SELECT id,at,user_name,action,summary,detail FROM audit_log WHERE entity='member' AND entity_id=? ORDER BY id DESC LIMIT 100", id) });
  });
  r.post('/members', editor, (req, res) => { res.status(201).json({ id: createMember(db, req.actor, memberBody.parse(req.body)) }); });
  r.patch('/members/:id', editor, (req, res) => { res.json(updateMember(db, req.actor, pid(req), memberBody.parse(req.body))); });
  r.post('/members/:id/exit', editor, (req, res) => {
    const b = z.object({ date, reason: str(500).default(''), reassign_to: idn.optional() }).parse(req.body);
    exitMember(db, req.actor, pid(req), b.date, b.reason, b.reassign_to); res.json({ ok: true });
  });
  r.post('/members/:id/rehire', editor, (req, res) => {
    const b = z.object({ date }).merge(memberBody.pick({ title: true, chapter_id: true, grade_id: true, manager_id: true, country: true, city: true })).parse(req.body);
    const { date: d, ...v } = b; rehireMember(db, req.actor, pid(req), d, v); res.json({ ok: true });
  });
  r.delete('/members/:id', admin, (req, res) => { deleteMember(db, req.actor, pid(req)); res.json({ ok: true }); });

  /* ---------- vacantes ---------- */
  r.get('/vacancies', (_req, res) => {
    const events = all<{ vacancy_id: number }>(db, 'SELECT vacancy_id,status,at,user_name FROM vacancy_events ORDER BY id');
    res.json(all<{ id: number }>(db, 'SELECT * FROM vacancies ORDER BY opened_at DESC, id DESC').map(v => ({ ...v, events: events.filter(e => e.vacancy_id === v.id) })));
  });
  const closing = isClosing;
  /** Comprueba las referencias antes de escribir (si no, SQLite fallaría con un error de clave foránea). */
  const checkVacancyRefs = (b: z.infer<typeof vacancyBody>) => {
    if (b.chapter_id != null && !get(db, 'SELECT 1 FROM chapters WHERE id=?', b.chapter_id)) throw new HttpError(400, 'El chapter no existe');
    if (b.grade_id != null && !get(db, 'SELECT 1 FROM grades WHERE id=?', b.grade_id)) throw new HttpError(400, 'El grado no existe');
    if (b.manager_id != null) {
      if (!get(db, 'SELECT 1 FROM members WHERE id=?', b.manager_id)) throw new HttpError(400, 'El manager no existe');
      if (!versionAt(db, b.manager_id, today())) throw new HttpError(400, 'El manager no está activo');
    }
  };
  r.post('/vacancies', editor, (req, res) => {
    const b = vacancyBody.parse(req.body);
    if (!b.code) throw new HttpError(400, 'El código es obligatorio');
    checkVacancyRefs(b);
    const opened = b.opened_at ?? today(), status = b.status ?? 'Open';
    const id = tx(db, () => {
      const vid = run(db, 'INSERT INTO vacancies(code,title,chapter_id,grade_id,manager_id,status,prf,sap,target_start,comments,opened_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        b.code!, b.title ?? '', b.chapter_id ?? null, b.grade_id ?? null, b.manager_id ?? null, status, b.prf ?? '', b.sap ?? '', b.target_start ?? null, b.comments ?? '', opened, closing(status) ? today() : null);
      run(db, 'INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,?,?,?)', vid, status, opened, req.actor.name);
      audit(db, req.actor, 'vacancy', vid, 'create', `Nueva vacante: ${b.code}`);
      return vid;
    });
    res.status(201).json({ id });
  });
  r.patch('/vacancies/:id', editor, (req, res) => {
    const b = vacancyBody.parse(req.body), id = pid(req);
    const v = get<{ status: string; code: string }>(db, 'SELECT * FROM vacancies WHERE id=?', id);
    if (!v) throw new HttpError(404, 'Vacante no encontrada');
    if (b.code !== undefined && !b.code) throw new HttpError(400, 'El código es obligatorio');
    checkVacancyRefs(b);
    tx(db, () => {
      const keys = Object.keys(b) as (keyof typeof b)[];
      if (keys.length) run(db, `UPDATE vacancies SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`, ...keys.map(k => b[k] as string | number | null), id);
      if (b.status && b.status !== v.status) {
        run(db, 'INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,?,?,?)', id, b.status, today(), req.actor.name);
        // Al reabrir deja de estar cubierta: se desvincula de la persona que la ocupó.
        run(db, 'UPDATE vacancies SET closed_at=?, filled_by=CASE WHEN ? THEN filled_by ELSE NULL END WHERE id=?', closing(b.status) ? today() : null, b.status === 'Filled' ? 1 : 0, id);
        audit(db, req.actor, 'vacancy', id, 'status', `Vacante ${v.code}: ${v.status} → ${b.status}`);
      } else audit(db, req.actor, 'vacancy', id, 'update', `Vacante ${v.code} actualizada`, b);
    });
    res.json({ ok: true });
  });
  r.post('/vacancies/:id/fill', editor, (req, res) => {
    const b = z.object({ name: str(200).min(1), email: str(200).default(''), hire_date: date }).parse(req.body), id = pid(req);
    const v = get<{ code: string; title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; closed_at: string | null }>(db, 'SELECT * FROM vacancies WHERE id=?', id);
    if (!v) throw new HttpError(404, 'Vacante no encontrada');
    if (v.closed_at) throw new HttpError(409, 'La vacante ya está cerrada');
    const memberId = tx(db, () => {
      const mid = createMember(db, req.actor, { name: b.name, email: b.email, hire_date: b.hire_date, title: v.title, chapter_id: v.chapter_id, grade_id: v.grade_id, manager_id: v.manager_id, reason: `Cubre la vacante ${v.code}` });
      run(db, "UPDATE vacancies SET status='Filled', closed_at=?, filled_by=? WHERE id=?", today(), mid, id);
      run(db, "INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,'Filled',?,?)", id, today(), req.actor.name);
      audit(db, req.actor, 'vacancy', id, 'fill', `Vacante ${v.code} cubierta por ${b.name}`);
      return mid;
    });
    res.json({ member_id: memberId });
  });
  r.delete('/vacancies/:id', editor, (req, res) => {
    const id = pid(req); found(exec(db, 'DELETE FROM vacancies WHERE id=?', id), 'Vacante'); audit(db, req.actor, 'vacancy', id, 'delete', 'Vacante borrada'); res.json({ ok: true });
  });

  /* ---------- reportes ---------- */
  r.get('/reports/timeline', (req, res) => {
    const to = dateOr(req.query.to, today()), from = dateOr(req.query.from, addYears(to, -1));
    const g = z.enum(['chapter', 'grade', 'team', 'none']).catch('none').parse(req.query.groupBy);
    if (from > to) throw new HttpError(400, 'El rango de fechas no es válido');
    res.json(timeline(db, from, to, g));
  });
  r.get('/reports/movements', (req, res) => {
    const to = dateOr(req.query.to, today()), from = dateOr(req.query.from, addYears(to, -1));
    res.json(movements(db, from, to));
  });

  /* ---------- importación ---------- */
  const importBody = z.object({
    rows: z.array(z.object({ name: z.string() }).passthrough()).min(1).max(5000), effective_date: date.optional(), exit_missing: z.boolean().optional(),
  });
  const rowsOf = (b: z.infer<typeof importBody>) => b.rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? '' : String(v).trim()])) as { name: string });
  r.post('/import/preview', editor, (req, res) => { const b = importBody.parse(req.body); res.json(planImport(db, { ...b, rows: rowsOf(b) })); });
  r.post('/import/apply', editor, (req, res) => { const b = importBody.parse(req.body); res.json(applyImport(db, req.actor, { ...b, rows: rowsOf(b) })); });

  /* ---------- auditoría ---------- */
  r.get('/audit', editor, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200), offset = Math.max(Number(req.query.offset) || 0, 0);
    // Búsqueda literal: los comodines de LIKE que escriba el usuario se escapan; la entidad se compara por igualdad.
    const q = typeof req.query.q === 'string' && req.query.q ? `%${req.query.q.replace(/[\\%_]/g, c => '\\' + c)}%` : '%';
    const entity = typeof req.query.entity === 'string' && req.query.entity ? req.query.entity : null;
    const where = "(? IS NULL OR entity = ?) AND (summary LIKE ? ESCAPE '\\' OR user_name LIKE ? ESCAPE '\\')";
    res.json({
      total: get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM audit_log WHERE ${where}`, entity, entity, q, q)!.n,
      items: all(db, `SELECT * FROM audit_log WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, entity, entity, q, q, limit, offset),
    });
  });

  /* ---------- usuarios ---------- */
  r.get('/users', admin, (_req, res) => { res.json(all<User>(db, 'SELECT * FROM users ORDER BY name').map(publicUser)); });
  r.post('/users', admin, (req, res) => {
    const b = z.object({ email: z.string().email(), name: str(100).min(1), role, password }).parse(req.body);
    if (get(db, 'SELECT 1 FROM users WHERE email=?', b.email)) throw new HttpError(409, 'Ya existe un usuario con ese email');
    const id = run(db, 'INSERT INTO users(email,name,role,password_hash) VALUES(?,?,?,?)', b.email, b.name, b.role, hashPassword(b.password));
    audit(db, req.actor, 'user', id, 'create', `Nuevo usuario ${b.email} (${b.role})`); res.status(201).json({ id });
  });
  r.patch('/users/:id', admin, (req, res) => {
    const b = z.object({ name: str(100).min(1), role, active: z.boolean(), password }).partial().parse(req.body), id = pid(req);
    const u = get<User>(db, 'SELECT * FROM users WHERE id=?', id);
    if (!u) throw new HttpError(404, 'Usuario no encontrado');
    const losesAdmin = u.role === 'admin' && u.active && ((b.role && b.role !== 'admin') || b.active === false);
    if (losesAdmin && get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1")!.n <= 1) throw new HttpError(409, 'Debe quedar al menos un administrador activo');
    if (b.name !== undefined) run(db, 'UPDATE users SET name=? WHERE id=?', b.name, id);
    if (b.role !== undefined) run(db, 'UPDATE users SET role=? WHERE id=?', b.role, id);
    if (b.active !== undefined) run(db, 'UPDATE users SET active=? WHERE id=?', b.active ? 1 : 0, id);
    if (b.password !== undefined) run(db, 'UPDATE users SET password_hash=? WHERE id=?', hashPassword(b.password), id);
    // Cambiar contraseña, rol o estado cierra las sesiones abiertas de ese usuario (salvo la propia, que se renueva).
    if (b.password !== undefined || (b.role !== undefined && b.role !== u.role) || b.active === false) {
      run(db, 'UPDATE users SET token_version=token_version+1 WHERE id=?', id);
      if (id === req.user!.id) setSession(db, res, { id, token_version: u.token_version + 1 });
    }
    audit(db, req.actor, 'user', id, 'update', `Usuario ${u.email} actualizado (${Object.keys(b).join(', ')})`); res.json({ ok: true });
  });
  return r;
}
