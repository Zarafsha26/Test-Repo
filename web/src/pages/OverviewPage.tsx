import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Coins,
  PieChart as PieIcon,
  ShieldCheck,
  Siren,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, type Issue, type Overview, type TestRecord } from '../lib/api';
import { Card, MetricTile, SectionTitle, SeverityPill } from '../components/ui';

function HealthGauge({ value }: { value: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const tone = value >= 85 ? '#16a34a' : value >= 70 ? '#d97706' : '#dc2626';
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={radius} fill="none" stroke="#f1f3f5" strokeWidth="10" />
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-semibold tracking-[-0.03em] text-ink">
          {value}
          <span className="text-lg font-medium text-ink-faint">%</span>
        </span>
      </div>
    </div>
  );
}

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value}%`;

function ScoreTrend({ tests }: { tests: TestRecord[] }) {
  const points = [...tests]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-16)
    .map((test, index) => ({
      n: index + 1,
      score: test.overall,
      agent: test.agentId,
    }));

  if (points.length < 2) {
    return (
      <div className="flex h-[190px] items-center justify-center text-sm text-ink-faint">
        Run at least two tests to see your trend.
      </div>
    );
  }

  return (
    <div className="h-[190px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f1f3f5" strokeDasharray="4 6" vertical={false} />
          <XAxis
            dataKey="n"
            tick={{ fontSize: 11, fill: '#98a2b3' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tick={{ fontSize: 11, fill: '#98a2b3' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: '#d0d5dd', strokeDasharray: '3 3' }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e9ecef',
              boxShadow: '0 8px 24px rgba(16,24,40,0.12)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
            formatter={(value) => [`${value}/100`, 'Test score']}
            labelFormatter={(label) => `Test ${label}`}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#16a34a"
            strokeWidth={2.25}
            fill="url(#trendFill)"
            dot={false}
            activeDot={{ r: 4.5, fill: '#16a34a', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function OutcomeDonut({ passed, total }: { passed: number; total: number }) {
  const rate = total > 0 ? passed / total : 0;
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - rate * circumference;
  return (
    <div className="relative flex h-[190px] items-center justify-center">
      <svg viewBox="0 0 160 160" className="h-[160px] w-[160px] -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#f1f3f5" strokeWidth="16" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="#16a34a"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
          {Math.round(rate * 100)}%
        </span>
        <span className="text-xs text-ink-faint">passed</span>
      </div>
    </div>
  );
}

export function OverviewPage({
  onOpenIssue,
  onNavigate,
  onToast,
}: {
  onOpenIssue: (issue: Issue) => void;
  onNavigate: (page: 'overview' | 'agents' | 'test' | 'issues') => void;
  onToast: (message: string) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, testList] = await Promise.all([api.overview(), api.tests()]);
      setOverview(data);
      setTests(testList.items);
      if (!data.calibrating && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not load overview.');
    }
  }, [onToast]);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => void load(), 3500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const calibrating = overview?.calibrating ?? false;
  const progress = overview?.calibrationProgress;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Overview
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          How much you can trust your agents today.
        </p>
      </header>

      {calibrating ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-soft">
          <span className="h-2 w-2 animate-pulse rounded-full bg-fair" />
          Running the first round of tests
          {progress && progress.total > 0
            ? ` — ${progress.done} of ${progress.total} complete`
            : '…'}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_2fr]">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#ecfdf3]" />
          <div className="relative flex items-center gap-6 px-6 py-6">
            {overview && overview.health !== null ? (
              <HealthGauge value={overview.health} />
            ) : (
              <div className="skeleton h-[132px] w-[132px] rounded-full" />
            )}
            <div>
              <p className="text-[13px] font-medium text-ink-soft">AI Agent Health</p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-ink">
                {overview ? overview.statusLine : 'Loading…'}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
                {overview && overview.totalTests > 0
                  ? `${overview.passedTests} of ${overview.totalTests} tests passed.`
                  : 'Scores update with every test you run.'}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <MetricTile
            label="Reliability"
            value={pct(overview?.metrics.reliability)}
            hint="Follows instructions"
            loading={!overview}
            icon={Activity}
            tone="bg-[#eef2ff] text-[#4f46e5]"
          />
          <MetricTile
            label="Safety"
            value={pct(overview?.metrics.safety)}
            hint="Stays within policy"
            loading={!overview}
            icon={ShieldCheck}
            tone="bg-good-soft text-good"
          />
          <MetricTile
            label="Accuracy"
            value={pct(overview?.metrics.accuracy)}
            hint="Gives correct answers"
            loading={!overview}
            icon={Target}
            tone="bg-fair-soft text-fair"
          />
          <MetricTile
            label="Cost / task"
            value={
              overview?.metrics.costPerTask != null
                ? `$${overview.metrics.costPerTask.toFixed(3)}`
                : '—'
            }
            hint="Average per test"
            loading={!overview}
            icon={Coins}
            tone="bg-[#fdf2f8] text-[#db2777]"
          />
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="px-6 py-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-good-soft text-good">
                <TrendingUp className="h-4 w-4" />
              </span>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                Score trend
              </h2>
            </div>
            <span className="text-xs text-ink-faint">Last {Math.min(tests.length, 16)} tests</span>
          </div>
          <ScoreTrend tests={tests} />
        </Card>

        <Card className="px-6 py-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eef2ff] text-[#4f46e5]">
              <PieIcon className="h-4 w-4" />
            </span>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Outcomes
            </h2>
          </div>
          {overview && overview.totalTests > 0 ? (
            <>
              <OutcomeDonut passed={overview.passedTests} total={overview.totalTests} />
              <div className="flex justify-center gap-5 pb-1 text-xs text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-good" /> {overview.passedTests} passed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#f04438]" />{' '}
                  {overview.totalTests - overview.passedTests} failed
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-[190px] items-center justify-center text-sm text-ink-faint">
              No results yet.
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            <button
              onClick={() => onNavigate('issues')}
              className="text-[13px] font-medium text-ink-soft transition hover:text-ink"
            >
              View all issues →
            </button>
          }
        >
          Needs Attention
        </SectionTitle>

        {overview && overview.attention.length > 0 ? (
          <Card className="divide-y divide-line-soft overflow-hidden">
            {overview.attention.map((issue) => (
              <button
                key={issue.id}
                onClick={() => onOpenIssue(issue)}
                className="group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#fafbfc]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-risk-soft text-risk">
                  <Siren className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{issue.agentName}</p>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">{issue.title}</p>
                </div>
                <SeverityPill severity={issue.severity} />
                <ChevronRight
                  className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
                  strokeWidth={2}
                />
              </button>
            ))}
          </Card>
        ) : overview && !calibrating ? (
          <Card className="px-5 py-8 text-center text-sm text-ink-soft">
            Nothing needs attention right now.
          </Card>
        ) : (
          <Card className="space-y-3 px-5 py-6">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-10 rounded-lg" />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
