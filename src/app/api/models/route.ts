import { NextRequest, NextResponse } from 'next/server';
import { MODELS } from '@/types';

let currentModel = MODELS[0];

export async function GET() {
  return NextResponse.json({ models: MODELS, current: currentModel });
}

export async function POST(request: NextRequest) {
  try {
    const { model } = await request.json();
    if (MODELS.includes(model)) {
      currentModel = model;
      return NextResponse.json({ ok: true, current: currentModel });
    }
    return NextResponse.json({ ok: false, error: 'Invalid model' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}