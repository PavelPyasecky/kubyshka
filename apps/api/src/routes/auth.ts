import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defaultAccounts, defaultCategories } from '@kubyshka/shared';
import { db } from '../db/client.ts';
import { accounts, categories, families, invites, members } from '../db/schema.ts';
import { env } from '../env.ts';
import { hashPin, hashToken, newId, newInviteCode, verifyPin } from '../lib/crypto.ts';
import { clearSession, issueDevice, readSession, requireSession } from '../lib/session.ts';

const MEMBER_COLORS = ['#15724C', '#7D5BA6', '#3478F6', '#B07400'];
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const credentials = {
  name: z.string().trim().min(1).max(40),
  pin: z.string().regex(/^\d{4}$/),
  device: z.string().trim().min(1).max(40).default('iPhone'),
};

const bootstrapBody = z.object({ ...credentials, setupCode: z.string().default('') });
const joinBody = z.object({ ...credentials, code: z.string().regex(/^\d{6}$/) });
const restoreBody = z.object({ ...credentials });

const familyExists = async (): Promise<boolean> => {
  const [row] = await db.select({ id: families.id }).from(families).limit(1);
  return Boolean(row);
};

const seedFamily = async (familyId: string, memberId: string, now: number): Promise<void> => {
  await db.insert(categories).values(
    defaultCategories.map((category, index) => ({
      id: newId(),
      familyId,
      updatedAt: now,
      updatedBy: memberId,
      name: category.name,
      flow: category.flow,
      icon: category.icon,
      color: category.color,
      sort: index,
    })),
  );

  await db.insert(accounts).values(
    defaultAccounts.map((account, index) => ({
      id: newId(),
      familyId,
      updatedAt: now,
      updatedBy: memberId,
      name: account.name,
      kind: account.kind,
      scope: 'shared',
      icon: account.icon,
      color: account.color,
      sort: index,
    })),
  );
};

const createMember = async (familyId: string, name: string, pin: string): Promise<string> => {
  const existing = await db.select({ id: members.id }).from(members).where(eq(members.familyId, familyId));
  const id = newId();

  await db.insert(members).values({
    id,
    familyId,
    name,
    pinHash: await hashPin(pin),
    color: MEMBER_COLORS[existing.length % MEMBER_COLORS.length],
  });

  return id;
};

export const authRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/state', async () => ({ needsBootstrap: !(await familyExists()), needsSetupCode: env.SETUP_CODE !== '' }));

  app.get('/me', { preHandler: requireSession }, async (request) => {
    const { familyId, memberId } = request.session!;
    const [family] = await db.select().from(families).where(eq(families.id, familyId));
    const roster = await db
      .select({ id: members.id, name: members.name, color: members.color })
      .from(members)
      .where(eq(members.familyId, familyId));

    return { memberId, family, members: roster };
  });

  app.post('/bootstrap', async (request, reply) => {
    const body = bootstrapBody.parse(request.body);

    if (await familyExists()) return reply.code(409).send({ error: 'family_exists' });
    if (env.SETUP_CODE && body.setupCode !== env.SETUP_CODE) {
      return reply.code(403).send({ error: 'bad_setup_code' });
    }

    const familyId = newId();
    const now = Date.now();
    await db.insert(families).values({ id: familyId, familyId, updatedAt: now, name: 'Семья' });

    const memberId = await createMember(familyId, body.name, body.pin);
    await db.update(families).set({ updatedBy: memberId }).where(eq(families.id, familyId));
    await seedFamily(familyId, memberId, now);
    await issueDevice(reply, memberId, body.device);

    return { memberId, familyId };
  });

  app.post('/invite', { preHandler: requireSession }, async (request) => {
    const { familyId, memberId } = request.session!;
    const code = newInviteCode();

    await db.insert(invites).values({
      id: newId(),
      familyId,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdBy: memberId,
    });

    return { code, expiresAt: Date.now() + INVITE_TTL_MS };
  });

  app.post('/join', async (request, reply) => {
    const body = joinBody.parse(request.body);

    const [invite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.codeHash, hashToken(body.code)), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
      .limit(1);

    if (!invite) return reply.code(404).send({ error: 'invite_invalid' });

    const memberId = await createMember(invite.familyId, body.name, body.pin);
    await db.update(invites).set({ usedAt: new Date() }).where(eq(invites.id, invite.id));
    await issueDevice(reply, memberId, body.device);

    return { memberId, familyId: invite.familyId };
  });

  app.post('/restore', async (request, reply) => {
    const body = restoreBody.parse(request.body);

    const candidates = await db.select().from(members).where(eq(members.name, body.name));
    for (const member of candidates) {
      if (!(await verifyPin(body.pin, member.pinHash))) continue;
      await issueDevice(reply, member.id, body.device);
      return { memberId: member.id, familyId: member.familyId };
    }

    return reply.code(401).send({ error: 'bad_credentials' });
  });

  app.post('/logout', async (request, reply) => {
    await clearSession(request, reply);
    return { ok: true };
  });

  app.get('/session', async (request) => ({ active: Boolean(await readSession(request)) }));
};
