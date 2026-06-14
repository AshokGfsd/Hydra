import { NextRequest, NextResponse } from 'next/server';
import { classifyIntent } from '@/lib/utils';
import { MODELS } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { input, model } = await request.json();
    const intent = await classifyIntent(input, model || MODELS[0]);
    return NextResponse.json(intent);
  } catch (err) {
    return NextResponse.json({ type: 'chat', error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}