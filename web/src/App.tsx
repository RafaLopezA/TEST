import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import type { User } from './api';
import { AppProvider, useApp } from './ctx';
import { Field, Modal, fmtDate } from './ui';
import { AuditPage } from './pages/Audit';
import { Catalog } from './pages/Catalog';
import { Dashboard } from './pages/Dashboard';
import { ImportPage } from './pages/ImportPage';
import { MemberPage } from './pages/MemberPage';
import { Members } from './pages/Members';
import { Org } from './pages/Org';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Vacancies } from './pages/Vacancies';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => { api<User>('GET', '/auth/me').then(setUser).catch(() => setUser(null)); }, []);
  const onLogout = useCallback(() => setUser(null), []);
  if (user === undefined) return <div className="center muted">Cargando…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <AppProvider user={user} onLogout={onLogout}><Shell /></AppProvider>;
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { onLogin(await api<User>('POST', '/auth/login', { email, password })); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <div className="login"><form className="card login-box" onSubmit={submit}>
    <div className="brand"><span className="logo">T</span><span>Team Hub</span></div>
    <p className="sub">Gestión del equipo, chapters y grados</p>
    <div className="form one">
      <Field label="Email"><input type="email" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="Contraseña"><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
    </div>
    {error && <p className="error">{error}</p>}
    <button className="btn primary block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
  </form></div>;
}

const ROLE = { admin: 'Administrador', editor: 'Editor', viewer: 'Lector' } as const;

function Shell() {
  const { user, logout, meta, asOf, setAsOf, isToday, isAdmin } = useApp();
  const [pw, setPw] = useState(false);
  const editor = user.role !== 'viewer';
  const link = (to: string, icon: string, label: string) => <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{icon} <span>{label}</span></NavLink>;
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="logo">T</span><span>Team Hub</span></div>
      <nav>
        {link('/', '📊', 'Resumen')}{link('/org', '🏢', 'Organigrama')}{link('/members', '👥', 'Miembros')}{link('/vacancies', '🎯', 'Vacantes')}{link('/reports', '📈', 'Reportes')}
        <div className="nav-sep">Administración</div>
        {link('/catalog', '🧩', 'Chapters y grados')}{editor && link('/import', '⬆️', 'Importar')}{editor && link('/audit', '🧾', 'Auditoría')}{isAdmin && link('/users', '🔑', 'Usuarios')}
      </nav>
      <div className="side-foot">
        <div className="me"><b>{user.name}</b><small>{ROLE[user.role]}</small></div>
        <button className="btn ghost" onClick={() => setPw(true)}>Cambiar contraseña</button>
        <button className="btn ghost" onClick={logout}>Cerrar sesión</button>
      </div>
    </aside>
    <div className="content">
      <header className="topbar">
        <span className="org">{meta.org_name}</span>
        <label className="asof" title="Ver la organización tal como estaba en una fecha">🕓 Fecha
          <input type="date" value={asOf} min={meta.first_date} onChange={e => e.target.value && setAsOf(e.target.value)} /></label>
        {!isToday && <button className="btn sm" onClick={() => setAsOf(meta.today)}>Volver a hoy</button>}
      </header>
      {!isToday && <div className="banner">Estás viendo la organización a fecha <b>{fmtDate(asOf)}</b>{asOf > meta.today ? ' (futuro planificado)' : ' (histórico)'}. La edición está desactivada.</div>}
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} /><Route path="/org" element={<Org />} /><Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<MemberPage />} /><Route path="/vacancies" element={<Vacancies />} /><Route path="/reports" element={<Reports />} />
          <Route path="/catalog" element={<Catalog />} />
          {editor && <Route path="/import" element={<ImportPage />} />}{editor && <Route path="/audit" element={<AuditPage />} />}{isAdmin && <Route path="/users" element={<Users />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
    {pw && <PasswordModal onClose={() => setPw(false)} />}
  </div>;
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', '/auth/password', { current, next }); toast('Contraseña actualizada'); onClose(); } catch (err) { setError((err as Error).message); }
  };
  return <Modal title="Cambiar contraseña" onClose={onClose}><form onSubmit={submit}><div className="form one">
    <Field label="Contraseña actual"><input type="password" required autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} /></Field>
    <Field label="Nueva contraseña (mín. 8)"><input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} /></Field></div>
    {error && <p className="error">{error}</p>}
    <div className="form-actions"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar</button></div></form></Modal>;
}
