import { useState } from 'react';
import { api, useSave, useUsers } from '../api';
import type { User } from '../api';
import { useApp } from '../ctx';
import { FormModal } from '../forms';
import { Field, Pill } from '../ui';

const ROLES = [['viewer', 'Lector · solo consulta'], ['editor', 'Editor · gestiona miembros, vacantes e importaciones'], ['admin', 'Administrador · además gestiona usuarios']];

export function Users() {
  const { user: me, toast } = useApp();
  const { data: users = [] } = useUsers();
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  const toggle = useSave((u: User) => api('PATCH', `/users/${u.id}`, { active: !u.active }));
  return <>
    <div className="head"><div><h1>Usuarios</h1><p className="sub">Quién puede acceder a la aplicación y con qué permisos</p></div><button className="btn primary" onClick={() => setEdit('new')}>+ Nuevo usuario</button></div>
    <div className="card tw flush"><table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th /></tr></thead><tbody>
      {users.map(u => <tr key={u.id}><td>{u.name}{u.id === me.id && <small> (tú)</small>}</td><td>{u.email}</td><td><Pill>{u.role}</Pill></td><td>{u.active ? <Pill color="#12a594">Activo</Pill> : <Pill off>Desactivado</Pill>}</td>
        <td className="actions"><button className="btn sm" onClick={() => setEdit(u)}>Editar</button> {u.id !== me.id && <button className="btn sm" onClick={() => toggle.mutate(u, { onError: e => toast(e.message, 'error') })}>{u.active ? 'Desactivar' : 'Activar'}</button>}</td></tr>)}</tbody></table></div>
    {edit && <FormModal title={edit === 'new' ? 'Nuevo usuario' : `Editar ${edit.name}`} onClose={() => setEdit(null)} initial={edit === 'new' ? { name: '', email: '', role: 'viewer', password: '' } : { name: edit.name, email: edit.email, role: edit.role, password: '' }}
      submit={v => (edit === 'new' ? api('POST', '/users', v) : api('PATCH', `/users/${edit.id}`, { name: v.name, role: v.role, ...(v.password ? { password: v.password } : {}) }))}>
      {(v, set) => <>
        <Field label="Nombre"><input required autoFocus value={v.name as string} onChange={set('name')} /></Field>
        <Field label="Email"><input type="email" required disabled={edit !== 'new'} value={v.email as string} onChange={set('email')} /></Field>
        <Field label="Rol" full><select value={v.role as string} onChange={set('role')}>{ROLES.map(([r, l]) => <option key={r} value={r}>{l}</option>)}</select></Field>
        <Field label={edit === 'new' ? 'Contraseña inicial (mín. 8)' : 'Nueva contraseña (vacío = no cambiar)'} full><input type="password" autoComplete="new-password" minLength={8} required={edit === 'new'} value={v.password as string} onChange={set('password')} /></Field>
      </>}</FormModal>}
  </>;
}
