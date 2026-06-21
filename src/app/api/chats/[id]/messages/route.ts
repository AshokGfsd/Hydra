import { NextRequest, NextResponse } from 'next/server';
import { getChat, addMessage } from '@/lib/chatStore';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { role, content, reasoning } = await request.json();
    if (!role || content === undefined) {
      return NextResponse.json({ error: 'role and content required' }, { status: 400 });
    }
    
    const chat = await addMessage(id, role, content, reasoning);
    if (!chat) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    return NextResponse.json({ ok: true, chat });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}