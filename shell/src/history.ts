import * as fs from 'fs';
import * as path from 'path';

interface Message {
  role: string;
  content: string;
}

const HISTORY_DIR = path.join(__dirname, '../../data/history');

function ensureHistoryDir() {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getHistoryPath(scope: string): string {
  ensureHistoryDir();
  return path.join(HISTORY_DIR, `${sanitizeSegment(scope)}.json`);
}

export function loadHistory(scope: string): Message[] {
  const historyPath = getHistoryPath(scope);

  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const data = fs.readFileSync(historyPath, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(scope: string, history: Message[]): void {
  const historyPath = getHistoryPath(scope);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

export function clearHistory(scope: string): void {
  const historyPath = getHistoryPath(scope);
  if (fs.existsSync(historyPath)) {
    fs.unlinkSync(historyPath);
  }
}
