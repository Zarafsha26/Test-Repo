import { useCallback, useEffect, useState } from 'react';
import { Sidebar, type PageKey } from './components/Sidebar';
import { api, type Issue, type TestRecord } from './lib/api';
import { OverviewPage } from './pages/OverviewPage';
import { AgentsPage } from './pages/AgentsPage';
import { TestPage } from './pages/TestPage';
import { IssuesPage } from './pages/IssuesPage';
import {
  Drawer,
  DrawerHeader,
  IssueDetailBody,
  SeverityPill,
} from './components/ui';

type Route = {
  page: PageKey;
  agentId?: string;
  testAgentId?: string;
};

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'overview' });
  const [issueCount, setIssueCount] = useState(0);
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);
  const [openIssue, setOpenIssue] = useState<{
    issue: Issue;
    test: TestRecord | null;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const navigate = useCallback((page: PageKey, extra: Partial<Route> = {}) => {
    setRoute({ page, ...extra });
    window.scrollTo({ top: 0 });
  }, []);

  const refreshChrome = useCallback(async () => {
    try {
      const [status, issues] = await Promise.all([api.status(), api.issues()]);
      setEngineOnline(status.llm.available);
      setIssueCount(issues.total);
    } catch {
      setEngineOnline(false);
    }
  }, []);

  useEffect(() => {
    void refreshChrome();
    const timer = setInterval(() => void refreshChrome(), 8000);
    return () => clearInterval(timer);
  }, [refreshChrome]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openIssueDetail = useCallback(async (issue: Issue) => {
    try {
      const detail = await api.issue(issue.id);
      setOpenIssue(detail);
    } catch (error) {
      setOpenIssue({ issue, test: null });
      if (error instanceof Error) console.error(error);
    }
  }, []);

  return (
    <div className="min-h-screen">
      <Sidebar
        current={route.page}
        onNavigate={(page) => navigate(page)}
        issueCount={issueCount}
        engineOnline={engineOnline}
      />

      <main className="ml-[236px] min-h-screen">
        <div className="mx-auto max-w-[1080px] px-8 py-8">
          {route.page === 'overview' ? (
            <OverviewPage
              onOpenIssue={openIssueDetail}
              onNavigate={navigate}
              onToast={setToast}
            />
          ) : null}
          {route.page === 'agents' ? (
            <AgentsPage
              agentId={route.agentId}
              onOpenAgent={(agentId) => navigate('agents', { agentId })}
              onBack={() => navigate('agents')}
              onRunTest={(agentId) => navigate('test', { testAgentId: agentId })}
              onOpenIssue={openIssueDetail}
              onToast={setToast}
            />
          ) : null}
          {route.page === 'test' ? (
            <TestPage
              presetAgentId={route.testAgentId}
              onIssueDetected={refreshChrome}
              onOpenIssue={openIssueDetail}
              onToast={setToast}
            />
          ) : null}
          {route.page === 'issues' ? (
            <IssuesPage
              onOpenIssue={openIssueDetail}
              onChanged={refreshChrome}
              onToast={setToast}
            />
          ) : null}
        </div>
      </main>

      <Drawer
        open={openIssue !== null}
        onClose={() => setOpenIssue(null)}
        labelledBy="drawer-title"
      >
        {openIssue ? (
          <>
            <DrawerHeader
              title={openIssue.issue.title}
              onClose={() => setOpenIssue(null)}
              meta={
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityPill severity={openIssue.issue.severity} />
                  <span className="text-xs text-ink-soft">
                    {openIssue.issue.agentName}
                  </span>
                  <span className="text-xs text-ink-faint">·</span>
                  <span className="text-xs capitalize text-ink-soft">
                    {openIssue.issue.category}
                  </span>
                </div>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <IssueDetailBody issue={openIssue.issue} />
              {openIssue.test ? (
                <div className="mt-6 rounded-xl border border-line p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                    From test
                  </p>
                  <p className="mt-2 text-sm text-ink-soft">
                    “{openIssue.test.scenario}”
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold ${openIssue.test.passed ? 'text-good' : 'text-risk'}`}
                    >
                      {openIssue.test.passed ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="text-xs text-ink-faint">
                      Score {openIssue.test.overall}/100
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </Drawer>

      {toast ? (
        <div className="fade-up fixed bottom-6 right-6 z-[60] rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
