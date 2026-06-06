import type { AiProvider, TaskExtraction } from "@/lib/domain/types";
import {
  TASK_EXTRACTION_JSON_SCHEMA,
  taskExtractionSchema,
} from "@/lib/ai/schema";

export class ProviderCallError extends Error {
  constructor(
    public readonly provider: AiProvider,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

type ProviderRequest = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

async function parseResponse(
  provider: AiProvider,
  response: Response,
): Promise<unknown> {
  const bodyText = await response.text();
  if (!response.ok) {
    let detail = bodyText.slice(0, 300);
    try {
      const body = JSON.parse(bodyText) as {
        error?: { message?: string };
        message?: string;
      };
      detail = body.error?.message || body.message || detail;
    } catch {
      // Keep the bounded raw response when a provider does not return JSON.
    }
    throw new ProviderCallError(
      provider,
      `${provider} request failed: ${detail}`,
      response.status,
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new ProviderCallError(
      provider,
      `${provider} returned a non-JSON response.`,
      response.status,
    );
  }
}

function parseTaskExtraction(
  provider: AiProvider,
  rawText: string | undefined,
): TaskExtraction {
  if (!rawText) {
    throw new ProviderCallError(provider, `${provider} returned empty output.`);
  }

  try {
    return taskExtractionSchema.parse(JSON.parse(rawText));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON";
    throw new ProviderCallError(
      provider,
      `${provider} output failed schema validation: ${detail.slice(0, 300)}`,
    );
  }
}

async function callOpenAi(request: ProviderRequest): Promise<TaskExtraction> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: request.system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: request.user }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meeting_task_extraction",
          strict: true,
          schema: TASK_EXTRACTION_JSON_SCHEMA,
        },
      },
      max_output_tokens: 8000,
    }),
    signal: request.signal,
  });
  const body = (await parseResponse("openai", response)) as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
  return parseTaskExtraction("openai", text);
}

async function callGemini(request: ProviderRequest): Promise<TaskExtraction> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const model = encodeURIComponent(request.model);
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": request.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: request.system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: request.user }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: TASK_EXTRACTION_JSON_SCHEMA,
        },
      }),
      signal: request.signal,
    },
  );
  const body = (await parseResponse("gemini", response)) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("");
  return parseTaskExtraction("gemini", text);
}

async function callClaude(request: ProviderRequest): Promise<TaskExtraction> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 8000,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      output_config: {
        format: {
          type: "json_schema",
          schema: TASK_EXTRACTION_JSON_SCHEMA,
        },
      },
    }),
    signal: request.signal,
  });
  const body = (await parseResponse("claude", response)) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content
    ?.filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("");
  return parseTaskExtraction("claude", text);
}

export async function callAiProvider(
  request: ProviderRequest,
): Promise<TaskExtraction> {
  switch (request.provider) {
    case "openai":
      return callOpenAi(request);
    case "gemini":
      return callGemini(request);
    case "claude":
      return callClaude(request);
  }
}
