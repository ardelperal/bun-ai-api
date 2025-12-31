import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import { geminiService } from './services/gemini';
import { openRouterService } from './services/openrouter';
import type { AIService, ChatMessage } from './types';

const services: AIService[] = [
  groqService,
  cerebrasService,
  geminiService,
  openRouterService,
]
let currentServiceIndex = 0;

function getNextService() {
  const service = services[currentServiceIndex];
  currentServiceIndex = (currentServiceIndex + 1) % services.length;
  return service;
}

const server = Bun.serve({
  port: process.env.PORT ?? 3000,
  async fetch(req) {
    const { pathname } = new URL(req.url)

    if (req.method === 'POST' && pathname === '/chat') {
      const requestId = crypto.randomUUID().slice(0, 8);
      
      // Security Check
      const authHeader = req.headers.get('Authorization');
      const expectedKey = process.env.BUN_AI_API_KEY;
      
      if (!expectedKey || !authHeader || authHeader !== `Bearer ${expectedKey}`) {
        console.warn(`[Req: ${requestId}] ⛔ Unauthorized access attempt`);
        return new Response("Unauthorized", { status: 401 });
      }

      try {
        const body = await req.json() as { messages: ChatMessage[] };
        const { messages } = body;

        if (!messages || !Array.isArray(messages)) {
             return new Response("Invalid body: 'messages' array is required", { status: 400 });
        }

        const service = getNextService();
        const timestamp = new Date().toISOString();
        
        console.log(`[${timestamp}] [Req: ${requestId}] 🔄 Rotating to service: ${service?.name}`);
        console.log(`[${timestamp}] [Req: ${requestId}] 📨 Message count: ${messages.length}`);

        const stream = await service?.chat(messages)

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (error) {
        console.error(`[Req: ${requestId}] ❌ Error processing request:`, error);
        return new Response("Invalid JSON or Internal Server Error", { status: 400 });
      }
    }

    return new Response("Not found", { status: 404 });
  }
})

console.log(`🚀 Server is running on ${server.url}`);
console.log(`📋 Available services: ${services.map(s => s.name).join(', ')}`);
