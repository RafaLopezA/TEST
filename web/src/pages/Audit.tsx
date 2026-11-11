import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAudit } from '../api';
import { Empty, Pill } from '../ui';

const ENTITIES: Record<string, string> = { member: 'Miembro', vacancy: 'Vacante', chapter: 'Chapter', grade: 'Grado', user: 'Usuario', import: 'Importación', settings: 'Ajustes' };
const PAGE = 50;

export function AuditPage() {
  const [q, setQ] = useState(''), [entity, setEntity] = useState(''), [page, setPage] = useState(0);
  const { data } = useAudit(`limit=${PAGE}&offset=${page * PAGE}&q=${encodeURIComponent(q)}&entity=${entity}`);
  const total = data?.total ?? 0;
  return <>
    <div className="head"><div><h1>Auditoría</h1><p className="sub">Registro de quién cambió qué y cuándo · {total} entradas</p></div></div>
    <div className="toolbar"><input type="search" placeholder="Buscar en el registro o por usuario…" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
      <select value={entity} onChange={e => { setEntity(e.target.value); setPage(0); }}><option value="">Todo</option>{Object.entries(ENTITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    <div className="card tw flush"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Tipo</th><th>Cambio</th></tr></thead><tbody>
      {data?.items.map(a => <tr key={a.id}><td>{new Date(a.at.replace(' ', 'T') + 'Z').toLocaleString('es-ES')}</td><td>{a.user_name}</td><td><Pill off>{ENTITIES[a.entity] ?? a.entity}</Pill></td>
        <td className="wrap">{a.entity === 'member' && a.entity_id && a.action !== 'delete' ? <Link to={`/members/${a.entity_id}`}>{a.summary}</Link> : a.summary}</td></tr>)}</tbody></table>
      {!data?.items.length && <Empty>Sin registros</Empty>}</div>
    {total > PAGE && <div className="pager"><button className="btn sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anteriores</button><span>Página {page + 1} de {Math.ceil(total / PAGE)}</span>
      <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Siguientes →</button></div>}
  </>;
}
