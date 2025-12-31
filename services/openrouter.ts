import OpenAI from 'openai';
import type { AIService, ChatMessage } from '../types';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
});

// Lista de modelos gratuitos recomendados con estrategia de fallback
// OpenRouter intentará usarlos en orden si alguno falla o está saturado.
const MODELS_FALLBACK_CHAIN = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1:free",
  "deepseek/deepseek-chat:free",
  "mistralai/mistral-7b-instruct:free",
  "google/gemma-2-9b-it:free",
  "microsoft/phi-3-medium-128k-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "openrouter/auto"
];

export const openRouterService: AIService = {
  name: 'OpenRouter (Auto-Fallback)',
  async chat(messages: ChatMessage[]) {
    let lastError: any = null;

    for (const model of MODELS_FALLBACK_CHAIN) {
      try {
        console.log(`OpenRouter attempting model: ${model}`);
        
        const stream = await openai.chat.completions.create({
          model: model,
          messages: messages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content
          })),
          stream: true,
        }, {
          headers: {
            "HTTP-Referer": "https://bun-ai-api.local",
            "X-Title": "Bun AI API"
          }
        });

        // If we get here, connection is established.
        // We return a generator that wraps the stream.
        return (async function* () {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              yield content;
            }
          }
        })();

      } catch (error) {
        console.warn(`⚠️ OpenRouter model ${model} failed:`, error instanceof Error ? error.message : error);
        lastError = error;
        // Continue to next model
      }
    }

    // If all failed
    throw lastError || new Error("All OpenRouter models failed");
  }
};
