import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  ClipboardList,
  Coins,
  Play,
  Plus,
  Settings,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import {
  api,
  type AgentDetail,
  type AgentSummary,
  type ConnectionDiagnostic,
  type Issue,
  type TestRecord,
} from '../lib/api';
import {
  Card,
  EmptyState,
  Modal,
  PrimaryButton,
  ReadyPill,
  ScoreRow,
  SectionTitle,
  Spinner,
  StatusPill,
} from '../components/ui';

const AVATAR_TONES = [
  'from-[#6366f1] to-[#4338ca]',
  'from-[#10b981] to-[#047857]',
  'from-[#f59e0b] to-[#b45309]',
  'from-[#ec4899] to-[#be185d]',
];

function timeAgo(timestamp: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const isErrorRun = (test: TestRecord): boolean =>
  (test.status ?? 'completed') === 'error';

function StatusBadge({ agent }: { agent: AgentSummary }) {
  if (agent.metrics) return <StatusPill status={agent.metrics.status} />;
  if (agent.status === 'Ready to Test') return <ReadyPill />;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-line-soft px-2.5 py-1 text-xs font-medium text-ink-soft">
      <Spinner className="h-3 w-3" /> Running
    </span>
  );
}

export function AgentsPage({
  agentId,
  onOpenAgent,
  onBack,
  onRunTest,
  onOpenIssue,
  onToast,
}: {
  agentId?: string;
  onOpenAgent: (id: string) => void;
  onBack: () => void;
  onRunTest: (id: string) => void;
  onOpenIssue: (issue: Issue) => void;
  onToast: (message: string) => void;
}) {
  if (agentId) {
    return (
      <AgentDetailPage
        agentId={agentId}
        onBack={onBack}
        onRunTest={onRunTest}
        onOpenIssue={onOpenIssue}
        onToast={onToast}
      />
    );
  }
  return (
    <AgentsList
      onOpenAgent={onOpenAgent}
      onAgentAdded={(agent) => onOpenAgent(agent.id)}
      onToast={onToast}
    />
  );
}

