import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, useMeta } from './api';
import type { Chapter, Grade, Meta, Role, User } from './api';

interface Ctx {
  user: User; logout: () => void; meta: Meta; asOf: string; setAsOf: (d: string) => void; isToday: boolean;
  /** Puede editar: rol suficiente y viendo la fecha actual (el pasado es de solo lectura). */
  canEdit: boolean; isAdmin: boolean; chapter: (id: number | null) => Chapter | undefined; grade: (id: number | null) => Grade | undefined; seniorLevel: number | null;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(C); if (!c) throw new Error('fuera de AppProvider'); return c; };
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export function AppProvider({ user, onLogout, children }: { user: User; onLogout: () => void; children: ReactNode }) {
  const { data: meta } = useMeta();
  const qc = useQueryClient();
  const [asOfRaw, setAsOfRaw] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  const logout = useCallback(() => { api('POST', '/auth/logout').finally(() => { qc.clear(); onLogout(); }); }, [qc, onLogout]);
  useEffect(() => { const h = () => onLogout(); window.addEventListener('th:unauthorized', h); return () => window.removeEventListener('th:unauthorized', h); }, [onLogout]);

  const value = useMemo<Ctx | null>(() => {
    if (!meta) return null;
    const asOf = asOfRaw ?? meta.today, isToday = asOf === meta.today;
    const ch = new Map(meta.chapters.map(c => [c.id, c])), gr = new Map(meta.grades.map(g => [g.id, g]));
    return {
      user, logout, meta, asOf, isToday, setAsOf: d => setAsOfRaw(d === meta.today ? null : d),
      canEdit: RANK[user.role] >= 1 && isToday, isAdmin: user.role === 'admin',
      chapter: id => (id == null ? undefined : ch.get(id)), grade: id => (id == null ? undefined : gr.get(id)),
      seniorLevel: meta.grades.find(g => g.code.toUpperCase() === 'M3')?.level ?? null, toast,
    };
  }, [meta, asOfRaw, user, logout, toast]);

  if (!value) return <div className="center muted">Cargando…</div>;
  return <C.Provider value={value}>{children}
    <div className="toasts">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div>
  </C.Provider>;
}
