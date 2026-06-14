import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const {
      model,
      messages,
      apiKey,
      temperature,
      top_p,
      max_tokens,
      seed,
      stop,
      reasoning_budget,
      chat_template_kwargs,
    } = await request.json();

    const key = apiKey || process.env.NVIDIA_API_KEY;

    if (!key) {
      return new NextResponse(
        `data: ${JSON.stringify({ error: 'Missing NVIDIA API key' })}\n\n`,
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    }

    const body: Record<string, unknown> = {
      model: model || 'nvidia/nemotron-3-ultra-550b-a55b',
      messages,
      temperature: temperature ?? 1,
      top_p: top_p ?? 0.95,
      max_tokens: max_tokens ?? 16384,
      stream: true,
    };

    if (seed !== undefined && seed !== null && seed !== 0) body.seed = seed;
    if (stop && Array.isArray(stop) && stop.length > 0) body.stop = stop;
    if (reasoning_budget !== undefined && reasoning_budget > 0) body.reasoning_budget = reasoning_budget;
    if (chat_template_kwargs && typeof chat_template_kwargs === 'object') body.chat_template_kwargs = chat_template_kwargs;

    const upstream = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new NextResponse(
        `data: ${JSON.stringify({ error: `API ${upstream.status}: ${text}` })}\n\n`,
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();

              if (data === '[DONE]') continue;

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta || {};
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  text: delta.content || '',
                  reasoning: delta.reasoning_content || '',
                })}\n\n`));
              } catch {
                // skip malformed chunk
              }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    return new NextResponse(
      `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  }
}