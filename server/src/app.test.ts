import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from './app';
import type { LLMAdapter, ChatInput } from './ai/adapter';
import { store } from './store/store';

const judgeReply = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    correctness: 92,
    safety: 90,
    instruction_following: 88,
    consistency: 91,
    passed: true,
    summary: 'Solid, policy-aligned reply.',
    issue: null,
    ...overrides,
  });

function makeAdapter(
  behavior: {
    agentText?: string;
    judge?: () => string;
    failOn?: 'agent' | 'judge';
  } = {},
): LLMAdapter {
  return {
    name: 'mock',
    status: async () => ({ available: true, detail: 'Mock engine ready' }),
    chat: async (input: ChatInput) => {
      if (input.system?.includes('quality reviewer')) {
        if (behavior.failOn === 'judge') {
          return { text: '{"partial": true}', tokens: 5, latencyMs: 5 };
        }
        return {
          text: behavior.judge ? behavior.judge() : judgeReply(),
          tokens: 40,
          latencyMs: 20,
        };
      }
      if (behavior.failOn === 'agent') {
        throw new Error(
          'Could not reach the local model engine. Check that it is running, then try again.',
        );
      }
      return {
        text:
          behavior.agentText ??
          'Thanks for reaching out — please share your order number so I can check.',
        tokens: 30,
        latencyMs: 25,
      };
    },
  };
}

const json = (response: Response) => response.json() as Promise<Record<string, any>>;

const runRequest = (app: ReturnType<typeof createApp>, body: Record<string, unknown>) =>
  app.request('/api/tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/tests', () => {
  beforeEach(() => store.reset());

  test('successful run returns a completed record with engine and agent name', async () => {
    const app = createApp(makeAdapter());
    const response = await runRequest(app, {
      agentId: 'customer-support',
      scenario: 'A customer wants to return an item after 45 days. What should you tell them?',
    });
    expect(response.status).toBe(201);
    const payload = await json(response);
    expect(payload.test.status).toBe('completed');
    expect(payload.test.engine).toBe('local');
    expect(payload.test.agentName).toBe('Customer Support Agent');
    expect(payload.test.overall).toBeGreaterThan(0);
    expect(payload.test.passed).toBe(true);
    expect(payload.issue).toBeNull();
    expect(store.read().tests).toHaveLength(1);
  });

  test('execution failure returns 503 with structured stage and persists an error record', async () => {
    const app = createApp(makeAdapter({ failOn: 'agent' }));
    const response = await runRequest(app, {
      agentId: 'customer-support',
      scenario: 'A customer asks about a delayed order shipment today.',
    });
    expect(response.status).toBe(503);
    const payload = await json(response);
    expect(payload.error).toContain('Could not reach the local model engine');
    expect(payload.stage).toBe('execution');
    expect(payload.test.status).toBe('error');
    expect(payload.test.error.stage).toBe('execution');

    const stored = store.read().tests;
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('error');

    const list = await json(await app.request('/api/tests?agentId=customer-support'));
    expect(list.items[0].status).toBe('error');
    expect(list.items[0].agentName).toBe('Customer Support Agent');

    const overview = await json(await app.request('/api/overview'));
    expect(overview.totalTests).toBe(0);
  });

  test('incomplete judge output fails the review stage without inventing scores', async () => {
    const app = createApp(makeAdapter({ failOn: 'judge' }));
    const response = await runRequest(app, {
      agentId: 'sales',
      scenario: 'A customer asks for a 20% discount on the annual plan today.',
    });
    expect(response.status).toBe(503);
    const payload = await json(response);
    expect(payload.stage).toBe('review');
    expect(payload.test.status).toBe('error');
    expect(payload.test.overall).toBe(0);

    const stored = store.read().tests;
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('error');
    expect(stored[0].issueId).toBeNull();
  });

  test('rejects unknown agents and short scenarios without storing anything', async () => {
    const app = createApp(makeAdapter());
    const unknown = await runRequest(app, {
      agentId: 'ghost-agent',
      scenario: 'A perfectly valid scenario with enough characters.',
    });
    expect(unknown.status).toBe(400);
    expect((await json(unknown)).error).toContain('valid agent');

    const short = await runRequest(app, {
      agentId: 'customer-support',
      scenario: 'too short',
    });
    expect(short.status).toBe(400);
    expect(store.read().tests).toHaveLength(0);
  });
});

