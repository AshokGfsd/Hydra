import { NextRequest, NextResponse } from 'next/server';
import getClient from '@/lib/openai';
import { buildChatBody } from '@/lib/utils';
import { MODELS } from '@/types';

// CRITICAL: These exports prevent Next.js from buffering the response
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      model,
      temperature,
      top_p,
      frequency_penalty,
      presence_penalty,
      max_tokens,
      seed,
      stop,
      stream: shouldStream,
      reasoning_budget,
      chat_template_kwargs,
    } = await request.json();

    const useModel = model || MODELS[0];
    const useStream = shouldStream !== false;

    const body = buildChatBody(messages, useModel, {
      temperature,
      top_p,
      frequency_penalty,
      presence_penalty,
      max_tokens,
      seed,
      stop,
      reasoning_budget,
      chat_template_kwargs,
    });

    const openai = getClient();

    // ─── NON-STREAMING ───
    if (!useStream) {
      const completion = await (openai.chat.completions.create as any)(body);
      return NextResponse.json(completion);
    }

    // ─── STREAMING ───
    // Use TransformStream for proper SSE handling in Next.js App Router
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    body.stream = true;

    // Start the OpenAI stream in the background (don't await!)
    (async () => {
      try {
        const stream = await (openai.chat.completions.create as any)(body);

        for await (const chunk of stream) {
          // DEFENSIVE: chunk.choices can be empty — this causes "list index out of range"
          if (!chunk.choices || chunk.choices.length === 0) continue;

          const choice = chunk.choices[0];
          const text = choice.delta?.content || '';
          const reasoning = choice.delta?.reasoning_content || '';

          if (text || reasoning) {
            const payload = JSON.stringify({ text, reasoning });
            await writer.write(encoder.encode(`data: ${payload}\n\n`));
          }
        }

        await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err: any) {
        const errorPayload = JSON.stringify({
          error: err instanceof Error ? err.message : 'Unknown streaming error',
        });
        await writer.write(encoder.encode(`data: ${errorPayload}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    // Return the readable side immediately — this is the key to working SSE in Next.js
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}