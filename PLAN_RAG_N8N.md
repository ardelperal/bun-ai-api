# Plan de accion: Chat interno con RAG (Gemini) + n8n

## Objetivo
Crear un sistema de chat para usuarios internos que responda preguntas sobre los aplicativos del departamento usando informacion verificada. La solucion usa Vertex AI RAG Engine (Gemini) para recuperar contexto y n8n para orquestar ingestion y consultas.

## Fuentes oficiales (documentacion)
- Grounding overview (Vertex AI): https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/overview
- Ground responses using RAG: https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/ground-responses-using-rag
- Vertex AI RAG Engine overview: https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-overview
- RAG quickstart: https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-quickstart
- Grounding with Vertex AI Search (opcional): https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-vertex-ai-search

## Resumen tecnico (segun la documentacion)
- Vertex AI RAG Engine es un framework de datos para RAG, con pasos de **indexado (corpus)**, **retrieval** y **generation**. (RAG Engine overview)
- El flujo de "grounding using RAG" permite seleccionar RAG Engine como fuente de grounding y usar un corpus existente. (Ground responses using RAG)
- Grounding conecta las respuestas del modelo a fuentes verificables y reduce alucinaciones. (Grounding overview)

## Arquitectura propuesta
1) Ingestion: fuentes internas -> normalizacion -> RAG Engine (corpus)
2) Retrieval: consulta -> RAG Engine -> chunks relevantes
3) Generation: Gemini genera la respuesta con contexto
4) Entrega: respuesta final a usuarios (n8n + API OpenAI-compatible)

## Plan de accion

### 1) Descubrimiento y catalogo de fuentes
- Inventario: manuales, wikis, tickets, FAQs, intranet, repos internos.
- Clasificar por aplicativo, version, fecha y criticidad.
- Definir politicas de acceso (por area/rol).

### 2) Preparar Google Cloud / Vertex AI
- Crear proyecto y habilitar Vertex AI.
- Elegir region (ej: us-central1 o us-east4 segun disponibilidad).
- Crear un **corpus** en RAG Engine para cada dominio (ej: "ERP", "RRHH", "BI").
- Validar con el quickstart oficial (curl o Python). (RAG quickstart)

### 3) Pipeline de ingestion en n8n
Workflow "IngestaDocs":
- Trigger: Manual + Cron diario/horario.
- Nodo(s) de origen: Drive/SharePoint/Confluence/Git (segun donde viven los docs).
- Normalizacion: convertir a texto, limpiar encabezados, quitar firmas, dividir por secciones.
- Subida a RAG Engine:
  - Crear/actualizar documentos en el corpus correspondiente.
  - Guardar metadata: app_id, version, fuente, fecha.
- Registrar logs (estado, cantidad de docs, errores).

Notas:
- RAG Engine maneja indexado (corpus). (RAG Engine overview)
- Para documentos complejos, considerar el parser de layout (Document AI + Gemini). (Ground responses using RAG)

### 4) Workflow de chat en n8n
Workflow "ChatAplicativos":
- Trigger: Webhook HTTP (entrada del usuario).
- Validar input: pregunta, app_id, idioma, usuario.
- Retrieval:
  - Llamar a RAG Engine para obtener chunks relevantes del corpus.
- Generation:
  - Llamar a Gemini con grounding (RAG) o inyectar el contexto recuperado en el prompt.
  - Recomendado: usar grounding con RAG Engine como fuente. (Ground responses using RAG)
- Post-proceso:
  - Respuesta + fuentes/citas.
  - Si no hay evidencia, responder "no tengo informacion suficiente".

### 5) Integracion con esta API (OpenAI-compatible)
Opcion A (recomendada):
- n8n consulta RAG Engine y luego llama a `https://ia.romancaba.com/v1/chat/completions`
- Inyecta el contexto como `system` + `user`.
- Puedes fijar `provider: "gemini"` o dejar rotacion.

Opcion B (si usas grounding directo en Vertex AI):
- n8n llama a la API de Vertex AI para grounding con RAG Engine.
- Esta API entrega respuesta ya grounded; solo la devuelves al cliente.

### 6) Seguridad y gobierno
- Acceso por rol al corpus (por app o por area).
- Evitar PII en los documentos; enmascarar datos sensibles.
- Auditoria: guardar pregunta, respuestas, corpus y chunks usados.

### 7) QA y pruebas
- Conjunto de preguntas canonicamente correctas por aplicativo.
- Medir: cobertura, exactitud, citas, tasa de "no data".
- Test de regresion cuando se actualice documentacion.

### 8) Observabilidad
- Logging en n8n + Coolify.
- Alerts por tasa de error en retrieval/generation.
- Reporte semanal de preguntas top y gaps de documentacion.

## Entregables sugeridos
- Corpus inicial por aplicativo.
- 2 workflows n8n: `IngestaDocs`, `ChatAplicativos`.
- Prompt base con reglas de seguridad (solo responder con contexto).
- Checklist de despliegue + pruebas.

## Siguientes pasos inmediatos
1) Confirmar fuentes y formato de documentos.
2) Crear corpus en RAG Engine por dominio.
3) Construir workflow de ingestion en n8n y cargar un lote piloto.
4) Construir workflow de chat y probar con 10 preguntas reales.
5) Ajustar prompts y criterios de fallback.
