import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DB } from './db.ts';
import { get, setting } from './db.ts';
import { HttpError } from './util.ts';
import type { Actor } from './util.ts';

export interface User { id: number; email: string; name: string; role: Actor['role']; active: number; password_hash: string }
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

export function setSession(db: DB, res: Response, userId: number) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
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
    const { uid, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    const u = get<User>(db, 'SELECT * FROM users WHERE id=? AND active=1', uid);
    return u ?? null;
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

/** Límite simple de intentos de login por IP+email. */
const attempts = new Map<string, { n: number; until: number }>();
export function loginThrottle(key: string, ok: boolean) {
  const now = Date.now(), a = attempts.get(key);
  if (ok) { attempts.delete(key); return; }
  if (a && a.until > now && a.n >= 8) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
  attempts.set(key, { n: a && a.until > now ? a.n + 1 : 1, until: now + 10 * 60000 });
}
export function loginBlocked(key: string) {
  const a = attempts.get(key);
  if (a && a.until > Date.now() && a.n >= 8) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
}
