import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';

export const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function cookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function setCookie(req: Request, res: Response, name: string, value: string, maxAge = MAX_AGE_MS): void {
  // Behind the Next proxy, trust x-forwarded-proto to decide on Secure.
  const secure = (req.headers['x-forwarded-proto'] ?? req.protocol) === 'https';
  res.cookie(name, value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge, secure });
}

/** Writes need a JSON body; browsers cannot send that cross-site without a CORS preflight. */
export function requireJson(req: Request): void {
  if (!req.is('application/json')) throw new BadRequestException('Yêu cầu phải ở dạng JSON.');
}

export function clientId(req: Request): string {
  return String(req.headers['x-forwarded-for'] ?? req.ip ?? 'unknown').split(',')[0].trim();
}
