import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api, useSave } from './api';
import type { Row } from './api';
import { useApp } from './ctx';
import { useOrg } from './hooks';
import { Field, Modal, disp } from './ui';

type V = Record<string, string | boolean>;
const num = (v: string | boolean) => (v === '' || typeof v === 'boolean' ? null : Number(v));

/** Formulario modal genérico: gestiona estado, envío y errores. */
export function FormModal({ title, initial, onClose, submit, children, ok = 'Guardar', done, wide }: {
  title: string; initial: V; onClose: () => void; submit: (v: V) => Promise<unknown>; ok?: string; done?: string; wide?: boolean;
  children: (v: V, set: (k: string) => (e: { target: { value: string } }) => void, setV: (p: V) => void) => ReactNode;
}) {
  const { toast } = useApp();
  const [v, setState] = useState<V>(initial), [error, setError] = useState('');
  const save = useSave(submit);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    save.mutate(v, { onSuccess: () => { toast(done ?? 'Guardado'); onClose(); }, onError: err => setError(err.message) });
  };
  return <Modal title={title} onClose={onClose} wide={wide}><form onSubmit={onSubmit}>
    <div className="form">{children(v, k => e => setState(s => ({ ...s, [k]: e.target.value })), p => setState(s => ({ ...s, ...p })))}</div>
    {error && <p className="error">{error}</p>}
    <div className="form-actions"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={save.isPending}>{save.isPending ? 'Guardando…' : ok}</button></div>
  </form></Modal>;
}

function OrgFields({ v, set, selfId }: { v: V; set: (k: string) => (e: { target: { value: string } }) => void; selfId?: number }) {
  const { meta } = useApp(); const { active } = useOrg();
  const people = active.filter(m => m.member_id !== selfId).sort((a, b) => a.name.localeCompare(b.name));
  return <>
    <Field label="Título"><input value={v.title as string} onChange={set('title')} /></Field>
    <Field label="Manager"><select value={v.manager_id as string} onChange={set('manager_id')}><option value="">— Sin manager —</option>{people.map(m => <option key={m.member_id} value={m.member_id}>{m.name}</option>)}</select></Field>
    <Field label="Chapter"><select value={v.chapter_id as string} onChange={set('chapter_id')}><option value="">—</option>{meta.chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <Field label="Grado"><select value={v.grade_id as string} onChange={set('grade_id')}><option value="">—</option>{meta.grades.map(g => <option key={g.id} value={g.id}>{g.code}{g.description ? ` · ${g.description}` : ''}</option>)}</select></Field>
    <Field label="País"><input value={v.country as string} onChange={set('country')} /></Field>
    <Field label="Ciudad"><input value={v.city as string} onChange={set('city')} /></Field>
  </>;
}
const orgBody = (v: V) => ({ title: v.title, manager_id: num(v.manager_id), chapter_id: num(v.chapter_id), grade_id: num(v.grade_id), country: v.country, city: v.city });
const orgInit = (r?: Row): V => ({ title: r?.title ?? '', manager_id: String(r?.manager_id ?? ''), chapter_id: String(r?.chapter_id ?? ''), grade_id: String(r?.grade_id ?? ''), country: r?.country ?? '', city: r?.city ?? '' });

export function MemberCreate({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: number) => void }) {
  const { meta } = useApp();
  return <FormModal title="Nuevo miembro" wide onClose={onClose} done="Miembro creado" initial={{ name: '', email: '', hire_date: meta.today, skills: '', ...orgInit() }}
    submit={async v => { const r = await api<{ id: number }>('POST', '/members', { name: v.name, email: v.email, hire_date: v.hire_date, skills: v.skills, ...orgBody(v) }); onCreated?.(r.id); }}>
    {(v, set) => <>
      <Field label="Nombre (Apellido, Nombre)" full><input required autoFocus value={v.name as string} onChange={set('name')} /></Field>
      <Field label="Email"><input type="email" value={v.email as string} onChange={set('email')} /></Field>
      <Field label="Fecha de alta"><input type="date" required value={v.hire_date as string} onChange={set('hire_date')} /></Field>
      <OrgFields v={v} set={set} />
      <Field label="Skills (separadas por comas)" full><input value={v.skills as string} onChange={set('skills')} /></Field>
    </>}
  </FormModal>;
}

