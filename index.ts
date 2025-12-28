import { cerebrasService } from './services/cerebras';
import { groqService } from './services/groq';
import type { AIService, ChatMessage } from './services/types';

const services: AIService[] = [
  cerebrasService,
  groqService,
];

console.log('Servicios registrados:', services.map(s => s.name).join(', '));

let currentServiceIndex = 0;

/**
 * Obtiene el siguiente servicio usando Round Robin
 */
function getNextService(): AIService {
  const service = services[currentServiceIndex]!;
  currentServiceIndex = (currentServiceIndex + 1) % services.length;
  return service;
}

/**
 * Convierte un iterador asíncrono en un ReadableStream para Bun
 */
function createChatStream(asyncIterable: AsyncIterable<string>): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of asyncIterable) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}

/**
 * Maneja la lógica de la petición de chat
 */
async function handleChat(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response('Messages array is required', { status: 400 });
    }

    const service = getNextService();
    console.log(`[Balanceador] Seleccionado: ${service.name}`);

    const stream = await service.chat(messages);
    return new Response(createChatStream(stream), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    console.error('Error procesando la petición:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const { pathname } = new URL(req.url);

    if (req.method === 'POST' && pathname === '/chat') {
      return handleChat(req);
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Servidor de balanceo escuchando en http://localhost:${server.port}`);