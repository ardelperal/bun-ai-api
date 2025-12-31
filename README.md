# Bun AI API (OpenAI-compatible)

Servicio en Bun que rota proveedores y expone endpoints compatibles con OpenAI para usar desde editores como Continue, JetBrains o Cursor.

## Requisitos
- Bun 1.x
- Claves de proveedor (segun el servicio que vayas a usar): `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`

## Variables de entorno
- `API_KEY`: clave para autenticar `/v1/*` (debe estar en `.env`).
- `OPENAI_API_KEY`: fallback si no existe `API_KEY`.
- `BUN_AI_API_KEY`: fallback adicional si no existe `API_KEY` (para reutilizar tu key actual).
- `MODELS`: lista CSV de modelos disponibles (ej: `mi-modelo-chat,mi-modelo-2`).
- `PORT`: puerto del servidor (default `3000`).
- `BUN_AI_API_KEY`: clave para el endpoint legacy `/chat` (no OpenAI-compatible).
- `API_TIMEOUT_SECONDS`: timeout (segundos) usado por el script `verify:openai` (default `60`).

## Endpoints OpenAI-compatible
- `GET /v1/models`
- `POST /v1/chat/completions`

Todos los endpoints `/v1/*` requieren `Authorization: Bearer <API_KEY>`.

### Ejemplos curl
```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/v1/models
```

```bash
curl -s -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mi-modelo-chat",
    "messages": [
      { "role": "system", "content": "Eres un asistente util." },
      { "role": "user", "content": "Dame una frase corta." }
    ]
  }' \
  http://localhost:3000/v1/chat/completions
```

```bash
# Streaming (SSE)
curl -N -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mi-modelo-chat",
    "messages": [{ "role": "user", "content": "Hola" }],
    "stream": true
  }' \
  http://localhost:3000/v1/chat/completions
```

## Configuracion en Continue (VS Code)
```json
{
  "models": [
    {
      "title": "Bun AI API",
      "provider": "openai",
      "model": "mi-modelo-chat",
      "apiBase": "http://localhost:3000/v1",
      "apiKey": "TU_API_KEY"
    }
  ]
}
```

## Configuracion OpenAI-compatible en JetBrains
- Provider: OpenAI-compatible
- Base URL: `http://localhost:3000/v1`
- API key: `TU_API_KEY`
- Model: `mi-modelo-chat`

## Verificacion rapida
Con el servidor levantado:
```bash
API_KEY=tu_clave API_TIMEOUT_SECONDS=120 bun run verify:openai
```

## Seguridad
No expongas tu API key en clientes publicos o repositorios.
