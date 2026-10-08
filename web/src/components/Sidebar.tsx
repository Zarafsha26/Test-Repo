import { Bot, FlaskConical, LayoutDashboard, ShieldAlert } from 'lucide-react';

export type PageKey = 'overview' | 'agents' | 'test' | 'issues';

const NAV: Array<{ key: PageKey; label: string; icon: typeof Bot }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'agents', label: 'Agents', icon: Bot },
  { key: 'test', label: 'Test', icon: FlaskConical },
  { key: 'issues', label: 'Issues', icon: ShieldAlert },
];

export function Sidebar({
  current,
  onNavigate,
  issueCount,
  engineOnline,
}: {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  issueCount: number;
  engineOnline: boolean | null;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[236px] flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2.5 px-6 pb-2 pt-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3 21 12l-9 9-9-9 9-9Z"
              stroke="white"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M12 8.5 15.5 12 12 15.5 8.5 12 12 8.5Z" fill="white" />
          </svg>
        </div>
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
          Silex
        </span>
      </div>

      <p className="px-6 pb-5 pt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
        Agent trust
      </p>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? 'bg-line-soft font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(16,24,40,0.04)]'
                  : 'font-medium text-ink-soft hover:bg-line-soft/70 hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <item.icon className={`h-4 w-4 ${active ? 'text-ink' : 'text-ink-faint'}`} strokeWidth={2} />
                {item.label}
              </span>
              {item.key === 'issues' && issueCount > 0 ? (
                <span className="rounded-full bg-risk-soft px-2 py-0.5 text-[11px] font-semibold text-risk">
                  {issueCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <span
            className={`h-2 w-2 rounded-full ${
              engineOnline === null
                ? 'bg-ink-faint'
                : engineOnline
                  ? 'bg-good'
                  : 'bg-risk'
            }`}
          />
          {engineOnline === null
            ? 'Checking engine…'
            : engineOnline
              ? 'Local engine online'
              : 'Engine unavailable'}
        </div>
        <p className="mt-1 text-[11px] text-ink-faint">Northwind Goods workspace</p>
      </div>
    </aside>
  );
}
