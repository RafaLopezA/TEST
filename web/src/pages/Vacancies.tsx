import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useSave, useVacancies } from '../api';
import type { Vacancy } from '../api';
import { useApp } from '../ctx';
import { FormModal } from '../forms';
import { useOrg } from '../hooks';
import { Confirm, Dot, Empty, Field, Kpi, Pill, avg, daysBetween, disp, fmtDate } from '../ui';
import { VAC_COLOR } from './Dashboard';

const num = (v: string | boolean) => (v === '' || typeof v === 'boolean' ? null : Number(v));

export function Vacancies() {
  const { meta, chapter, grade, canEdit, toast } = useApp();
  const { active, name } = useOrg();
  const { data: list = [] } = useVacancies();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [edit, setEdit] = useState<Vacancy | 'new' | null>(null), [fill, setFill] = useState<Vacancy | null>(null), [del, setDel] = useState<Vacancy | null>(null);
  const patch = useSave(({ id, status }: { id: number; status: string }) => api('PATCH', `/vacancies/${id}`, { status }));
  const remove = useSave((id: number) => api('DELETE', `/vacancies/${id}`));
  const open = list.filter(v => !v.closed_at), closed = list.filter(v => v.closed_at), filled = closed.filter(v => v.status === 'Filled');
  const openStatuses = meta.vacancy_statuses.filter(s => s !== 'Filled' && s !== 'Cancelled');
  const people = active.slice().sort((a, b) => a.name.localeCompare(b.name));

  const VacCard = ({ v }: { v: Vacancy }) => { const c = chapter(v.chapter_id), age = daysBetween(v.opened_at, meta.today);
    return <div className="vcard"><div className="vtitle"><b>{v.code}</b><Pill>{grade(v.grade_id)?.code ?? '—'}</Pill></div>
      <small>{v.title}</small><small>{c ? <><Dot color={c.color} />{c.name}</> : 'Sin chapter'} · {disp(name(v.manager_id)) || 'sin manager'}</small>
      <small>{v.prf && `PRF ${v.prf}`}{v.prf && v.sap && ' · '}{v.sap && `SAP ${v.sap}`}</small>
      {v.comments && <small className="wrap">💬 {v.comments}</small>}
      <small className={age > 90 ? 'down' : ''}>Abierta hace {age} días{v.target_start ? ` · objetivo ${fmtDate(v.target_start)}` : ''}</small>
      {canEdit && <div className="vactions">
        <select value={v.status} onChange={e => patch.mutate({ id: v.id, status: e.target.value }, { onError: err => toast(err.message, 'error') })}>{meta.vacancy_statuses.filter(s => s !== 'Filled').map(s => <option key={s}>{s}</option>)}</select>
        <button className="btn sm primary" onClick={() => setFill(v)}>Cubrir</button><button className="btn sm" onClick={() => setEdit(v)}>Editar</button></div>}
    </div>; };

  return <>
    <div className="head"><div><h1>Vacantes</h1><p className="sub">Posiciones abiertas (TBH) y su proceso de contratación</p></div>
      {canEdit && <button className="btn primary" onClick={() => setEdit('new')}>+ Nueva vacante</button>}</div>
    <div className="grid kpis">
      <Kpi value={open.length} label="Abiertas" /><Kpi value={`${Math.round(avg(open.map(v => daysBetween(v.opened_at, meta.today))))} d`} label="Antigüedad media de las abiertas" />
      <Kpi value={filled.length} label="Cubiertas (histórico)" /><Kpi value={filled.length ? `${Math.round(avg(filled.map(v => daysBetween(v.opened_at, v.closed_at!))))} d` : '—'} label="Tiempo medio de cobertura" />
    </div>
    <div className="tabs"><button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>Tablero ({open.length})</button><button className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>Cerradas ({closed.length})</button></div>
    {tab === 'open' ? <div className="board">{openStatuses.map(s => { const items = open.filter(v => v.status === s); return <div className="col-board" key={s}>
      <h3><Dot color={VAC_COLOR[s]} />{s} <span className="muted">{items.length}</span></h3>{items.map(v => <VacCard key={v.id} v={v} />)}{!items.length && <div className="muted small">—</div>}</div>; })}</div>
      : <div className="card tw flush"><table><thead><tr><th>Código</th><th>Chapter</th><th>Grado</th><th>Estado</th><th>Abierta</th><th>Cerrada</th><th>Días</th><th>Cubierta por</th>{canEdit && <th />}</tr></thead><tbody>
        {closed.map(v => <tr key={v.id}><td>{v.code}<small className="blk">{v.title}</small></td><td>{chapter(v.chapter_id)?.name ?? '—'}</td><td>{grade(v.grade_id)?.code ?? '—'}</td><td><Pill color={VAC_COLOR[v.status]}>{v.status}</Pill></td>
          <td>{fmtDate(v.opened_at)}</td><td>{fmtDate(v.closed_at)}</td><td>{daysBetween(v.opened_at, v.closed_at!)}</td><td>{v.filled_by ? <Link to={`/members/${v.filled_by}`}>{disp(name(v.filled_by)) || 'Ver persona'}</Link> : '—'}</td>
          {canEdit && <td className="actions"><button className="btn sm" onClick={() => patch.mutate({ id: v.id, status: 'Open' })}>Reabrir</button> <button className="btn sm danger" onClick={() => setDel(v)}>Borrar</button></td>}</tr>)}</tbody></table>
        {!closed.length && <Empty>Sin vacantes cerradas</Empty>}</div>}

    {edit && <FormModal wide title={edit === 'new' ? 'Nueva vacante' : `Editar ${edit.code}`} onClose={() => setEdit(null)}
      initial={edit === 'new' ? { code: 'TBH - ', title: '', chapter_id: '', grade_id: '', manager_id: '', status: 'Pending PRF', prf: '', sap: '', target_start: '', comments: '', opened_at: meta.today }
        : { code: edit.code, title: edit.title, chapter_id: String(edit.chapter_id ?? ''), grade_id: String(edit.grade_id ?? ''), manager_id: String(edit.manager_id ?? ''), status: edit.status, prf: edit.prf, sap: edit.sap, target_start: edit.target_start ?? '', comments: edit.comments, opened_at: edit.opened_at }}
      submit={v => { const body = { ...v, chapter_id: num(v.chapter_id), grade_id: num(v.grade_id), manager_id: num(v.manager_id), target_start: v.target_start || null };
        return edit === 'new' ? api('POST', '/vacancies', body) : api('PATCH', `/vacancies/${edit.id}`, body); }}>
      {(v, set) => <>
        <Field label="Código"><input required value={v.code as string} onChange={set('code')} /></Field>
        <Field label="Título del puesto"><input value={v.title as string} onChange={set('title')} /></Field>
        <Field label="Chapter"><select value={v.chapter_id as string} onChange={set('chapter_id')}><option value="">—</option>{meta.chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Grado"><select value={v.grade_id as string} onChange={set('grade_id')}><option value="">—</option>{meta.grades.map(g => <option key={g.id} value={g.id}>{g.code}</option>)}</select></Field>
        <Field label="Manager"><select value={v.manager_id as string} onChange={set('manager_id')}><option value="">—</option>{people.map(m => <option key={m.member_id} value={m.member_id}>{m.name}</option>)}</select></Field>
        <Field label="Estado"><select value={v.status as string} onChange={set('status')}>{meta.vacancy_statuses.filter(s => s !== 'Filled').map(s => <option key={s}>{s}</option>)}</select></Field>
        <Field label="PRF"><input value={v.prf as string} onChange={set('prf')} /></Field><Field label="Posición SAP"><input value={v.sap as string} onChange={set('sap')} /></Field>
        <Field label="Abierta el"><input type="date" required value={v.opened_at as string} onChange={set('opened_at')} /></Field>
        <Field label="Incorporación objetivo"><input type="date" value={v.target_start as string} onChange={set('target_start')} /></Field>
        <Field label="Comentarios" full><textarea rows={2} value={v.comments as string} onChange={set('comments')} /></Field>
      </>}</FormModal>}
    {fill && <FormModal title={`Cubrir ${fill.code}`} ok="Crear persona y cerrar vacante" done="Vacante cubierta" onClose={() => setFill(null)} initial={{ name: '', email: '', hire_date: fill.target_start ?? meta.today }}
      submit={v => api('POST', `/vacancies/${fill.id}/fill`, v)}>
      {(v, set) => <>
        <p className="full sub">Se dará de alta a la persona con el chapter, grado, título y manager de la vacante.</p>
        <Field label="Nombre (Apellido, Nombre)" full><input required autoFocus value={v.name as string} onChange={set('name')} /></Field>
        <Field label="Email"><input type="email" value={v.email as string} onChange={set('email')} /></Field>
        <Field label="Fecha de incorporación"><input type="date" required value={v.hire_date as string} onChange={set('hire_date')} /></Field>
      </>}</FormModal>}
    {del && <Confirm danger text={`¿Borrar la vacante ${del.code}?`} onClose={() => setDel(null)} onYes={() => remove.mutate(del.id)} />}
  </>;
}
