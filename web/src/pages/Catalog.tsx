import { useState } from 'react';
import { api, useSave } from '../api';
import type { Chapter, Grade } from '../api';
import { useApp } from '../ctx';
import { FormModal } from '../forms';
import { useOrg } from '../hooks';
import { Bars, Card, Confirm, Dot, Field, PALETTE, Pill } from '../ui';

export function Catalog() {
  const { meta, canEdit, isAdmin, toast } = useApp();
  const { active } = useOrg();
  const [ch, setCh] = useState<Chapter | 'new' | null>(null), [gr, setGr] = useState<Grade | 'new' | null>(null), [org, setOrg] = useState(false);
  const [del, setDel] = useState<{ path: string; label: string } | null>(null);
  const remove = useSave((path: string) => api('DELETE', path));
  return <>
    <div className="head"><div><h1>Chapters y grados</h1><p className="sub">Catálogos de la organización «{meta.org_name}»</p></div>
      {isAdmin && <button className="btn" onClick={() => setOrg(true)}>Renombrar organización</button>}</div>
    <div className="head sec"><h2>Chapters</h2>{canEdit && <button className="btn primary" onClick={() => setCh('new')}>+ Nuevo chapter</button>}</div>
    <div className="grid cols2">{meta.chapters.map(c => { const ms = active.filter(m => m.chapter_id === c.id); return <Card key={c.id}>
      <div className="card-head"><h2><Dot color={c.color} />{c.name}</h2>{canEdit && <div className="row"><button className="btn sm" onClick={() => setCh(c)}>Editar</button><button className="btn sm danger" onClick={() => setDel({ path: `/chapters/${c.id}`, label: c.name })}>Borrar</button></div>}</div>
      <p className="sub"><b>{ms.length}</b> personas</p>
      <Bars items={meta.grades.map((g, i) => ({ label: g.code, value: ms.filter(m => m.grade_id === g.id).length, color: PALETTE[i % PALETTE.length] })).filter(x => x.value)} /></Card>; })}</div>
    <div className="head sec"><h2>Grados</h2>{canEdit && <button className="btn primary" onClick={() => setGr('new')}>+ Nuevo grado</button>}</div>
    <div className="card tw flush"><table><thead><tr><th>Nivel</th><th>Código</th><th>Descripción</th><th>Personas</th>{canEdit && <th />}</tr></thead><tbody>
      {meta.grades.map(g => <tr key={g.id}><td>{g.level}</td><td><Pill>{g.code}</Pill></td><td>{g.description}</td><td>{active.filter(m => m.grade_id === g.id).length}</td>
        {canEdit && <td className="actions"><button className="btn sm" onClick={() => setGr(g)}>Editar</button> <button className="btn sm danger" onClick={() => setDel({ path: `/grades/${g.id}`, label: g.code })}>Borrar</button></td>}</tr>)}</tbody></table></div>
    <p className="sub">El nivel ordena los grados: a mayor nivel, más seniority. Un aumento de nivel se registra como promoción.</p>

    {ch && <FormModal title={ch === 'new' ? 'Nuevo chapter' : 'Editar chapter'} onClose={() => setCh(null)} initial={ch === 'new' ? { name: '', color: PALETTE[meta.chapters.length % PALETTE.length] } : { name: ch.name, color: ch.color }}
      submit={v => (ch === 'new' ? api('POST', '/chapters', v) : api('PUT', `/chapters/${ch.id}`, v))}>
      {(v, set) => <><Field label="Nombre"><input required autoFocus value={v.name as string} onChange={set('name')} /></Field><Field label="Color"><input type="color" className="color" value={v.color as string} onChange={set('color')} /></Field></>}</FormModal>}
    {gr && <FormModal title={gr === 'new' ? 'Nuevo grado' : 'Editar grado'} onClose={() => setGr(null)} initial={gr === 'new' ? { code: '', description: '', level: String(Math.max(0, ...meta.grades.map(g => g.level)) + 1) } : { code: gr.code, description: gr.description, level: String(gr.level) }}
      submit={v => { const body = { ...v, level: Number(v.level) }; return gr === 'new' ? api('POST', '/grades', body) : api('PUT', `/grades/${gr.id}`, body); }}>
      {(v, set) => <><Field label="Código"><input required autoFocus value={v.code as string} onChange={set('code')} /></Field><Field label="Nivel (mayor = más senior)"><input type="number" min={0} max={100} required value={v.level as string} onChange={set('level')} /></Field>
        <Field label="Descripción" full><input value={v.description as string} onChange={set('description')} /></Field></>}</FormModal>}
    {org && <FormModal title="Nombre de la organización" onClose={() => setOrg(false)} initial={{ org_name: meta.org_name }} submit={v => api('PUT', '/settings', v)}>
      {(v, set) => <Field label="Nombre" full><input required value={v.org_name as string} onChange={set('org_name')} /></Field>}</FormModal>}
    {del && <Confirm danger text={`¿Borrar «${del.label}»?`} onClose={() => setDel(null)} onYes={() => remove.mutate(del.path, { onSuccess: () => toast('Borrado'), onError: e => toast(e.message, 'error') })} />}
  </>;
}
