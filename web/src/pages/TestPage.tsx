import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Lightbulb,
  ListChecks,
  MessageSquare,
  Play,
  RefreshCw,
  Target,
  ShieldCheck,
  Activity,
  GitCompare,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
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
  { key: 'consistency', label: 'Consistency', icon: ListChecks, tone: 'bg-line-soft text-ink-soft' },
];

const STAGE_LABELS: Record<string, string> = {
  request: 'Before the test started',
  connection: 'While connecting to the agent',
  execution: 'While running the test',
  review: 'While reviewing the answer',
};

const timeAgo = (timestamp: number): string => {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const isErrorRun = (test: TestRecord): boolean =>
  (test.status ?? 'completed') === 'error';

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
  const [error, setError] = useState<{ message: string; stage?: string; saved: boolean } | null>(
    null,
  );
  const [history, setHistory] = useState<TestRecord[]>([]);
  const [scope, setScope] = useState<'agent' | 'all'>('agent');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .agents()
      .then((data) => {
        if (cancelled) return;
        setAgents(data.items);
        setAgentId((current) => {
          if (presetAgentId && data.items.some((agent) => agent.id === presetAgentId)) {
            return presetAgentId;
          }
          if (current && data.items.some((agent) => agent.id === current)) {
            return current;
          }
          return data.items[0]?.id ?? '';
        });
      })
      .catch(() => {
        if (!cancelled) onToast('Could not load agents.');
      });
    return () => {
      cancelled = true;
    };
  }, [presetAgentId, onToast]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.tests(scope === 'agent' && agentId ? agentId : undefined);
      setHistory(data.items);
    } catch {
      // history is non-critical
    }
  }, [agentId, scope]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const canRun = Boolean(agentId) && scenario.trim().length >= 10 && !running;

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const data = await api.runTest(agentId, scenario.trim());
      setResult(data);
      await loadHistory();
      onIssueDetected();
      if (data.issue) onToast(`Detected: ${data.issue.title}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The test could not be run.';
      const stage = error instanceof ApiError ? error.stage : undefined;
      const saved = Boolean(error instanceof ApiError && error.test);
      setError({ message, stage, saved });
      onToast(message);
      void loadHistory();
      try {
        const data = await api.agents();
        setAgents(data.items);
        setAgentId((current) =>
          current && data.items.some((agent) => agent.id === current)
            ? current
            : (data.items[0]?.id ?? ''),
        );
      } catch {
        // agent refresh is best-effort after a failed test
      }
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

      {error && !running ? (
        <div ref={resultRef} className="fade-up">
          <Card className="px-6 py-6">
            <div className="flex flex-wrap items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-risk-soft text-risk">
                <AlertCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Test did not complete</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{error.message}</p>
                <p className="mt-1.5 text-xs text-ink-faint">
                  {error.stage && STAGE_LABELS[error.stage]
                    ? `${STAGE_LABELS[error.stage]}. `
                    : ''}
                  {error.saved
                    ? 'This run was saved to test history as an error — no score was recorded for it.'
                    : 'Nothing was saved to test history for this run.'}{' '}
                  Your scenario is still below — press Retry to run it again.
                </p>
              </div>
              {Boolean(agentId) && scenario.trim().length >= 10 ? (
                <PrimaryButton onClick={() => void run()}>
                  <RefreshCw className="h-4 w-4" />
                  Retry test
                </PrimaryButton>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {result ? (
        <div ref={resultRef} className="fade-up space-y-4">
          <Card className="px-6 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <PassFailBadge passed={result.test.passed} />
                <span className="text-sm text-ink-soft">
                  Result score{' '}
                  <span className="font-semibold text-ink">{result.test.overall}/100</span>
                </span>
                <span className="rounded-full bg-line-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  {result.test.engine === 'external' ? 'External agent' : 'Local engine'}
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

            <div className="grid grid-cols-2 gap-5 pt-5 md:grid-cols-4">
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

            {result.test.checks && result.test.checks.length > 0 ? (
              <div className="mt-5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  <ListChecks className="h-3.5 w-3.5" /> Requirement checks
                </p>
                <div className="mt-2 space-y-2">
                  {result.test.checks.map((check, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                        check.met
                          ? 'border-good/25 bg-good-soft/50'
                          : 'border-risk/25 bg-risk-soft/50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                          check.met ? 'bg-good text-white' : 'bg-risk text-white'
                        }`}
                      >
                        {check.met ? (
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        ) : (
                          <X className="h-2.5 w-2.5" strokeWidth={3} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block leading-snug text-ink">{check.criterion}</span>
                        {check.evidence ? (
                          <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
                            {check.met ? 'Evidence: ' : 'Not met: '}
                            {check.evidence}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {result.issue ? (
              <div className="mt-5 rounded-xl border border-risk/25 bg-risk-soft px-4 py-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-risk">
                  <AlertTriangle className="h-3.5 w-3.5" /> Finding
                </p>
                <p className="mt-1.5 text-sm font-semibold text-ink">
                  {result.issue.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {result.issue.whatHappened}
                </p>
                <p className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-risk">
                  <Lightbulb className="h-3.5 w-3.5" /> Recommended action
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  {result.issue.recommendation}
                </p>
                <button
                  onClick={() => onOpenIssue(result.issue!)}
                  className="mt-3 text-[13px] font-medium text-risk underline-offset-2 hover:underline"
                >
                  View full details →
                </button>
              </div>
            ) : null}

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
          action={
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-line bg-panel p-0.5">
                {(
                  [
                    ['agent', 'This agent'],
                    ['all', 'All agents'],
                  ] as Array<['agent' | 'all', string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setScope(value);
                      setExpandedId(null);
                      setCompareIds([]);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      scope === value
                        ? 'bg-ink text-white'
                        : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <History className="h-4 w-4 text-ink-faint" />
            </div>
          }
        >
          Test history
        </SectionTitle>

        {(() => {
          const selected = compareIds
            .map((id) => history.find((test) => test.id === id))
            .filter((test): test is TestRecord => Boolean(test))
            .sort((a, b) => a.createdAt - b.createdAt);
          if (selected.length !== 2) return null;
          const [older, newer] = selected;
          const rows: Array<{ label: string; older: number; newer: number }> = [
            { label: 'Overall', older: older.overall, newer: newer.overall },
            { label: 'Accuracy', older: older.scores.accuracy, newer: newer.scores.accuracy },
            { label: 'Safety', older: older.scores.safety, newer: newer.scores.safety },
            { label: 'Reliability', older: older.scores.reliability, newer: newer.scores.reliability },
            { label: 'Consistency', older: older.scores.consistency, newer: newer.scores.consistency },
          ];
          const overallDelta = newer.overall - older.overall;
          const regressed =
            overallDelta < 0 || (older.passed && !newer.passed);
          const improved = overallDelta > 0 && !regressed;
          return (
            <Card className="fade-up mb-4 px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-4">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                    <GitCompare className="h-3.5 w-3.5" /> Comparing two runs
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {new Date(older.createdAt).toLocaleString()} →{' '}
                    {new Date(newer.createdAt).toLocaleString()}
                    {older.agentName ? ` · ${older.agentName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      regressed
                        ? 'bg-risk-soft text-risk'
                        : improved
                          ? 'bg-good-soft text-good'
                          : 'bg-line-soft text-ink-soft'
                    }`}
                  >
                    {regressed
                      ? `Regressed ${Math.abs(overallDelta)} points`
                      : improved
                        ? `Improved +${overallDelta} points`
                        : 'No overall change'}
                  </span>
                  <button
                    onClick={() => setCompareIds([])}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:text-ink"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid gap-x-6 gap-y-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-line-soft bg-[#fcfcfd] px-4 py-3">
                  <p className="text-[13px] font-medium text-ink-soft">Result</p>
                  <div className="mt-1.5 flex items-center gap-2 text-sm">
                    <PassFailBadge passed={older.passed} />
                    <span className="text-ink-faint">→</span>
                    <PassFailBadge passed={newer.passed} />
                  </div>
                </div>
                {rows.map((row) => {
                  const delta = row.newer - row.older;
                  return (
                    <div
                      key={row.label}
                      className="rounded-xl border border-line-soft bg-[#fcfcfd] px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium text-ink-soft">{row.label}</p>
                        <span
                          className={`text-xs font-semibold ${
                            delta < 0
                              ? 'text-risk'
                              : delta > 0
                                ? 'text-good'
                                : 'text-ink-faint'
                          }`}
                        >
                          {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-ink">
                        <span className="text-ink-faint">{row.older}</span>
                        <span className="mx-1.5 text-ink-faint">→</span>
                        <span className="font-semibold">{row.newer}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {history.length > 0 ? (
          <Card className="divide-y divide-line-soft overflow-hidden">
            {history.map((test, index) => {
              const isError = isErrorRun(test);
              const older = history[index + 1];
              const delta =
                !isError && older && !isErrorRun(older)
                  ? test.overall - older.overall
                  : null;
              const expanded = expandedId === test.id;
              const selectedForCompare = compareIds.includes(test.id);
              return (
                <div key={test.id}>
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    {!isError ? (
                      <button
                        onClick={() =>
                          setCompareIds((current) =>
                            current.includes(test.id)
                              ? current.filter((id) => id !== test.id)
                              : [...current, test.id].slice(-2),
                          )
                        }
                        aria-label={
                          selectedForCompare ? 'Remove from comparison' : 'Add to comparison'
                        }
                        title={
                          selectedForCompare ? 'Remove from comparison' : 'Compare this run'
                        }
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                          selectedForCompare
                            ? 'border-ink bg-ink text-white'
                            : 'border-line bg-panel text-transparent hover:border-[#d0d5dd]'
                        }`}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </button>
                    ) : (
                      <span className="h-5 w-5 shrink-0" />
                    )}
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        isError ? 'bg-ink-faint' : test.passed ? 'bg-good' : 'bg-risk'
                      }`}
                    />
                    <button
                      onClick={() => setExpandedId(expanded ? null : test.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                        {test.scenario}
                      </p>
                      {scope === 'all' && test.agentName ? (
                        <span className="hidden max-w-32 truncate text-xs text-ink-faint sm:block">
                          {test.agentName}
                        </span>
                      ) : null}
                      <span className="hidden w-16 text-right text-xs text-ink-faint md:block">
                        {timeAgo(test.createdAt)}
                      </span>
                      <span className="hidden rounded-full bg-line-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint lg:block">
                        {test.engine === 'external' ? 'External' : 'Local'}
                      </span>
                      {delta !== null ? (
                        <span
                          className={`w-10 text-right text-xs font-semibold ${
                            delta > 0 ? 'text-good' : delta < 0 ? 'text-risk' : 'text-ink-faint'
                          }`}
                        >
                          {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0'}
                        </span>
                      ) : null}
                      <span
                        className={`w-12 text-right text-xs font-semibold ${
                          isError
                            ? 'text-ink-faint'
                            : test.passed
                              ? 'text-good'
                              : 'text-risk'
                        }`}
                      >
                        {isError ? 'ERROR' : test.passed ? 'PASS' : 'FAIL'}
                      </span>
                      <span className="w-8 text-right text-xs font-medium text-ink">
                        {isError ? '—' : test.overall}
                      </span>
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-ink-faint" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
                      )}
                    </button>
                  </div>
                  {expanded ? (
                    <div className="border-t border-line-soft bg-[#fafbfc] px-5 py-4">
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-faint">
                        <span>{new Date(test.createdAt).toLocaleString()}</span>
                        {test.agentName ? <span>{test.agentName}</span> : null}
                        <span>
                          {test.engine === 'external' ? 'External agent' : 'Local engine'}
                        </span>
                        {isError ? null : (
                          <>
                            <span>Responded in {(test.latencyMs / 1000).toFixed(1)}s</span>
                            <span>${test.costUsd.toFixed(3)} estimated cost</span>
                          </>
                        )}
                      </div>
                      {isError ? (
                        <div className="mt-3 rounded-xl border border-risk/25 bg-risk-soft px-4 py-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-risk">
                            <AlertTriangle className="h-3.5 w-3.5" /> Run error
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                            {test.error?.message ?? test.explanation}
                          </p>
                          <p className="mt-1.5 text-xs text-ink-faint">
                            No score was recorded for this run.
                          </p>
                        </div>
                      ) : (
                        <>
                          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-white px-4 py-3 text-sm leading-relaxed text-ink">
                            {test.response}
                          </p>
                          <p className="mt-2 text-sm italic leading-relaxed text-ink-soft">
                            “{test.explanation}”
                          </p>
                          {test.checks && test.checks.length > 0 ? (
                            <div className="mt-3 space-y-1.5">
                              {test.checks.map((check, checkIndex) => (
                                <div key={checkIndex} className="flex items-start gap-2 text-sm">
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                      check.met ? 'bg-good text-white' : 'bg-risk text-white'
                                    }`}
                                  >
                                    {check.met ? (
                                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                                    ) : (
                                      <X className="h-2.5 w-2.5" strokeWidth={3} />
                                    )}
                                  </span>
                                  <span className="text-ink-soft">
                                    {check.criterion}
                                    {check.evidence ? (
                                      <span className="text-ink-faint"> — {check.evidence}</span>
                                    ) : null}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {test.issueId ? (
                            <button
                              onClick={async () => {
                                try {
                                  const data = await api.issue(test.issueId!);
                                  onOpenIssue(data.issue);
                                } catch {
                                  onToast('Could not open the issue.');
                                }
                              }}
                              className="mt-3 text-[13px] font-medium text-risk underline-offset-2 hover:underline"
                            >
                              View issue →
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="px-5 py-8 text-center text-sm text-ink-soft">
            {running ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-4 w-4" /> First result appears here.
              </span>
            ) : scope === 'all' ? (
              'No tests in this workspace yet. Run one above.'
            ) : (
              'No tests for this agent yet. Run one above.'
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
