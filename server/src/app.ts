import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import { agentById, allAgents, AGENT_STATUSES } from './domain/agents';
import {
  agentMetrics,
  agentTests,
  buildOverview,
  scoredTests,
  severityRank,
} from './domain/health';
import {
  calibrationState,
  runCalibration,
  runTest,
  TestExecutionError,
} from './domain/baseline';
import { diagnoseConnection, isValidHttpUrl, redactCredentials } from './ai/connection';
import { store } from './store/store';
import type { LLMAdapter } from './ai/adapter';
import { testStatusOf, type TestRecord } from './domain/types';

type Env = { Variables: { adapter: LLMAdapter } };

const DIST_DIR = join(import.meta.dir, '..', '..', 'web', 'dist');

function serveIndex(): Response {
  const file = join(DIST_DIR, 'index.html');
  if (!existsSync(file)) {
    return new Response(
      'The Silex interface has not been built yet. Run: bun run build',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }
  return new Response(readFileSync(file), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

const createTestInput = (body: unknown): { agentId: string; scenario: string } => {
  const record = (body ?? {}) as { agentId?: unknown; scenario?: unknown };
  const agentId = typeof record.agentId === 'string' ? record.agentId.trim() : '';
  const scenario = typeof record.scenario === 'string' ? record.scenario.trim() : '';
  if (!agentById(agentId)) throw new Error('Choose a valid agent.');
  if (scenario.length < 10) {
    throw new Error('Describe the scenario in at least 10 characters.');
  }
  if (scenario.length > 1200) {
    throw new Error('Keep the scenario under 1200 characters.');
  }
  return { agentId, scenario };
};

type AgentInput = { name: string; purpose: string; connection: string };

const isInputError = (
  value: AgentInput | { error: string },
): value is { error: string } => 'error' in value;

function validateAgentBody(body: unknown): AgentInput | { error: string } {
  const record = (body ?? {}) as { name?: unknown; purpose?: unknown; connection?: unknown };
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const purpose = typeof record.purpose === 'string' ? record.purpose.trim() : '';
  const connection =
    typeof record.connection === 'string' ? record.connection.trim() : '';
  if (name.length < 2 || name.length > 60) {
    return { error: 'Enter an agent name of 2 to 60 characters.' };
  }
  if (purpose.length < 3 || purpose.length > 200) {
    return { error: 'Describe the purpose in 3 to 200 characters.' };
  }
  if (connection && !isValidHttpUrl(connection)) {
    return {
      error:
        'Enter a valid connection URL starting with http:// or https://, or leave it empty to use the local engine.',
    };
  }
  return { name, purpose, connection };
}

async function probeConnection(url: string): Promise<string | null> {
  const safeUrl = redactCredentials(url);
  const diagnostic = await diagnoseConnection(url);
  const failed = diagnostic.steps.find((step) => !step.ok);
  if (!failed) return null;
  return `${failed.detail} (${safeUrl})`;
}

const presentTest = (test: TestRecord): TestRecord => {
  const agent = agentById(test.agentId);
  return {
    ...test,
    status: testStatusOf(test),
    engine: test.engine ?? (agent?.connection ? 'external' : 'local'),
    agentName: test.agentName ?? agent?.name ?? 'Removed agent',
    error: test.error ?? null,
  };
};

export function createApp(adapter: LLMAdapter) {
  const app = new Hono<Env>();

  app.use('/api/*', async (context, next) => {
    context.set('adapter', adapter);
    await next();
  });

  app.get('/api/status', async (context) => {
    const llm = await adapter.status();
    return context.json({ llm, calibration: calibrationState() });
  });

  app.get('/api/overview', (context) => {
    const overview = buildOverview(store.read(), calibrationState());
    return context.json(overview);
  });

  const agentStatus = (
    db: ReturnType<typeof store.read>,
    agent: { id: string; custom?: boolean },
  ): string => {
    const metrics = agentMetrics(db, agent.id);
    if (metrics) return metrics.status;
    return agent.custom ? AGENT_STATUSES.ready : AGENT_STATUSES.calibrating;
  };

  app.get('/api/agents', (context) => {
    const db = store.read();
    const items = allAgents().map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      connection: redactCredentials(agent.connection ?? ''),
      engine: agent.connection ? ('external' as const) : ('local' as const),
      metrics: agentMetrics(db, agent.id),
      status: agentStatus(db, agent),
    }));
    return context.json({ items });
  });

  app.post('/api/agents', async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'The request body could not be read.' }, 400);
    }
    const input = validateAgentBody(body);
    if (isInputError(input)) return context.json({ error: input.error }, 400);
    if (input.connection) {
      const probeError = await probeConnection(input.connection);
      if (probeError) return context.json({ error: probeError }, 400);
    }
    const agent = {
      id: `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name: input.name,
      purpose: input.purpose,
      connection: input.connection,
      createdAt: Date.now(),
    };
    store.addCustomAgent(agent);
    return context.json(
      {
        item: {
          id: agent.id,
          name: agent.name,
          role: 'Custom',
          description: agent.purpose,
          metrics: null,
          status: AGENT_STATUSES.ready,
        },
      },
      201,
    );
  });

  app.get('/api/agents/:id', (context) => {
    const agent = agentById(context.req.param('id'));
    if (!agent) return context.json({ error: 'Agent not found.' }, 404);
    const db = store.read();
    const recent = agentTests(db, agent.id).slice(0, 5).map(presentTest);
    return context.json({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      connection: redactCredentials(agent.connection ?? ''),
      engine: agent.connection ? 'external' : 'local',
      metrics: agentMetrics(db, agent.id),
      status: agentStatus(db, agent),
      recentTests: recent,
      recentFailures: scoredTests(agentTests(db, agent.id))
        .filter((test) => !test.passed)
        .slice(0, 3)
        .map(presentTest),
    });
  });

  app.patch('/api/agents/:id', async (context) => {
    const id = context.req.param('id');
    const agent = agentById(id);
    if (!agent) return context.json({ error: 'Agent not found.' }, 404);

    let body: Record<string, unknown>;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'The request body could not be read.' }, 400);
    }

    const existingConnection = agent.connection ?? '';
    let nextConnection = existingConnection;
    if (body.connection !== undefined) {
      const raw = typeof body.connection === 'string' ? body.connection.trim() : '';
      nextConnection =
        existingConnection && raw === redactCredentials(existingConnection)
          ? existingConnection
          : raw;
    }
    const merged = {
      name: body.name !== undefined ? body.name : agent.name,
      purpose: body.purpose !== undefined ? body.purpose : agent.description,
      connection: nextConnection,
    };
    const input = validateAgentBody(merged);
    if (isInputError(input)) return context.json({ error: input.error }, 400);
    const connectionChanged = input.connection !== existingConnection;
    if (input.connection && connectionChanged) {
      const probeError = await probeConnection(input.connection);
      if (probeError) return context.json({ error: probeError }, 400);
    }

    if (agent.custom) {
      const updated = store.updateCustomAgent(id, input);
      if (!updated) return context.json({ error: 'Agent not found.' }, 404);
    } else {
      store.setAgentOverride(id, input);
    }

    const db = store.read();
    const current = agentById(id)!;
    return context.json({
      item: {
        id: current.id,
        name: current.name,
        role: current.role,
        description: current.description,
        connection: redactCredentials(current.connection ?? ''),
        engine: current.connection ? 'external' : 'local',
        metrics: agentMetrics(db, current.id),
        status: agentStatus(db, current),
      },
    });
  });

  app.post('/api/agents/:id/diagnose', async (context) => {
    const agent = agentById(context.req.param('id'));
    if (!agent) return context.json({ error: 'Agent not found.' }, 404);

    if (agent.connection) {
      const diagnostic = await diagnoseConnection(agent.connection);
      return context.json({ engine: 'external' as const, ...diagnostic });
    }

    const status = await context.get('adapter').status();
    return context.json({
      engine: 'local' as const,
      ok: status.available,
      url: '',
      steps: [
        {
          name: 'Local model engine',
          ok: status.available,
          detail: status.detail,
        },
      ],
    });
  });

  app.delete('/api/agents/:id', (context) => {
    const id = context.req.param('id');
    const agent = agentById(id);
    if (!agent) return context.json({ error: 'Agent not found.' }, 404);
    if (agent.custom) {
      const removed = store.removeCustomAgent(id);
      if (!removed) return context.json({ error: 'Agent not found.' }, 404);
    } else {
      store.hideAgent(id);
    }
    return context.json({ ok: true });
  });

  app.get('/api/tests', (context) => {
    const agentId = context.req.query('agentId');
    const db = store.read();
    const items = db.tests
      .filter((test) => !agentId || test.agentId === agentId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 25)
      .map(presentTest);
    return context.json({ items });
  });

  app.post('/api/tests', async (context) => {
    let input: { agentId: string; scenario: string };
    try {
      input = createTestInput(await context.req.json());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The request could not be read.';
      return context.json({ error: message, stage: 'request' }, 400);
    }

    const agent = agentById(input.agentId)!;
    try {
      const { record, issue } = await runTest(
        context.get('adapter'),
        agent,
        input.scenario,
      );
      return context.json({ test: presentTest(record), issue }, 201);
    } catch (error) {
      if (error instanceof TestExecutionError) {
        console.error(
          `[silex] test ${error.stage} failure for agent "${agent.name}":`,
          error.message,
        );
        return context.json(
          {
            error: error.message,
            stage: error.stage,
            test: presentTest(error.record),
          },
          503,
        );
      }
      const message =
        error instanceof Error ? error.message : 'The test could not be completed.';
      console.error(`[silex] test failed for agent "${agent.name}":`, message);
      return context.json({ error: message, stage: 'execution' }, 503);
    }
  });

  app.get('/api/issues', (context) => {
    const items = store
      .listIssues()
      .sort(
        (a, b) =>
          severityRank(b.severity) - severityRank(a.severity) || b.createdAt - a.createdAt,
      );
    return context.json({ items, total: items.length });
  });

  app.get('/api/issues/:id', (context) => {
    const issue = store.listIssues().find((item) => item.id === context.req.param('id'));
    if (!issue) return context.json({ error: 'Issue not found.' }, 404);
    const test = store.read().tests.find((item) => item.id === issue.testId);
    return context.json({ issue, test: test ? presentTest(test) : null });
  });

  app.post('/api/calibrate', async (context) => {
    const state = calibrationState();
    if (state.running) return context.json({ calibration: state }, 202);
    void runCalibration(context.get('adapter'));
    return context.json({ calibration: calibrationState() }, 202);
  });

  app.use('*', async (context, next) => {
    const pathname = new URL(context.req.url).pathname;
    if (pathname.startsWith('/api/')) return next();
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return next();
    }
    const candidate = resolve(DIST_DIR, `.${decoded}`);
    if (!candidate.startsWith(DIST_DIR)) return next();
    try {
      if (statSync(candidate).isFile()) {
        const file = Bun.file(candidate);
        return new Response(file, {
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'cache-control': pathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          },
        });
      }
    } catch {
      // fall through to SPA index
    }
    return next();
  });

  app.notFound((context) => {
    if (context.req.path.startsWith('/api/')) {
      return context.json({ error: 'Not found.' }, 404);
    }
    return serveIndex();
  });

  app.onError((error, context) => {
    console.error('request failed', error);
    return context.json(
      { error: 'The request could not be completed.' },
      500,
    );
  });

  return app;
}

