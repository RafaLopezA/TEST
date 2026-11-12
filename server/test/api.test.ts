import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/auth.ts';
import { openDb, run } from '../src/db.ts';
import { seedDemo } from '../src/seed.ts';
import { snapshot, timeline } from '../src/temporal.ts';
import { addDays, addYears, isDate, today } from '../src/util.ts';

const db = openDb(':memory:');
for (const [email, role] of [['admin@t.io', 'admin'], ['editor@t.io', 'editor'], ['viewer@t.io', 'viewer']])
  run(db, 'INSERT INTO users(email,name,role,password_hash) VALUES(?,?,?,?)', email, role, role, hashPassword('secret123'));
const server = createApp(db).listen(0);
let base = '';
before(() => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`; });
after(() => server.close());

async function client(email: string) {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
}

test('autenticación y roles', async () => {
  assert.equal((await fetch(`${base}/members`)).status, 401);
  const bad = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@t.io', password: 'nope' }) });
  assert.equal(bad.status, 401);
  const viewer = await client('viewer@t.io'), editor = await client('editor@t.io');
  assert.equal((await viewer('GET', '/auth/me')).body.role, 'viewer');
  assert.equal((await viewer('POST', '/chapters', { name: 'X', color: '#000000' })).status, 403);
  assert.equal((await editor('GET', '/users')).status, 403);
  assert.equal((await viewer('GET', '/audit')).status, 403);
});

test('ciclo de vida de un miembro con histórico', async () => {
  const api = await client('editor@t.io');
  const ch1 = (await api('POST', '/chapters', { name: 'Backend', color: '#5b5bf0' })).body.id;
  const ch2 = (await api('POST', '/chapters', { name: 'Frontend', color: '#12a594' })).body.id;
  const g1 = (await api('POST', '/grades', { code: 'M4', description: 'Engineer', level: 4 })).body.id;
  const g2 = (await api('POST', '/grades', { code: 'M3', description: 'Senior', level: 5 })).body.id;
  assert.equal((await api('POST', '/chapters', { name: 'backend', color: '#000000' })).status, 409);

  const boss = (await api('POST', '/members', { name: 'Jefa, Ana', hire_date: '2024-01-01', grade_id: g2, chapter_id: ch1 })).body.id;
  const other = (await api('POST', '/members', { name: 'Otro, Luis', hire_date: '2024-01-01', grade_id: g2, chapter_id: ch1 })).body.id;
  const dev = (await api('POST', '/members', { name: 'Dev, Eva', hire_date: '2025-01-01', grade_id: g1, chapter_id: ch1, manager_id: boss, title: 'Engineer' })).body.id;

  // promoción con fecha efectiva + traslado posterior
  assert.equal((await api('PATCH', `/members/${dev}`, { grade_id: g2, effective_date: '2025-06-01', reason: 'Promo' })).status, 200);
  assert.equal((await api('PATCH', `/members/${dev}`, { chapter_id: ch2, effective_date: '2025-09-01' })).status, 200);
  assert.equal((await api('PATCH', `/members/${dev}`, { grade_id: g2, effective_date: '2025-02-01' })).status, 400, 'no se permite antedatar');
  assert.equal((await api('PATCH', `/members/${boss}`, { manager_id: dev })).status, 400, 'no se permiten ciclos');

  const at = async (d: string) => (await api('GET', `/members?asOf=${d}`)).body.find((m: any) => m.member_id === dev);
  assert.equal(await at('2024-12-31'), undefined);
  assert.equal((await at('2025-03-01')).grade_id, g1);
  assert.equal((await at('2025-07-01')).grade_id, g2);
  assert.equal((await at('2025-07-01')).chapter_id, ch1);
  assert.equal((await at('2025-10-01')).chapter_id, ch2);

  // corrección: no genera versión nueva
  await api('PATCH', `/members/${dev}`, { title: 'Senior Engineer', correction: true });
  const detail = (await api('GET', `/members/${dev}`)).body;
  assert.equal(detail.versions.length, 3);
  assert.equal(detail.versions[2].title, 'Senior Engineer');
  assert.ok(detail.audit.length >= 4);

  const moves = (await api('GET', '/reports/movements?from=2025-01-01&to=2025-12-31')).body.filter((m: any) => m.member_id === dev);
  assert.deepEqual(moves.map((m: any) => m.type).sort(), ['chapter', 'hire', 'promotion', 'title']);

  // baja de la manager: exige reasignar
  assert.equal((await api('POST', `/members/${boss}/exit`, { date: '2026-01-01' })).status, 400);
  assert.equal((await api('POST', `/members/${boss}/exit`, { date: '2026-01-01', reason: 'Baja', reassign_to: other })).status, 200);
  assert.equal((await at('2026-01-02')).manager_id, other);
  assert.equal((await at('2025-12-31')).manager_id, boss);
  const roster = (await api('GET', '/members?asOf=2026-02-01&all=1')).body;
  assert.equal(roster.find((m: any) => m.member_id === boss).state, 'exited');
  assert.equal((await api('PATCH', `/members/${boss}`, { title: 'x' })).status, 409);
  assert.equal((await api('POST', `/members/${boss}/rehire`, { date: '2026-03-01' })).status, 200);

  const tl = (await api('GET', '/reports/timeline?from=2025-11-01&to=2026-03-31&groupBy=chapter')).body;
  assert.deepEqual(tl.map((p: any) => p.total), [3, 3, 2, 2, 3]);
  assert.equal(tl[2].exits, 1);
  assert.equal(tl[4].hires, 1);
  assert.equal((await api('DELETE', `/chapters/${ch1}`)).status, 409);
});

test('vacantes: flujo y cobertura', async () => {
  const api = await client('editor@t.io');
  const id = (await api('POST', '/vacancies', { code: 'TBH - M4 BE 1', title: 'Engineer', status: 'Open', opened_at: '2026-01-10' })).body.id;
  assert.equal((await api('PATCH', `/vacancies/${id}`, { status: 'Recruiting' })).status, 200);
  const filled = await api('POST', `/vacancies/${id}/fill`, { name: 'Nueva, Persona', hire_date: '2026-04-01' });
  assert.equal(filled.status, 200);
  const v = (await api('GET', '/vacancies')).body.find((x: any) => x.id === id);
  assert.equal(v.status, 'Filled'); assert.equal(v.filled_by, filled.body.member_id); assert.equal(v.events.length, 3);
  assert.equal((await api('POST', `/vacancies/${id}/fill`, { name: 'Otra', hire_date: '2026-04-01' })).status, 409);
});

test('importación: preview y aplicación idempotente', async () => {
  const api = await client('admin@t.io');
  const rows = [
    { name: 'Director, Uno', email: 'd1@x.io', manager: 'Head, Boss', title: 'Director', grade: 'M2', chapter: 'Backend', country: 'Spain', city: 'Zaragoza' },
    { name: 'Persona, Dos', email: 'p2@x.io', manager: 'Director, Uno', title: 'Developer', grade: 'P1', chapter: 'Data', country: 'Spain', city: 'Zaragoza' },
    { name: 'TBH - P1 BE 1', manager: 'Director, Uno', title: 'Developer', grade: 'P1', chapter: 'Backend', hiring: 'Recruiting', sap: '123', prf: '9' },
  ];
  const pre = (await api('POST', '/import/preview', { rows, effective_date: '2026-05-01' })).body;
  assert.deepEqual(pre.newChapters, ['Data']); assert.deepEqual(pre.newGrades.sort(), ['M2', 'P1']); assert.deepEqual(pre.placeholders, ['Head, Boss']);
  assert.equal(pre.create.length, 2); assert.equal(pre.vacancies.create.length, 1);
  assert.equal((await api('POST', '/import/apply', { rows, effective_date: '2026-05-01' })).status, 200);
  const snap = (await api('GET', '/members?asOf=2026-05-02')).body;
  const p2 = snap.find((m: any) => m.name === 'Persona, Dos'), d1 = snap.find((m: any) => m.name === 'Director, Uno');
  assert.equal(p2.manager_id, d1.member_id); assert.equal(p2.team_id, d1.member_id);
  const again = (await api('POST', '/import/preview', { rows, effective_date: '2026-06-01' })).body;
  assert.equal(again.create.length, 0); assert.equal(again.update.length, 0); assert.equal(again.unchanged, 2); assert.equal(again.vacancies.unchanged, 1);
  rows[1].grade = 'M2';
  const third = (await api('POST', '/import/apply', { rows, effective_date: '2026-06-01' })).body;
  assert.equal(third.update.length, 1);
  const hist = (await api('GET', `/members/${p2.member_id}`)).body.versions;
  assert.equal(hist.length, 2); assert.equal(hist[1].valid_from, '2026-06-01');
});

test('gestión de usuarios', async () => {
  const api = await client('admin@t.io');
  assert.equal((await api('POST', '/users', { email: 'n@t.io', name: 'Nuevo', role: 'viewer', password: 'short' })).status, 400);
  const id = (await api('POST', '/users', { email: 'n@t.io', name: 'Nuevo', role: 'viewer', password: 'longenough1' })).body.id;
  assert.equal((await api('PATCH', `/users/${id}`, { active: false })).status, 200);
  const me = (await api('GET', '/auth/me')).body.id;
  assert.equal((await api('PATCH', `/users/${me}`, { role: 'viewer' })).status, 409, 'último admin');
});

test('datos de demostración', () => {
  const d = openDb(':memory:');
  seedDemo(d);
  const snap = snapshot(d, today());
  assert.ok(snap.length > 40, `headcount ${snap.length}`);
  assert.ok(snap.filter(m => m.manager_id === null).length === 1);
  const tl = timeline(d, `${Number(today().slice(0, 4)) - 2}-01-01`, today(), 'team');
  assert.ok(tl.length >= 24 && tl.at(-1)!.total === snap.length);
});

/* ---------- regresiones de la revisión de código ---------- */

test('cambios planificados a futuro no bloquean la operativa de hoy', async () => {
  const api = await client('editor@t.io');
  const meta = (await api('GET', '/meta')).body;
  const chA = meta.chapters[0].id, chB = meta.chapters[1].id, gLow = meta.grades.at(-1).id, gHigh = meta.grades[0].id;
  const past = addDays(today(), -200), future = addDays(today(), 60), t = today();
  const top = (await api('POST', '/members', { name: 'Fut, Top', hire_date: past })).body.id;
  const mgr = (await api('POST', '/members', { name: 'Fut, Manager', hire_date: past, manager_id: top })).body.id;
  const alt = (await api('POST', '/members', { name: 'Fut, Alt', hire_date: past, manager_id: top })).body.id;
  const dev = (await api('POST', '/members', { name: 'Fut, Dev', hire_date: past, manager_id: mgr, chapter_id: chA, grade_id: gLow, title: 'Dev' })).body.id;
  const at = async (d: string) => (await api('GET', `/members?asOf=${d}`)).body.find((m: any) => m.member_id === dev);

  // promoción planificada: hoy sigue con el grado antiguo
  assert.equal((await api('PATCH', `/members/${dev}`, { grade_id: gHigh, effective_date: future, reason: 'Planificada' })).status, 200);
  assert.equal((await at(t)).grade_id, gLow);
  assert.equal((await at(future)).grade_id, gHigh);

  // editar hoy sigue funcionando y el cambio se arrastra a la versión futura, que conserva su propia promoción
  assert.equal((await api('PATCH', `/members/${dev}`, { chapter_id: chB, effective_date: t })).status, 200);
  assert.equal((await at(addDays(t, -1))).chapter_id, chA);
  assert.equal((await at(t)).chapter_id, chB);
  assert.equal((await at(t)).grade_id, gLow);
  assert.equal((await at(future)).chapter_id, chB);
  assert.equal((await at(future)).grade_id, gHigh);
  // una corrección rectifica la situación vigente hoy, no la futura
  assert.equal((await api('PATCH', `/members/${dev}`, { title: 'Developer', correction: true })).status, 200);
  assert.equal((await at(t)).title, 'Developer');
  assert.equal((await at(future)).title, 'Developer');
  assert.equal((await api('GET', `/members/${dev}`)).body.versions.length, 3);

  // la baja de su manager hoy reasigna también la versión futura
  assert.equal((await api('POST', `/members/${mgr}/exit`, { date: t, reason: 'Baja', reassign_to: alt })).status, 200);
  assert.equal((await at(addDays(t, -1))).manager_id, mgr);
  assert.equal((await at(t)).manager_id, alt);
  assert.equal((await at(future)).manager_id, alt);

  // no se puede asignar un manager que ya no está activo
  assert.equal((await api('PATCH', `/members/${dev}`, { manager_id: mgr })).status, 400);
  assert.equal((await api('POST', '/members', { name: 'Fut, Otro', manager_id: mgr })).status, 400);

  // la baja de la persona anula sus cambios planificados
  const exitDay = addDays(t, 10);
  assert.equal((await api('POST', `/members/${dev}/exit`, { date: exitDay, reason: 'Se va' })).status, 200);
  const versions = (await api('GET', `/members/${dev}`)).body.versions;
  assert.ok(versions.every((v: any) => v.valid_from < exitDay));
  assert.equal(versions.at(-1).valid_to, exitDay);
  assert.equal(await at(future), undefined);
  assert.equal((await at(t)).grade_id, gLow);
});

test('el motivo de una baja sobrevive a la reincorporación', async () => {
  const api = await client('editor@t.io');
  const id = (await api('POST', '/members', { name: 'Vuelve, Ana', hire_date: '2024-01-10' })).body.id;
  await api('POST', `/members/${id}/exit`, { date: '2024-06-01', reason: 'Excedencia' });
  await api('POST', `/members/${id}/rehire`, { date: '2025-01-01' });
  const row = (await api('GET', '/members?asOf=2024-09-01&all=1')).body.find((m: any) => m.member_id === id);
  assert.equal(row.state, 'exited'); assert.equal(row.exit_date, '2024-06-01'); assert.equal(row.exit_reason, 'Excedencia');
  const exit = (await api('GET', '/reports/movements?from=2024-01-01&to=2024-12-31')).body.find((m: any) => m.member_id === id && m.type === 'exit');
  assert.equal(exit.reason, 'Excedencia');
});

test('fechas de calendario y referencias no válidas se rechazan con 400', async () => {
  assert.equal(isDate('2026-02-31'), false); assert.equal(isDate('2026-99-99'), false); assert.equal(isDate('2028-02-29'), true);
  assert.equal(addYears('2028-02-29', -1), '2027-02-28'); assert.equal(addYears('2026-03-15', -1), '2025-03-15');
  const api = await client('editor@t.io');
  for (const d of ['2026-02-31', '2026-99-99']) {
    assert.equal((await api('POST', '/vacancies', { code: 'TBH - X', opened_at: d })).status, 400);
    assert.equal((await api('POST', '/members', { name: 'Fecha, Mala', hire_date: d })).status, 400);
  }
  assert.equal((await api('POST', '/vacancies', { code: 'TBH - X', chapter_id: 99999 })).status, 400);
  assert.equal((await api('POST', '/vacancies', { code: 'TBH - X', manager_id: 99999 })).status, 400);
  const id = (await api('POST', '/vacancies', { code: 'TBH - FK' })).body.id;
  assert.equal((await api('PATCH', `/vacancies/${id}`, { grade_id: 99999 })).status, 400);
  // identificadores inexistentes: 404 y sin rastro en auditoría
  assert.equal((await api('PUT', '/chapters/99999', { name: 'Nada', color: '#000000' })).status, 404);
  assert.equal((await api('DELETE', '/grades/99999')).status, 404);
  assert.equal((await api('DELETE', '/vacancies/99999')).status, 404);
  assert.equal((await api('GET', '/audit?q=' + encodeURIComponent('%'))).body.total, 0, 'el comodín se busca literalmente');
  assert.ok((await api('GET', '/audit?entity=vacancy')).body.items.every((a: any) => a.entity === 'vacancy'));
});

test('vacantes: reabrir desvincula a quien la cubría y las bajas no dejan vacantes huérfanas', async () => {
  const api = await client('editor@t.io');
  const boss = (await api('POST', '/members', { name: 'Vac, Boss', hire_date: '2024-01-01' })).body.id;
  const mgr = (await api('POST', '/members', { name: 'Vac, Manager', hire_date: '2024-01-01', manager_id: boss })).body.id;
  const id = (await api('POST', '/vacancies', { code: 'TBH - REOPEN', manager_id: mgr })).body.id;
  const other = (await api('POST', '/vacancies', { code: 'TBH - ORPHAN', manager_id: mgr })).body.id;
  await api('POST', `/vacancies/${id}/fill`, { name: 'Vac, Nueva', hire_date: today() });
  await api('PATCH', `/vacancies/${id}`, { status: 'Open' });
  let list = (await api('GET', '/vacancies')).body;
  assert.equal(list.find((v: any) => v.id === id).filled_by, null); assert.equal(list.find((v: any) => v.id === id).closed_at, null);
  // el manager tiene un reporte (quien cubrió la vacante): se reasigna a su jefa, igual que las vacantes abiertas
  assert.equal((await api('POST', `/members/${mgr}/exit`, { date: addDays(today(), 1), reassign_to: boss })).status, 200);
  list = (await api('GET', '/vacancies')).body;
  assert.equal(list.find((v: any) => v.id === other).manager_id, boss);
});

test('importación: vacantes cerradas, campos parciales, emails, duplicados y bajas', async () => {
  const api = await client('admin@t.io');
  const d1 = addDays(today(), -30), d2 = addDays(today(), -20), d3 = addDays(today(), -10);
  const base = [
    { name: 'Imp, Jefa', email: 'jefa@imp.io', title: 'Lead', grade: 'M3', chapter: 'Backend' },
    { name: 'Imp, Uno', email: 'uno@imp.io', manager: 'Imp, Jefa', title: 'Dev', grade: 'M4', chapter: 'Backend' },
    { name: 'Imp, Dos', email: 'dos@imp.io', manager: 'Imp, Jefa', title: 'Dev', grade: 'M4', chapter: 'Backend' },
    { name: 'Imp, Uno', email: 'uno@imp.io', manager: 'Imp, Jefa', title: 'Dev', grade: 'M4', chapter: 'Backend' },   // duplicada
    { name: 'TBH - IMP 1', manager: 'Imp, Jefa', title: 'Dev', grade: 'M4', chapter: 'Backend', hiring: 'Recruiting', sap: 'S-1', prf: 'P-1', comments: 'Reemplazo' },
    { name: 'TBH - IMP 2', manager: 'Imp, Jefa', title: 'Dev', grade: 'M4', chapter: 'Backend', hiring: 'Filled', sap: 'S-2' },
  ];
  const first = (await api('POST', '/import/apply', { rows: base, effective_date: d1 })).body;
  assert.equal(first.create.length, 3); assert.equal(first.skipped.length, 1); assert.match(first.skipped[0].reason, /duplicada/);
  const vac = async (code: string) => (await api('GET', '/vacancies')).body.filter((v: any) => v.code === code);
  assert.equal((await vac('TBH - IMP 2'))[0].closed_at, d1, 'una vacante importada como Filled queda cerrada');

  // reimportar no duplica la vacante cerrada; un cambio parcial conserva el resto de campos
  const rows2 = base.slice(0, 3).concat([{ name: 'TBH - IMP 1', hiring: 'Offer', sap: 'S-1' } as any, base[5]]);
  const pre2 = (await api('POST', '/import/preview', { rows: rows2, effective_date: d2 })).body;
  assert.deepEqual(pre2.vacancies, { create: [], update: ['TBH - IMP 1'], unchanged: 1 });
  await api('POST', '/import/apply', { rows: rows2, effective_date: d2 });
  const v1 = (await vac('TBH - IMP 1'))[0];
  assert.equal(v1.status, 'Offer'); assert.equal(v1.prf, 'P-1'); assert.equal(v1.comments, 'Reemplazo'); assert.ok(v1.chapter_id && v1.grade_id && v1.manager_id);
  assert.equal((await vac('TBH - IMP 2')).length, 1);

  // solo cambia un email: la previsualización lo detecta y se aplica
  const rows3 = [base[0], { ...base[1], email: 'uno.nuevo@imp.io', name: 'Imp, Uno' }];
  delete (rows3[1] as any).email; (rows3[1] as any).email = 'uno.nuevo@imp.io';
  const pre3 = (await api('POST', '/import/preview', { rows: rows3, effective_date: d3, exit_missing: true })).body;
  assert.deepEqual(pre3.update.map((u: any) => u.changes.map((c: any) => c.field)), [['email']]);
  assert.ok(pre3.missing.some((m: any) => m.name === 'Imp, Dos' && m.can_exit));
  const res3 = (await api('POST', '/import/apply', { rows: rows3, effective_date: d3, exit_missing: true })).body;
  assert.equal(res3.exited, res3.missing.filter((m: any) => m.can_exit).length);
  const roster = (await api('GET', '/members?all=1')).body;
  assert.equal(roster.find((m: any) => m.name === 'Imp, Uno').email, 'uno.nuevo@imp.io');
  assert.equal(roster.find((m: any) => m.name === 'Imp, Dos').state, 'exited');

  // una baja que la fecha efectiva no permite se anuncia como no aplicable y no se cuenta; una reincorporación anterior a la baja se omite
  const early = (await api('POST', '/import/preview', { rows: [base[0], base[2]], effective_date: d1, exit_missing: true })).body;
  assert.ok(early.missing.length > 0 && early.missing.every((m: any) => !m.can_exit || m.name !== 'Imp, Uno'));
  assert.ok(early.skipped.some((s: any) => s.name === 'Imp, Dos'), 'reincorporación con fecha anterior a la baja');
  assert.equal(early.rehire.length, 0);
});

test('sesiones: cambiar la contraseña o el rol invalida las cookies anteriores', async () => {
  const admin = await client('admin@t.io');
  const id = (await admin('POST', '/users', { email: 's@t.io', name: 'Sesión', role: 'editor', password: 'secret123' })).body.id;
  const a = await client('s@t.io'), b = await client('s@t.io');
  assert.equal((await a('GET', '/auth/me')).status, 200);
  assert.equal((await b('POST', '/auth/password', { current: 'secret123', next: 'otra-clave-1' })).status, 200);
  assert.equal((await a('GET', '/auth/me')).status, 401, 'la otra sesión queda cerrada');
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 's@t.io', password: 'otra-clave-1' }) });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  const me = () => fetch(`${base}/auth/me`, { headers: { cookie } });
  assert.equal((await me()).status, 200);
  await admin('PATCH', `/users/${id}`, { role: 'viewer' });
  assert.equal((await me()).status, 401, 'un cambio de rol exige volver a entrar');
});
