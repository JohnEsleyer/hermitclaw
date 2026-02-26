(function (global) {
  const CALENDAR_SYMBOL_OPTIONS = ['•', '✨', '📅', '🚀', '✅', '⚠️', '🔥', '💡', '🧪', '📌', '⏰'];

  function normalizeCalendarSymbol(value) {
    const symbol = String(value || '').trim();
    return CALENDAR_SYMBOL_OPTIONS.includes(symbol) ? symbol : '•';
  }

  const api = { CALENDAR_SYMBOL_OPTIONS, normalizeCalendarSymbol };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.CalendarSymbols = api;
})(typeof window !== 'undefined' ? window : globalThis);
