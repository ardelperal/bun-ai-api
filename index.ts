import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import { geminiService } from './services/gemini';
import { openRouterService } from './services/openrouter';
import type { AIService, ChatMessage } from './types';

const serviceCatalog = [
  { id: 'groq', service: groqService },
  { id: 'cerebras', service: cerebrasService },
  { id: 'gemini', service: geminiService },
  { id: 'openrouter', service: openRouterService },
];

const services = serviceCatalog.map(entry => entry.service);
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

function normalizeProviderName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getProviderEntry(provider: string) {
  const normalized = normalizeProviderName(provider);
  for (let index = 0; index < serviceCatalog.length; index += 1) {
    const entry = serviceCatalog[index];
    const aliases = [
      normalizeProviderName(entry.id),
      normalizeProviderName(entry.service.name),
    ];
    if (aliases.includes(normalized)) {
      return { entry, index };
    }
  }

  return null;
}

function getServiceRotationOrder(startIndex: number) {
  const ordered: { service: AIService; index: number }[] = [];
  for (let offset = 0; offset < services.length; offset += 1) {
    const index = (startIndex + offset) % services.length;
    ordered.push({ service: services[index], index });
  }

  return ordered;
}

function getApiKey() {
  return process.env.API_KEY ?? process.env.BUN_AI_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
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
        provider?: string;
      };

      try {
        body = await req.json();
      } catch (error) {
        console.warn(`[Req: ${requestId}] Invalid JSON body`, error);
        return badRequest('Invalid JSON body');
      }

      const { model, messages, stream, provider } = body ?? {};
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

      const providerName = typeof provider === 'string' ? provider.trim() : '';
      let providerEntry: { entry: { id: string; service: AIService }; index: number } | null = null;
      if (providerName) {
        providerEntry = getProviderEntry(providerName);
        if (!providerEntry) {
          return badRequest(`Unknown provider: ${providerName}`);
        }
      }

      const prompt = messagesToPrompt(normalizedMessages);
      console.log(`[Req: ${requestId}] ?? OpenAI prompt built (${prompt.length} chars)`);

      try {
        const rotationStart = providerEntry ? providerEntry.index : currentServiceIndex;
        const candidates = getServiceRotationOrder(rotationStart);
        let selected: { service: AIService; index: number } | null = null;
        let textStream: AsyncIterable<string> | null = null;
        let lastError: unknown = null;

        for (const candidate of candidates) {
          try {
            textStream = await candidate.service.chat(normalizedMessages);
            selected = candidate;
            break;
          } catch (error) {
            lastError = error;
            console.warn(`[Req: ${requestId}] ?? Provider failed: ${candidate.service.name}`, error);
          }
        }

        if (!selected || !textStream) {
          console.error(`[Req: ${requestId}] ? All providers failed`, lastError);
          return serverError();
        }

        if (!providerEntry) {
          currentServiceIndex = (selected.index + 1) % services.length;
        }

        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [Req: ${requestId}] ?? Provider: ${selected.service.name} | model: ${model}`);
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
