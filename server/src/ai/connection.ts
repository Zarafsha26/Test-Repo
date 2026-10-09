export type DiagnosticStep = {
  name: string;
  ok: boolean;
  detail: string;
};

export type ConnectionDiagnostic = {
  ok: boolean;
  url: string;
  steps: DiagnosticStep[];
};

const PROBE_TIMEOUT_MS = 4000;

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function redactCredentials(value: string): string {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (!url.username && !url.password) return value;
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return value.replace(/\/\/[^/@]+@/, '//');
  }
}

function describeFailure(error: unknown): string {
  const name = (error as Error)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return `No response within ${Math.round(PROBE_TIMEOUT_MS / 1000)} seconds — the server did not answer in time.`;
  }
  const cause = (error as { cause?: { code?: string } })?.cause;
  if (cause?.code === 'ENOTFOUND' || cause?.code === 'ECONNREFUSED') {
    return 'The server could not be found or refused the connection.';
  }
  return 'The server could not be reached from Silex.';
}

export async function diagnoseConnection(
  connection: string,
): Promise<ConnectionDiagnostic> {
  const safeUrl = redactCredentials(connection);
  const steps: DiagnosticStep[] = [];

  if (!isValidHttpUrl(connection)) {
    steps.push({
      name: 'Address is valid',
      ok: false,
      detail: 'Enter a URL that starts with http:// or https://.',
    });
    return { ok: false, url: safeUrl, steps };
  }

  const url = new URL(connection);
  steps.push({
    name: 'Address is valid',
    ok: true,
    detail: `${url.host}${url.pathname === '/' ? '' : url.pathname}`,
  });

  const started = Date.now();
  try {
    const response = await fetch(connection, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (response.ok) {
      steps.push({
        name: 'Endpoint responded',
        ok: true,
        detail: `Answered with HTTP ${response.status} in ${elapsed}s.`,
      });
    } else if (response.status === 405) {
      steps.push({
        name: 'Endpoint responded',
        ok: true,
        detail:
          'The server is reachable but does not accept HEAD checks (HTTP 405).',
      });
    } else {
      steps.push({
        name: 'Endpoint responded',
        ok: false,
        detail: `The server answered with HTTP ${response.status} — check the connection URL or ask the endpoint owner.`,
      });
    }
  } catch (error) {
    steps.push({
      name: 'Endpoint responded',
      ok: false,
      detail: describeFailure(error),
    });
  }

  return { ok: steps.every((step) => step.ok), url: safeUrl, steps };
}
