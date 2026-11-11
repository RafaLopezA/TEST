'use strict';
/* Team Hub — organización, chapters, grados y vacantes. Sin dependencias de build; datos en localStorage. */
const KEY = 'teamhub.v2';
const PALETTE = ['#5b5bf0', '#12a594', '#f5a524', '#e5484d', '#0091ff', '#a05bf0', '#f76b15', '#30a46c'];
const HIRING = ['Open', 'Pending PRF', 'Recruiting'];
const HCOLOR = { 'Open': '#f5a524', 'Pending PRF': '#a05bf0', 'Recruiting': '#0091ff' };
const GRADE_ORDER = ['P4', 'P3', 'P2', 'P1', 'M4', 'M3', 'M2', 'M1']; // de menor a mayor seniority
const SENIOR_LEVEL = 6; // M3 o superior
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const disp = n => { const p = String(n || '').split(','); return p.length === 2 ? `${p[1].trim()} ${p[0].trim()}` : String(n || ''); };

/* ---------- datos ---------- */
function demo() {
  const chapters = [['Backend Engineering', 0], ['Frontend Engineering', 1], ['Quality Engineering', 2], ['DEVOPS / SRE', 3], ['Delivery Lead', 5]]
    .map(([name, c]) => ({ id: 'c' + c, name, color: PALETTE[c] }));
  const grades = [['P4', 'Graduate', 1], ['P2', 'Junior', 2], ['P1', 'Developer', 3], ['M4', 'Engineer', 4], ['M3', 'Senior', 5], ['M2', 'Director', 6]]
    .map(([name, desc, level]) => ({ id: 'g' + name, name, desc, level }));
  const first = ['Ana', 'Luis', 'Marta', 'Carlos', 'Elena', 'Pablo', 'Lucía', 'Diego', 'Sara', 'Javier', 'Laura', 'Andrés', 'Paula', 'Rubén', 'Irene', 'Hugo', 'Nuria', 'Adrián', 'Claudia', 'Sergio', 'Alba', 'Iván', 'Carmen', 'Raúl', 'Julia', 'Mario', 'Eva', 'Óscar', 'Rosa', 'Tomás', 'Inés', 'Álvaro', 'Noa', 'Pedro', 'Silvia', 'Víctor', 'Teresa', 'Gael', 'Mía', 'Jorge', 'Lola', 'Aitor', 'Berta', 'Dani'];
  const last = ['García', 'Martín', 'Ruiz', 'Pérez', 'Torres', 'Sanz', 'Navarro', 'Romero', 'Gil', 'Molina', 'Ortega', 'Vega', 'Castro', 'Díaz', 'Marín', 'Serrano', 'León', 'Cano', 'Prieto', 'Rubio', 'Núñez', 'Herrera', 'Soto', 'Campos', 'Flores', 'Vidal', 'Blanco', 'Pardo', 'Crespo', 'Lara', 'Bravo', 'Mora'];
  let n = 0; const members = [];
  const person = (o) => { const f = first[n % first.length], l = last[(n * 7 + 3) % last.length]; n++;
    const name = `${l}, ${f}`; return { id: uid(), name, email: `${f}.${l}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), type: 'employee', status: 'active', hiring: '', prf: '', sap: '', comments: '', country: 'Spain', city: 'Zaragoza', ...o }; };
  const head = 'Rivera, Alex';
  const dirs = [['Backend Engineering', 'Software Engineering 4'], ['Frontend Engineering', 'Software Engineering 5'], ['DEVOPS / SRE', 'Software Engineering 7'], ['Quality Engineering', 'Software Engineering 6'], ['Backend Engineering', 'Software Engineering 3']];
  const gradeMix = ['P1', 'M4', 'M4', 'P2', 'M4', 'P1', 'P1', 'M4', 'P4', 'P1'];
  dirs.forEach(([ch, dept], di) => {
    const d = person({ title: 'Director Software Engineering', chapterId: chapters.find(c => c.name === ch).id, gradeId: 'gM2', manager: head, team: '(direct)', dept });
    members.push(d);
    const mgrs = [0, 1].map(() => { const m = person({ title: 'Senior Software Engineer II', chapterId: d.chapterId, gradeId: 'gM3', manager: d.name, team: d.name, dept }); members.push(m); return m; });
    for (let i = 0; i < 6; i++) {
      const g = gradeMix[(i + di) % gradeMix.length], mg = mgrs[i % 2];
      members.push(person({ title: { P4: 'Tech Future Graduate', P2: 'Junior Software Developer', P1: 'Software Developer', M4: 'Software Engineer II' }[g], chapterId: d.chapterId, gradeId: 'g' + g, manager: i % 3 === 2 ? d.name : mg.name, team: d.name, dept, city: i % 4 === 3 ? 'Gurgaon' : 'Zaragoza', country: i % 4 === 3 ? 'India' : 'Spain' }));
    }
    [['M4', 'Recruiting'], ['P1', 'Open'], ['M3', 'Pending PRF']].slice(0, 2 + (di % 2)).forEach(([g, h], k) =>
      members.push({ id: uid(), name: `TBH - ${g} ${ch.slice(0, 2).toUpperCase()} ${k + 1}`, email: '', type: 'tbh', status: 'active', hiring: h, prf: String(550000 + di * 10 + k), sap: String(20049000 + di * 10 + k), comments: '', title: g === 'M3' ? 'Senior Software Engineer' : g === 'M4' ? 'Software Engineer' : 'Software Developer', chapterId: d.chapterId, gradeId: 'g' + g, manager: d.name, team: d.name, dept, country: 'Spain', city: 'Zaragoza' }));
  });
  return { org: head, chapters, grades, members };
}
let db = load();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || demo(); } catch { return demo(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('No se pudo guardar en el navegador'); } }
const chapter = id => db.chapters.find(c => c.id === id);
const grade = id => db.grades.find(g => g.id === id);
const member = id => db.members.find(m => m.id === id);
const sortedGrades = () => [...db.grades].sort((a, b) => b.level - a.level); // mayor → menor
const staff = () => db.members.filter(m => m.type !== 'tbh' && m.status === 'active');
const tbhs = () => db.members.filter(m => m.type === 'tbh');
const pool = () => (state.incTbh ? [...staff(), ...tbhs()] : staff());
const lvl = m => grade(m.gradeId)?.level || 0;
const initials = n => disp(n).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const teams = () => [...new Set(db.members.map(m => m.team).filter(Boolean))].sort();
const colorOf = m => chapter(m.chapterId)?.color || '#999';

/* ---------- UI helpers ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2800); }
function modal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; const f = $('#modal-box input'); f && f.focus(); }
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function confirmDlg(msg, fn) {
  modal(`<h2>${esc(msg)}</h2><div class="form-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="yes">Confirmar</button></div>`);
  $('#yes').onclick = () => { closeModal(); fn(); };
}
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
const csv = rows => '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
const opts = (list, sel, label = x => x.name) => list.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(label(x))}</option>`).join('');

function bars(items) {
  if (!items.length) return '<div class="empty">Sin datos</div>';
  const max = Math.max(1, ...items.map(i => i.v));
  return `<div class="bars">${items.map(i => `<div class="bar-row"><span title="${esc(i.l)}"><span class="dot" style="background:${i.color}"></span>${esc(i.l)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${i.v / max * 100}%;background:${i.color}"></div></div><b>${i.v}</b></div>`).join('')}</div>`;
}
function donut(items) {
  const total = items.reduce((a, i) => a + i.v, 0) || 1; let acc = 0;
  const stops = items.map(i => { const s = acc / total * 100; acc += i.v; return `${i.color} ${s}% ${acc / total * 100}%`; });
  return `<div class="donut-wrap"><div class="donut" data-c="${items.reduce((a, i) => a + i.v, 0)}" style="background:conic-gradient(${stops.join(',') || 'var(--line) 0 100%'})"></div>
    <div class="legend">${items.map(i => `<div><span class="dot" style="background:${i.color}"></span>${esc(i.l)} · <b>${i.v}</b> (${Math.round(i.v / total * 100)}%)</div>`).join('')}</div></div>`;
}
function matrix(rows, cols, fn, totalLabel = 'Total') {
  const cell = rows.map(r => cols.map(c => fn(r, c))), max = Math.max(1, ...cell.flat());
  const colTot = cols.map((c, j) => cell.reduce((a, r) => a + r[j], 0));
  return `<div class="tw"><table class="heat"><thead><tr><th></th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${r.color ? `<span class="dot" style="background:${r.color}"></span>` : ''}${esc(r.label)}</td>${cell[i].map(n => `<td class="c" style="background:color-mix(in srgb,var(--brand) ${Math.round(n / max * 55)}%,transparent)">${n || '·'}</td>`).join('')}<td><b>${cell[i].reduce((a, b) => a + b, 0)}</b></td></tr>`).join('')}
    <tr><td><b>${totalLabel}</b></td>${colTot.map(n => `<td><b>${n}</b></td>`).join('')}<td><b>${colTot.reduce((a, b) => a + b, 0)}</b></td></tr></tbody></table></div>`;
}
const byChapter = list => db.chapters.map(c => ({ l: c.name, v: list.filter(m => m.chapterId === c.id).length, color: c.color }));
const byGrade = list => sortedGrades().map((g, i) => ({ l: `${g.name}${g.desc ? ' · ' + g.desc : ''}`, v: list.filter(m => m.gradeId === g.id).length, color: PALETTE[i % PALETTE.length] }));
const byTeam = list => teams().map((t, i) => ({ l: t === '(direct)' ? 'Directos' : disp(t), v: list.filter(m => m.team === t).length, color: PALETTE[i % PALETTE.length] }));
const pipeline = () => HIRING.map(h => ({ l: h, v: tbhs().filter(m => m.hiring === h).length, color: HCOLOR[h] }));
const reports = name => db.members.filter(m => m.manager === name && m.status === 'active');
const kpi = (v, l) => `<div class="card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
const toggle = () => `<label class="chk"><input type="checkbox" id="inc-tbh" ${state.incTbh ? 'checked' : ''}> Incluir vacantes (TBH)</label>`;

/* ---------- vistas ---------- */
const views = {
  dashboard() {
    const st = staff(), mgrs = [...new Set(st.map(m => m.manager))].filter(n => st.some(p => p.name === n));
    const span = avg(mgrs.map(n => reports(n).length));
    const seniors = st.filter(m => lvl(m) >= SENIOR_LEVEL).length;
    return `<div class="head"><div><h1>Resumen</h1><p class="sub">${esc(disp(db.org) || 'Organización')} · vista general</p></div>
      <button class="btn primary" data-act="add-member">+ Nuevo miembro</button></div>
      <div class="grid kpis">
        ${kpi(st.length, 'Personas activas')}${kpi(tbhs().length, 'Vacantes (TBH)')}${kpi(db.chapters.length, 'Chapters')}
        ${kpi(span.toFixed(1), 'Span medio por manager')}${kpi(st.length ? Math.round(seniors / st.length * 100) + '%' : '—', 'Perfil M3 o superior')}
      </div>
      <div class="grid cols2">
        <div class="card"><h2>Personas por chapter</h2>${bars(byChapter(st))}</div>
        <div class="card"><h2>Distribución por grado</h2>${donut(byGrade(st))}</div>
        <div class="card"><h2>Personas por equipo (director)</h2>${bars(byTeam(st))}</div>
        <div class="card"><h2>Pipeline de vacantes</h2>${bars(pipeline())}</div>
      </div>`;
  },

  org() {
    const mode = state.orgMode;
    return `<div class="head"><div><h1>Organigrama</h1><p class="sub">${mode === 'chart' ? 'Una página por director, como en las presentaciones.' : 'Jerarquía desplegable por manager.'} Las vacantes llevan borde punteado.</p></div>
      <div><span class="tabs" style="display:inline-flex;margin:0 8px 0 0"><button class="${mode === 'chart' ? 'on' : ''}" data-act="org-mode" data-id="chart">Diagrama</button><button class="${mode === 'tree' ? 'on' : ''}" data-act="org-mode" data-id="tree">Árbol</button></span>
      <button class="btn primary" onclick="print()">🖨 Exportar PDF</button></div></div>
      ${mode === 'chart' ? orgChart() : orgTree()}`;
  },

  members() {
    const f = state.filter;
    let list = db.members.filter(m =>
      (!f.q || (m.name + m.email + m.title + m.manager).toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.chapter || m.chapterId === f.chapter) && (!f.grade || m.gradeId === f.grade) && (!f.team || m.team === f.team) &&
      (!f.type || (f.type === 'tbh' ? m.type === 'tbh' : f.type === 'inactive' ? m.status !== 'active' && m.type !== 'tbh' : m.type !== 'tbh' && m.status === 'active')));
    const s = state.sort, dir = s.dir;
    const key = { name: m => m.name, chapter: m => chapter(m.chapterId)?.name || '', grade: lvl, manager: m => m.manager, team: m => m.team }[s.by];
    list.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dir);
    state.visible = list;
    const th = (k, t) => `<th data-sort="${k}">${t}${s.by === k ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
    const sel = (id, label, items, cur) => `<select id="${id}"><option value="">${label}</option>${items}</select>`;
    return `<div class="head"><div><h1>Miembros</h1><p class="sub">${list.length} de ${db.members.length} registros</p></div>
      <div><button class="btn" data-act="export-members">⬇ CSV</button> <button class="btn primary" data-act="add-member">+ Nuevo miembro</button></div></div>
      <div class="toolbar">
        <input type="search" id="f-q" placeholder="Buscar por nombre, email, título o manager…" value="${esc(f.q)}">
        ${sel('f-chapter', 'Todos los chapters', opts(db.chapters, f.chapter))}
        ${sel('f-grade', 'Todos los grados', opts(sortedGrades(), f.grade, g => `${g.name} · ${g.desc || ''}`))}
        ${sel('f-team', 'Todos los equipos', teams().map(t => `<option value="${esc(t)}" ${t === f.team ? 'selected' : ''}>${esc(t === '(direct)' ? 'Directos' : disp(t))}</option>`).join(''))}
        <select id="f-type"><option value="">Todos</option>${[['employee', 'Activos'], ['tbh', 'Vacantes (TBH)'], ['inactive', 'Inactivos']].map(([v, l]) => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="card tw" style="padding:0"><table><thead><tr>${th('name', 'Miembro')}<th>Título</th>${th('chapter', 'Chapter')}${th('grade', 'Grado')}${th('manager', 'Manager')}${th('team', 'Equipo')}<th>Ubicación</th><th></th></tr></thead>
      <tbody>${list.map(m => {
        const c = chapter(m.chapterId), tbh = m.type === 'tbh';
        return `<tr><td><div class="person"><span class="avatar ${tbh ? 'tbh' : ''}" style="background:${tbh ? 'transparent' : colorOf(m)};border-color:${colorOf(m)};color:${tbh ? colorOf(m) : '#fff'}">${tbh ? '+' : esc(initials(m.name))}</span>
          <div>${esc(tbh ? m.name : disp(m.name))}<small>${tbh ? `<span class="pill" style="background:${HCOLOR[m.hiring] || '#999'}22;color:${HCOLOR[m.hiring] || '#999'}">${esc(m.hiring || 'TBH')}</span> PRF ${esc(m.prf || '—')}` : esc(m.email)}${!tbh && m.status !== 'active' ? ' · Inactivo' : ''}</small></div></div></td>
        <td>${esc(m.title)}</td><td>${c ? `<span class="dot" style="background:${c.color}"></span>${esc(c.name)}` : '—'}</td><td><span class="pill">${esc(grade(m.gradeId)?.name || '—')}</span></td>
        <td>${esc(disp(m.manager))}</td><td>${esc(m.team === '(direct)' ? 'Directos' : disp(m.team))}</td><td>${esc([m.city, m.country].filter(Boolean).join(', '))}</td>
        <td class="actions"><button class="btn sm" data-act="edit-member" data-id="${m.id}">Editar</button> <button class="btn sm danger" data-act="del-member" data-id="${m.id}">Borrar</button></td></tr>`;
      }).join('')}</tbody></table>${list.length ? '' : '<div class="empty">Sin resultados</div>'}</div>
      <datalist id="dl-mgr">${[...new Set(db.members.map(m => m.manager).concat(db.members.map(m => m.name)))].filter(Boolean).map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
  },

  chapters() {
    return `<div class="head"><div><h1>Chapters</h1><p class="sub">Agrupaciones de especialidad</p></div><button class="btn primary" data-act="add-chapter">+ Nuevo chapter</button></div>
      <div class="grid cols2">${db.chapters.map(c => {
        const ms = staff().filter(m => m.chapterId === c.id), vac = tbhs().filter(m => m.chapterId === c.id).length;
        return `<div class="card"><div class="head" style="margin:0 0 6px"><h2 style="margin:0"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</h2>
          <div><button class="btn sm" data-act="edit-chapter" data-id="${c.id}">Editar</button> <button class="btn sm danger" data-act="del-chapter" data-id="${c.id}">Borrar</button></div></div>
          <p class="sub"><b>${ms.length}</b> personas · <b>${vac}</b> vacantes</p>
          <div style="margin-top:12px">${bars(byGrade(ms).filter(g => g.v))}</div></div>`;
      }).join('') || '<div class="empty">Crea tu primer chapter</div>'}</div>`;
  },

  grades() {
    return `<div class="head"><div><h1>Grados</h1><p class="sub">Niveles de carrera (mayor nivel = más senior)</p></div><button class="btn primary" data-act="add-grade">+ Nuevo grado</button></div>
      <div class="card tw" style="padding:0"><table><thead><tr><th>Nivel</th><th>Grado</th><th>Descripción</th><th>Personas</th><th>Vacantes</th><th></th></tr></thead><tbody>
      ${sortedGrades().map(g => `<tr><td>${g.level}</td><td><span class="pill">${esc(g.name)}</span></td><td>${esc(g.desc)}</td><td>${staff().filter(m => m.gradeId === g.id).length}</td><td>${tbhs().filter(m => m.gradeId === g.id).length}</td>
        <td class="actions"><button class="btn sm" data-act="edit-grade" data-id="${g.id}">Editar</button> <button class="btn sm danger" data-act="del-grade" data-id="${g.id}">Borrar</button></td></tr>`).join('')}
      </tbody></table></div>`;
  },

  reports() {
    const P = pool(), gs = sortedGrades();
    const chRows = db.chapters.map(c => ({ id: c.id, label: c.name, color: c.color }));
    const mgrs = [...new Set(db.members.map(m => m.manager))].filter(n => n && staff().some(p => p.name === n))
      .map(n => ({ n, r: reports(n).filter(m => m.type !== 'tbh').length, v: reports(n).filter(m => m.type === 'tbh').length })).sort((a, b) => b.r - a.r);
    const locs = {}; staff().forEach(m => { const k = [m.city, m.country].filter(Boolean).join(', ') || 'Sin ubicar'; locs[k] = (locs[k] || 0) + 1; });
    return `<div class="head"><div><h1>Reportes</h1><p class="sub">${new Date().toLocaleDateString('es-ES')} · ${toggle()}</p></div>
      <div><button class="btn" data-act="report-csv">⬇ Matriz CSV</button> <button class="btn" data-act="export-members">⬇ Miembros CSV</button> <button class="btn primary" onclick="print()">🖨 Imprimir / PDF</button></div></div>
      <div class="card" style="margin-bottom:16px"><h2>Chapter × grado</h2>${matrix(chRows, gs.map(g => ({ id: g.id, label: g.name })), (r, c) => P.filter(m => m.chapterId === r.id && m.gradeId === c.id).length)}</div>
      <div class="card" style="margin-bottom:16px"><h2>Equipo (director) × chapter</h2>${matrix(teams().map(t => ({ id: t, label: t === '(direct)' ? 'Directos' : disp(t) })), db.chapters.map(c => ({ id: c.id, label: c.name })), (r, c) => P.filter(m => m.team === r.id && m.chapterId === c.id).length)}</div>
      <div class="grid cols2">
        <div class="card"><h2>Pirámide de grados</h2>${bars(byGrade(P))}</div>
        <div class="card"><h2>% M3 o superior por chapter</h2>${bars(db.chapters.map(c => { const ms = P.filter(m => m.chapterId === c.id); return { l: c.name, v: ms.length ? Math.round(ms.filter(m => lvl(m) >= SENIOR_LEVEL).length / ms.length * 100) : 0, color: c.color }; }))}</div>
        <div class="card" style="grid-column:1/-1"><h2>Vacantes por chapter y estado</h2>${matrix(chRows, HIRING.map(h => ({ id: h, label: h })), (r, c) => tbhs().filter(m => m.chapterId === r.id && m.hiring === c.id).length)}</div>
        <div class="card"><h2>Ubicaciones</h2>${bars(Object.entries(locs).sort((a, b) => b[1] - a[1]).map(([l, v], i) => ({ l, v, color: PALETTE[i % PALETTE.length] })))}</div>
        <div class="card tw" style="grid-column:1/-1"><h2>Span of control (reportes directos por manager)</h2><table><thead><tr><th>Manager</th><th>Equipo</th><th>Reportes</th><th>Vacantes</th></tr></thead><tbody>
          ${mgrs.map(m => `<tr><td>${esc(disp(m.n))}</td><td>${esc(disp(db.members.find(x => x.name === m.n)?.team === '(direct)' ? m.n : db.members.find(x => x.name === m.n)?.team))}</td><td><b>${m.r}</b></td><td>${m.v || '·'}</td></tr>`).join('')}</tbody></table></div>
      </div>`;
  },
};

function orgTree() {
    const names = new Set(db.members.map(m => m.name)), seen = new Set();
    const node = (m, depth) => {
      if (seen.has(m.id) || depth > 12) return ''; seen.add(m.id);
      const kids = db.members.filter(k => k.manager === m.name && k.id !== m.id).sort((a, b) => lvl(b) - lvl(a));
      const tbh = m.type === 'tbh';
      const card = `<span class="person"><span class="avatar ${tbh ? 'tbh' : ''}" style="background:${tbh ? 'transparent' : colorOf(m)};border-color:${colorOf(m)};color:${tbh ? colorOf(m) : '#fff'}">${tbh ? '+' : esc(initials(m.name))}</span>
        <span>${esc(tbh ? m.name : disp(m.name))}<small>${esc(m.title)} · ${esc(grade(m.gradeId)?.name || '')} · ${esc(chapter(m.chapterId)?.name || '')}</small></span>
        ${tbh ? `<span class="pill" style="background:${HCOLOR[m.hiring] || '#999'}22;color:${HCOLOR[m.hiring] || '#999'}">${esc(m.hiring || 'TBH')}</span>` : ''}
        ${kids.length ? `<span class="pill off">${kids.length}</span>` : ''}</span>`;
      return kids.length ? `<details ${depth < 2 ? 'open' : ''}><summary>${card}</summary><div class="tree">${kids.map(k => node(k, depth + 1)).join('')}</div></details>` : `<div class="leaf">${card}</div>`;
    };
    const roots = db.members.filter(m => !names.has(m.manager) || !m.manager).sort((a, b) => lvl(b) - lvl(a));
    return `<div class="card"><div class="org-root">🏢 <b>${esc(disp(db.org) || 'Organización')}</b></div><div class="tree">${roots.map(r => node(r, 0)).join('') || '<div class="empty">Sin datos</div>'}</div></div>`;
  }

/* ---------- organigrama en diagrama (estilo presentación) ---------- */
function boxLabel(m) {
  if (m.type === 'tbh') {
    const t = /^TBH\s*-\s*(\S+)\s+(\S+)/i.exec(m.name);
    return `<b>${esc(t ? `TBH ${t[1]} ${t[2]}` : 'TBH ' + (grade(m.gradeId)?.name || ''))}</b>${m.sap ? `<br>SAP ${esc(m.sap)}` : ''}${m.hiring ? `<br><small>${esc(m.hiring)}</small>` : ''}`;
  }
  return esc(m.name);
}
const cbox = (m, cls) => `<div class="cbox ${m.type === 'tbh' ? 'tbh' : cls}" title="${esc(m.title)} · ${esc(grade(m.gradeId)?.name || '')} · ${esc(chapter(m.chapterId)?.name || '')}">${boxLabel(m)}</div>`;
function orgChart() {
  const names = new Set(db.members.map(m => m.name));
  const kidsOf = m => db.members.filter(k => k.manager === m.name && k.id !== m.id).sort((a, b) => lvl(b) - lvl(a) || a.name.localeCompare(b.name));
  const dirs = db.members.filter(m => !names.has(m.manager) || !m.manager).sort((a, b) => a.name.localeCompare(b.name));
  const head = `<section class="chart-page card"><h3 class="ct">${esc(db.org ? 'THE TEAM' : 'THE TEAM')}</h3><div class="ctree"><div class="cbox root">${esc(disp(db.org) || 'Organización')}</div>
    <div class="crow">${dirs.map(d => `<div class="ccol">${cbox(d, 'mgr')}</div>`).join('')}</div></div></section>`;
  const pages = dirs.map(d => {
    const kids = kidsOf(d), isMgr = k => kidsOf(k).length || (k.type !== 'tbh' && lvl(k) >= SENIOR_LEVEL) || k.type === 'tbh' && kidsOf(k).length;
    const mgrs = kids.filter(isMgr), direct = kids.filter(k => !isMgr(k));
    const col = k => { const ic = kidsOf(k); return `<div class="ccol">${cbox(k, 'mgr')}${ic.length ? `<div class="cgrid">${ic.map(i => cbox(i, 'ic')).join('')}</div>` : ''}</div>`; };
    return `<section class="chart-page card"><h3 class="ct">THE TEAM</h3><div class="ctree"><div class="cbox root">${esc(d.name)}</div>
      <div class="crow">${mgrs.map(col).join('')}${direct.length ? `<div class="ccol"><div class="cgrid">${direct.map(i => cbox(i, 'ic')).join('')}</div></div>` : ''}</div></div></section>`;
  }).join('');
  return head + pages;
}

/* ---------- formularios ---------- */
const FIELDS = ['name', 'email', 'title', 'manager', 'team', 'country', 'city', 'hiring', 'prf', 'sap', 'comments'];
function memberForm(id) {
  if (!db.chapters.length || !db.grades.length) return toast('Crea antes al menos un chapter y un grado');
  const m = member(id) || { name: '', email: '', title: '', chapterId: db.chapters[0].id, gradeId: sortedGrades().slice(-1)[0].id, manager: '', team: '', country: 'Spain', city: '', type: 'employee', hiring: '', prf: '', sap: '', status: 'active', comments: '' };
  const inp = (k, label, extra = '') => `<label>${label}<input name="${k}" value="${esc(m[k])}" ${extra}></label>`;
  modal(`<h2>${id ? 'Editar' : 'Nuevo'} registro</h2><form id="frm" class="form">
    <label>Tipo<select name="type" id="f-tp"><option value="employee" ${m.type !== 'tbh' ? 'selected' : ''}>Empleado</option><option value="tbh" ${m.type === 'tbh' ? 'selected' : ''}>Vacante (TBH)</option></select></label>
    <label>Estado<select name="status"><option value="active" ${m.status === 'active' ? 'selected' : ''}>Activo</option><option value="inactive" ${m.status !== 'active' ? 'selected' : ''}>Inactivo</option></select></label>
    <label class="full">Nombre (Apellido, Nombre)<input name="name" required value="${esc(m.name)}"></label>
    ${inp('email', 'Email', 'type="email"')}${inp('title', 'Título')}
    <label>Chapter<select name="chapterId">${opts(db.chapters, m.chapterId)}</select></label>
    <label>Grado<select name="gradeId">${opts(sortedGrades(), m.gradeId, g => `${g.name} · ${g.desc || ''}`)}</select></label>
    ${inp('manager', 'Manager', 'list="dl-mgr"')}${inp('team', 'Equipo (director)', 'list="dl-mgr"')}
    ${inp('country', 'País')}${inp('city', 'Ciudad')}
    <label>Estado de contratación<select name="hiring"><option value="">—</option>${HIRING.map(h => `<option ${m.hiring === h ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
    ${inp('prf', 'PRF')}${inp('sap', 'SAP position')}
    <label class="full">Comentarios<textarea name="comments" rows="2">${esc(m.comments)}</textarea></label>
    <div class="form-actions full"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  $('#frm').onsubmit = e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    if (id) Object.assign(m, d); else db.members.push({ id: uid(), ...d });
    save(); closeModal(); render(); toast('Guardado');
  };
}
function chapterForm(id) {
  const c = chapter(id) || { name: '', color: PALETTE[db.chapters.length % PALETTE.length] };
  modal(`<h2>${id ? 'Editar' : 'Nuevo'} chapter</h2><form id="frm" class="form">
    <label class="full">Nombre<input name="name" required value="${esc(c.name)}"></label>
    <label>Color<input name="color" type="color" value="${c.color}" style="padding:2px;height:38px"></label>
    <div class="form-actions full"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  $('#frm').onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); if (id) Object.assign(c, d); else db.chapters.push({ id: uid(), ...d }); save(); closeModal(); render(); };
}
function gradeForm(id) {
  const g = grade(id) || { name: '', desc: '', level: db.grades.length + 1 };
  modal(`<h2>${id ? 'Editar' : 'Nuevo'} grado</h2><form id="frm" class="form">
    <label>Código<input name="name" required value="${esc(g.name)}"></label>
    <label>Nivel (mayor = más senior)<input name="level" type="number" step="0.5" min="0" required value="${g.level}"></label>
    <label class="full">Descripción<input name="desc" value="${esc(g.desc)}"></label>
    <div class="form-actions full"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  $('#frm').onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); d.level = +d.level; if (id) Object.assign(g, d); else db.grades.push({ id: uid(), ...d }); save(); closeModal(); render(); };
}

/* ---------- importación (Excel / CSV / JSON) ---------- */
function loadSheetJS() {
  return window.XLSX ? Promise.resolve() : new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el lector de Excel (¿sin conexión?). Exporta la hoja a CSV e inténtalo de nuevo.')); document.head.appendChild(s);
  });
}
const clean = v => { v = v == null ? '' : String(v).trim(); return v.startsWith('#') && v.endsWith('!') ? '' : v; };
async function importFile(file) {
  if (/\.json$/i.test(file.name)) {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.members) || !Array.isArray(d.chapters) || !Array.isArray(d.grades)) throw new Error('JSON no válido');
    return d;
  }
  await loadSheetJS();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames.includes('People') ? 'People' : wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hi = rows.findIndex(r => r.includes('Name') && (r.includes('Mail') || r.includes('Chapter')));
  if (hi < 0) throw new Error('No encuentro la fila de cabeceras (Name, Mail, Manager, Team, Title, Chapter…)');
  const H = rows[hi].map(clean), col = n => H.indexOf(n);
  const get = (r, ...names) => { for (const n of names) { const i = col(n); if (i >= 0 && clean(r[i])) return clean(r[i]); } return ''; };
  const out = { org: '', chapters: [], grades: [], members: [] };
  rows.slice(hi + 1).forEach(r => {
    const name = get(r, 'Name'); if (!name) return;
    if (!out.org) out.org = get(r, 'Org');
    const chName = get(r, 'Chapter') || 'Sin chapter', gCode = get(r, 'Grade (Level)', 'Grade') || '—';
    let c = out.chapters.find(x => x.name === chName); if (!c) out.chapters.push(c = { id: uid(), name: chName, color: PALETTE[out.chapters.length % PALETTE.length] });
    let g = out.grades.find(x => x.name === gCode); if (!g) out.grades.push(g = { id: uid(), name: gCode, desc: '', level: 0 });
    const tbh = /^TBH/i.test(name);
    out.members.push({ id: uid(), name, email: get(r, 'Mail'), manager: get(r, 'Manager'), team: get(r, 'Team'), title: get(r, 'Title'), chapterId: c.id, gradeId: g.id,
      country: get(r, 'Country'), city: get(r, 'City'), type: tbh ? 'tbh' : 'employee', status: 'active', hiring: get(r, 'HiringStatus'), prf: get(r, 'PRF number'), sap: get(r, 'SAP position number'), comments: get(r, 'Comments') });
  });
  if (!out.members.length) throw new Error('El fichero no contiene filas de personas');
  // niveles de grado: orden conocido (P4<…<P1<M4<…<M1); los desconocidos al final por orden alfabético inverso
  out.grades.forEach(g => { const i = GRADE_ORDER.indexOf(g.name); g.level = i >= 0 ? i + 1 : 0; });
  const mapTitles = {}; out.members.forEach(m => { const g = out.grades.find(x => x.id === m.gradeId); if (g && !g.desc && m.type !== 'tbh') mapTitles[g.id] = mapTitles[g.id] || m.title; });
  out.grades.forEach(g => { g.desc = mapTitles[g.id] || ''; });
  return out;
}

/* ---------- acciones ---------- */
const actions = {
  'org-mode': m => { state.orgMode = m; render(); },
  'add-member': () => memberForm(), 'edit-member': id => memberForm(id),
  'del-member': id => confirmDlg(`¿Borrar a ${disp(member(id).name)}?`, () => { db.members = db.members.filter(m => m.id !== id); save(); render(); }),
  'add-chapter': () => chapterForm(), 'edit-chapter': id => chapterForm(id),
  'del-chapter': id => { const n = db.members.filter(m => m.chapterId === id).length; if (n) return toast(`No se puede borrar: tiene ${n} registro(s). Reasígnalos antes.`); confirmDlg('¿Borrar este chapter?', () => { db.chapters = db.chapters.filter(c => c.id !== id); save(); render(); }); },
  'add-grade': () => gradeForm(), 'edit-grade': id => gradeForm(id),
  'del-grade': id => { const n = db.members.filter(m => m.gradeId === id).length; if (n) return toast(`No se puede borrar: lo tienen ${n} registro(s). Reasígnalos antes.`); confirmDlg('¿Borrar este grado?', () => { db.grades = db.grades.filter(g => g.id !== id); save(); render(); }); },
  'export-members': () => download('miembros.csv', csv([['Name', 'Mail', 'Manager', 'Team', 'Title', 'Grade', 'Chapter', 'Country', 'City', 'Type', 'HiringStatus', 'PRF number', 'SAP position number', 'Comments'],
    ...(route() === 'members' ? state.visible : db.members).map(m => [m.name, m.email, m.manager, m.team, m.title, grade(m.gradeId)?.name, chapter(m.chapterId)?.name, m.country, m.city, m.type, m.hiring, m.prf, m.sap, m.comments])]), 'text/csv'),
  'report-csv': () => { const gs = sortedGrades(), P = pool(); download('matriz-chapter-grado.csv', csv([['Chapter', ...gs.map(g => g.name), 'Total'],
    ...db.chapters.map(c => { const r = gs.map(g => P.filter(m => m.chapterId === c.id && m.gradeId === g.id).length); return [c.name, ...r, r.reduce((a, b) => a + b, 0)]; })]), 'text/csv'); },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (b) return actions[b.dataset.act](b.dataset.id);
  const s = e.target.closest('[data-sort]'); if (s) { state.sort = { by: s.dataset.sort, dir: state.sort.by === s.dataset.sort ? -state.sort.dir : 1 }; render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'f-q') { state.filter.q = e.target.value; const p = e.target.selectionStart; render(); const q = $('#f-q'); q.focus(); q.setSelectionRange(p, p); }
});
document.addEventListener('change', e => {
  const k = { 'f-chapter': 'chapter', 'f-grade': 'grade', 'f-team': 'team', 'f-type': 'type' }[e.target.id];
  if (k) { state.filter[k] = e.target.value; render(); }
  if (e.target.id === 'inc-tbh') { state.incTbh = e.target.checked; render(); }
});
$('#btn-export').onclick = () => download('team-hub.json', JSON.stringify(db, null, 2), 'application/json');
$('#file-import').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = await importFile(f);
    confirmDlg(`Se importarán ${d.members.length} registros, ${d.chapters.length} chapters y ${d.grades.length} grados. Esto reemplaza los datos actuales. ¿Continuar?`, () => { db = d; state.filter = { q: '', chapter: '', grade: '', team: '', type: '' }; save(); render(); toast('Datos importados'); });
  } catch (err) { toast(err.message || 'No se pudo importar'); }
};
$('#btn-reset').onclick = () => confirmDlg('¿Reemplazar todos los datos por los de demostración?', () => { db = demo(); save(); render(); });

/* ---------- router ---------- */
const state = { filter: { q: '', chapter: '', grade: '', team: '', type: '' }, sort: { by: 'name', dir: 1 }, visible: [], incTbh: false, orgMode: 'chart' };
const route = () => (location.hash.replace('#/', '') || 'dashboard');
function render() {
  const r = views[route()] ? route() : 'dashboard';
  $('#main').innerHTML = views[r]();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.v === r));
}
window.addEventListener('hashchange', render);
render();
