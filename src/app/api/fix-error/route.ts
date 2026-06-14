import { NextRequest, NextResponse } from 'next/server';
import getClient from '@/lib/openai';
import { MODELS } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { error, model } = await request.json();
    if (!error) {
      return NextResponse.json({ error: 'error message is required' }, { status: 400 });
    }

    const prompt = `You are an API debugger. An AI chat request failed with this error:

${error}

Analyze the error and return ONLY a raw JSON object. NO markdown, NO code fences, NO explanation outside the JSON.

Examples:
- Token limit errors → reduce max_tokens
- Rate limit errors → reduce max_tokens, reduce temperature  
- Context length errors → reduce or remove system messages, shorten inputs
- Invalid parameter errors → remove or fix the parameter
- Role alternation errors → insert filler messages or remove duplicates

Return format:
{"fixed": true, "changes": {"parameter_name": "new_value"}, "explanation": "brief reason"}

If unfixable:
{"fixed": false, "explanation": "why"}`;

    const completion = await getClient().chat.completions.create({
      model: model || MODELS[0],
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.1,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let result: any = {};
    try {
      result = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[1]);
        } catch {
          result = { fixed: false, explanation: 'Failed to parse AI response' };
        }
      } else {
        result = { fixed: false, explanation: 'Failed to parse AI response' };
      }
    }

    if (!result.fixed) {
      if (error.toLowerCase().includes('roles must alternate')) {
        result = { fixed: true, changes: { fix_alternation: 'true' }, explanation: 'Fix role alternation in messages' };
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { fixed: false, explanation: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
