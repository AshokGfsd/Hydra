import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY || '',
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }
  return client;
}

export default getClient;
