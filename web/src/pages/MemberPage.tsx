import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useMember, useSave } from '../api';
import type { Row, Version } from '../api';
import { useApp } from '../ctx';
import { MemberChange, MemberExit, MemberPersonal, MemberRehire } from '../forms';
import { useOrg } from '../hooks';
import { Avatar, Card, Confirm, Dot, Empty, Pill, disp, fmtDate, yearsBetween } from '../ui';

export function MemberPage() {
  const id = Number(useParams().id);
  const { data, isLoading, error } = useMember(id);
  const { chapter, grade, canEdit, isAdmin, meta, toast, asOf } = useApp();
  const { byId, reports, name } = useOrg();
  const nav = useNavigate();
  const [modal, setModal] = useState<'change' | 'personal' | 'exit' | 'rehire' | 'delete' | null>(null);
  const del = useSave(() => api('DELETE', `/members/${id}`));
  if (isLoading) return <Empty>Cargando…</Empty>;
  if (error || !data) return <Empty>No se encontró la persona. <Link to="/members">Volver</Link></Empty>;
  const { member, versions, audit } = data;
  // Situación a la fecha seleccionada: la versión vigente ese día; si no hay (baja o alta futura), la más cercana.
  const live = versions.find(v => v.valid_from <= asOf && (v.valid_to === null || v.valid_to > asOf));
  const cur = live ?? [...versions].reverse().find(v => v.valid_from <= asOf) ?? versions[0];
  const row = byId.get(id), open = versions.find(v => v.valid_to === null), last = versions.at(-1)!;
  const gone = !open && last.valid_to! <= meta.today, plannedExit = !open && !gone;
  const gradeSince = versions.filter(v => v.valid_from <= cur.valid_from).reverse().find((v, i, a) => a[i + 1]?.grade_id !== v.grade_id)?.valid_from;
  const c = chapter(cur.chapter_id), mine = reports.get(id) ?? [];
  // Fila "actual" para los formularios aunque la fecha global sea otra
  const asRow: Row = row ?? { ...cur, version_id: cur.id, ...member, member_id: id, team_id: null, state: live ? 'active' : 'exited' };

  const describe = (v: Version, prev?: Version): string[] => {
    if (!prev) return ['Alta en la organización'];
    if (prev.valid_to !== v.valid_from) return ['Reincorporación'];
    const out: string[] = [];
    if (prev.grade_id !== v.grade_id) { const a = grade(prev.grade_id), b = grade(v.grade_id); out.push(`${a && b && b.level > a.level ? 'Promoción' : 'Cambio de grado'}: ${a?.code ?? '—'} → ${b?.code ?? '—'}`); }
    if (prev.chapter_id !== v.chapter_id) out.push(`Cambio de chapter: ${chapter(prev.chapter_id)?.name ?? '—'} → ${chapter(v.chapter_id)?.name ?? '—'}`);
    if (prev.manager_id !== v.manager_id) out.push(`Cambio de manager: ${disp(name(prev.manager_id)) || '—'} → ${disp(name(v.manager_id)) || '—'}`);
    if (prev.title !== v.title) out.push(`Título: ${prev.title || '—'} → ${v.title || '—'}`);
    if (prev.city !== v.city || prev.country !== v.country) out.push(`Ubicación: ${[prev.city, prev.country].filter(Boolean).join(', ') || '—'} → ${[v.city, v.country].filter(Boolean).join(', ') || '—'}`);
    return out.length ? out : ['Actualización'];
  };
  const events = versions.flatMap((v, i) => {
    const e = [{ date: v.valid_from, lines: describe(v, versions[i - 1]), reason: v.reason, kind: i === 0 ? 'hire' : 'change', v }];
    if (v.valid_to && versions[i + 1]?.valid_from !== v.valid_to) e.push({ date: v.valid_to, lines: ['Baja'], reason: v.exit_reason, kind: 'exit', v });
    return e;
  }).reverse();

  return <>
    <div className="head"><div className="person big"><Avatar name={member.name} color={live ? c?.color : '#aaa'} />
      <div><h1>{disp(member.name)}</h1><p className="sub">{cur.title || 'Sin título'} · {member.email || 'sin email'}</p></div></div>
      {canEdit && <div className="row">
        {!gone && <button className="btn primary" onClick={() => setModal('change')}>Cambio organizativo</button>}
        {gone && <button className="btn primary" onClick={() => setModal('rehire')}>Reincorporar</button>}
        <button className="btn" onClick={() => setModal('personal')}>Datos personales</button>
        {open && <button className="btn danger" onClick={() => setModal('exit')}>Dar de baja</button>}
        {isAdmin && <button className="btn danger" title="Borrado definitivo (solo para errores de alta)" onClick={() => setModal('delete')}>Borrar</button>}
      </div>}</div>
    <div className="grid cols2">
      <Card title={asOf === meta.today ? 'Situación actual' : `Situación a ${fmtDate(asOf)}`}>
        <dl className="facts">
          <dt>Estado</dt><dd>{live ? <><Pill color="#12a594">Activo</Pill>{plannedExit && <Pill color="#f5a524">Baja prevista {fmtDate(last.valid_to)}</Pill>}</>
            : cur.valid_from > asOf ? <Pill color="#0091ff">Se incorpora el {fmtDate(cur.valid_from)}</Pill>
              : <Pill off>Baja desde {fmtDate(cur.valid_to)}{cur.exit_reason ? ` · ${cur.exit_reason}` : ''}</Pill>}</dd>
          <dt>Chapter</dt><dd>{c ? <><Dot color={c.color} />{c.name}</> : '—'}</dd>
          <dt>Grado</dt><dd>{grade(cur.grade_id) ? <><Pill>{grade(cur.grade_id)!.code}</Pill> {grade(cur.grade_id)!.description}</> : '—'}</dd>
          <dt>Manager</dt><dd>{cur.manager_id ? <Link to={`/members/${cur.manager_id}`}>{disp(name(cur.manager_id))}</Link> : '—'}</dd>
          <dt>Ubicación</dt><dd>{[cur.city, cur.country].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Alta</dt><dd>{fmtDate(member.hire_date)}{member.hire_date <= asOf && <> · {yearsBetween(member.hire_date, live || !cur.valid_to ? asOf : cur.valid_to).toFixed(1)} años</>}</dd>
          <dt>En el grado desde</dt><dd>{fmtDate(gradeSince)}</dd>
          <dt>Skills</dt><dd>{member.skills ? member.skills.split(',').map(s => s.trim()).filter(Boolean).map(s => <Pill key={s} off>{s}</Pill>) : '—'}</dd>
          {member.notes && <><dt>Notas</dt><dd>{member.notes}</dd></>}
        </dl>
        {mine.length > 0 && <><h3>Reportes directos ({mine.length})</h3><div className="chips">{mine.map(r => <Link key={r.member_id} className="chip" to={`/members/${r.member_id}`}>{disp(r.name)} · {grade(r.grade_id)?.code ?? '—'}</Link>)}</div></>}
      </Card>
      <Card title="Histórico">
        <ol className="timeline">{events.map((e, i) => <li key={i} className={e.kind}>
          <time>{fmtDate(e.date)}{e.date > meta.today && <Pill color="#0091ff">planificado</Pill>}</time>
          {e.lines.map((l, k) => <div key={k}><b>{l}</b></div>)}
          {e.kind !== 'exit' && <small>{[chapter(e.v.chapter_id)?.name, grade(e.v.grade_id)?.code, e.v.title].filter(Boolean).join(' · ')}</small>}
          {e.reason && <small>Motivo: {e.reason}</small>}</li>)}</ol>
      </Card>
      <Card title="Registro de cambios (auditoría)" style={{ gridColumn: '1/-1' }}>
        {audit.length ? <div className="tw"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Cambio</th></tr></thead><tbody>
          {audit.map(a => <tr key={a.id}><td>{new Date(a.at.replace(' ', 'T') + 'Z').toLocaleString('es-ES')}</td><td>{a.user_name}</td><td className="wrap">{a.summary}</td></tr>)}</tbody></table></div> : <Empty>Sin registros</Empty>}
      </Card>
    </div>
    {modal === 'change' && <MemberChange row={asRow} onClose={() => setModal(null)} />}
    {modal === 'personal' && <MemberPersonal member={member} onClose={() => setModal(null)} />}
    {modal === 'exit' && <MemberExit row={asRow} onClose={() => setModal(null)} />}
    {modal === 'rehire' && <MemberRehire row={asRow} onClose={() => setModal(null)} />}
    {modal === 'delete' && <Confirm danger text={`¿Borrar definitivamente a ${disp(member.name)} y todo su histórico? Para una salida normal usa "Dar de baja".`} onClose={() => setModal(null)}
      onYes={() => del.mutate(undefined, { onSuccess: () => { toast('Miembro borrado'); nav('/members'); }, onError: e => toast(e.message, 'error') })} />}
  </>;
}
