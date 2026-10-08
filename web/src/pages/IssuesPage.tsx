import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, RefreshCcw, ShieldAlert, Siren, Target } from 'lucide-react';
import { api, type Issue } from '../lib/api';
import { Card, EmptyState, SeverityPill, Spinner } from '../components/ui';

const CATEGORY_LABEL: Record<Issue['category'], string> = {
  accuracy: 'Accuracy',
  safety: 'Safety',
  reliability: 'Reliability',
};

const CATEGORY_ICON: Record<Issue['category'], typeof Target> = {
  accuracy: Target,
  safety: ShieldAlert,
  reliability: RefreshCcw,
};

const CATEGORY_TONE: Record<Issue['category'], string> = {
  accuracy: 'bg-fair-soft text-fair',
  safety: 'bg-risk-soft text-risk',
  reliability: 'bg-[#eef2ff] text-[#4f46e5]',
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function IssuesPage({
  onOpenIssue,
  onChanged,
  onToast,
}: {
  onOpenIssue: (issue: Issue) => void;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [issues, setIssues] = useState<Issue[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.issues();
      setIssues(data.items);
      onChanged();
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not load issues.');
    }
  }, [onChanged, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const high = issues?.filter((issue) => issue.severity === 'high').length ?? 0;
  const medium = issues?.filter((issue) => issue.severity === 'medium').length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Issues</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Real problems detected in tests — what went wrong and what to do next.
        </p>
      </header>

      {issues === null ? (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <Spinner className="h-4 w-4" /> Loading issues…
        </div>
      ) : issues.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-risk-soft text-risk">
              <Siren className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">
              {issues.length} {issues.length === 1 ? 'issue' : 'issues'} detected
            </h2>
            <span className="text-sm text-ink-faint">
              {high} high · {medium} medium
            </span>
          </div>

          <div className="space-y-3">
            {issues.map((issue) => (
              <button
                key={issue.id}
                onClick={() => onOpenIssue(issue)}
                className="group block w-full text-left"
              >
                <Card className="flex items-center gap-4 px-5 py-4 transition group-hover:border-[#d0d5dd] group-hover:shadow-[0_2px_6px_rgba(16,24,40,0.06)]">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CATEGORY_TONE[issue.category]}`}
                  >
                    {(() => {
                      const Icon = CATEGORY_ICON[issue.category];
                      return <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />;
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{issue.title}</p>
                    <p className="mt-1 text-[13px] text-ink-soft">
                      {issue.agentName} · {CATEGORY_LABEL[issue.category]} ·{' '}
                      {formatDate(issue.createdAt)}
                    </p>
                  </div>
                  <SeverityPill severity={issue.severity} />
                  <ChevronRight
                    className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
                    strokeWidth={2}
                  />
                </Card>
              </button>
            ))}
          </div>

          <p className="pt-2 text-[13px] text-ink-faint">
            Open any issue to see what happened, why it matters, and the recommended
            action.
          </p>
        </>
      ) : (
        <EmptyState
          title="No issues detected"
          body="Every test so far passed review. New issues appear here the moment a test finds one."
        />
      )}
    </div>
  );
}
