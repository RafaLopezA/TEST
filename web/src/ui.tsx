import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export const PALETTE = ['#5b5bf0', '#12a594', '#f5a524', '#e5484d', '#0091ff', '#a05bf0', '#f76b15', '#30a46c', '#d6409f', '#7c66dc'];
/** "Apellido, Nombre" → "Nombre Apellido". */
export const disp = (n?: string | null) => { const p = String(n ?? '').split(','); return p.length === 2 ? `${p[1].trim()} ${p[0].trim()}` : String(n ?? ''); };
export const initials = (n: string) => disp(n).split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
export const fmtDate = (d?: string | null) => (d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtMonth = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const yearsBetween = (a: string, b: string) => daysBetween(a, b) / 365.25;
export const addYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
export const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const countBy = <T,>(list: T[], key: (x: T) => string | number | null | undefined) => {
  const m = new Map<string, number>(); for (const x of list) { const k = String(key(x) ?? ''); m.set(k, (m.get(k) || 0) + 1); } return m;
};

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const text = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);
  return <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-box" style={wide ? { maxWidth: 760 } : undefined} role="dialog" aria-label={title}><h2>{title}</h2>{children}</div>
  </div>;
}
export function Confirm({ text, onYes, onClose, danger }: { text: string; onYes: () => void; onClose: () => void; danger?: boolean }) {
  return <Modal title="Confirmar" onClose={onClose}><p>{text}</p>
    <div className="form-actions"><button className="btn" onClick={onClose}>Cancelar</button><button className={`btn primary ${danger ? 'bg-danger' : ''}`} onClick={() => { onYes(); onClose(); }}>Confirmar</button></div></Modal>;
}
export const Field = ({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) => <label className={full ? 'full' : undefined}>{label}{children}</label>;
export const Avatar = ({ name, color, dashed }: { name: string; color?: string; dashed?: boolean }) =>
  <span className={`avatar ${dashed ? 'tbh' : ''}`} style={dashed ? { borderColor: color, color } : { background: color || '#999' }}>{dashed ? '+' : initials(name)}</span>;
export const Dot = ({ color }: { color?: string }) => <span className="dot" style={{ background: color || '#999' }} />;
export const Pill = ({ children, color, off }: { children: ReactNode; color?: string; off?: boolean }) =>
  <span className={`pill ${off ? 'off' : ''}`} style={color ? { background: color + '22', color } : undefined}>{children}</span>;
export const Kpi = ({ value, label, hint }: { value: ReactNode; label: string; hint?: ReactNode }) =>
  <div className="card kpi"><div className="v">{value}</div><div className="l">{label}</div>{hint && <div className="h">{hint}</div>}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Card = ({ title, children, style, actions }: { title?: string; children: ReactNode; style?: CSSProperties; actions?: ReactNode }) =>
  <div className="card" style={style}>{(title || actions) && <div className="card-head"><h2>{title}</h2>{actions}</div>}{children}</div>;

export interface BarItem { label: string; value: number; color?: string; suffix?: string }
export function Bars({ items }: { items: BarItem[] }) {
  if (!items.length) return <Empty>Sin datos</Empty>;
  const max = Math.max(1, ...items.map(i => i.value));
  return <div className="bars">{items.map((i, k) => <div className="bar-row" key={k}>
    <span title={i.label}><Dot color={i.color ?? PALETTE[k % PALETTE.length]} />{i.label}</span>
    <div className="bar-track"><div className="bar-fill" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? PALETTE[k % PALETTE.length] }} /></div>
    <b>{i.value}{i.suffix}</b></div>)}</div>;
}
export function Donut({ items }: { items: BarItem[] }) {
  const total = items.reduce((a, i) => a + i.value, 0); let acc = 0;
  const stops = items.map((i, k) => { const s = (acc / (total || 1)) * 100; acc += i.value; return `${i.color ?? PALETTE[k % PALETTE.length]} ${s}% ${(acc / (total || 1)) * 100}%`; });
  return <div className="donut-wrap"><div className="donut" data-c={total} style={{ background: `conic-gradient(${total ? stops.join(',') : 'var(--line) 0 100%'})` }} />
    <div className="legend">{items.map((i, k) => <div key={k}><Dot color={i.color ?? PALETTE[k % PALETTE.length]} />{i.label} · <b>{i.value}</b> ({total ? Math.round((i.value / total) * 100) : 0}%)</div>)}</div></div>;
}
export interface Axis { id: string | number; label: string; color?: string }
export function Matrix({ rows, cols, cell }: { rows: Axis[]; cols: Axis[]; cell: (r: Axis, c: Axis) => number }) {
  const data = rows.map(r => cols.map(c => cell(r, c))), max = Math.max(1, ...data.flat()), colTot = cols.map((_, j) => data.reduce((a, r) => a + r[j], 0));
  return <div className="tw"><table className="heat"><thead><tr><th />{cols.map(c => <th key={c.id}>{c.label}</th>)}<th>Total</th></tr></thead><tbody>
    {rows.map((r, i) => <tr key={r.id}><td>{r.color && <Dot color={r.color} />}{r.label}</td>
      {data[i].map((n, j) => <td key={j} className="c" style={{ background: `color-mix(in srgb,var(--brand) ${Math.round((n / max) * 55)}%,transparent)` }}>{n || '·'}</td>)}
      <td><b>{data[i].reduce((a, b) => a + b, 0)}</b></td></tr>)}
    <tr><td><b>Total</b></td>{colTot.map((n, j) => <td key={j}><b>{n}</b></td>)}<td><b>{colTot.reduce((a, b) => a + b, 0)}</b></td></tr>
  </tbody></table></div>;
}
