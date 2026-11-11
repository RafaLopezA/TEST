import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { get, openDb, run } from './db.ts';
import { seedDemo } from './seed.ts';

const root = resolve(import.meta.dirname, '../..');
const db = openDb(process.env.DB_PATH || join(root, 'data', 'teamhub.db'));

if (!get(db, 'SELECT 1 FROM users LIMIT 1')) {
  const email = process.env.ADMIN_EMAIL || 'admin@teamhub.local';
  const pw = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  run(db, "INSERT INTO users(email,name,role,password_hash) VALUES(?,?,'admin',?)", email, 'Administrador', hashPassword(pw));
  console.log(`\n  Usuario administrador creado: ${email}${process.env.ADMIN_PASSWORD ? '' : `  ·  contraseña: ${pw}`}\n  Cámbiala tras el primer inicio de sesión.\n`);
}
if (process.env.SEED_DEMO === '1' && !get(db, 'SELECT 1 FROM members LIMIT 1')) { seedDemo(db); console.log('  Datos de demostración cargados.'); }

const port = Number(process.env.PORT) || 3000;
createApp(db, join(root, 'web', 'dist')).listen(port, () => console.log(`Team Hub escuchando en http://localhost:${port}`));
