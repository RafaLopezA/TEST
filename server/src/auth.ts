import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DB } from './db.ts';
import { get, setting } from './db.ts';
import { HttpError } from './util.ts';
import type { Actor } from './util.ts';

export interface User { id: number; email: string; name: string; role: Actor['role']; active: number; password_hash: string; token_version: number }
const COOKIE = 'th_session';
const TTL = 7 * 24 * 3600;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const a = scryptSync(pw, Buffer.from(salt, 'hex'), 32), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const secret = (db: DB) => process.env.SESSION_SECRET || setting(db, 'session_secret', () => randomBytes(32).toString('hex'));
const sign = (db: DB, body: string) => createHmac('sha256', secret(db)).update(body).digest('base64url');

/** La sesión lleva la versión de token del usuario: al cambiar contraseña o rol se incrementa y las cookies anteriores dejan de valer. */
export function setSession(db: DB, res: Response, user: Pick<User, 'id' | 'token_version'>) {
  const body = Buffer.from(JSON.stringify({ uid: user.id, v: user.token_version, exp: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${body}.${sign(db, body)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${TTL}${secure}`);
}
export const clearSession = (res: Response) => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);

function readSession(db: DB, req: Request): User | null {
  const raw = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [body, mac] = raw.split('.');
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(db, body)), given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp, v } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    const u = get<User>(db, 'SELECT * FROM users WHERE id=? AND active=1', uid);
    return u && u.token_version === v ? u : null;
  } catch { return null; }
}

declare module 'express-serve-static-core' { interface Request { user?: User; actor: Actor } }

export const authenticate = (db: DB) => (req: Request, _res: Response, next: NextFunction) => {
  const u = readSession(db, req);
  if (!u) throw new HttpError(401, 'No autenticado');
  req.user = u; req.actor = { id: u.id, name: u.name, role: u.role };
  next();
};
const RANK = { viewer: 0, editor: 1, admin: 2 } as const;
export const requireRole = (role: Actor['role']) => (req: Request, _res: Response, next: NextFunction) => {
  if (RANK[req.actor.role] < RANK[role]) throw new HttpError(403, 'No tienes permisos para esta acción');
  next();
};

/**
 * Límite de intentos fallidos de login: por IP+email (fuerza bruta sobre una cuenta) y por IP
 * (prueba de credenciales sobre muchas cuentas). Las entradas caducadas se purgan periódicamente.
 */
const WINDOW = 10 * 60000, MAX_PER_ACCOUNT = 8, MAX_PER_IP = 40, MAX_ENTRIES = 10000;
const attempts = new Map<string, { n: number; until: number }>();
let lastPurge = 0;
function purge(now: number) {
  if (now - lastPurge < 60000 && attempts.size < MAX_ENTRIES) return;
  lastPurge = now;
  for (const [k, a] of attempts) if (a.until <= now) attempts.delete(k);
  if (attempts.size >= MAX_ENTRIES) attempts.clear();   // último recurso ante una avalancha: nunca crecer sin límite
}
const count = (k: string, now: number) => { const a = attempts.get(k); return a && a.until > now ? a.n : 0; };
const bump = (k: string, now: number) => attempts.set(k, { n: count(k, now) + 1, until: now + WINDOW });

export function loginBlocked(ip: string, email: string) {
  const now = Date.now(); purge(now);
  if (count(`a|${ip}|${email}`, now) >= MAX_PER_ACCOUNT || count(`i|${ip}`, now) >= MAX_PER_IP) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
}
export function loginResult(ip: string, email: string, ok: boolean) {
  const now = Date.now();
  if (ok) { attempts.delete(`a|${ip}|${email}`); return; }
  bump(`a|${ip}|${email}`, now); bump(`i|${ip}`, now);
}
export const resetLoginThrottle = () => attempts.clear();
