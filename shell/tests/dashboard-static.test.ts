import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDashboardStaticRoot } from '../src/dashboard-static';

describe('resolveDashboardStaticRoot', () => {
  it('prefers built dashboard dist when it exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermit-static-'));
    const serverDir = path.join(root, 'shell', 'src');
    const distDir = path.join(root, 'shell', 'dashboard', 'dist');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });

    const resolved = resolveDashboardStaticRoot(serverDir);
    expect(resolved).toBe(distDir);
  });

  it('falls back to repository dashboard public source in dev', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermit-static-'));
    const serverDir = path.join(root, 'shell', 'src');
    const publicDir = path.join(root, 'dashboard', 'src', 'public');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    const resolved = resolveDashboardStaticRoot(serverDir);
    expect(resolved).toBe(publicDir);
  });
});
