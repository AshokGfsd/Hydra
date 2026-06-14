export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  timestamp?: number;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface ChatParams {
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
  seed?: number;
  stop?: string[];
  stream?: boolean;
  reasoning_budget?: number;
  chat_template_kwargs?: Record<string, unknown>;
}

export interface StreamChunk {
  text?: string;
  reasoning?: string;
  done?: boolean;
  error?: string;
}

export interface Memory {
  id: string;
  key: string;
  content: string;
  type: 'task' | 'fact' | 'preference';
  createdAt: number;
  updatedAt: number;
}

export interface IntentResult {
  type: 'chat' | 'create_file' | 'explain_only';
  error?: string;
}
const MODELS = [
  "mistralai/mixtral-8x7b-instruct-v0.1",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/llama-3.1-nemotron-nano-8b-v1",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "nvidia/nemotron-mini-4b-instruct",
  "nvidia/nvidia-nemotron-nano-9b-v2",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/cosmos-reason2-8b",
  "nvidia/nemotron-nano-12b-v2-vl",
  "google/gemma-2-2b-it",
  "google/gemma-2-9b-it",
  "google/gemma-2-27b-it",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "deepseek-ai/deepseek-v4-flash",
  "deepseek-ai/deepseek-v4-pro",
  "deepseek-ai/deepseek-r1",
  "qwen/qwen3-next-80b-a3b-instruct",
  "qwen/qwen2.5-72b-instruct",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "meta/llama-3.1-8b-instruct",
  "mistralai/mixtral-8x22b-instruct-v0.1",
  "mistralai/mistral-large-2-instruct",
  "microsoft/phi-3.5-moe-instruct"
];

export { MODELS };

// export const MODELS = [
//   'nvidia/llama-3.3-nemotron-super-49b-v1.5',
//   'nvidia/nemotron-3-ultra-550b-a55b',
//   'nvidia/nemotron-3-super-120b-a12b',
//   'nvidia/nemotron-3-nano-30b-a3b',
//   'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
//   'nvidia/nemotron-mini-4b-instruct',
//   'nvidia/nvidia-nemotron-nano-9b-v2',
//   'nvidia/llama-3_3-nemotron-super-49b-v1_5',
//   'nvidia/llama-3_3-nemotron-super-49b-v1',
//   'nvidia/llama-3_1-nemotron-nano-8b-v1',
//   'nvidia/cosmos-reason2-8b',
//   'nvidia/nemotron-nano-12b-v2-vl',
//   'google/gemma-2-2b-it',
//   'openai/gpt-oss-120b',
//   'deepseek-ai/deepseek-v4-flash',
//   'deepseek-ai/deepseek-v4-pro',
// ];