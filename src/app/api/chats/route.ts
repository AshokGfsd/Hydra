import { NextRequest, NextResponse } from 'next/server';
import { listChats, createChat } from '@/lib/chatStore';
import { MODELS } from '@/types';

export async function GET() {
  return NextResponse.json({ chats: listChats() });
}

export async function POST(request: NextRequest) {
  try {
    const { title, model } = await request.json();
    const chat = createChat(title || 'New Chat', model || MODELS[0]);
    return NextResponse.json({ chat });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}