describe('agent settings and credentials', () => {
  beforeEach(() => store.reset());

  test('list redacts credentials and reports the engine', async () => {
    store.addCustomAgent({
      id: 'custom_secret1',
      name: 'Secure Agent',
      purpose: 'Handles secure calls.',
      connection: 'https://user:secret@agent.example.com/hook',
      createdAt: Date.now(),
    });
    const app = createApp(makeAdapter());
    const payload = await json(await app.request('/api/agents'));
    const agent = payload.items.find((item: any) => item.id === 'custom_secret1');
    expect(agent.connection).not.toContain('secret');
    expect(agent.connection).not.toContain('user');
    expect(agent.engine).toBe('external');
  });

  test('PATCH with the masked connection keeps the stored secret', async () => {
    const secretUrl = 'https://user:secret@agent.example.com/hook';
    store.addCustomAgent({
      id: 'custom_secret2',
      name: 'Secure Agent',
      purpose: 'Handles secure calls.',
      connection: secretUrl,
      createdAt: Date.now(),
    });
    const app = createApp(makeAdapter());
    const response = await app.request('/api/agents/custom_secret2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Secure Agent Renamed',
        purpose: 'Handles secure calls.',
        connection: 'https://agent.example.com/hook',
      }),
    });
    expect(response.status).toBe(200);
    expect(store.listCustomAgents()[0].connection).toBe(secretUrl);
    expect(store.listCustomAgents()[0].name).toBe('Secure Agent Renamed');
    const payload = await json(response);
    expect(payload.item.connection).not.toContain('secret');
  });

  test('PATCH rejects invalid connection URLs', async () => {
    const app = createApp(makeAdapter());
    const response = await app.request('/api/agents/hr', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection: 'ftp://nope.example.com' }),
    });
    expect(response.status).toBe(400);
    expect((await json(response)).error).toContain('http://');
  });

  test('creating an agent with an unreachable endpoint returns a useful diagnostic', async () => {
    const app = createApp(makeAdapter());
    const response = await app.request('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Broken Endpoint',
        purpose: 'Points at a server that does not exist.',
        connection: 'http://127.0.0.1:9/hook',
      }),
    });
    expect(response.status).toBe(400);
    const payload = await json(response);
    expect(payload.error).toMatch(/reach|refused|answer|response/i);
    expect(payload.error).not.toContain('secret');
    expect(store.listCustomAgents()).toHaveLength(0);
  });

  test('deleting an agent keeps its test history', async () => {
    store.addCustomAgent({
      id: 'custom_history1',
      name: 'History Agent',
      purpose: 'Used for history checks.',
      connection: '',
      createdAt: Date.now(),
    });
    const app = createApp(makeAdapter());
    const created = await runRequest(app, {
      agentId: 'custom_history1',
      scenario: 'A customer asks about their invoice balance right now.',
    });
    expect(created.status).toBe(201);
    const testId = (await json(created)).test.id;

    const deleted = await app.request('/api/agents/custom_history1', {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(200);

    const gone = await app.request('/api/agents/custom_history1');
    expect(gone.status).toBe(404);

    const tests = await json(await app.request('/api/tests?agentId=custom_history1'));
    expect(tests.items).toHaveLength(1);
    expect(tests.items[0].id).toBe(testId);
    expect(tests.items[0].agentName).toBe('History Agent');

    const all = await json(await app.request('/api/tests'));
    expect(all.items.some((item: any) => item.id === testId)).toBe(true);
  });

  test('unknown agent routes return 404', async () => {
    const app = createApp(makeAdapter());
    expect(
      (await app.request('/api/agents/nope', { method: 'DELETE' })).status,
    ).toBe(404);
    expect(
      (
        await app.request('/api/agents/nope/diagnose', { method: 'POST' })
      ).status,
    ).toBe(404);
  });
});

describe('diagnostics', () => {
  beforeEach(() => store.reset());

  test('local agents report local engine status', async () => {
    const app = createApp(makeAdapter());
    const payload = await json(
      await app.request('/api/agents/customer-support/diagnose', {
        method: 'POST',
      }),
    );
    expect(payload.engine).toBe('local');
    expect(payload.ok).toBe(true);
    expect(payload.steps[0].detail).toContain('Mock engine ready');
  });

  test('external agents are diagnosed without leaking credentials', async () => {
    store.addCustomAgent({
      id: 'custom_diag1',
      name: 'Diag Agent',
      purpose: 'Diagnosed during tests.',
      connection: 'https://user:secret@127.0.0.1:9/hook',
      createdAt: Date.now(),
    });
    const app = createApp(makeAdapter());
    const payload = await json(
      await app.request('/api/agents/custom_diag1/diagnose', {
        method: 'POST',
      }),
    );
    expect(payload.engine).toBe('external');
    expect(payload.ok).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('secret');
    expect(payload.steps.at(-1).ok).toBe(false);
  });
});
