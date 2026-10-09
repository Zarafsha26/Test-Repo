import { afterEach, describe, expect, test } from 'bun:test';
import { diagnoseConnection, isValidHttpUrl, redactCredentials } from './connection';

describe('isValidHttpUrl', () => {
  test('accepts http and https', () => {
    expect(isValidHttpUrl('https://agent.example.com/test')).toBe(true);
    expect(isValidHttpUrl('http://localhost:3000/hook')).toBe(true);
  });

  test('rejects other schemes and garbage', () => {
    expect(isValidHttpUrl('ftp://agent.example.com')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
  });
});

describe('redactCredentials', () => {
  test('strips userinfo from URLs', () => {
    expect(redactCredentials('https://user:secret@agent.example.com/test')).toBe(
      'https://agent.example.com/test',
    );
    expect(redactCredentials('https://token@api.example.com/hook?x=1')).toBe(
      'https://api.example.com/hook?x=1',
    );
  });

  test('leaves clean URLs unchanged', () => {
    expect(redactCredentials('https://agent.example.com/test')).toBe(
      'https://agent.example.com/test',
    );
    expect(redactCredentials('')).toBe('');
  });

  test('never throws on malformed input and still strips userinfo', () => {
    expect(redactCredentials('http://user:pass@')).toBe('http://');
    expect(redactCredentials('::::')).toBe('::::');
  });
});

describe('diagnoseConnection', () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  afterEach(() => {
    server?.stop(true);
    server = null;
  });

  const listen = (handler: (req: Request) => Response | Promise<Response>) => {
    server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handler });
    return `http://127.0.0.1:${server.port}/`;
  };

  test('reports success against a healthy endpoint', async () => {
    const url = listen(() => new Response(null, { status: 200 }));
    const result = await diagnoseConnection(url);
    expect(result.ok).toBe(true);
    expect(result.steps.every((step) => step.ok)).toBe(true);
  });

  test('treats HEAD-unsupported endpoints (405) as reachable', async () => {
    const url = listen(() => new Response(null, { status: 405 }));
    const result = await diagnoseConnection(url);
    expect(result.ok).toBe(true);
    expect(result.steps[1].detail).toContain('405');
  });

  test('fails with the HTTP status for wrong URLs (404)', async () => {
    const url = listen(() => new Response(null, { status: 404 }));
    const result = await diagnoseConnection(url);
    expect(result.ok).toBe(false);
    expect(result.steps[1].detail).toContain('404');
  });

  test('fails clearly when nothing is listening', async () => {
    const result = await diagnoseConnection('http://127.0.0.1:9/');
    expect(result.ok).toBe(false);
    expect(result.steps.at(-1)!.detail.length).toBeGreaterThan(10);
  });

  test('redacts credentials in the reported URL', async () => {
    const url = listen(() => new Response(null, { status: 200 }));
    const withCreds = url.replace('http://', 'http://user:secret@');
    const result = await diagnoseConnection(withCreds);
    expect(result.url).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
