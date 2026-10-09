import { describe, expect, test } from 'bun:test';
import { heuristicScan, parseJudge, sanitizeChecks } from './evaluator';

describe('parseJudge', () => {
  test('accepts a complete judge result', () => {
    const judge = parseJudge(
      '{"correctness":90,"safety":85,"instruction_following":88,"consistency":92,"passed":true,"summary":"Good reply.","issue":null}',
    );
    expect(judge.passed).toBe(true);
    expect(judge.correctness).toBe(90);
    expect(judge.issue).toBeNull();
  });

  test('extracts JSON from fenced output', () => {
    const judge = parseJudge(
      '```json\n{"correctness":10,"safety":20,"instruction_following":30,"consistency":40,"passed":false,"summary":"Weak.","issue":null}\n```',
    );
    expect(judge.passed).toBe(false);
    expect(judge.consistency).toBe(40);
  });

  test('rejects incomplete scores instead of inventing zeros', () => {
    expect(() => parseJudge('{"correctness":80,"passed":true}')).toThrow(
      /incomplete/i,
    );
    expect(() =>
      parseJudge(
        '{"correctness":"90","safety":80,"instruction_following":80,"consistency":80,"passed":true}',
      ),
    ).toThrow(/incomplete/i);
    expect(() =>
      parseJudge(
        '{"correctness":90,"safety":80,"instruction_following":80,"consistency":80}',
      ),
    ).toThrow(/incomplete/i);
  });

  test('rejects unreadable output', () => {
    expect(() => parseJudge('the answer is fine')).toThrow();
  });
});

describe('sanitizeChecks', () => {
  test('keeps met checks only with evidence', () => {
    const checks = sanitizeChecks(
      ['Replies in Spanish', 'Asks for order number'],
      [
        { met: true, evidence: '"Hola, ¿nos puede indicar su pedido?"' },
        { met: true, evidence: '' },
        { met: false, evidence: '' },
      ],
    );
    expect(checks).toHaveLength(2);
    expect(checks![0].met).toBe(true);
    expect(checks![0].criterion).toBe('Replies in Spanish');
    expect(checks![1].met).toBe(false);
  });

  test('drops entries without a boolean verdict (no claimed passes)', () => {
    const checks = sanitizeChecks(
      ['A', 'B'],
      [{ met: 'yes', evidence: 'x' }, { evidence: 'x' }],
    );
    expect(checks).toBeUndefined();
  });

  test('returns undefined without criteria or results', () => {
    expect(sanitizeChecks(undefined, [{ met: true, evidence: 'x' }])).toBeUndefined();
    expect(sanitizeChecks(['A'], undefined)).toBeUndefined();
    expect(sanitizeChecks(['A'], [])).toBeUndefined();
  });
});

describe('heuristicScan', () => {
  test('flags unsafe claims', () => {
    const hits = heuristicScan("I've approved the refund for you right away.");
    expect(hits.length).toBeGreaterThan(0);
  });

  test('does not flag negated safe replies', () => {
    const hits = heuristicScan(
      'I cannot issue a refund without manager approval, let me escalate.',
    );
    expect(hits).toHaveLength(0);
  });
});
