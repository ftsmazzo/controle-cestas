import type { Request, Response, NextFunction } from 'express';

const ADMIN_HEADER = 'x-admin-key';

export function getAdminApiKey(): string | undefined {
  const key = process.env.ADMIN_API_KEY?.trim();
  return key || undefined;
}

export function requireAdminWrite(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = getAdminApiKey();
  if (!expected) {
    next();
    return;
  }
  const provided = String(req.header(ADMIN_HEADER) ?? '').trim();
  if (provided === expected) {
    next();
    return;
  }
  res.status(403).json({
    error:
      'Alteração de dados restrita à área administrativa. Use o endereço /admin com a chave correta.',
  });
}
