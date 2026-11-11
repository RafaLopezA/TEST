import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMovements, useRoster, useTimeline, useVacancies } from '../api';
import type { MoveType, Row } from '../api';
import { useApp } from '../ctx';
import { useOrg } from '../hooks';
import { Bars, Card, Empty, Kpi, Matrix, PALETTE, Pill, addYears, avg, countBy, daysBetween, disp, downloadCsv, fmtDate, fmtMonth, yearsBetween } from '../ui';
import { VAC_COLOR } from './Dashboard';

export const MOVE: Record<MoveType, { label: string; color: string }> = {
  hire: { label: 'Alta', color: '#12a594' }, rehire: { label: 'Reincorporación', color: '#12a594' }, exit: { label: 'Baja', color: '#e5484d' },
  promotion: { label: 'Promoción', color: '#5b5bf0' }, demotion: { label: 'Bajada de grado', color: '#f76b15' }, grade: { label: 'Cambio de grado', color: '#7c66dc' },
  chapter: { label: 'Cambio de chapter', color: '#0091ff' }, manager: { label: 'Cambio de manager', color: '#f5a524' }, title: { label: 'Cambio de título', color: '#999999' }, location: { label: 'Cambio de ubicación', color: '#999999' },
};
const TABS = [['evolution', 'Evolución'], ['moves', 'Movimientos'], ['compare', 'Comparar fechas'], ['structure', 'Estructura'], ['attrition', 'Rotación'], ['vacancies', 'Vacantes']] as const;
type Tab = (typeof TABS)[number][0];
const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 } };

export function Reports() {
  const { asOf, meta } = useApp();
  const [tab, setTab] = useState<Tab>('evolution');
  const [from, setFrom] = useState(addYears(asOf, -2) < meta.first_date ? meta.first_date : addYears(asOf, -2)), [to, setTo] = useState(asOf);
  const range = <span className="range">Desde <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} /> hasta <input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} /></span>;
  return <>
    <div className="head"><div><h1>Reportes</h1><p className="sub">Históricos y análisis de la organización</p></div><button className="btn primary" onClick={() => window.print()}>🖨 Imprimir / PDF</button></div>
    <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'evolution' && <Evolution from={from} to={to} range={range} />}
    {tab === 'moves' && <Moves from={from} to={to} range={range} />}
    {tab === 'compare' && <Compare />}
    {tab === 'structure' && <Structure />}
    {tab === 'attrition' && <Attrition />}
    {tab === 'vacancies' && <VacReport />}
  </>;
}

