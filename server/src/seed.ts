/** Datos de demostración (ficticios) con ~3 años de histórico: altas, promociones, traslados, bajas y vacantes. */
import { join, resolve } from 'node:path';
import type { DB } from './db.ts';
import { get, openDb, run, setSetting, tx } from './db.ts';
import { hashPassword } from './auth.ts';
import { createMember, exitMember, updateMember } from './members.ts';
import { SYSTEM, addDays, today } from './util.ts';

export function seedDemo(db: DB) {
  let s = 42;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const between = (a: string, b: string) => addDays(a, Math.floor(rnd() * Math.max(1, (Date.parse(b) - Date.parse(a)) / 86400000)));
  const first = ['Ana', 'Luis', 'Marta', 'Carlos', 'Elena', 'Pablo', 'Lucía', 'Diego', 'Sara', 'Javier', 'Laura', 'Andrés', 'Paula', 'Rubén', 'Irene', 'Hugo', 'Nuria', 'Adrián', 'Claudia', 'Sergio', 'Alba', 'Iván', 'Carmen', 'Raúl', 'Julia', 'Mario', 'Eva', 'Óscar', 'Rosa', 'Tomás', 'Inés', 'Álvaro', 'Noa', 'Pedro', 'Silvia', 'Víctor', 'Teresa', 'Gael', 'Mía', 'Jorge', 'Lola', 'Aitor', 'Berta', 'Dani'];
  const last = ['García', 'Martín', 'Ruiz', 'Pérez', 'Torres', 'Sanz', 'Navarro', 'Romero', 'Gil', 'Molina', 'Ortega', 'Vega', 'Castro', 'Díaz', 'Marín', 'Serrano', 'León', 'Cano', 'Prieto', 'Rubio', 'Núñez', 'Herrera', 'Soto', 'Campos', 'Flores', 'Vidal', 'Blanco', 'Pardo', 'Crespo', 'Lara', 'Bravo', 'Mora', 'Iglesias', 'Peña', 'Cortés', 'Lozano'];
  const used = new Set<string>();
  const person = () => { for (;;) { const f = pick(first), l = pick(last), n = `${l}, ${f}`; if (!used.has(n)) { used.add(n); return { name: n, email: `${f}.${l}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }; } } };
  const now = today(), start = `${Number(now.slice(0, 4)) - 3}-01-09`;

  tx(db, () => {
    setSetting(db, 'org_name', 'Software Engineering (demo)');
    const ch = Object.fromEntries([['Backend Engineering', '#5b5bf0'], ['Frontend Engineering', '#12a594'], ['Quality Engineering', '#f5a524'], ['DevOps / SRE', '#e5484d'], ['Delivery Lead', '#a05bf0']]
      .map(([n, c]) => [n, run(db, 'INSERT INTO chapters(name,color) VALUES(?,?)', n, c)]));
    const TITLES: Record<string, string> = { P4: 'Tech Future Graduate', P2: 'Junior Software Developer', P1: 'Software Developer', M4: 'Software Engineer', M3: 'Senior Software Engineer', M2: 'Director Software Engineering', M1: 'VP Engineering' };
    const LADDER = ['P4', 'P2', 'P1', 'M4', 'M3'];
    const gr = Object.fromEntries(['P4', 'P2', 'P1', 'M4', 'M3', 'M2', 'M1'].map((c, i) => [c, run(db, 'INSERT INTO grades(code,description,level) VALUES(?,?,?)', c, TITLES[c], i + 1)]));
    const skills = ['Java', 'Kotlin', 'React', 'TypeScript', 'Python', 'AWS', 'Kubernetes', 'Terraform', 'Cypress', 'Playwright', 'SQL', 'Kafka', 'Go', 'Node.js'];
    const mk = (g: string, chapter: string, manager: number | null, hire: string, city = 'Zaragoza', country = 'Spain') =>
      createMember(db, SYSTEM, { ...person(), hire_date: hire, title: TITLES[g], grade_id: gr[g], chapter_id: ch[chapter], manager_id: manager, city, country,
        skills: [...new Set([pick(skills), pick(skills), pick(skills)])].join(', ') });

    const head = mk('M1', 'Delivery Lead', null, start);
    const teams = [['Backend Engineering', 9], ['Frontend Engineering', 8], ['Quality Engineering', 8], ['DevOps / SRE', 5], ['Backend Engineering', 8]] as const;
    const allManagers: number[] = [];
    teams.forEach(([chapter, size], ti) => {
      const dir = mk('M2', chapter, head, addDays(start, 20 + ti * 25));
      const mgrs = [0, 1].map(i => mk('M3', chapter, dir, addDays(start, 60 + ti * 30 + i * 45)));
      allManagers.push(...mgrs);
      for (let i = 0; i < size; i++) {
        const hire = between(addDays(start, 120), addDays(now, -40));
        let gi = Math.floor(rnd() * 4), mgr = rnd() < 0.2 ? dir : pick(mgrs), chap: string = chapter;
        const id = mk(LADDER[gi], chapter, mgr, hire, rnd() < 0.15 ? 'Gurgaon' : 'Zaragoza', undefined);
        if (rnd() < 0.15) run(db, "UPDATE member_versions SET country='India' WHERE member_id=? AND city='Gurgaon'", id);
        let d = hire, lastEv = hire;
        for (let e = 0; e < 3; e++) {
          d = addDays(d, 240 + Math.floor(rnd() * 260));
          if (d >= addDays(now, -15)) break;
          lastEv = d;
          const x = rnd();
          if (x < 0.55 && gi < LADDER.length - 1) { gi++; updateMember(db, SYSTEM, id, { grade_id: gr[LADDER[gi]], title: TITLES[LADDER[gi]], effective_date: d, reason: 'Promoción anual' }); }
          else if (x < 0.7) { chap = pick(Object.keys(ch).filter(c => c !== chap && c !== 'Delivery Lead')); updateMember(db, SYSTEM, id, { chapter_id: ch[chap], effective_date: d, reason: 'Cambio de chapter' }); }
          else if (x < 0.85) { const nm = pick(mgrs.filter(m => m !== mgr).concat(dir)); if (nm !== mgr) { mgr = nm; updateMember(db, SYSTEM, id, { manager_id: nm, effective_date: d, reason: 'Reorganización' }); } }
        }
        if (rnd() < 0.22 && addDays(lastEv, 60) < addDays(now, -5)) exitMember(db, SYSTEM, id, between(addDays(lastEv, 30), addDays(now, -5)), pick(['Baja voluntaria', 'Movilidad interna', 'Fin de contrato']));
      }
    });

    const vac = (code: string, g: string, chapter: string, status: string, opened: string, closed: string | null, i: number) => {
      const id = run(db, 'INSERT INTO vacancies(code,title,chapter_id,grade_id,manager_id,status,prf,sap,opened_at,closed_at,comments) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        code, TITLES[g], ch[chapter], gr[g], pick(allManagers), status, String(550000 + i * 37), String(20049000 + i * 13), opened, closed, i % 4 === 0 ? 'Reemplazo' : '');
      const flow = ['Pending PRF', 'Open', 'Recruiting', 'Offer', 'Filled'], upto = status === 'Cancelled' ? 2 : flow.indexOf(status);
      const end = closed ?? now, step = Math.max(1, Math.floor((Date.parse(end) - Date.parse(opened)) / 86400000 / (upto + 1)));
      for (let k = 0; k <= upto; k++) run(db, 'INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,?,?,?)', id, flow[k], k === upto && closed ? closed : addDays(opened, step * k), 'sistema');
      if (status === 'Cancelled') run(db, "INSERT INTO vacancy_events(vacancy_id,status,at,user_name) VALUES(?,'Cancelled',?,'sistema')", id, end);
    };
    const abbr: Record<string, string> = { 'Backend Engineering': 'BE', 'Frontend Engineering': 'FE', 'Quality Engineering': 'QA', 'DevOps / SRE': 'SRE' };
    const chs = Object.keys(abbr);
    ['Pending PRF', 'Pending PRF', 'Open', 'Open', 'Open', 'Recruiting', 'Recruiting', 'Recruiting', 'Recruiting', 'Offer', 'Offer'].forEach((st, i) => {
      const c = chs[i % chs.length], g = pick(['P1', 'M4', 'M3']);
      vac(`TBH - ${g} ${abbr[c]} ${i + 1}`, g, c, st, addDays(now, -(15 + Math.floor(rnd() * 150))), null, i);
    });
    for (let i = 0; i < 9; i++) {
      const c = chs[i % chs.length], g = pick(['P1', 'M4', 'M3']), opened = addDays(now, -(120 + Math.floor(rnd() * 500)));
      vac(`TBH - ${g} ${abbr[c]} H${i + 1}`, g, c, i === 8 ? 'Cancelled' : 'Filled', opened, addDays(opened, 35 + Math.floor(rnd() * 80)), 20 + i);
    }
  });
}

if (import.meta.filename === process.argv[1]) {
  const db = openDb(process.env.DB_PATH || join(resolve(import.meta.dirname, '../..'), 'data', 'teamhub.db'));
  if (get(db, 'SELECT 1 FROM members LIMIT 1')) { console.error('La base de datos ya tiene miembros: no se cargan datos de demostración.'); process.exit(1); }
  seedDemo(db);
  for (const [email, name, role] of [['admin@demo.local', 'Admin Demo', 'admin'], ['editor@demo.local', 'Editora Demo', 'editor'], ['lector@demo.local', 'Lector Demo', 'viewer']])
    if (!get(db, 'SELECT 1 FROM users WHERE email=?', email)) run(db, 'INSERT INTO users(email,name,role,password_hash) VALUES(?,?,?,?)', email, name, role, hashPassword('demo1234'));
  console.log('Datos de demostración cargados. Usuarios: admin@demo.local, editor@demo.local, lector@demo.local (contraseña: demo1234)');
}
