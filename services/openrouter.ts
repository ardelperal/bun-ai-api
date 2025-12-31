import OpenAI from 'openai';
import type { AIService, ChatMessage } from '../types';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
});

export const openRouterService: AIService = {
  name: 'OpenRouter',
  async chat(messages: ChatMessage[]) {
    const completion = await openai.chat.completions.create({
      model: 'google/gemini-2.0-flash-exp:free',
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      })),
      stream: true,
    });

    return (async function* () {
      for await (const chunk of completion) {
        yield chunk.choices[0]?.delta?.content || '';
      }
    })();
  }
}