function Evolution({ from, to, range }: { from: string; to: string; range: React.ReactNode }) {
  const { meta } = useApp(); const { name } = useOrg();
  const [g, setG] = useState<'chapter' | 'grade' | 'team'>('chapter');
  const { data: tl = [] } = useTimeline(from, to, g);
  const keys = [...new Set(tl.flatMap(p => Object.keys(p.groups)))];
  const label = (k: string) => (g === 'chapter' ? meta.chapters.find(c => c.id === +k)?.name : g === 'grade' ? meta.grades.find(x => x.id === +k)?.code : disp(name(+k))) || 'Sin asignar';
  const color = (k: string, i: number) => (g === 'chapter' ? meta.chapters.find(c => c.id === +k)?.color : undefined) ?? PALETTE[i % PALETTE.length];
  const ordered = g === 'grade' ? meta.grades.map(x => String(x.id)).filter(k => keys.includes(k)).concat(keys.filter(k => !meta.grades.some(x => String(x.id) === k))) : keys.sort((a, b) => label(a).localeCompare(label(b)));
  const series = tl.map(p => ({ date: fmtMonth(p.date), Total: p.total, Altas: p.hires, Bajas: -p.exits, ...Object.fromEntries(ordered.map(k => [label(k), p.groups[k] ?? 0])) }));
  const first = tl[0]?.total ?? 0, last = tl.at(-1)?.total ?? 0;
  return <>
    <div className="toolbar">{range}<select value={g} onChange={e => setG(e.target.value as typeof g)}><option value="chapter">Por chapter</option><option value="grade">Por grado</option><option value="team">Por equipo</option></select>
      <button className="btn" onClick={() => downloadCsv(`evolucion-${from}_${to}.csv`, [['Fecha', 'Total', 'Altas', 'Bajas', ...ordered.map(label)], ...tl.map(p => [p.date, p.total, p.hires, p.exits, ...ordered.map(k => p.groups[k] ?? 0)])])}>⬇ CSV</button></div>
    <div className="grid kpis"><Kpi value={last} label={`Headcount a ${fmtDate(to)}`} /><Kpi value={<span className={last >= first ? 'up' : 'down'}>{last >= first ? '+' : ''}{last - first}</span>} label="Variación en el periodo" hint={first ? `${(((last - first) / first) * 100).toFixed(1)}%` : undefined} />
      <Kpi value={tl.reduce((a, p) => a + p.hires, 0)} label="Altas" /><Kpi value={tl.reduce((a, p) => a + p.exits, 0)} label="Bajas" /></div>
    <Card title="Headcount a fin de mes"><div className="chart lg"><ResponsiveContainer><AreaChart data={series} margin={{ left: -18, right: 8, top: 6 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="date" fontSize={12} minTickGap={24} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip {...tip} /><Legend />
      {ordered.map((k, i) => <Area key={k} isAnimationActive={false} type="monotone" dataKey={label(k)} stackId="1" stroke={color(k, i)} fill={color(k, i)} fillOpacity={0.55} />)}</AreaChart></ResponsiveContainer></div></Card>
    <Card title="Altas y bajas por mes" style={{ marginTop: 16 }}><div className="chart sm"><ResponsiveContainer><BarChart data={series} stackOffset="sign" margin={{ left: -24, right: 8, top: 6 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="date" fontSize={12} minTickGap={24} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip {...tip} formatter={(v: number) => Math.abs(v)} /><Legend />
      <Bar isAnimationActive={false} dataKey="Altas" stackId="a" fill="#12a594" /><Bar isAnimationActive={false} dataKey="Bajas" stackId="a" fill="#e5484d" /></BarChart></ResponsiveContainer></div></Card>
  </>;
}

function Moves({ from, to, range }: { from: string; to: string; range: React.ReactNode }) {
  const { chapter } = useApp();
  const { data: moves = [] } = useMovements(from, to);
  const [type, setType] = useState('');
  const counts = countBy(moves, m => m.type), list = moves.filter(m => !type || m.type === type);
  return <>
    <div className="toolbar">{range}<select value={type} onChange={e => setType(e.target.value)}><option value="">Todos los tipos</option>{Object.entries(MOVE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <button className="btn" onClick={() => downloadCsv(`movimientos-${from}_${to}.csv`, [['Fecha', 'Tipo', 'Persona', 'De', 'A', 'Motivo'], ...list.map(m => [m.date, MOVE[m.type].label, m.name, m.from, m.to, m.reason])])}>⬇ CSV</button></div>
    <div className="grid kpis">{(['hire', 'exit', 'promotion', 'chapter', 'manager'] as MoveType[]).map(t => <Kpi key={t} value={(counts.get(t) ?? 0) + (t === 'hire' ? counts.get('rehire') ?? 0 : 0)} label={MOVE[t].label + 's'} />)}</div>
    <div className="card tw flush"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Persona</th><th>Detalle</th><th>Motivo</th></tr></thead><tbody>
      {list.map((m, i) => <tr key={i}><td>{fmtDate(m.date)}</td><td><Pill color={MOVE[m.type].color}>{MOVE[m.type].label}</Pill></td><td><Link to={`/members/${m.member_id}`}>{disp(m.name)}</Link></td>
        <td className="wrap">{m.from && m.to ? `${m.from} → ${m.to}` : m.from || m.to || chapter(m.chapter_id)?.name}</td><td className="wrap">{m.reason}</td></tr>)}</tbody></table>
      {!list.length && <Empty>Sin movimientos en el periodo</Empty>}</div>
  </>;
}

function Compare() {
  const { asOf, meta, chapter, grade } = useApp();
  const [a, setA] = useState(addYears(asOf, -1) < meta.first_date ? meta.first_date : addYears(asOf, -1)), [b, setB] = useState(asOf);
  const act = (rows?: Row[]) => (rows ?? []).filter(r => r.state === 'active');
  const A = act(useRoster(a).data), B = act(useRoster(b).data);
  const { data: moves = [] } = useMovements(a < b ? a : b, a < b ? b : a);
  const inA = new Map(A.map(r => [r.member_id, r])), inB = new Map(B.map(r => [r.member_id, r]));
  const joined = B.filter(r => !inA.has(r.member_id)), left = A.filter(r => !inB.has(r.member_id));
  const changed = B.filter(r => { const p = inA.get(r.member_id); return p && (p.grade_id !== r.grade_id || p.chapter_id !== r.chapter_id); });
  const table = (title: string, axes: { id: number; label: string }[], key: (r: Row) => number | null) => <Card title={title}><div className="tw"><table className="compact"><thead><tr><th /><th>{fmtDate(a)}</th><th>{fmtDate(b)}</th><th>Δ</th></tr></thead><tbody>
    {axes.map(x => { const n1 = A.filter(r => key(r) === x.id).length, n2 = B.filter(r => key(r) === x.id).length; return <tr key={x.id}><td>{x.label}</td><td>{n1}</td><td>{n2}</td><td className={n2 > n1 ? 'up' : n2 < n1 ? 'down' : ''}>{n2 > n1 ? '+' : ''}{n2 - n1 || '·'}</td></tr>; })}
    <tr><td><b>Total</b></td><td><b>{A.length}</b></td><td><b>{B.length}</b></td><td className={B.length >= A.length ? 'up' : 'down'}><b>{B.length >= A.length ? '+' : ''}{B.length - A.length}</b></td></tr></tbody></table></div></Card>;
  const people = (rows: Row[]) => rows.length ? <div className="chips">{rows.map(r => <Link key={r.member_id} className="chip" to={`/members/${r.member_id}`}>{disp(r.name)} · {grade(r.grade_id)?.code ?? '—'}</Link>)}</div> : <Empty>Nadie</Empty>;
  return <>
    <div className="toolbar"><span className="range">Comparar <input type="date" value={a} onChange={e => e.target.value && setA(e.target.value)} /> con <input type="date" value={b} onChange={e => e.target.value && setB(e.target.value)} /></span></div>
    <div className="grid kpis"><Kpi value={`${A.length} → ${B.length}`} label="Headcount" /><Kpi value={joined.length} label="Entran" /><Kpi value={left.length} label="Salen" />
      <Kpi value={moves.filter(m => m.type === 'promotion').length} label="Promociones" /><Kpi value={moves.filter(m => m.type === 'chapter').length} label="Cambios de chapter" /></div>
    <div className="grid cols2">
      {table('Por chapter', meta.chapters.map(c => ({ id: c.id, label: c.name })), r => r.chapter_id)}
      {table('Por grado', meta.grades.map(g => ({ id: g.id, label: `${g.code} · ${g.description}` })), r => r.grade_id)}
      <Card title={`Entran (${joined.length})`}>{people(joined)}</Card><Card title={`Salen (${left.length})`}>{people(left)}</Card>
      <Card title={`Cambian de grado o chapter (${changed.length})`} style={{ gridColumn: '1/-1' }}>{changed.length ? <div className="tw"><table><thead><tr><th>Persona</th><th>Antes</th><th>Después</th></tr></thead><tbody>
        {changed.map(r => { const p = inA.get(r.member_id)!; return <tr key={r.member_id}><td><Link to={`/members/${r.member_id}`}>{disp(r.name)}</Link></td>
          <td>{chapter(p.chapter_id)?.name ?? '—'} · {grade(p.grade_id)?.code ?? '—'}</td><td>{chapter(r.chapter_id)?.name ?? '—'} · {grade(r.grade_id)?.code ?? '—'}</td></tr>; })}</tbody></table></div> : <Empty>Sin cambios</Empty>}</Card>
    </div>
  </>;
}

function Structure() {
  const { meta, asOf, grade, seniorLevel } = useApp(); const { active, reports, name, byId } = useOrg();
  const teams = [...new Set(active.map(m => m.team_id).filter((t): t is number => t != null))].sort((x, y) => name(x).localeCompare(name(y)));
  const chAxes = meta.chapters.map(c => ({ id: c.id, label: c.name, color: c.color })), grAxes = meta.grades.map(g => ({ id: g.id, label: g.code }));
  const locs = [...countBy(active, m => [m.city, m.country].filter(Boolean).join(', ') || 'Sin ubicar')].sort((x, y) => y[1] - x[1]);
  const skills = [...countBy(active.flatMap(m => m.skills.split(',').map(s => s.trim()).filter(Boolean)), s => s)].sort((x, y) => y[1] - x[1]).slice(0, 12);
  const buckets = [['< 1 año', 0, 1], ['1–2 años', 1, 2], ['2–5 años', 2, 5], ['> 5 años', 5, 99]] as const;
  const span = [...reports.entries()].map(([id, rs]) => ({ id, n: rs.length })).sort((x, y) => y.n - x.n);
  const exportMatrix = () => downloadCsv(`chapter-grado-${asOf}.csv`, [['Chapter', ...meta.grades.map(g => g.code), 'Total'],
    ...meta.chapters.map(c => { const r = meta.grades.map(g => active.filter(m => m.chapter_id === c.id && m.grade_id === g.id).length); return [c.name, ...r, r.reduce((x, y) => x + y, 0)]; })]);
  return <>
    <p className="sub">Estructura a {fmtDate(asOf)} · cambia la fecha en la barra superior para ver otra foto.</p>
    <Card title="Chapter × grado" actions={<button className="btn sm" onClick={exportMatrix}>⬇ CSV</button>}><Matrix rows={chAxes} cols={grAxes} cell={(r, c) => active.filter(m => m.chapter_id === r.id && m.grade_id === c.id).length} /></Card>
    <Card title="Equipo × chapter" style={{ margin: '16px 0' }}><Matrix rows={teams.map(t => ({ id: t, label: disp(name(t)) }))} cols={chAxes} cell={(r, c) => active.filter(m => m.team_id === r.id && m.chapter_id === c.id).length} /></Card>
    <div className="grid cols2">
      <Card title="Pirámide de grados"><Bars items={meta.grades.map(g => ({ label: `${g.code} · ${g.description}`, value: active.filter(m => m.grade_id === g.id).length }))} /></Card>
      {seniorLevel != null && <Card title="% M3 o superior por chapter"><Bars items={meta.chapters.map(c => { const ms = active.filter(m => m.chapter_id === c.id); return { label: c.name, color: c.color, suffix: '%', value: ms.length ? Math.round((ms.filter(m => (grade(m.grade_id)?.level ?? 0) >= seniorLevel).length / ms.length) * 100) : 0 }; })} /></Card>}
      <Card title="Antigüedad"><Bars items={buckets.map(([label, lo, hi]) => ({ label, value: active.filter(m => { const y = yearsBetween(m.hire_date, asOf); return y >= lo && y < hi; }).length }))} /></Card>
      <Card title="Ubicaciones"><Bars items={locs.map(([label, value]) => ({ label, value }))} /></Card>
      <Card title="Skills más frecuentes"><Bars items={skills.map(([label, value]) => ({ label, value }))} /></Card>
      <Card title="Span of control (reportes directos)"><div className="tw"><table><thead><tr><th>Manager</th><th>Grado</th><th>Reportes</th></tr></thead><tbody>
        {span.map(s => <tr key={s.id}><td><Link to={`/members/${s.id}`}>{disp(name(s.id))}</Link></td><td>{grade(byId.get(s.id)?.grade_id ?? null)?.code ?? '—'}</td><td><b>{s.n}</b></td></tr>)}</tbody></table></div></Card>
    </div>
  </>;
}

function Attrition() {
  const { asOf, meta } = useApp();
  const from = addYears(asOf, -1);
  const { data: tl = [] } = useTimeline(from, asOf, 'chapter');
  const { data: moves = [] } = useMovements(from, asOf);
  const exits = moves.filter(m => m.type === 'exit'), promos = moves.filter(m => m.type === 'promotion');
  const avgHc = avg(tl.map(p => p.total));
  const reasons = [...countBy(exits, m => m.reason || 'Sin motivo')].sort((a, b) => b[1] - a[1]);
  const { data: roster = [] } = useRoster(asOf);
  const tenures = exits.map(e => roster.find(r => r.member_id === e.member_id)).filter((r): r is Row => !!r).map(r => yearsBetween(r.hire_date, r.exit_date ?? asOf));
  return <>
    <p className="sub">Últimos 12 meses hasta {fmtDate(asOf)}. Rotación = bajas / headcount medio del periodo.</p>
    <div className="grid kpis"><Kpi value={avgHc ? `${((exits.length / avgHc) * 100).toFixed(1)}%` : '—'} label="Rotación anual" /><Kpi value={exits.length} label="Bajas" /><Kpi value={moves.filter(m => m.type === 'hire' || m.type === 'rehire').length} label="Altas" />
      <Kpi value={promos.length} label="Promociones" hint={avgHc ? `${((promos.length / avgHc) * 100).toFixed(0)}% de la plantilla` : undefined} /><Kpi value={tenures.length ? `${avg(tenures).toFixed(1)} a` : '—'} label="Antigüedad media al salir" /></div>
    <div className="grid cols2">
      <Card title="Rotación por chapter"><Bars items={meta.chapters.map(c => { const hc = avg(tl.map(p => p.groups[c.id] ?? 0)); return { label: c.name, color: c.color, suffix: '%', value: hc ? Math.round((exits.filter(e => e.chapter_id === c.id).length / hc) * 100) : 0 }; })} /></Card>
      <Card title="Motivos de baja"><Bars items={reasons.map(([label, value]) => ({ label, value }))} /></Card>
      <Card title="Promociones por grado alcanzado"><Bars items={meta.grades.map(g => ({ label: g.code, value: promos.filter(p => p.to === g.code).length })).filter(x => x.value)} /></Card>
      <Card title="Bajas del periodo">{exits.length ? <ul className="feed">{exits.map((m, i) => <li key={i}><span><Link to={`/members/${m.member_id}`}>{disp(m.name)}</Link><small> {m.from} {m.reason && `· ${m.reason}`}</small></span><time>{fmtDate(m.date)}</time></li>)}</ul> : <Empty>Sin bajas</Empty>}</Card>
    </div>
  </>;
}

function VacReport() {
  const { meta, chapter } = useApp();
  const { data: list = [] } = useVacancies();
  const open = list.filter(v => !v.closed_at), filled = list.filter(v => v.status === 'Filled' && v.closed_at);
  const chAxes = meta.chapters.map(c => ({ id: c.id, label: c.name, color: c.color })), openStatuses = meta.vacancy_statuses.filter(s => s !== 'Filled' && s !== 'Cancelled');
  const aging = [['< 30 días', 0, 30], ['30–60', 30, 60], ['60–90', 60, 90], ['> 90 días', 90, 1e6]] as const;
  return <>
    <div className="grid kpis"><Kpi value={open.length} label="Abiertas" /><Kpi value={filled.length} label="Cubiertas" /><Kpi value={filled.length ? `${Math.round(avg(filled.map(v => daysBetween(v.opened_at, v.closed_at!))))} d` : '—'} label="Tiempo medio de cobertura" />
      <Kpi value={list.filter(v => v.status === 'Cancelled').length} label="Canceladas" /></div>
    <Card title="Abiertas por chapter y estado"><Matrix rows={chAxes} cols={openStatuses.map(s => ({ id: s, label: s }))} cell={(r, c) => open.filter(v => v.chapter_id === r.id && v.status === c.id).length} /></Card>
    <div className="grid cols2" style={{ marginTop: 16 }}>
      <Card title="Embudo actual"><Bars items={openStatuses.map(s => ({ label: s, value: open.filter(v => v.status === s).length, color: VAC_COLOR[s] }))} /></Card>
      <Card title="Antigüedad de las abiertas"><Bars items={aging.map(([label, lo, hi]) => ({ label, value: open.filter(v => { const d = daysBetween(v.opened_at, meta.today); return d >= lo && d < hi; }).length }))} /></Card>
      <Card title="Días medios de cobertura por chapter"><Bars items={meta.chapters.map(c => ({ label: c.name, color: c.color, suffix: ' d', value: Math.round(avg(filled.filter(v => v.chapter_id === c.id).map(v => daysBetween(v.opened_at, v.closed_at!)))) })).filter(x => x.value)} /></Card>
      <Card title="Abiertas más antiguas">{open.length ? <ul className="feed">{open.slice().sort((a, b) => a.opened_at.localeCompare(b.opened_at)).slice(0, 8).map(v => <li key={v.id}><Pill color={VAC_COLOR[v.status]}>{v.status}</Pill><span>{v.code}<small> {chapter(v.chapter_id)?.name}</small></span><time>{daysBetween(v.opened_at, meta.today)} d</time></li>)}</ul> : <Empty>Sin vacantes abiertas</Empty>}</Card>
    </div>
  </>;
}
