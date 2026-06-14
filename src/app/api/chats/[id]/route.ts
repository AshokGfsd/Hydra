import { NextRequest, NextResponse } from 'next/server';
import { getChat, renameChat, setChatModel, deleteChat } from '@/lib/chatStore';
import { MODELS } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ chat });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { title, model } = await request.json();
    if (title !== undefined) renameChat(id, title);
    if (model !== undefined && MODELS.includes(model)) setChatModel(id, model);
    const chat = getChat(id);
    if (!chat) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ chat });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteChat(id);
  return NextResponse.json({ ok: true });
}