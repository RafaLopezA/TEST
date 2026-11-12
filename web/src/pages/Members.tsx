import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../ctx';
import { MemberCreate } from '../forms';
import { useOrg } from '../hooks';
import { Avatar, Dot, Empty, Pill, disp, downloadCsv, fmtDate } from '../ui';

type SortKey = 'name' | 'chapter' | 'grade' | 'manager' | 'team' | 'hire';

export function Members() {
  const { meta, chapter, grade, canEdit, asOf } = useApp();
  const { rows, name } = useOrg();
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', chapter: '', grade: '', team: '', state: 'active' });
  const [sort, setSort] = useState<{ by: SortKey; dir: 1 | -1 }>({ by: 'name', dir: 1 });
  const [creating, setCreating] = useState(false);
  const teams = useMemo(() => [...new Set(rows.filter(r => r.state === 'active' && r.team_id != null).map(r => r.team_id!))].sort((a, b) => name(a).localeCompare(name(b))), [rows, name]);

  const list = useMemo(() => {
    const q = f.q.toLowerCase();
    const key: Record<SortKey, (r: (typeof rows)[number]) => string | number> = {
      name: r => r.name, chapter: r => chapter(r.chapter_id)?.name ?? '', grade: r => grade(r.grade_id)?.level ?? 0, manager: r => name(r.manager_id), team: r => name(r.team_id), hire: r => r.hire_date,
    };
    return rows.filter(r => (!f.state || r.state === f.state) && (!f.chapter || r.chapter_id === +f.chapter) && (!f.grade || r.grade_id === +f.grade) && (!f.team || r.team_id === +f.team || r.member_id === +f.team)
      && (!q || `${r.name} ${r.email} ${r.title} ${r.skills} ${name(r.manager_id)}`.toLowerCase().includes(q)))
      .sort((a, b) => { const x = key[sort.by](a), y = key[sort.by](b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [rows, f, sort, chapter, grade, name]);

  const th = (k: SortKey, label: string) => <th className="sort" onClick={() => setSort(s => ({ by: k, dir: s.by === k ? (-s.dir as 1 | -1) : 1 }))}>{label}{sort.by === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));
  const exportCsv = () => downloadCsv(`miembros-${asOf}.csv`, [['Nombre', 'Email', 'Título', 'Chapter', 'Grado', 'Manager', 'Equipo', 'País', 'Ciudad', 'Alta', 'Baja', 'Estado', 'Skills'],
    ...list.map(r => [r.name, r.email, r.title, chapter(r.chapter_id)?.name, grade(r.grade_id)?.code, name(r.manager_id), name(r.team_id), r.country, r.city, r.hire_date, r.exit_date, r.state, r.skills])]);

  return <>
    <div className="head"><div><h1>Miembros</h1><p className="sub">{list.length} de {rows.length} personas · situación a {fmtDate(asOf)}</p></div>
      <div className="row"><button className="btn" onClick={exportCsv}>⬇ CSV</button>{canEdit && <button className="btn primary" onClick={() => setCreating(true)}>+ Nuevo miembro</button>}</div></div>
    <div className="toolbar">
      <input type="search" placeholder="Buscar por nombre, email, título, skill o manager…" value={f.q} onChange={set('q')} />
      <select value={f.chapter} onChange={set('chapter')}><option value="">Todos los chapters</option>{meta.chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select value={f.grade} onChange={set('grade')}><option value="">Todos los grados</option>{meta.grades.map(g => <option key={g.id} value={g.id}>{g.code}</option>)}</select>
      <select value={f.team} onChange={set('team')}><option value="">Todos los equipos</option>{teams.map(t => <option key={t} value={t}>{disp(name(t))}</option>)}</select>
      <select value={f.state} onChange={set('state')}><option value="active">Activos</option><option value="exited">Bajas</option><option value="future">Incorporaciones futuras</option><option value="">Todos</option></select>
    </div>
    <div className="card tw flush"><table><thead><tr>{th('name', 'Miembro')}<th>Título</th>{th('chapter', 'Chapter')}{th('grade', 'Grado')}{th('manager', 'Manager')}{th('team', 'Equipo')}<th>Ubicación</th>{th('hire', 'Alta')}</tr></thead>
      <tbody>{list.map(r => { const c = chapter(r.chapter_id); return <tr key={r.member_id} className="click" onClick={() => nav(`/members/${r.member_id}`)}>
        <td><div className="person"><Avatar name={r.name} color={r.state === 'active' ? c?.color : '#aaa'} /><div>{disp(r.name)}
          <small>{r.email}{r.state === 'exited' && <> · <Pill off>Baja {fmtDate(r.exit_date)}</Pill></>}{r.state === 'future' && <> · <Pill color="#0091ff">Entra {fmtDate(r.valid_from)}</Pill></>}</small></div></div></td>
        <td>{r.title}</td><td>{c ? <><Dot color={c.color} />{c.name}</> : '—'}</td><td><Pill>{grade(r.grade_id)?.code ?? '—'}</Pill></td>
        <td>{disp(name(r.manager_id))}</td><td>{disp(name(r.team_id))}</td><td>{[r.city, r.country].filter(Boolean).join(', ')}</td><td>{fmtDate(r.hire_date)}</td></tr>; })}</tbody></table>
      {!list.length && <Empty>Sin resultados</Empty>}</div>
    {creating && <MemberCreate onClose={() => setCreating(false)} onCreated={id => nav(`/members/${id}`)} />}
  </>;
}
