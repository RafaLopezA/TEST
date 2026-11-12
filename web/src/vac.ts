import type { Vacancy } from './api';

export const VAC_COLOR: Record<string, string> = { 'Pending PRF': '#a05bf0', Open: '#f5a524', Recruiting: '#0091ff', Offer: '#12a594', Filled: '#30a46c', Cancelled: '#999999' };
const closing = (s: string) => s === 'Filled' || s === 'Cancelled';

/** Vacantes tal como estaban en una fecha: abiertas/cerradas y con el estado que tenían entonces (según su historial). */
export function vacanciesAt(list: Vacancy[], asOf: string, today: string) {
  const at = list.filter(v => v.opened_at <= asOf).map(v => {
    if (asOf >= today) return v;
    const closed = v.closed_at && v.closed_at <= asOf ? v.closed_at : null;
    const past = v.events.filter(e => e.at.slice(0, 10) <= asOf).at(-1)?.status ?? v.events[0]?.status ?? v.status;
    return { ...v, closed_at: closed, filled_by: closed ? v.filled_by : null, status: closed ? (closing(past) ? past : v.status) : closing(past) ? 'Open' : past };
  });
  return { open: at.filter(v => !v.closed_at), closed: at.filter(v => v.closed_at) };
}
