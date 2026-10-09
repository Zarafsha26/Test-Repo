import { afterEach, describe, expect, test } from 'bun:test';
import { callAgentEndpoint } from './adapter';

describe('callAgentEndpoint', () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  afterEach(() => {
    server?.stop(true);
    server = null;
  });

  const listen = (handler: (req: Request) => Response | Promise<Response>) => {
    server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handler });
    return `http://127.0.0.1:${server.port}/`;
  };

  const call = (connection: string) =>
    callAgentEndpoint({
      connection,
      agentName: 'Test Agent',
      purpose: 'Tests endpoints.',
      prompt: 'Hello there.',
    });

  test('reads a JSON reply field', async () => {
    const url = listen(() => Response.json({ reply: 'Sure — here is the answer.' }));
    const result = await call(url);
    expect(result.text).toBe('Sure — here is the answer.');
    expect(result.tokens).toBeGreaterThan(0);
  });

  test('accepts plain text replies from agent APIs', async () => {
    const url = listen(
      () => new Response('All good.', { headers: { 'Content-Type': 'text/plain' } }),
    );
    expect((await call(url)).text).toBe('All good.');
  });

  test('rejects a web page served with a text/html content type', async () => {
    const url = listen(
      () =>
        new Response('<!DOCTYPE html><html><body>marketing page</body></html>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    );
    await expect(call(url)).rejects.toThrow(/web page/);
  });

  test('rejects an HTML body even when the content type is not html', async () => {
    const url = listen(
      () =>
        new Response('<html><body>hidden page</body></html>', {
          headers: { 'Content-Type': 'text/plain' },
        }),
    );
    await expect(call(url)).rejects.toThrow(/web page/);
  });

  test('rejects an empty response', async () => {
    const url = listen(() => new Response('', { status: 200 }));
    await expect(call(url)).rejects.toThrow(/empty/);
  });

  test('reports non-2xx statuses', async () => {
    const url = listen(() => new Response(null, { status: 501 }));
    await expect(call(url)).rejects.toThrow('501');
  });

  test('reports unreachable endpoints', async () => {
    await expect(call('http://127.0.0.1:9/')).rejects.toThrow(/reach/i);
  });
});
