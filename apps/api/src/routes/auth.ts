import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.ts';
import { devices, families, familyKeys, invites, members } from '../db/schema.ts';
import { env } from '../env.ts';
import { hashPin, hashToken, newId, newInviteCode, verifyPin } from '../lib/crypto.ts';
import { clearSession, issueDevice, readSession, requireSession } from '../lib/session.ts';

const MEMBER_COLORS = ['#15724C', '#7D5BA6', '#3478F6', '#B07400'];
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const wrappedKeySchema = z.string().regex(/^[A-Za-z0-9_-]{40,128}$/);

const credentials = {
  name: z.string().trim().min(1).max(40),
  pin: z.string().regex(/^\d{4}$/),
  device: z.string().trim().min(1).max(40).default('iPhone'),
};

const bootstrapBody = z.object({ ...credentials, setupCode: z.string().default(''), wrappedKey: wrappedKeySchema });
const joinBody = z.object({ ...credentials, code: z.string().regex(/^\d{6}$/) });
const restoreBody = z.object({ ...credentials });

const familyExists = async (): Promise<boolean> => {
  const [row] = await db.select({ id: families.id }).from(families).limit(1);
  return Boolean(row);
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
    const roster = await db
      .select({ id: members.id, name: members.name, color: members.color })
      .from(members)
      .where(eq(members.familyId, familyId));
    const deviceRows = await db
      .select({ memberId: devices.memberId })
      .from(devices)
      .innerJoin(members, eq(members.id, devices.memberId))
      .where(eq(members.familyId, familyId));
    const deviceCount = new Map<string, number>();
    for (const row of deviceRows) deviceCount.set(row.memberId, (deviceCount.get(row.memberId) ?? 0) + 1);

    return {
      memberId,
      familyId,
      members: roster.map((member) => ({ ...member, deviceCount: deviceCount.get(member.id) ?? 0 })),
    };
  });

  app.get('/key', { preHandler: requireSession }, async (request, reply) => {
    const { familyId } = request.session!;
    const [row] = await db.select().from(familyKeys).where(eq(familyKeys.familyId, familyId));
    if (!row) return reply.code(404).send({ error: 'key_missing' });
    return { wrappedKey: row.wrappedKey };
  });

  app.post('/key', { preHandler: requireSession }, async (request, reply) => {
    const { familyId } = request.session!;
    const body = z.object({ wrappedKey: wrappedKeySchema }).parse(request.body);
    const [existing] = await db.select({ familyId: familyKeys.familyId }).from(familyKeys).where(eq(familyKeys.familyId, familyId));
    if (existing) return reply.code(409).send({ error: 'key_exists' });
    await db.insert(familyKeys).values({ familyId, wrappedKey: body.wrappedKey });
    return { ok: true };
  });

  app.post('/bootstrap', async (request, reply) => {
    const body = bootstrapBody.parse(request.body);

    if (await familyExists()) return reply.code(409).send({ error: 'family_exists' });
    if (env.SETUP_CODE && body.setupCode !== env.SETUP_CODE) {
      return reply.code(403).send({ error: 'bad_setup_code' });
    }

    const familyId = newId();
    // Нулевое время отдаёт первую содержательную запись клиенту: только он умеет её зашифровать.
    await db.insert(families).values({ id: familyId, familyId, updatedAt: 0 });
    await db.insert(familyKeys).values({ familyId, wrappedKey: body.wrappedKey });

    const memberId = await createMember(familyId, body.name, body.pin);
    await db.update(families).set({ updatedBy: memberId }).where(eq(families.id, familyId));
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
