export type Severity = 'high' | 'medium' | 'low';

export type IssueCategory = 'accuracy' | 'safety' | 'reliability';

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

export type CustomAgent = {
  id: string;
  name: string;
  purpose: string;
  connection: string;
  createdAt: number;
};

export type Database = {
  version: 1;
  tests: TestRecord[];
  issues: Issue[];
  customAgents: CustomAgent[];
  calibratedAt: number | null;
};

export type AgentStatus = string;

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