function AgentsList({
  onOpenAgent,
  onAgentAdded,
  onToast,
}: {
  onOpenAgent: (id: string) => void;
  onAgentAdded: (agent: AgentSummary) => void;
  onToast: (message: string) => void;
}) {
  const [items, setItems] = useState<AgentSummary[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [settingsAgent, setSettingsAgent] = useState<AgentSummary | null>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [connection, setConnection] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.agents();
      setItems(data.items);
    } catch {
      if (!items) setItems([]);
    }
  }, [items]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 6000);
    return () => clearInterval(timer);
  }, [load]);

  const save = async () => {
    setFormError(null);
    if (name.trim().length < 2) return setFormError('Enter an agent name of at least 2 characters.');
    if (purpose.trim().length < 3) return setFormError('Describe what this agent does.');
    setSaving(true);
    try {
      const { item } = await api.createAgent({
        name: name.trim(),
        purpose: purpose.trim(),
        connection: connection.trim(),
      });
      setShowAdd(false);
      setName('');
      setPurpose('');
      setConnection('');
      onToast(`${item.name} added — ready to test.`);
      onAgentAdded(item);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not add the agent.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
            Agents
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every agent in this workspace, with its latest health score.
          </p>
        </div>
        <PrimaryButton onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Agent
        </PrimaryButton>
      </header>

      {items === null ? (
        <Card className="space-y-3 px-5 py-6">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-16 rounded-xl" />
          ))}
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          title="No agents yet"
          body="Add your first agent to start testing it before it talks to real customers."
        />
      ) : (
        <Card className="divide-y divide-line-soft overflow-hidden">
          {items.map((agent, index) => (
            <div
              key={agent.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenAgent(agent.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenAgent(agent.id);
                }
              }}
              className="group flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition hover:bg-[#fafbfc]"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${
                  AVATAR_TONES[index % AVATAR_TONES.length]
                }`}
              >
                <Bot className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{agent.name}</p>
                  {agent.role === 'Custom' ? (
                    <span className="rounded bg-line-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                      Custom
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                  {agent.description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-ink">
                  {agent.metrics ? `Health: ${agent.metrics.health}%` : 'No score yet'}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {agent.metrics
                    ? `${agent.metrics.testCount} tests · ${agent.metrics.failureCount} failed`
                    : agent.status === 'Ready to Test'
                      ? 'Not tested yet'
                      : 'First tests running'}
                </p>
              </div>
              <StatusBadge agent={agent} />
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setSettingsAgent(agent);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={`Settings for ${agent.name}`}
                title="Agent settings"
                className="rounded-lg p-2 text-ink-faint transition hover:bg-line-soft hover:text-ink"
              >
                <Settings className="h-4 w-4" />
              </button>
              <ChevronRight
                className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
                strokeWidth={2}
              />
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={showAdd}
        onClose={() => !saving && setShowAdd(false)}
        title="Add your AI Agent"
        subtitle="Give it a name, tell us what it does, and connect where it runs."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-ink-soft" htmlFor="agent-name">
              Agent Name
            </label>
            <input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Billing Assistant"
              className="mt-1.5 w-full rounded-lg border border-line bg-[#fcfcfd] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-[#d0d5dd] focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-ink-soft" htmlFor="agent-purpose">
              Purpose
            </label>
            <input
              id="agent-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="What this agent handles, e.g. invoices and refunds"
              className="mt-1.5 w-full rounded-lg border border-line bg-[#fcfcfd] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-[#d0d5dd] focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-ink-soft" htmlFor="agent-connection">
              Connection
            </label>
            <input
              id="agent-connection"
              value={connection}
              onChange={(event) => setConnection(event.target.value)}
              placeholder="https://your-agent.example.com/test — or leave empty"
              className="mt-1.5 w-full rounded-lg border border-line bg-[#fcfcfd] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-[#d0d5dd] focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              Point Silex at where your agent runs. Leave empty to test with the local engine.
            </p>
          </div>
          {formError ? (
            <div className="flex items-start gap-2 rounded-lg bg-risk-soft px-3 py-2.5 text-[13px] text-risk">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowAdd(false)}
              disabled={saving}
              className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:text-ink"
            >
              Cancel
            </button>
            <PrimaryButton onClick={save} loading={saving}>
              Save Agent
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {settingsAgent ? (
        <AgentSettingsModal
          agent={settingsAgent}
          onClose={() => setSettingsAgent(null)}
          onSaved={async (item) => {
            setItems((current) =>
              current ? current.map((entry) => (entry.id === item.id ? item : entry)) : current,
            );
            void load();
          }}
          onRemoved={() => {
            setItems((current) =>
              current ? current.filter((entry) => entry.id !== settingsAgent.id) : current,
            );
            setSettingsAgent(null);
            void load();
          }}
          onToast={onToast}
        />
      ) : null}
    </div>
  );
}

function ScoreTrend({ tests }: { tests: { overall: number; createdAt: number }[] }) {
  const points = [...tests]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-14)
    .map((test, index) => ({
      index: index + 1,
      score: test.overall,
      time: new Date(test.createdAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));
  if (points.length < 2) return null;
  return (
    <div className="h-[92px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="index" hide />
          <Tooltip
            cursor={{ stroke: '#d0d5dd', strokeDasharray: '3 3' }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e9ecef',
              boxShadow: '0 8px 24px rgba(16,24,40,0.12)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
            formatter={(value) => [`${value}/100`, 'Score']}
            labelFormatter={() => ''}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#4f46e5"
            strokeWidth={2}
            fill="url(#scoreFill)"
            dot={false}
            activeDot={{ r: 4, fill: '#4f46e5', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AgentDetailPage({
  agentId,
  onBack,
  onRunTest,
  onOpenIssue,
  onToast,
}: {
  agentId: string;
  onBack: () => void;
  onRunTest: (id: string) => void;
  onOpenIssue: (issue: Issue) => void;
  onToast: (message: string) => void;
}) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.agent(agentId));
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not load agent.');
    }
  }, [agentId, onToast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 7000);
    return () => clearInterval(timer);
  }, [load]);

  if (!detail) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-6 w-40 rounded-md" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }

  const metrics = detail.metrics;
  const isReady = !metrics && detail.status === 'Ready to Test';

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        All agents
      </button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4338ca] text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
                {detail.name}
              </h1>
              {metrics ? (
                <StatusPill status={metrics.status} />
              ) : isReady ? (
                <ReadyPill />
              ) : null}
            </div>
            <p className="mt-0.5 max-w-xl text-sm text-ink-soft">{detail.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Agent settings"
            title="Agent settings"
            className="rounded-lg border border-line bg-panel p-2.5 text-ink-soft transition hover:text-ink"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
          <PrimaryButton onClick={() => onRunTest(detail.id)}>
            <Play className="h-4 w-4 fill-current" />
            Run Test
          </PrimaryButton>
        </div>
      </header>

      {metrics ? (
        <>
          <Card className="px-6 py-6">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
              <div>
                <p className="text-[13px] font-medium text-ink-soft">Health score</p>
                <p className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink">
                  {metrics.health}
                  <span className="text-xl font-medium text-ink-faint">%</span>
                </p>
              </div>
              <div className="min-w-[240px] flex-1 space-y-3">
                <ScoreRow label="Accuracy" value={metrics.accuracy} />
                <ScoreRow label="Safety" value={metrics.safety} />
                <ScoreRow label="Reliability" value={metrics.reliability} />
              </div>
            </div>
            {detail.recentTests.filter((test) => !isErrorRun(test)).length >= 2 ? (
              <div className="mt-6 border-t border-line-soft pt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  Score trend
                </p>
                <ScoreTrend tests={detail.recentTests.filter((test) => !isErrorRun(test))} />
              </div>
            ) : null}
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { icon: ClipboardList, label: 'Recent tests', value: `${metrics.testCount}` },
              {
                icon: AlertCircle,
                label: 'Recent failures',
                value: `${metrics.failureCount}`,
                warn: metrics.failureCount > 0,
              },
              {
                icon: Timer,
                label: 'Avg response time',
                value: `${(metrics.avgResponseMs / 1000).toFixed(1)}s`,
              },
              {
                icon: Coins,
                label: 'Cost per task',
                value: `$${metrics.costPerTask.toFixed(3)}`,
              },
            ].map((tile) => (
              <Card key={tile.label} className="px-5 py-4">
                <div className="flex items-center gap-2 text-ink-faint">
                  <tile.icon className="h-4 w-4" />
                  <p className="text-[13px] font-medium text-ink-soft">{tile.label}</p>
                </div>
                <p
                  className={`mt-2 text-2xl font-semibold tracking-[-0.02em] ${
                    tile.warn ? 'text-risk' : 'text-ink'
                  }`}
                >
                  {tile.value}
                </p>
              </Card>
            ))}
          </div>
        </>
      ) : isReady ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
            <Play className="h-5 w-5 fill-current" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Ready to Test</p>
            <p className="mt-1 max-w-md text-sm text-ink-soft">
              This agent has not been tested yet. Run your first test to see its health
              score, safety and reliability.
            </p>
          </div>
          <PrimaryButton onClick={() => onRunTest(detail.id)}>
            <Play className="h-4 w-4 fill-current" />
            Run Test
          </PrimaryButton>
        </Card>
      ) : (
        <Card className="px-6 py-8 text-center text-sm text-ink-soft">
          <span className="mr-2 inline-flex align-middle">
            <Spinner className="h-4 w-4 text-ink-faint" />
          </span>
          Running this agent’s first tests. Health score appears shortly.
        </Card>
      )}

      <section>
        <SectionTitle>Recent tests</SectionTitle>
        {detail.recentTests.length > 0 ? (
          <Card className="divide-y divide-line-soft overflow-hidden">
            {detail.recentTests.map((test) => (
              <div key={test.id} className="flex items-center gap-4 px-5 py-3.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isErrorRun(test)
                      ? 'bg-ink-faint'
                      : test.passed
                        ? 'bg-good'
                        : 'bg-risk'
                  }`}
                />
                <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                  {test.scenario}
                </p>
                <span className="text-xs text-ink-faint">{timeAgo(test.createdAt)}</span>
                <span
                  className={`w-12 text-right text-xs font-semibold ${
                    isErrorRun(test)
                      ? 'text-ink-faint'
                      : test.passed
                        ? 'text-good'
                        : 'text-risk'
                  }`}
                >
                  {isErrorRun(test) ? 'ERROR' : test.passed ? 'PASS' : 'FAIL'}
                </span>
                <span className="w-10 text-right text-xs font-medium text-ink">
                  {isErrorRun(test) ? '—' : test.overall}
                </span>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            title="No tests yet"
            body="Run a test to see results and scores for this agent."
          />
        )}
      </section>

      {detail.recentFailures.length > 0 ? (
        <section>
          <SectionTitle>Recent failures</SectionTitle>
          <Card className="divide-y divide-line-soft overflow-hidden">
            {detail.recentFailures.map((test) => (
              <div key={test.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-ink">{test.scenario}</p>
                  <span className="text-xs font-semibold text-risk">FAIL</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-soft">{test.explanation}</p>
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
                    className="mt-2 text-[13px] font-medium text-ink underline-offset-2 hover:underline"
                  >
                    View issue →
                  </button>
                ) : null}
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {showSettings ? (
        <AgentSettingsModal
          agent={detail}
          onClose={() => setShowSettings(false)}
          onSaved={async () => {
            await load();
          }}
          onRemoved={() => onBack()}
          onToast={onToast}
        />
      ) : null}
    </div>
  );
}

function AgentSettingsModal({
  agent,
  onClose,
  onSaved,
  onRemoved,
  onToast,
}: {
  agent: AgentSummary;
  onClose: () => void;
  onSaved: (item: AgentSummary) => void | Promise<void>;
  onRemoved: () => void;
  onToast: (message: string) => void;
}) {
  const [name, setName] = useState(agent.name);
  const [purpose, setPurpose] = useState(agent.description);
  const [connection, setConnection] = useState(agent.connection ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [diagnostic, setDiagnostic] = useState<ConnectionDiagnostic | null>(null);

  const connectionDirty = connection.trim() !== (agent.connection ?? '');

  const checkConnection = async () => {
    setChecking(true);
    setDiagnostic(null);
    try {
      setDiagnostic(await api.diagnose(agent.id));
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not check the connection.',
      );
    } finally {
      setChecking(false);
    }
  };

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-line bg-[#fcfcfd] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-[#d0d5dd] focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink/10';

  const validate = (): string | null => {
    const trimmedName = name.trim();
    const trimmedPurpose = purpose.trim();
    const trimmedConnection = connection.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return 'Enter an agent name of 2 to 60 characters.';
    }
    if (trimmedPurpose.length < 3 || trimmedPurpose.length > 200) {
      return 'Describe what this agent does in 3 to 200 characters.';
    }
    if (trimmedConnection) {
      try {
        const url = new URL(trimmedConnection);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return 'Enter a valid connection URL starting with http:// or https://, or leave it empty to use the local engine.';
      }
    }
    return null;
  };

  const save = async () => {
    setFormError(null);
    const invalid = validate();
    if (invalid) return setFormError(invalid);
    setSaving(true);
    try {
      const { item } = await api.updateAgent(agent.id, {
        name: name.trim(),
        purpose: purpose.trim(),
        connection: connection.trim(),
      });
      await onSaved(item);
      onToast(`Settings saved for ${item.name}.`);
      onClose();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not save the settings.',
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await api.removeAgent(agent.id);
      onToast(`${agent.name} removed.`);
      onRemoved();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not remove the agent.',
      );
      setConfirming(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={() => !saving && onClose()}
        title="Agent Settings"
        subtitle="Update how this agent is identified and where it runs."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-ink-soft" htmlFor="settings-agent-name">
              Agent Name
            </label>
            <input
              id="settings-agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-ink-soft" htmlFor="settings-agent-purpose">
              Purpose
            </label>
            <input
              id="settings-agent-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-ink-soft" htmlFor="settings-agent-connection">
              Connection
            </label>
            <input
              id="settings-agent-connection"
              value={connection}
              onChange={(event) => {
                setConnection(event.target.value);
                setDiagnostic(null);
              }}
              placeholder="https://your-agent.example.com/test — or leave empty"
              className={inputClass}
            />
            <div className="mt-1.5 flex items-start justify-between gap-3">
              <p className="text-xs text-ink-faint">
                {agent.engine === 'external'
                  ? 'This agent runs at an external endpoint. Credentials are stored privately and never shown back.'
                  : 'Leave empty to test with the local engine.'}
              </p>
              <button
                onClick={() => void checkConnection()}
                disabled={checking || connectionDirty}
                title={
                  connectionDirty
                    ? 'Save changes first to check the updated address'
                    : 'Check that Silex can reach this agent'
                }
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checking ? 'Checking…' : 'Check connection'}
              </button>
            </div>
            {connectionDirty ? (
              <p className="mt-1 text-xs text-fair">Save changes first to check the updated address.</p>
            ) : null}
            {diagnostic ? (
              <div className="mt-2 space-y-1.5 rounded-xl border border-line-soft bg-[#f8f9fb] px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  {diagnostic.engine === 'external' ? 'Endpoint check' : 'Local engine check'}
                </p>
                {diagnostic.steps.map((step) => (
                  <div key={step.name} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        step.ok ? 'bg-good text-white' : 'bg-risk text-white'
                      }`}
                    >
                      {step.ok ? (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      ) : (
                        <X className="h-2.5 w-2.5" strokeWidth={3} />
                      )}
                    </span>
                    <span className="min-w-0 text-ink-soft">
                      <span className="font-medium text-ink">{step.name}</span>
                      <span className="block text-xs leading-snug">{step.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {formError ? (
            <div className="flex items-start gap-2 rounded-lg bg-risk-soft px-3 py-2.5 text-[13px] text-risk">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => {
                setFormError(null);
                setConfirming(true);
              }}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-risk transition hover:bg-risk-soft"
            >
              <Trash2 className="h-4 w-4" />
              Remove agent
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:text-ink"
              >
                Cancel
              </button>
              <PrimaryButton onClick={() => void save()} loading={saving}>
                Save changes
              </PrimaryButton>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirming}
        onClose={() => !removing && setConfirming(false)}
        title={`Remove ${agent.name}?`}
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          This agent disappears from the agents list and from test selection. Its
          past test results and issues are kept.
        </p>
        <div className="flex justify-end gap-2 pt-5">
          <button
            onClick={() => setConfirming(false)}
            disabled={removing}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => void remove()}
            disabled={removing}
            className="rounded-lg bg-risk px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {removing ? 'Removing…' : 'Remove agent'}
          </button>
        </div>
      </Modal>
    </>
  );
}
