import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function POST(request: NextRequest) {
  try {
    const { html, filename } = await request.json();
    const file = filename || `page-${Date.now()}.html`;
    const filepath = join(process.cwd(), 'generated', file);
    
    try {
      await writeFile(filepath, html);
    } catch {
      await writeFile(join(process.cwd(), file), html);
    }
    
    return NextResponse.json({ ok: true, file });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}