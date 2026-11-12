import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useVacancies } from '../api';
import type { Row, Vacancy } from '../api';
import { useApp } from '../ctx';
import { useOrg } from '../hooks';
import { Avatar, Empty, Pill, disp, fmtDate } from '../ui';
import { VAC_COLOR, vacanciesAt } from '../vac';

type Node = { kind: 'm'; row: Row } | { kind: 'v'; vac: Vacancy };

export function Org() {
  const { meta, asOf, chapter, grade, seniorLevel } = useApp();
  const { active, reports } = useOrg();
  const { data: vacancies = [] } = useVacancies();
  const [mode, setMode] = useState<'chart' | 'tree'>('chart');
  const openVac = vacanciesAt(vacancies, asOf, meta.today).open;
  const ids = new Set(active.map(r => r.member_id));
  const lvl = (r: Row) => grade(r.grade_id)?.level ?? 0;
  const kids = (id: number): Node[] => [
    ...(reports.get(id) ?? []).slice().sort((a, b) => lvl(b) - lvl(a) || a.name.localeCompare(b.name)).map(row => ({ kind: 'm' as const, row })),
    ...openVac.filter(v => v.manager_id === id).map(vac => ({ kind: 'v' as const, vac })),
  ];
  const roots = active.filter(r => r.manager_id == null || !ids.has(r.manager_id)).sort((a, b) => lvl(b) - lvl(a));
  const tbhLabel = (v: Vacancy) => { const t = /^TBH\s*-\s*(\S+)\s+(\S+)/i.exec(v.code); return t ? `TBH ${t[1]} ${t[2]}` : v.code; };

  const Box = ({ n, cls }: { n: Node; cls: string }) => n.kind === 'v'
    ? <div className="cbox tbh" title={`${n.vac.title} · ${n.vac.status}`}><b>{tbhLabel(n.vac)}</b>{n.vac.sap && <><br />SAP {n.vac.sap}</>}<br /><small>{n.vac.status}</small></div>
    : <Link to={`/members/${n.row.member_id}`} className={`cbox ${cls}`} title={`${n.row.title} · ${grade(n.row.grade_id)?.code ?? ''} · ${chapter(n.row.chapter_id)?.name ?? ''}`}>{n.row.name}
      {cls !== 'ic' && <small>{grade(n.row.grade_id)?.code}</small>}</Link>;
  const hasKids = (n: Node) => n.kind === 'm' && kids(n.row.member_id).length > 0;
  const isLead = (n: Node) => hasKids(n) || (n.kind === 'm' && seniorLevel != null && lvl(n.row) >= seniorLevel);

  /** Página de diagrama para una persona con su primera y segunda línea (formato presentación). */
  const Page = ({ root, deep }: { root: Row; deep: boolean }) => {
    const ch = kids(root.member_id), leads = deep ? ch.filter(isLead) : ch, direct = deep ? ch.filter(n => !isLead(n)) : [];
    return <section className="chart-page card"><h3 className="ct">{meta.org_name.toUpperCase()} · THE TEAM <small>{fmtDate(asOf)}</small></h3>
      <div className="ctree"><Box n={{ kind: 'm', row: root }} cls="root" />
        <div className="crow">
          {leads.map((l, i) => { const sub = deep && l.kind === 'm' ? kids(l.row.member_id) : []; return <div className="ccol" key={i}><Box n={l} cls="mgr" />{sub.length > 0 && <div className="cgrid">{sub.map((s, k) => <Box key={k} n={s} cls="ic" />)}</div>}</div>; })}
          {direct.length > 0 && <div className="ccol"><div className="cgrid">{direct.map((s, k) => <Box key={k} n={s} cls="ic" />)}</div></div>}
        </div></div></section>;
  };
  // Páginas: la cabeza con su primera línea y después cada persona de primera línea que tenga equipo
  // Páginas: cada cabeza con su primera línea y, después, una página por cada persona de primera línea con equipo.
  // Si la organización solo tiene dos niveles, una única página con todo.
  const firstLine = roots.flatMap(r => kids(r.member_id).flatMap(n => (hasKids(n) && n.kind === 'm' ? [n.row] : [])));
  const pages = firstLine.length ? [...roots.map(r => ({ root: r, deep: false })), ...firstLine.map(r => ({ root: r, deep: true }))] : roots.map(r => ({ root: r, deep: true }));

  const Tree = ({ n, depth }: { n: Node; depth: number }) => {
    if (n.kind === 'v') return <div className="leaf"><span className="person"><Avatar name="+" color={chapter(n.vac.chapter_id)?.color ?? '#999'} dashed /><span>{n.vac.code}<small>{n.vac.title} · {grade(n.vac.grade_id)?.code ?? ''}</small></span><Pill color={VAC_COLOR[n.vac.status]}>{n.vac.status}</Pill></span></div>;
    const ch = kids(n.row.member_id), r = n.row;
    const card = <span className="person"><Avatar name={r.name} color={chapter(r.chapter_id)?.color} />
      <span><Link to={`/members/${r.member_id}`} onClick={e => e.stopPropagation()}>{disp(r.name)}</Link><small>{[r.title, grade(r.grade_id)?.code, chapter(r.chapter_id)?.name].filter(Boolean).join(' · ')}</small></span>
      {ch.length > 0 && <Pill off>{ch.length}</Pill>}</span>;
    return ch.length ? <details open={depth < 2}><summary>{card}</summary><div className="tree">{ch.map((k, i) => <Tree key={i} n={k} depth={depth + 1} />)}</div></details> : <div className="leaf">{card}</div>;
  };

  return <>
    <div className="head"><div><h1>Organigrama</h1><p className="sub">Jerarquía por manager a {fmtDate(asOf)}. Las vacantes abiertas aparecen con borde punteado.</p></div>
      <div className="row"><span className="tabs inline"><button className={mode === 'chart' ? 'on' : ''} onClick={() => setMode('chart')}>Diagrama</button><button className={mode === 'tree' ? 'on' : ''} onClick={() => setMode('tree')}>Árbol</button></span>
        <button className="btn primary" onClick={() => window.print()}>🖨 Exportar PDF</button></div></div>
    {!roots.length ? <Empty>No hay personas activas en esta fecha</Empty>
      : mode === 'chart' ? pages.map(p => <Page key={`${p.root.member_id}-${p.deep}`} root={p.root} deep={p.deep} />)
        : <div className="card"><div className="tree root">{roots.map(r => <Tree key={r.member_id} n={{ kind: 'm', row: r }} depth={0} />)}</div></div>}
  </>;
}
