import { describe, expect, test } from 'bun:test';
import { agentMetrics, buildOverview } from './health';
import type { Database, TestRecord } from './types';

const base = (overrides: Partial<TestRecord>): TestRecord => ({
  id: `t_${Math.random().toString(36).slice(2)}`,
  agentId: 'customer-support',
  agentName: 'Customer Support Agent',
  scenario: 'Scenario under test with enough characters',
  response: 'reply',
  scores: { accuracy: 90, safety: 90, reliability: 90, consistency: 90 },
  overall: 90,
  passed: true,
  explanation: 'ok',
  latencyMs: 1000,
  tokens: 100,
  costUsd: 0.001,
  createdAt: Date.now(),
  source: 'manual',
  issueId: null,
  status: 'completed',
  error: null,
  engine: 'local',
  ...overrides,
});

const dbWith = (tests: TestRecord[]): Database => ({
  version: 1,
  tests,
  issues: [],
  customAgents: [],
  agentOverrides: {},
  hiddenAgentIds: [],
  calibratedAt: Date.now(),
});

describe('agentMetrics', () => {
  test('excludes error runs from health and counts', () => {
    const db = dbWith([
      base({ id: 't1' }),
      base({
        id: 't2',
        status: 'error',
        passed: false,
        overall: 0,
        scores: { accuracy: 0, safety: 0, reliability: 0, consistency: 0 },
        error: { stage: 'connection', message: 'unreachable' },
      }),
    ]);
    const metrics = agentMetrics(db, 'customer-support')!;
    expect(metrics.testCount).toBe(1);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.health).toBeGreaterThan(85);
  });

  test('counts genuine failures', () => {
    const db = dbWith([
      base({ id: 't1' }),
      base({ id: 't2', passed: false, overall: 40, scores: { accuracy: 40, safety: 50, reliability: 40, consistency: 45 } }),
    ]);
    const metrics = agentMetrics(db, 'customer-support')!;
    expect(metrics.testCount).toBe(2);
    expect(metrics.failureCount).toBe(1);
  });

  test('returns null when only error runs exist', () => {
    const db = dbWith([
      base({ id: 't1', status: 'error', passed: false }),
    ]);
    expect(agentMetrics(db, 'customer-support')).toBeNull();
  });
});

describe('buildOverview', () => {
  test('excludes error runs from totals and pass counts', () => {
    const db = dbWith([
      base({ id: 't1' }),
      base({ id: 't2', passed: false }),
      base({ id: 't3', status: 'error', passed: false }),
    ]);
    const overview = buildOverview(db, { done: 0, total: 0 });
    expect(overview.totalTests).toBe(2);
    expect(overview.passedTests).toBe(1);
  });
});
