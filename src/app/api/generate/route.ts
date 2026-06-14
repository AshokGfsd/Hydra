import { NextRequest, NextResponse } from 'next/server';
import { generateHTML } from '@/lib/utils';
import { MODELS } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { prompt, model, temperature, top_p, max_tokens, seed } = await request.json();
    const html = await generateHTML(prompt, model || MODELS[0], {
      temperature,
      top_p,
      max_tokens,
      seed,
    });
    return NextResponse.json({ html });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}