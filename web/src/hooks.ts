import { useMemo } from 'react';
import { useRoster } from './api';
import type { Row } from './api';
import { useApp } from './ctx';

/** Foto de la organización a la fecha seleccionada, con índices de uso común. */
export function useOrg() {
  const { asOf } = useApp();
  const { data, isLoading } = useRoster(asOf);
  return useMemo(() => {
    const rows = data ?? [], active = rows.filter(r => r.state === 'active'), byId = new Map(rows.map(r => [r.member_id, r]));
    const reports = new Map<number, Row[]>();
    for (const r of active) if (r.manager_id != null) reports.set(r.manager_id, [...(reports.get(r.manager_id) ?? []), r]);
    return { rows, active, byId, reports, isLoading, name: (id: number | null) => (id == null ? '' : byId.get(id)?.name ?? '') };
  }, [data, isLoading]);
}
