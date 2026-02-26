import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverSitesFromWorkspaces } from '../src/sites';

describe('discoverSitesFromWorkspaces', () => {
  it('returns only workspaces with visible www files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermit-sites-'));
    fs.mkdirSync(path.join(root, '1_10', 'www'), { recursive: true });
    fs.mkdirSync(path.join(root, '1_20', 'www'), { recursive: true });
    fs.mkdirSync(path.join(root, '2_10', 'www'), { recursive: true });
    fs.writeFileSync(path.join(root, '1_10', 'www', 'index.html'), '<h1>x</h1>');
    fs.writeFileSync(path.join(root, '2_10', 'www', '.keep'), '');

    const sites = discoverSitesFromWorkspaces(
      root,
      [{ id: 1, name: 'Builder', docker_image: 'hermitshell/python:latest' }],
      'https://demo.example',
      (agentId) => agentId === 1 ? { password: 'abc123', updatedAt: 1700000000000 } : null
    );

    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      agentId: 1,
      userId: 10,
      agentName: 'Builder',
      imageLabel: 'hermitshell/python',
      previewUrl: 'https://demo.example/preview/1/8080/',
      localUrl: '/preview/1/8080/',
      hasPassword: true
    });
  });

  it('falls back to Agent #id and unknown image when metadata missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermit-sites-'));
    fs.mkdirSync(path.join(root, '5_99', 'www'), { recursive: true });
    fs.writeFileSync(path.join(root, '5_99', 'www', 'app.js'), 'console.log(1)');

    const sites = discoverSitesFromWorkspaces(root, [], 'http://localhost:3000/', () => null);

    expect(sites).toHaveLength(1);
    expect(sites[0].agentName).toBe('Agent #5');
    expect(sites[0].imageLabel).toBe('unknown');
    expect(sites[0].previewUrl).toBe('http://localhost:3000/preview/5/8080/');
    expect(sites[0].hasPassword).toBe(false);
  });
});
