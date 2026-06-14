import { NextRequest, NextResponse } from 'next/server';
import { listMemories, createMemory } from '@/lib/memoryStore';

export async function GET() {
  try {
    const memories = listMemories();
    return NextResponse.json({ memories });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { key, content, type } = await request.json();
    if (!key || !content) {
      return NextResponse.json({ error: 'key and content are required' }, { status: 400 });
    }
    const memory = createMemory(key, content, type || 'fact');
    return NextResponse.json({ memory });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
