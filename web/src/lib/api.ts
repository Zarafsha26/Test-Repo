export type Severity = 'high' | 'medium' | 'low';
export type IssueCategory = 'accuracy' | 'safety' | 'reliability';

export type Scores = {
  accuracy: number;
  safety: number;
  reliability: number;
  consistency: number;
};

export type TestRecord = {
  id: string;
  agentId: string;
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

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError('Cannot reach Silex. Is the server running?', 0);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: string }).error ?? 'Something went wrong.',
      response.status,
    );
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
  agent: (id: string) => request<AgentDetail>(`/api/agents/${id}`),
  tests: (agentId?: string) =>
    request<{ items: TestRecord[] }>(
      `/api/tests${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`,
    ),
  runTest: (agentId: string, scenario: string) =>
    request<{ test: TestRecord; issue: Issue | null }>('/api/tests', {
      method: 'POST',
      body: JSON.stringify({ agentId, scenario }),
    }),
  issues: () => request<{ items: Issue[]; total: number }>('/api/issues'),
  issue: (id: string) =>
    request<{ issue: Issue; test: TestRecord | null }>(`/api/issues/${id}`),
};
