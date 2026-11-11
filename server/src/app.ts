import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import type { DB } from './db.ts';
import { apiRouter } from './routes.ts';
import { HttpError } from './util.ts';

export function createApp(db: DB, staticDir?: string) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
  app.use(express.json({ limit: '5mb' }));
  app.get('/healthz', (_req, res) => { res.json({ ok: true }); });
  app.use('/api', apiRouter(db));
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'No encontrado' }); });
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { maxAge: '1h', index: false }));
    app.get(/.*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(join(staticDir, 'index.html')); });
  }
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    if (err instanceof ZodError) { res.status(400).json({ error: err.issues.map(i => `${i.path.join('.') || 'datos'}: ${i.message}`).join('; ') }); return; }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') { res.status(400).json({ error: 'JSON no válido' }); return; }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });
  return app;
}
