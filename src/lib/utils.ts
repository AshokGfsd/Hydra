import getClient from './openai';
import { MODELS, IntentResult, ChatParams } from '@/types';

export async function classifyIntent(input: string, model: string = MODELS[0]): Promise<IntentResult> {
  try {
    const res = await getClient().chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: `
Classify user input into:
- chat
- create_file
- explain_only

Return ONLY JSON:
{"type":"..."}

Input:
${input}
          `,
        },
      ],
      max_tokens: 50,
    });

    return JSON.parse(res.choices[0].message.content || '{"type":"chat"}');
  } catch {
    return { type: 'chat' };
  }
}

export async function generateHTML(prompt: string, model: string, params: ChatParams = {}): Promise<string> {
  const body = {
    model,
    messages: [
      {
        role: 'user' as const,
        content: `
Create a modern SaaS landing page.

Return ONLY HTML.

Request:
${prompt}
        `,
      },
    ],
    temperature: params.temperature ?? 0.7,
    top_p: params.top_p ?? 0.95,
    max_tokens: params.max_tokens ?? 8192,
  };

  if (params.seed !== undefined && params.seed !== null && params.seed !== 0) {
    (body as Record<string, unknown>).seed = params.seed;
  }

  const res = await getClient().chat.completions.create(body);
  return res.choices[0].message.content || '';
}

export function buildChatBody(messages: Array<{ role: string; content: string }>, model: string, params: ChatParams = {}) {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: params.temperature ?? 0.7,
    top_p: params.top_p ?? 0.95,
    max_tokens: params.max_tokens ?? 8192,
  };

  if (params.seed !== undefined && params.seed !== null && params.seed !== 0) {
    body.seed = params.seed;
  }
  if (params.stop && Array.isArray(params.stop) && params.stop.length > 0) {
    body.stop = params.stop;
  }
  if (params.frequency_penalty !== undefined) {
    body.frequency_penalty = params.frequency_penalty;
  }
  if (params.presence_penalty !== undefined) {
    body.presence_penalty = params.presence_penalty;
  }

  const extraBody: Record<string, unknown> = {};
  if (params.reasoning_budget !== undefined && params.reasoning_budget > 0) {
    extraBody.reasoning_budget = params.reasoning_budget;
  }
  if (params.chat_template_kwargs && typeof params.chat_template_kwargs === 'object') {
    extraBody.chat_template_kwargs = params.chat_template_kwargs;
  }
  if (Object.keys(extraBody).length > 0) {
    body.extra_body = extraBody;
  }

  return body;
}