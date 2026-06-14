import { NextRequest, NextResponse } from 'next/server';
import getClient from '@/lib/openai';
import { createMemory } from '@/lib/memoryStore';
import { MODELS } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { userMessage, assistantResponse, model } = await request.json();
    if (!userMessage || !assistantResponse) {
      return NextResponse.json({ error: 'userMessage and assistantResponse are required' }, { status: 400 });
    }

    const prompt = `Analyze this conversation exchange and extract any important information to remember:

User: ${userMessage}
Assistant: ${assistantResponse}

Extract facts, preferences, and task patterns as JSON array. Each entry must have:
- "key": short label (snake_case)
- "content": what to remember
- "type": "fact" | "preference" | "task"

Return ONLY a valid JSON array, nothing else. Example:
[{"key": "user_name", "content": "User's name is Alex", "type": "fact"}]

If nothing to remember, return empty array [].`;

    const completion = await getClient().chat.completions.create({
      model: model || MODELS[0],
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.1,
    });

    const raw = completion.choices[0]?.message?.content || '[]';
    let extracted: Array<{ key: string; content: string; type: 'fact' | 'preference' | 'task' }> = [];
    try {
      extracted = JSON.parse(raw);
      if (!Array.isArray(extracted)) extracted = [];
    } catch {
      extracted = [];
    }

    const saved = [];
    for (const item of extracted) {
      if (item.key && item.content) {
        const memory = createMemory(item.key, item.content, item.type || 'fact');
        saved.push(memory);
      }
    }

    return NextResponse.json({ memories: saved, count: saved.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
