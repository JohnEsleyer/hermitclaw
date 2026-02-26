import { describe, it, expect } from 'vitest';
import { CALENDAR_SYMBOL_OPTIONS, normalizeCalendarSymbol } from '../../dashboard/src/public/calendar-symbols.js';

describe('calendar symbol picker helpers', () => {
  it('exports default symbol options for the picker', () => {
    expect(Array.isArray(CALENDAR_SYMBOL_OPTIONS)).toBe(true);
    expect(CALENDAR_SYMBOL_OPTIONS.length).toBeGreaterThan(5);
    expect(CALENDAR_SYMBOL_OPTIONS).toContain('•');
    expect(CALENDAR_SYMBOL_OPTIONS).toContain('✨');
  });

  it('normalizes invalid symbols back to default bullet marker', () => {
    expect(normalizeCalendarSymbol('')).toBe('•');
    expect(normalizeCalendarSymbol('nope')).toBe('•');
    expect(normalizeCalendarSymbol('✨')).toBe('✨');
  });
});
