import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { devices, members } from '../db/schema.ts';
import { env } from '../env.ts';
import { hashToken, newId, newToken } from './crypto.ts';

export const COOKIE_NAME = 'kb_device';
const YEAR_SECONDS = 365 * 24 * 60 * 60;

export type Session = { deviceId: string; memberId: string; familyId: string };

declare module 'fastify' {
  interface FastifyRequest {
    session?: Session;
  }
}

export const issueDevice = async (reply: FastifyReply, memberId: string, label: string): Promise<void> => {
  const token = newToken();
  await db.insert(devices).values({ id: newId(), memberId, label, tokenHash: hashToken(token) });

  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: YEAR_SECONDS,
  });
};

export const readSession = async (request: FastifyRequest): Promise<Session | undefined> => {
  const token = request.cookies[COOKIE_NAME];
  if (!token) return undefined;

  const [row] = await db
    .select({ deviceId: devices.id, memberId: members.id, familyId: members.familyId })
    .from(devices)
    .innerJoin(members, eq(members.id, devices.memberId))
    .where(eq(devices.tokenHash, hashToken(token)))
    .limit(1);

  return row;
};

export const requireSession = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const session = await readSession(request);
  if (!session) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  request.session = session;
};

export const clearSession = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const token = request.cookies[COOKIE_NAME];
  if (token) await db.delete(devices).where(eq(devices.tokenHash, hashToken(token)));
  reply.clearCookie(COOKIE_NAME, { path: '/' });
};
