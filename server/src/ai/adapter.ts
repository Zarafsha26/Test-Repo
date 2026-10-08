import { spawn } from 'node:child_process';

export type ChatInput = {
  system?: string;
  prompt: string;
};

export type ChatResult = {
  text: string;
  tokens: number;
  latencyMs: number;
};

export interface LLMAdapter {
  readonly name: string;
  status(): Promise<{ available: boolean; detail: string }>;
  chat(input: ChatInput): Promise<ChatResult>;
}

type OpenCodeMessage = {
  info?: {
    tokens?: { total?: number };
    time?: { created?: number; completed?: number };
  };
  parts?: Array<{ type?: string; text?: string }>;
};

const HOST = process.env.SILEX_LLM_HOST ?? '127.0.0.1';
const PORT = Number(process.env.SILEX_LLM_PORT ?? '4571');
const BASE_URL = process.env.SILEX_LLM_URL ?? `http://${HOST}:${PORT}`;
const PROVIDER_ID = process.env.SILEX_LLM_PROVIDER ?? 'opencode';
const MODEL_ID = process.env.SILEX_LLM_MODEL ?? 'mimo-v2.6-flash-free';
const CALL_TIMEOUT_MS = Number(process.env.SILEX_LLM_TIMEOUT_MS ?? '90000');
const ENDPOINT_TIMEOUT_MS = Number(process.env.SILEX_ENDPOINT_TIMEOUT_MS ?? '60000');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureRuntime(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/global/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) return true;
  } catch {
    // not running yet
  }

  const child = spawn(
    'setsid',
    [
      'opencode',
      'serve',
      '--port',
      String(PORT),
      '--hostname',
      HOST,
    ],
    {
      stdio: 'ignore',
      detached: true,
    },
  );
  child.on('error', () => undefined);
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(500);
    try {
      const response = await fetch(`${BASE_URL}/global/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return true;
    } catch {
      // keep waiting
    }
  }
  return false;
}

export class OpenCodeAdapter implements LLMAdapter {
  readonly name = 'local';

  private ready = false;

  async status() {
    const up = await ensureRuntime();
    this.ready = up;
    return {
      available: up,
      detail: up ? 'Connected to local runtime' : 'Local runtime unavailable',
    };
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    if (!this.ready) {
      this.ready = await ensureRuntime();
      if (!this.ready) {
        throw new Error('The local model runtime is unavailable.');
      }
    }

    const started = Date.now();

    const sessionResponse = await fetch(`${BASE_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'silex' }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!sessionResponse.ok) {
      throw new Error('Could not open a session with the local runtime.');
    }
    const session = (await sessionResponse.json()) as { id: string };

    const messageResponse = await fetch(
      `${BASE_URL}/session/${session.id}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: { providerID: PROVIDER_ID, modelID: MODEL_ID },
          ...(input.system ? { system: input.system } : {}),
          tools: {},
          parts: [{ type: 'text', text: input.prompt }],
        }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
    );
    if (!messageResponse.ok) {
      const body = (await messageResponse.text()).slice(0, 300);
      throw new Error(`The local model returned an error: ${body}`);
    }

    const payload = (await messageResponse.json()) as OpenCodeMessage;
    const text = (payload.parts ?? [])
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('The local model returned an empty response.');
    }

    return {
      text,
      tokens: payload.info?.tokens?.total ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

export function createAdapter(): LLMAdapter {
  return new OpenCodeAdapter();
}

const ENDPOINT_KEYS = ['response', 'reply', 'text', 'output', 'message', 'content', 'answer'];

export async function callAgentEndpoint(params: {
  connection: string;
  agentName: string;
  purpose: string;
  prompt: string;
}): Promise<ChatResult> {
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(params.connection, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: params.prompt,
        agent: params.agentName,
        purpose: params.purpose,
      }),
      signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Could not reach the agent endpoint. Check the connection URL.');
  }
  if (!response.ok) {
    throw new Error(`The agent endpoint responded with an error (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let text = '';
  if (contentType.includes('application/json')) {
    const data = (await response.json()) as Record<string, unknown>;
    const matched = ENDPOINT_KEYS.map((key) => data[key]).find(
      (value) => typeof value === 'string',
    );
    text = typeof matched === 'string' ? matched : JSON.stringify(data);
  } else {
    text = await response.text();
  }
  text = text.trim();
  if (!text) throw new Error('The agent endpoint returned an empty response.');

  return {
    text,
    tokens: Math.ceil((params.prompt.length + text.length) / 4),
    latencyMs: Date.now() - started,
  };
}
