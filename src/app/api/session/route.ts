import { NextRequest, NextResponse } from 'next/server';
import { ensureSession, getSession, updateSession, deleteSession, clearSessionCookie } from '@/lib/session';

export async function GET() {
  try {
    const { session, isNew } = await ensureSession();
    return NextResponse.json({
      id: session.id,
      userName: session.userName || null,
      model: session.model || null,
      data: session.data,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isNew,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get session' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    const body = await req.json();
    const { userName, model, data } = body;

    const updates: Record<string, unknown> = {};
    if (userName !== undefined) updates.userName = userName;
    if (model !== undefined) updates.model = model;
    if (data !== undefined) updates.data = data;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await updateSession(session.id, updates as any);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (session) {
      await deleteSession(session.id);
    }
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