/** Cambio organizativo: genera una nueva versión en el histórico con fecha efectiva (o corrige la actual). */
export function MemberChange({ row, onClose }: { row: Row; onClose: () => void }) {
  const { meta } = useApp();
  return <FormModal title={`Cambio organizativo · ${disp(row.name)}`} wide onClose={onClose} done="Cambio registrado" initial={{ ...orgInit(row), effective_date: meta.today, reason: '', correction: false }}
    submit={v => api('PATCH', `/members/${row.member_id}`, { ...orgBody(v), ...(v.correction ? { correction: true } : { effective_date: v.effective_date, reason: v.reason }) })}>
    {(v, set, setV) => <>
      <OrgFields v={v} set={set} selfId={row.member_id} />
      <label className="full chk"><input type="checkbox" checked={!!v.correction} onChange={e => setV({ correction: e.target.checked })} />
        Es una corrección de datos (rectifica la situación actual sin generar histórico)</label>
      {!v.correction && <>
        <Field label={`Fecha efectiva (desde ${row.valid_from})`}><input type="date" required min={row.valid_from} value={v.effective_date as string} onChange={set('effective_date')} /></Field>
        <Field label="Motivo"><input placeholder="Promoción, reorganización…" value={v.reason as string} onChange={set('reason')} /></Field>
      </>}
    </>}
  </FormModal>;
}

export function MemberPersonal({ member, onClose }: { member: { id: number; name: string; email: string; skills: string; notes: string; hire_date: string }; onClose: () => void }) {
  return <FormModal title="Datos personales" onClose={onClose} initial={{ name: member.name, email: member.email, skills: member.skills, notes: member.notes, hire_date: member.hire_date }}
    submit={v => api('PATCH', `/members/${member.id}`, v)}>
    {(v, set) => <>
      <Field label="Nombre (Apellido, Nombre)" full><input required value={v.name as string} onChange={set('name')} /></Field>
      <Field label="Email"><input type="email" value={v.email as string} onChange={set('email')} /></Field>
      <Field label="Fecha de alta"><input type="date" required value={v.hire_date as string} onChange={set('hire_date')} /></Field>
      <Field label="Skills (separadas por comas)" full><input value={v.skills as string} onChange={set('skills')} /></Field>
      <Field label="Notas" full><textarea rows={3} value={v.notes as string} onChange={set('notes')} /></Field>
    </>}
  </FormModal>;
}

export function MemberExit({ row, onClose }: { row: Row; onClose: () => void }) {
  const { meta } = useApp(); const { reports, active } = useOrg();
  const mine = reports.get(row.member_id) ?? [];
  return <FormModal title={`Baja · ${disp(row.name)}`} onClose={onClose} ok="Registrar baja" done="Baja registrada" initial={{ date: meta.today, reason: '', reassign_to: String(row.manager_id ?? '') }}
    submit={v => api('POST', `/members/${row.member_id}/exit`, { date: v.date, reason: v.reason, ...(mine.length ? { reassign_to: num(v.reassign_to) } : {}) })}>
    {(v, set) => <>
      <Field label="Fecha efectiva de baja"><input type="date" required value={v.date as string} onChange={set('date')} /></Field>
      <Field label="Motivo"><input list="exit-reasons" value={v.reason as string} onChange={set('reason')} />
        <datalist id="exit-reasons"><option value="Baja voluntaria" /><option value="Movilidad interna" /><option value="Fin de contrato" /><option value="Despido" /></datalist></Field>
      {mine.length > 0 && <Field label={`Reasignar sus ${mine.length} reporte(s) directo(s) a`} full>
        <select required value={v.reassign_to as string} onChange={set('reassign_to')}><option value="">— Elegir —</option>
          {active.filter(m => m.member_id !== row.member_id).sort((a, b) => a.name.localeCompare(b.name)).map(m => <option key={m.member_id} value={m.member_id}>{m.name}</option>)}</select></Field>}
    </>}
  </FormModal>;
}

export function MemberRehire({ row, onClose }: { row: Row; onClose: () => void }) {
  const { meta } = useApp();
  return <FormModal title={`Reincorporación · ${disp(row.name)}`} onClose={onClose} ok="Reincorporar" initial={{ date: meta.today }}
    submit={v => api('POST', `/members/${row.member_id}/rehire`, { date: v.date })}>
    {(v, set) => <><Field label="Fecha de reincorporación" full><input type="date" required min={row.valid_to ?? undefined} value={v.date as string} onChange={set('date')} /></Field>
      <p className="full sub">Vuelve con su último chapter, grado y manager; podrás cambiarlos después.</p></>}
  </FormModal>;
}
