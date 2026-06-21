import { NextRequest, NextResponse } from 'next/server';
import { listChats, createChat } from '@/lib/chatStore';
import { MODELS } from '@/types';

export async function GET() {
  const chats = await listChats();
  return NextResponse.json({ chats });
}

export async function POST(request: NextRequest) {
  try {
    const { title, model } = await request.json();
    const chat = await createChat(title || 'New Chat', model || MODELS[0]);
    return NextResponse.json({ chat });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}