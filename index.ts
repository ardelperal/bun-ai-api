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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const defaultModels = ['mi-modelo-chat'];

function getNextService() {
  const service = services[currentServiceIndex];
  currentServiceIndex = (currentServiceIndex + 1) % services.length;
  return service;
}

function getApiKey() {
  return process.env.API_KEY ?? process.env.OPENAI_API_KEY ?? '';
}

function isAuthorized(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const expectedKey = getApiKey();
  return !!expectedKey && authHeader === `Bearer ${expectedKey}`;
}

function getModelsFromEnv() {
  const raw = process.env.MODELS ?? '';
  const models = raw
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
  return models.length > 0 ? models : defaultModels;
}

function messagesToPrompt(messages: ChatMessage[]) {
  return messages.map(message => `[${message.role}] ${message.content}`).join('\n');
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function textResponse(body: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(body, {
    ...init,
    headers,
  });
}

function sseResponse(stream: ReadableStream, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Connection', 'keep-alive');
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(stream, {
    ...init,
    headers,
  });
}

function unauthorizedResponse() {
  return jsonResponse(
    { error: { message: 'Unauthorized', type: 'auth_error' } },
    { status: 401 }
  );
}

function badRequest(message: string) {
  return jsonResponse(
    { error: { message, type: 'invalid_request_error' } },
    { status: 400 }
  );
}

function serverError() {
  return jsonResponse(
    { error: { message: 'Internal Server Error', type: 'server_error' } },
    { status: 500 }
  );
}

function createChatCompletionStream(params: {
  id: string;
  created: number;
  model: string;
  textStream: AsyncIterable<string>;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const roleChunk = {
          id: params.id,
          object: 'chat.completion.chunk',
          created: params.created,
          model: params.model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null,
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(roleChunk)}\n\n`));

        for await (const chunk of params.textStream) {
          if (!chunk) {
            continue;
          }

          const payload = {
            id: params.id,
            object: 'chat.completion.chunk',
            created: params.created,
            model: params.model,
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: null,
              },
            ],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }

        const finalChunk = {
          id: params.id,
          object: 'chat.completion.chunk',
          created: params.created,
          model: params.model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('Streaming error:', error);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });
}

const server = Bun.serve({
  port: process.env.PORT ?? 3000,
  async fetch(req) {
    const { pathname } = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (req.method === 'POST' && pathname === '/chat') {
      const requestId = crypto.randomUUID().slice(0, 8);
      
      // Security Check
      const authHeader = req.headers.get('Authorization');
      const expectedKey = process.env.BUN_AI_API_KEY;
      
      if (!expectedKey || !authHeader || authHeader !== `Bearer ${expectedKey}`) {
        console.warn(`[Req: ${requestId}] ⛔ Unauthorized access attempt`);
        return textResponse('Unauthorized', { status: 401 });
      }

      try {
        const body = await req.json() as { messages: ChatMessage[] };
        const { messages } = body;

        if (!messages || !Array.isArray(messages)) {
             return textResponse("Invalid body: 'messages' array is required", { status: 400 });
        }

        const service = getNextService();
        const timestamp = new Date().toISOString();
        
        console.log(`[${timestamp}] [Req: ${requestId}] 🔄 Rotating to service: ${service?.name}`);
        console.log(`[${timestamp}] [Req: ${requestId}] 📨 Message count: ${messages.length}`);

        const stream = await service?.chat(messages)

        return sseResponse(stream as unknown as ReadableStream);
      } catch (error) {
        console.error(`[Req: ${requestId}] ❌ Error processing request:`, error);
        return textResponse('Invalid JSON or Internal Server Error', { status: 400 });
      }
    }

    if (pathname === '/v1/models' && req.method === 'GET') {
      if (!isAuthorized(req)) {
        return unauthorizedResponse();
      }

      const models = getModelsFromEnv();
      return jsonResponse({
        object: 'list',
        data: models.map(model => ({ id: model, object: 'model' })),
      });
    }

    if (pathname === '/v1/chat/completions' && req.method === 'POST') {
      if (!isAuthorized(req)) {
        return unauthorizedResponse();
      }

      const requestId = crypto.randomUUID().slice(0, 8);
      let body: {
        model?: string;
        messages?: ChatMessage[];
        temperature?: number;
        max_tokens?: number;
        stream?: boolean;
      };

      try {
        body = await req.json();
      } catch (error) {
        console.warn(`[Req: ${requestId}] Invalid JSON body`, error);
        return badRequest('Invalid JSON body');
      }

      const { model, messages, stream } = body ?? {};
      if (!model || typeof model !== 'string') {
        return badRequest("Missing required field: 'model'");
      }

      if (!messages || !Array.isArray(messages)) {
        return badRequest("Missing required field: 'messages'");
      }

      const normalizedMessages: ChatMessage[] = [];
      for (const message of messages) {
        if (!message || typeof message !== 'object') {
          return badRequest('Each message must be an object');
        }

        const { role, content } = message as ChatMessage;
        if (typeof role !== 'string' || typeof content !== 'string') {
          return badRequest('Each message must include role and content');
        }

        if (role !== 'system' && role !== 'user' && role !== 'assistant') {
          return badRequest(`Invalid role: ${role}`);
        }

        normalizedMessages.push({ role, content });
      }

      const models = getModelsFromEnv();
      if (!models.includes(model)) {
        return badRequest(`Model not available: ${model}`);
      }

      const prompt = messagesToPrompt(normalizedMessages);
      console.log(`[Req: ${requestId}] ?? OpenAI prompt built (${prompt.length} chars)`);

      const service = getNextService();
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Req: ${requestId}] ?? Service: ${service?.name} | model: ${model}`);

      try {
        if (!service?.chat) {
          console.warn(`[Req: ${requestId}] ?? No generator available, using placeholder`);
          const placeholder = async function* () {
            yield 'TODO: conectar generador real para /v1/chat/completions';
          };

          const textStream = placeholder();
          const responseId = `chatcmpl-${crypto.randomUUID()}`;
          const created = Math.floor(Date.now() / 1000);

          if (stream) {
            return sseResponse(createChatCompletionStream({
              id: responseId,
              created,
              model,
              textStream,
            }));
          }

          let content = '';
          for await (const chunk of textStream) {
            content += chunk;
          }

          return jsonResponse({
            id: responseId,
            object: 'chat.completion',
            created,
            model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content },
                finish_reason: 'stop',
              },
            ],
          });
        }

        const textStream = await service.chat(normalizedMessages);
        const responseId = `chatcmpl-${crypto.randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);

        if (stream) {
          return sseResponse(createChatCompletionStream({
            id: responseId,
            created,
            model,
            textStream,
          }));
        }

        let content = '';
        for await (const chunk of textStream) {
          content += chunk;
        }

        return jsonResponse({
          id: responseId,
          object: 'chat.completion',
          created,
          model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            },
          ],
        });
      } catch (error) {
        console.error(`[Req: ${requestId}] ? Generator error`, error);
        return serverError();
      }
    }

    return textResponse('Not found', { status: 404 });
  }
})

console.log(`🚀 Server is running on ${server.url}`);
console.log(`📋 Available services: ${services.map(s => s.name).join(', ')}`);
