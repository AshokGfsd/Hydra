import { cookies } from 'next/headers';
import { Collection, ObjectId } from 'mongodb';
import { getDb } from './mongodb';

export interface Session {
  _id?: ObjectId;
  id: string;
  userName?: string;
  model?: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const SESSION_COOKIE = 'hydra_session';
const SESSION_TTL_DAYS = 30;

function generateId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getCollection(): Promise<Collection<Session>> {
  const db = await getDb();
  const col = db.collection<Session>('sessions');
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ id: 1 }, { unique: true });
  return col;
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const col = await getCollection();
  return col.findOne({ id: sid, expiresAt: { $gt: new Date() } });
}

export async function createSession(data?: Partial<Session>): Promise<Session> {
  const col = await getCollection();
  const now = new Date();
  const sid = generateId();
  const session: Session = {
    id: sid,
    data: data?.data || {},
    userName: data?.userName,
    model: data?.model,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
  await col.insertOne(session);
  return session;
}

export async function updateSession(sid: string, data: Partial<Session>): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne(
    { id: sid },
    { $set: { ...data, updatedAt: new Date() } }
  );
  return result.matchedCount > 0;
}

export async function deleteSession(sid: string): Promise<boolean> {
  const col = await getCollection();
  const result = await col.deleteOne({ id: sid });
  return result.deletedCount > 0;
}

export async function ensureSession(): Promise<{ session: Session; isNew: boolean }> {
  const existing = await getSession();
  if (existing) return { session: existing, isNew: false };

  const session = await createSession();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    path: '/',
  });
  return { session, isNew: true };
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export { SESSION_COOKIE };
