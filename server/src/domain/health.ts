import { AGENTS, allAgents } from './agents';
import type { Database, AgentMetrics, Issue, TestRecord } from './types';

const RECENT_WINDOW = 10;

const round = (value: number) => Math.round(value);

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export function statusFor(health: number): AgentMetrics['status'] {
  if (health >= 90) return 'Healthy';
  if (health >= 80) return 'Needs attention';
  return 'At risk';
}

export function agentTests(db: Database, agentId: string): TestRecord[] {
  return db.tests
    .filter((test) => test.agentId === agentId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function agentMetrics(db: Database, agentId: string): AgentMetrics | null {
  const recent = agentTests(db, agentId).slice(0, RECENT_WINDOW);
  if (recent.length === 0) return null;

  const accuracy = average(recent.map((test) => test.scores.accuracy));
  const safety = average(recent.map((test) => test.scores.safety));
  const reliability = average(recent.map((test) => test.scores.reliability));
  const passRate =
    (recent.filter((test) => test.passed).length / recent.length) * 100;

  const health = round(accuracy * 0.35 + safety * 0.3 + reliability * 0.2 + passRate * 0.15);
  const all = agentTests(db, agentId);

  return {
    health,
    status: statusFor(health),
    accuracy: round(accuracy),
    safety: round(safety),
    reliability: round(reliability),
    costPerTask:
      Math.round(average(all.map((test) => test.costUsd)) * 1000) / 1000,
    avgResponseMs: round(average(all.map((test) => test.latencyMs))),
    testCount: all.length,
    failureCount: all.filter((test) => !test.passed).length,
  };
}

export type Overview = {
  calibrating: boolean;
  calibrationProgress: { done: number; total: number };
  health: number | null;
  statusLine: string;
  statusTone: 'good' | 'fair' | 'risk';
  metrics: {
    reliability: number | null;
    safety: number | null;
    accuracy: number | null;
    costPerTask: number | null;
  };
  attention: Issue[];
  issueCount: number;
  totalTests: number;
  passedTests: number;
  calibratedAt: number | null;
};

export function buildOverview(
  db: Database,
  progress: { done: number; total: number },
): Overview {
  const agents = allAgents();
  const withData = agents
    .map((agent) => ({ agent, metrics: agentMetrics(db, agent.id) }))
    .filter((entry): entry is { agent: (typeof agents)[number]; metrics: AgentMetrics } =>
      Boolean(entry.metrics),
    );

  const ready =
    AGENTS.every((agent) => agentMetrics(db, agent.id) !== null) &&
    db.calibratedAt !== null;
  const calibrating = !ready || progress.total > 0;

  const recent = [...db.tests].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  const attention = [...db.issues]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.createdAt - a.createdAt)
    .slice(0, 3);

  const health =
    withData.length > 0 ? round(average(withData.map((entry) => entry.metrics.health))) : null;

  const issues = db.issues.length;
  const statusLine = health === null
    ? 'Calibrating agents with a first round of tests'
    : issues === 0
      ? health >= 85
        ? 'Excellent — no open issues'
        : `Stable — no open issues yet`
      : health >= 85
        ? `Good — but ${issues} ${issues === 1 ? 'issue needs' : 'issues need'} attention`
        : health >= 70
          ? `Fair — ${issues} ${issues === 1 ? 'issue needs' : 'issues need'} attention`
          : `At risk — ${issues} ${issues === 1 ? 'issue needs' : 'issues need'} attention`;

  return {
    calibrating,
    calibrationProgress: progress,
    health,
    statusLine,
    statusTone: (health !== null && health < 80 ? 'risk' : health !== null && health < 85 ? 'fair' : 'good'),
    metrics: {
      reliability:
        withData.length > 0 ? round(average(withData.map((entry) => entry.metrics.reliability))) : null,
      safety:
        withData.length > 0 ? round(average(withData.map((entry) => entry.metrics.safety))) : null,
      accuracy:
        withData.length > 0 ? round(average(withData.map((entry) => entry.metrics.accuracy))) : null,
      costPerTask:
        recent.length > 0
          ? Math.round(average(recent.map((test) => test.costUsd)) * 1000) / 1000
          : null,
    },
    attention,
    issueCount: db.issues.length,
    totalTests: db.tests.length,
    passedTests: db.tests.filter((test) => test.passed).length,
    calibratedAt: db.calibratedAt,
  };
}

export function severityRank(severity: Issue['severity']): number {
  return severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
}
