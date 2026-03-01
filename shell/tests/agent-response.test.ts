import { describe, expect, it } from 'vitest';
import { parseAgentResponse, parseFileAction } from '../src/agent-response';

describe('parseAgentResponse', () => {
  it('parses deterministic json payload', () => {
    const result = parseAgentResponse('{"userId":"100","message":"Done","action":"FILE:report.pdf","terminal":"python run.py"}');
    expect(result.userId).toBe('100');
    expect(result.message).toBe('Done');
    expect(result.action).toBe('FILE:report.pdf');
    expect(result.terminal).toBe('python run.py');
  });

  it('falls back to raw output when no json exists', () => {
    const result = parseAgentResponse('Plain response');
    expect(result.message).toBe('Plain response');
    expect(result.action).toBe('');
  });
});

describe('parseFileAction', () => {
  it('returns only safe file names', () => {
    expect(parseFileAction('FILE:invoice.txt')).toBe('invoice.txt');
    expect(parseFileAction('FILE:../secrets.txt')).toBeNull();
    expect(parseFileAction('')).toBeNull();
  });
});

