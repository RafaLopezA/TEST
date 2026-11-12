import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMovements, useTimeline, useVacancies } from '../api';
import { useApp } from '../ctx';
import { useOrg } from '../hooks';
import { Bars, Card, Donut, Empty, Kpi, PALETTE, Pill, addYears, avg, disp, fmtDate, fmtMonth, yearsBetween } from '../ui';
import { VAC_COLOR, vacanciesAt } from '../vac';
import { MOVE } from './Reports';


export function Dashboard() {
  const { meta, asOf, chapter, seniorLevel, grade } = useApp();
  const { active, reports, name } = useOrg();
  const from = addYears(asOf, -1);
  const { data: tl = [] } = useTimeline(from, asOf, 'chapter');
  const { data: moves = [] } = useMovements(from, asOf);
  const { data: vacancies = [] } = useVacancies();
  const { open } = vacanciesAt(vacancies, asOf, meta.today);
  const exits = moves.filter(m => m.type === 'exit').length, hires = moves.filter(m => m.type === 'hire' || m.type === 'rehire').length;
  const avgHc = avg(tl.map(p => p.total)) || 1, delta = tl.length ? active.length - tl[0].total : 0;
  const spans = [...reports.values()].map(r => r.length);
  const seniors = seniorLevel == null ? null : active.filter(m => (grade(m.grade_id)?.level ?? 0) >= seniorLevel).length;
  const teams = [...new Set(active.map(m => m.team_id).filter((t): t is number => t != null))];
  // Las personas sin chapter o sin grado (p. ej. managers creados por una importación) también cuentan: se muestran como "Sin chapter/grado".
  const NONE = '#9aa0b4', noChapter = active.filter(m => chapter(m.chapter_id) == null).length, noGrade = active.filter(m => grade(m.grade_id) == null).length;
  const areas = [...meta.chapters.map(c => ({ key: String(c.id), name: c.name, color: c.color })), ...(tl.some(p => p.groups['0']) ? [{ key: '0', name: 'Sin chapter', color: NONE }] : [])];
  const series = tl.map(p => ({ date: fmtMonth(p.date), ...Object.fromEntries(areas.map(a => [a.name, p.groups[a.key] ?? 0])), Altas: p.hires, Bajas: p.exits }));

  return <>
    <div className="head"><div><h1>Resumen</h1><p className="sub">Situación a {fmtDate(asOf)} y evolución de los últimos 12 meses</p></div></div>
    <div className="grid kpis">
      <Kpi value={active.length} label="Personas activas" hint={<span className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} en 12 meses</span>} />
      <Kpi value={open.length} label="Vacantes abiertas" hint={`${open.filter(v => v.status === 'Recruiting' || v.status === 'Offer').length} en selección`} />
      <Kpi value={`${hires} / ${exits}`} label="Altas / bajas (12 m)" hint={`Rotación ${((exits / avgHc) * 100).toFixed(1)}%`} />
      <Kpi value={avg(spans).toFixed(1)} label="Span medio por manager" hint={`${spans.length} managers · máx. ${Math.max(0, ...spans)}`} />
      <Kpi value={`${avg(active.map(m => yearsBetween(m.hire_date, asOf))).toFixed(1)} a`} label="Antigüedad media" hint={seniors != null && active.length ? `${Math.round((seniors / active.length) * 100)}% M3 o superior` : undefined} />
    </div>
    <div className="grid cols2">
      <Card title="Evolución del headcount por chapter" style={{ gridColumn: '1/-1' }}>
        <div className="chart"><ResponsiveContainer><AreaChart data={series} margin={{ left: -18, right: 8, top: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 }} /><Legend />
          {areas.map(a => <Area key={a.key} isAnimationActive={false} type="monotone" dataKey={a.name} stackId="1" stroke={a.color} fill={a.color} fillOpacity={0.55} />)}
        </AreaChart></ResponsiveContainer></div></Card>
      <Card title="Personas por chapter"><Bars items={[...meta.chapters.map(c => ({ label: c.name, value: active.filter(m => m.chapter_id === c.id).length, color: c.color })), ...(noChapter ? [{ label: 'Sin chapter', value: noChapter, color: NONE }] : [])]} /></Card>
      <Card title="Distribución por grado"><Donut items={[...meta.grades.map(g => ({ label: `${g.code}${g.description ? ' · ' + g.description : ''}`, value: active.filter(m => m.grade_id === g.id).length })), ...(noGrade ? [{ label: 'Sin grado', value: noGrade, color: NONE }] : [])]} /></Card>
      <Card title="Altas y bajas por mes"><div className="chart sm"><ResponsiveContainer><BarChart data={series} margin={{ left: -24, right: 8, top: 6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 }} /><Legend />
        <Bar isAnimationActive={false} dataKey="Altas" fill="#12a594" radius={[4, 4, 0, 0]} /><Bar isAnimationActive={false} dataKey="Bajas" fill="#e5484d" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card title="Personas por equipo"><Bars items={teams.map((t, i) => ({ label: disp(name(t)), value: active.filter(m => m.team_id === t).length, color: PALETTE[i % PALETTE.length] })).sort((a, b) => b.value - a.value)} /></Card>
      <Card title="Vacantes abiertas por estado" actions={<Link to="/vacancies">Ver tablero →</Link>}>
        <Bars items={meta.vacancy_statuses.filter(s => s !== 'Filled' && s !== 'Cancelled').map(s => ({ label: s, value: open.filter(v => v.status === s).length, color: VAC_COLOR[s] }))} /></Card>
      <Card title="Últimos movimientos" actions={<Link to="/reports">Ver todos →</Link>}>
        {moves.length ? <ul className="feed">{moves.filter(m => m.type !== 'title' && m.type !== 'location').slice(0, 8).map((m, i) => <li key={i}><Pill color={MOVE[m.type].color}>{MOVE[m.type].label}</Pill>
          <span><Link to={`/members/${m.member_id}`}>{disp(m.name)}</Link>{m.from && m.to ? <small> {m.from} → {m.to}</small> : <small> {chapter(m.chapter_id)?.name}</small>}</span><time>{fmtDate(m.date)}</time></li>)}</ul> : <Empty>Sin movimientos en el periodo</Empty>}</Card>
    </div>
  </>;
}
