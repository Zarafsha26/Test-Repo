export type Severity = 'high' | 'medium' | 'low';
export type IssueCategory = 'accuracy' | 'safety' | 'reliability';

export type Scores = {
  accuracy: number;
  safety: number;
  reliability: number;
  consistency: number;
};

export type TestStatus = 'completed' | 'error';

export type TestEngine = 'local' | 'external';

export type TestError = {
  stage: 'connection' | 'execution' | 'review';
  message: string;
};

export type CriterionCheck = {
  criterion: string;
  met: boolean;
  evidence: string;
};

export type TestRecord = {
  id: string;
  agentId: string;
  agentName?: string;
  scenario: string;
  response: string;
  scores: Scores;
  overall: number;
  passed: boolean;
  explanation: string;
  latencyMs: number;
  tokens: number;
  costUsd: number;
  createdAt: number;
  source: 'baseline' | 'manual';
  issueId: string | null;
  status?: TestStatus;
  error?: TestError | null;
  engine?: TestEngine;
  checks?: CriterionCheck[];
};

export type Issue = {
  id: string;
  testId: string;
  agentId: string;
  agentName: string;
  severity: Severity;
  category: IssueCategory;
  title: string;
  whatHappened: string;
  expected: string;
  actual: string;
  whyItMatters: string;
  recommendation: string;
  createdAt: number;
};

export type AgentMetrics = {
  health: number;
  status: 'Healthy' | 'Needs attention' | 'At risk';
  accuracy: number;
  safety: number;
  reliability: number;
  costPerTask: number;
  avgResponseMs: number;
  testCount: number;
  failureCount: number;
};

export type AgentSummary = {
  id: string;
  name: string;
  role: string;
  description: string;
  connection?: string;
  engine?: TestEngine;
  metrics: AgentMetrics | null;
  status?: string;
};

export type AgentDetail = AgentSummary & {
  recentTests: TestRecord[];
  recentFailures: TestRecord[];
  status?: string;
};

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

export type Status = {
  llm: { available: boolean; detail: string };
  calibration: { done: number; total: number; running: boolean };
};

export type DiagnosticStep = {
  name: string;
  ok: boolean;
  detail: string;
};

export type ConnectionDiagnostic = {
  engine: TestEngine;
  ok: boolean;
  url: string;
  steps: DiagnosticStep[];
};

export class ApiError extends Error {
  status: number;
  stage?: string;
  test?: TestRecord;
  constructor(
    message: string,
    status: number,
    extra?: { stage?: string; test?: TestRecord },
  ) {
    super(message);
    this.status = status;
    this.stage = extra?.stage;
    this.test = extra?.test;
  }
}

const RUN_TEST_TIMEOUT_MS = 150_000;

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
  } catch (error) {
    if (timeoutMs && (error as Error)?.name === 'TimeoutError') {
      const seconds = Math.round(timeoutMs / 1000);
      throw new ApiError(
        `The test timed out after ${seconds} second${seconds === 1 ? '' : 's'}. The local engine may be busy — try running it again.`,
        0,
      );
    }
    throw new ApiError('Cannot reach Silex. Is the server running?', 0);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload as {
      error?: string;
      stage?: string;
      test?: TestRecord;
    };
    throw new ApiError(details.error ?? 'Something went wrong.', response.status, {
      stage: details.stage,
      test: details.test,
    });
  }
  return payload as T;
}

export const api = {
  status: () => request<Status>('/api/status'),
  overview: () => request<Overview>('/api/overview'),
  agents: () => request<{ items: AgentSummary[] }>('/api/agents'),
  createAgent: (input: { name: string; purpose: string; connection: string }) =>
    request<{ item: AgentSummary }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateAgent: (
    id: string,
    input: { name: string; purpose: string; connection: string },
  ) =>
    request<{ item: AgentSummary }>(`/api/agents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  removeAgent: (id: string) =>
    request<{ ok: boolean }>(`/api/agents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  agent: (id: string) => request<AgentDetail>(`/api/agents/${id}`),
  diagnose: (id: string) =>
    request<ConnectionDiagnostic>(
      `/api/agents/${encodeURIComponent(id)}/diagnose`,
      { method: 'POST' },
      15_000,
    ),
  tests: (agentId?: string) =>
    request<{ items: TestRecord[] }>(
      `/api/tests${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`,
    ),
  runTest: (agentId: string, scenario: string) =>
    request<{ test: TestRecord; issue: Issue | null }>(
      '/api/tests',
      {
        method: 'POST',
        body: JSON.stringify({ agentId, scenario }),
      },
      RUN_TEST_TIMEOUT_MS,
    ),
  issues: () => request<{ items: Issue[]; total: number }>('/api/issues'),
  issue: (id: string) =>
    request<{ issue: Issue; test: TestRecord | null }>(`/api/issues/${id}`),
};
