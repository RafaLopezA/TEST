import { useState } from 'react';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { api, useSave } from '../api';
import type { ImportPlan } from '../api';
import { useApp } from '../ctx';
import { Card, Empty, Kpi, Pill } from '../ui';

/** Cabeceras admitidas (formato peopleTemp) → campo interno. */
const COLUMNS: Record<string, string[]> = {
  name: ['name', 'nombre'], email: ['mail', 'email'], manager: ['manager', 'lm'], title: ['title', 'título', 'titulo'], grade: ['grade (level)', 'grade', 'grado'], chapter: ['chapter'],
  country: ['country', 'país', 'pais'], city: ['city', 'ciudad'], hiring: ['hiringstatus', 'hiring status', 'estado'], prf: ['prf number', 'prf'], sap: ['sap position number', 'sap'], comments: ['comments', 'comentarios'],
};
type Rec = Record<string, string>;
const clean = (v: unknown) => { const s = v == null ? '' : String(v).trim(); return /^#.*[!?]$|^#N\/A$/.test(s) ? '' : s; };

function parseCsv(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function toRecords(grid: unknown[][]): Rec[] {
  const hi = grid.findIndex(r => r.some(c => ['name', 'nombre'].includes(clean(c).toLowerCase())));
  if (hi < 0) throw new Error('No encuentro la fila de cabeceras: debe existir una columna "Name"');
  const head = grid[hi].map(c => clean(c).toLowerCase()), idx: Record<string, number> = {};
  for (const [field, names] of Object.entries(COLUMNS)) for (const n of names) { const i = head.indexOf(n); if (i >= 0 && idx[field] === undefined) idx[field] = i; }
  const extraGrade = head.indexOf('grade');   // algunas hojas traen el grado en dos columnas
  return grid.slice(hi + 1).map(r => {
    const o: Rec = {}; for (const [f, i] of Object.entries(idx)) o[f] = clean(r[i]);
    if (!o.grade && extraGrade >= 0) o.grade = clean(r[extraGrade]);
    return o;
  }).filter(o => o.name);
}

export function ImportPage() {
  const { meta, toast } = useApp();
  const [rows, setRows] = useState<Rec[] | null>(null), [file, setFile] = useState(''), [date, setDate] = useState(meta.today), [exitMissing, setExitMissing] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null), [error, setError] = useState(''), [done, setDone] = useState(false);
  const body = () => ({ rows, effective_date: date, exit_missing: exitMissing });
  const preview = useSave(() => api<ImportPlan>('POST', '/import/preview', body()));
  const apply = useSave(() => api<ImportPlan>('POST', '/import/apply', body()));

  const load = async (f: File) => {
    setError(''); setPlan(null); setDone(false); setFile(f.name);
    try {
      let grid: unknown[][];
      if (/\.csv$/i.test(f.name)) grid = parseCsv((await f.text()).replace(/^﻿/, ''));
      else { const sheets = await readSheetNames(f); grid = await readXlsxFile(f, { sheet: sheets.includes('People') ? 'People' : 1 }) as unknown[][]; }
      const recs = toRecords(grid);
      if (!recs.length) throw new Error('El fichero no contiene filas de personas');
      setRows(recs);
    } catch (e) { setRows(null); setError((e as Error).message || 'No se pudo leer el fichero'); }
  };
  const run = (m: typeof preview, after: (p: ImportPlan) => void) => { setError(''); m.mutate(undefined, { onSuccess: after, onError: e => setError(e.message) }); };
  const exitable = plan ? plan.missing.filter(m => m.can_exit).length : 0;
  const nothing = plan && !plan.create.length && !plan.update.length && !plan.rehire.length && !plan.vacancies.create.length && !plan.vacancies.update.length && !(exitMissing && exitable);

  return <>
    <div className="head"><div><h1>Importar</h1><p className="sub">Carga o sincroniza el equipo desde Excel o CSV. Cada diferencia se registra en el histórico con la fecha efectiva indicada.</p></div></div>
    <Card title="1 · Fichero">
      <p className="sub">Columnas reconocidas: <b>Name</b>, Mail, Manager, Title, Grade (Level), Chapter, Country, City, HiringStatus, PRF number, SAP position number, Comments. Las filas cuyo nombre empieza por «TBH» se tratan como vacantes. Las personas se identifican por email y, si no hay, por nombre.</p>
      <label className="btn primary">Elegir fichero (.xlsx, .csv)<input type="file" accept=".xlsx,.csv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) load(f); }} /></label>
      {rows && <span className="pad">📄 {file} · <b>{rows.filter(r => !/^TBH/i.test(r.name)).length}</b> personas y <b>{rows.filter(r => /^TBH/i.test(r.name)).length}</b> vacantes leídas</span>}
    </Card>
    {error && <p className="error">{error}</p>}
    {rows && <Card title="2 · Opciones" style={{ marginTop: 16 }}>
      <div className="toolbar" style={{ margin: 0 }}>
        <label className="asof">Fecha efectiva de los cambios <input type="date" value={date} onChange={e => { if (e.target.value) { setDate(e.target.value); setPlan(null); } }} /></label>
        <label className="chk"><input type="checkbox" checked={exitMissing} onChange={e => { setExitMissing(e.target.checked); setDone(false); }} /> Dar de baja a quien no aparezca en el fichero</label>
        <button className="btn primary" disabled={preview.isPending} onClick={() => run(preview, p => { setPlan(p); setDone(false); })}>{preview.isPending ? 'Calculando…' : 'Previsualizar cambios'}</button>
      </div></Card>}
    {plan && <Card title={done ? '✅ Importación aplicada' : '3 · Previsualización'} style={{ marginTop: 16 }}>
      <div className="grid kpis"><Kpi value={plan.create.length} label="Altas" /><Kpi value={plan.update.length} label="Personas con cambios" /><Kpi value={plan.unchanged} label="Sin cambios" />
        <Kpi value={plan.missing.length} label="No aparecen en el fichero" hint={done && exitMissing ? `${plan.exited} dados de baja` : exitMissing ? `se darán de baja ${exitable}` : 'no se tocan'} /><Kpi value={plan.vacancies.create.length + plan.vacancies.update.length} label="Vacantes nuevas o modificadas" /></div>
      {(plan.newChapters.length > 0 || plan.newGrades.length > 0 || plan.placeholders.length > 0) && <p>
        {plan.newChapters.length > 0 && <>Chapters nuevos: {plan.newChapters.map(c => <Pill key={c}>{c}</Pill>)} </>}
        {plan.newGrades.length > 0 && <>Grados nuevos: {plan.newGrades.map(c => <Pill key={c}>{c}</Pill>)} </>}
        {plan.placeholders.length > 0 && <>Managers que no están en el fichero y se crearán: {plan.placeholders.map(c => <Pill key={c} color="#f5a524">{c}</Pill>)}</>}</p>}
      {plan.update.length > 0 && <><h3>Cambios</h3><div className="tw scroll"><table><thead><tr><th>Persona</th><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>
        {plan.update.flatMap(u => u.changes.map((c, i) => <tr key={`${u.id}-${i}`}><td>{i === 0 ? u.name : ''}</td><td>{c.field}</td><td>{c.from}</td><td><b>{c.to}</b></td></tr>))}</tbody></table></div></>}
      {plan.create.length > 0 && <><h3>Altas</h3><div className="tw scroll"><table><thead><tr><th>Persona</th><th>Chapter</th><th>Grado</th><th>Manager</th></tr></thead><tbody>
        {plan.create.map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.chapter}</td><td>{c.grade}</td><td>{c.manager}</td></tr>)}</tbody></table></div></>}
      {plan.rehire.length > 0 && <p>Reincorporaciones: {plan.rehire.map(r => <Pill key={r.id}>{r.name}</Pill>)}</p>}
      {plan.missing.length > 0 && <><h3>No aparecen en el fichero</h3><div className="chips">{plan.missing.map(m => <span key={m.id} className="chip">{m.name}{exitMissing && !m.can_exit && ' · no se puede dar de baja con esta fecha'}</span>)}</div></>}
      {plan.skipped.length > 0 && <><h3>Filas que no se aplican</h3><div className="tw scroll"><table><thead><tr><th>Fila</th><th>Motivo</th></tr></thead><tbody>
        {plan.skipped.map((s, i) => <tr key={i}><td>{s.name}</td><td className="wrap">{s.reason}</td></tr>)}</tbody></table></div></>}
      {nothing && <Empty>El fichero coincide con los datos actuales: no hay nada que aplicar.</Empty>}
      {!done && !nothing && <div className="form-actions"><button className="btn primary" disabled={apply.isPending} onClick={() => run(apply, p => { setPlan(p); setDone(true); toast('Importación aplicada'); })}>{apply.isPending ? 'Aplicando…' : `Aplicar con fecha ${date}`}</button></div>}
    </Card>}
  </>;
}
