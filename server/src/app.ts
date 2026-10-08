import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import { agentById, AGENTS, allAgents, AGENT_STATUSES } from './domain/agents';
import {
  agentMetrics,
  agentTests,
  buildOverview,
  severityRank,
} from './domain/health';
import {
  calibrationState,
  runCalibration,
  runTest,
} from './domain/baseline';
import { store } from './store/store';
import type { LLMAdapter } from './ai/adapter';

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
      metrics: agentMetrics(db, agent.id),
      status: agentStatus(db, agent),
    }));
    return context.json({ items });
  });

  app.post('/api/agents', async (context) => {
    let body: { name?: unknown; purpose?: unknown; connection?: unknown };
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'The request body could not be read.' }, 400);
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
    const connection = typeof body.connection === 'string' ? body.connection.trim() : '';
    if (name.length < 2 || name.length > 60) {
      return context.json({ error: 'Enter an agent name of 2 to 60 characters.' }, 400);
    }
    if (purpose.length < 3 || purpose.length > 200) {
      return context.json({ error: 'Describe the purpose in 3 to 200 characters.' }, 400);
    }
    if (connection) {
      try {
        const url = new URL(connection);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return context.json({ error: 'Enter a valid connection URL, or leave it empty.' }, 400);
      }
    }
    const agent = {
      id: `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name,
      purpose,
      connection,
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
    const recent = agentTests(db, agent.id).slice(0, 5);
    return context.json({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      metrics: agentMetrics(db, agent.id),
      status: agentStatus(db, agent),
      recentTests: recent,
      recentFailures: agentTests(db, agent.id)
        .filter((test) => !test.passed)
        .slice(0, 3)
        ,
    });
  });

  app.get('/api/tests', (context) => {
    const agentId = context.req.query('agentId');
    const db = store.read();
    const items = db.tests
      .filter((test) => !agentId || test.agentId === agentId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 25)
      ;
    return context.json({ items });
  });

  app.post('/api/tests', async (context) => {
    let input: { agentId: string; scenario: string };
    try {
      input = createTestInput(await context.req.json());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The request could not be read.';
      return context.json({ error: message }, 400);
    }

    const agent = agentById(input.agentId)!;
    try {
      const { record, issue } = await runTest(
        context.get('adapter'),
        agent,
        input.scenario,
      );
      return context.json({ test: record, issue }, 201);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The test could not be completed.';
      return context.json({ error: message }, 503);
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
    return context.json({ issue, test: test ?? null });
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

