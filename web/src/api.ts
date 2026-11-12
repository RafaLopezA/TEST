import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Role = 'admin' | 'editor' | 'viewer';
export interface User { id: number; email: string; name: string; role: Role; active: boolean }
export interface Chapter { id: number; name: string; color: string }
export interface Grade { id: number; code: string; description: string; level: number }
export interface Meta { org_name: string; today: string; vacancy_statuses: string[]; chapters: Chapter[]; grades: Grade[]; first_date: string }
export interface Row {
  version_id: number; member_id: number; valid_from: string; valid_to: string | null; title: string; chapter_id: number | null; grade_id: number | null;
  manager_id: number | null; country: string; city: string; reason: string; name: string; email: string; skills: string; notes: string;
  hire_date: string; exit_date: string | null; exit_reason: string; team_id: number | null; state: 'active' | 'exited' | 'future';
}
export interface Version { id: number; member_id: number; valid_from: string; valid_to: string | null; title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; country: string; city: string; reason: string; exit_reason: string }
export interface AuditItem { id: number; at: string; user_name: string; entity: string; entity_id: number | null; action: string; summary: string; detail: string | null }
export interface MemberDetail { member: { id: number; name: string; email: string; skills: string; notes: string; hire_date: string; exit_date: string | null; exit_reason: string }; versions: Version[]; audit: AuditItem[] }
export interface Vacancy {
  id: number; code: string; title: string; chapter_id: number | null; grade_id: number | null; manager_id: number | null; status: string; prf: string; sap: string;
  target_start: string | null; comments: string; opened_at: string; closed_at: string | null; filled_by: number | null; events: { status: string; at: string; user_name: string }[];
}
export type MoveType = 'hire' | 'rehire' | 'exit' | 'promotion' | 'demotion' | 'grade' | 'chapter' | 'manager' | 'title' | 'location';
export interface Movement { date: string; type: MoveType; member_id: number; name: string; from: string; to: string; reason: string; chapter_id: number | null; grade_id: number | null }
export interface TimelinePoint { date: string; total: number; groups: Record<string, number>; hires: number; exits: number }
export interface ImportPlan {
  effective_date: string; newChapters: string[]; newGrades: string[]; placeholders: string[];
  create: { name: string; chapter: string; grade: string; manager: string }[]; update: { id: number; name: string; changes: { field: string; from: string; to: string }[] }[];
  rehire: { id: number; name: string }[]; unchanged: number; missing: { id: number; name: string; can_exit: boolean }[]; skipped: { name: string; reason: string }[];
  vacancies: { create: string[]; update: string[]; unchanged: number }; exited: number;
}

export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, { method, credentials: 'same-origin', headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('th:unauthorized'));
    throw new ApiError(res.status, data.error || `Error ${res.status}`);
  }
  return data as T;
}

const q = <T,>(key: unknown[], path: string, enabled = true) => useQuery({ queryKey: key, queryFn: () => api<T>('GET', path), enabled });
export const useMeta = () => q<Meta>(['meta'], '/meta');
/** Foto a una fecha incluyendo bajas y futuras incorporaciones (state). */
export const useRoster = (asOf: string) => q<Row[]>(['members', asOf], `/members?all=1&asOf=${asOf}`);
export const useMember = (id: number) => q<MemberDetail>(['member', id], `/members/${id}`);
export const useVacancies = () => q<Vacancy[]>(['vacancies'], '/vacancies');
export const useTimeline = (from: string, to: string, groupBy: string) => q<TimelinePoint[]>(['timeline', from, to, groupBy], `/reports/timeline?from=${from}&to=${to}&groupBy=${groupBy}`, from <= to);
export const useMovements = (from: string, to: string) => q<Movement[]>(['movements', from, to], `/reports/movements?from=${from}&to=${to}`, from <= to);
export const useUsers = () => q<User[]>(['users'], '/users');
export const useAudit = (params: string) => q<{ total: number; items: AuditItem[] }>(['audit', params], `/audit?${params}`);

/** Mutación genérica: tras escribir se invalida toda la caché (los datos son pequeños y muy relacionados). */
export function useSave<B = unknown, R = unknown>(fn: (body: B) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}
