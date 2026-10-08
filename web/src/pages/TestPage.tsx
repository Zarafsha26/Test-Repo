import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, History, MessageSquare, Play, Target, ShieldCheck, Activity } from 'lucide-react';
import {
  api,
  type AgentSummary,
  type Issue,
  type TestRecord,
} from '../lib/api';
import {
  Card,
  FieldLabel,
  PassFailBadge,
  PrimaryButton,
  SectionTitle,
  Spinner,
} from '../components/ui';

const EXAMPLE =
  'A customer wants to return an item after 45 days. What should you tell them?';

const SCORE_LABELS: Array<{
  key: keyof TestRecord['scores'];
  label: string;
  icon: typeof Target;
  tone: string;
}> = [
  { key: 'accuracy', label: 'Accuracy', icon: Target, tone: 'bg-fair-soft text-fair' },
  { key: 'safety', label: 'Safety', icon: ShieldCheck, tone: 'bg-good-soft text-good' },
  { key: 'reliability', label: 'Reliability', icon: Activity, tone: 'bg-[#eef2ff] text-[#4f46e5]' },
];

export function TestPage({
  presetAgentId,
  onIssueDetected,
  onOpenIssue,
  onToast,
}: {
  presetAgentId?: string;
  onIssueDetected: () => void;
  onOpenIssue: (issue: Issue) => void;
  onToast: (message: string) => void;
}) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState<string>(presetAgentId ?? '');
  const [scenario, setScenario] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ test: TestRecord; issue: Issue | null } | null>(
    null,
  );
  const [history, setHistory] = useState<TestRecord[]>([]);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .agents()
      .then((data) => {
        setAgents(data.items);
        setAgentId((current) => current || data.items[0]?.id || '');
      })
      .catch(() => onToast('Could not load agents.'));
  }, [onToast]);

  useEffect(() => {
    if (presetAgentId) setAgentId(presetAgentId);
  }, [presetAgentId]);

  const loadHistory = useCallback(async () => {
    if (!agentId) return;
    try {
      const data = await api.tests(agentId);
      setHistory(data.items);
    } catch {
      // history is non-critical
    }
  }, [agentId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const canRun = Boolean(agentId) && scenario.trim().length >= 10 && !running;

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    setResult(null);
    try {
      const data = await api.runTest(agentId, scenario.trim());
      setResult(data);
      await loadHistory();
      onIssueDetected();
      if (data.issue) onToast(`Detected: ${data.issue.title}`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'The test could not be run.');
    } finally {
      setRunning(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    }
  };

  const selected = agents.find((agent) => agent.id === agentId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Test</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Describe a real situation, run it, and see if the answer is safe to send.
        </p>
      </header>

      <Card className="px-6 py-6">
        <div className="space-y-5">
          <div>
            <FieldLabel>Agent</FieldLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {agents.map((agent) => {
                const active = agent.id === agentId;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setAgentId(agent.id)}
                    disabled={running}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                      active
                        ? 'border-ink bg-ink text-white shadow-[0_2px_8px_rgba(16,24,40,0.18)]'
                        : 'border-line bg-panel text-ink-soft hover:border-[#d0d5dd] hover:text-ink'
                    }`}
                  >
                    <Bot className="h-4 w-4" strokeWidth={2} />
                    {agent.name}
                  </button>
                );
              })}
              {agents.length === 0 ? (
                <div className="skeleton h-9 w-56 rounded-lg" />
              ) : null}
            </div>
          </div>

          <div>
            <FieldLabel>Test your agent</FieldLabel>
            <textarea
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              rows={4}
              placeholder={`“${EXAMPLE}”`}
              disabled={running}
              className="mt-2 w-full resize-y rounded-xl border border-line bg-[#fcfcfd] px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-[#d0d5dd] focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-ink-faint">
                Write it the way a real customer or employee would.
              </p>
              <p className="text-xs text-ink-faint">{scenario.trim().length}/1200</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <PrimaryButton onClick={run} disabled={!canRun} loading={running}>
              {!running ? <Play className="h-4 w-4 fill-current" /> : null}
              {running ? 'Running test…' : 'Run Test'}
            </PrimaryButton>
            {running ? (
              <span className="text-[13px] text-ink-soft">
                Asking {selected?.name ?? 'the agent'} and reviewing the answer…
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      {result ? (
        <div ref={resultRef} className="fade-up space-y-4">
          <Card className="px-6 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-4">
              <div className="flex items-center gap-3">
                <PassFailBadge passed={result.test.passed} />
                <span className="text-sm text-ink-soft">
                  Result score{' '}
                  <span className="font-semibold text-ink">{result.test.overall}/100</span>
                </span>
              </div>
              {result.issue ? (
                <button
                  onClick={() => onOpenIssue(result.issue!)}
                  className="rounded-full bg-risk-soft px-3 py-1.5 text-xs font-semibold text-risk transition hover:brightness-95"
                >
                  1 issue detected — view details
                </button>
              ) : (
                <span className="text-xs font-medium text-good">No issues detected</span>
              )}
            </div>

            <div className="grid gap-5 pt-5 md:grid-cols-3">
              {SCORE_LABELS.map(({ key, label, icon: Icon, tone }) => {
                const value = result.test.scores[key];
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-line-soft bg-[#fcfcfd] px-4 py-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-[13px] font-medium text-ink-soft">{label}</p>
                    </div>
                    <p className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em] text-ink">
                      {value}
                      <span className="text-sm font-medium text-ink-faint">%</span>
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-xl border border-line-soft bg-[#f8f9fb] px-4 py-3.5">
              <p className="text-sm italic leading-relaxed text-ink-soft">
                “{result.test.explanation}”
              </p>
            </div>

            <div className="mt-5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                <MessageSquare className="h-3.5 w-3.5" /> Agent reply
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-line px-4 py-3.5 text-sm leading-relaxed text-ink">
                {result.test.response}
              </p>
              <p className="mt-2 text-xs text-ink-faint">
                Responded in {(result.test.latencyMs / 1000).toFixed(1)}s · $
                {result.test.costUsd.toFixed(3)} estimated cost
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      <section>
        <SectionTitle
          action={<History className="h-4 w-4 text-ink-faint" />}
        >
          Test history
        </SectionTitle>
        {history.length > 0 ? (
          <Card className="divide-y divide-line-soft overflow-hidden">
            {history.map((test) => (
              <div key={test.id} className="flex items-center gap-4 px-5 py-3.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${test.passed ? 'bg-good' : 'bg-risk'}`}
                />
                <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                  {test.scenario}
                </p>
                <span
                  className={`text-xs font-semibold ${test.passed ? 'text-good' : 'text-risk'}`}
                >
                  {test.passed ? 'PASS' : 'FAIL'}
                </span>
                <span className="w-10 text-right text-xs font-medium text-ink">
                  {test.overall}
                </span>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="px-5 py-8 text-center text-sm text-ink-soft">
            {running ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-4 w-4" /> First result appears here.
              </span>
            ) : (
              'No tests for this agent yet. Run one above.'
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
