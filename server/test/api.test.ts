import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/auth.ts';
import { openDb, run } from '../src/db.ts';
import { seedDemo } from '../src/seed.ts';
import { snapshot, timeline } from '../src/temporal.ts';
import { today } from '../src/util.ts';

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
  assert.equal((await api('PATCH', `/members/${dev}`, { chapter_id: ch1, effective_date: '2025-02-01' })).status, 400, 'no se permite antedatar');
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
