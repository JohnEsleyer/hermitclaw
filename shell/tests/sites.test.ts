import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverSitesFromWorkspaces, deleteSiteWorkspace, deleteWebApp } from '../src/sites';

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

  it('deletes only the selected site workspace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermit-sites-'));
    const siteA = path.join(root, '5_10', 'www');
    const siteB = path.join(root, '6_11', 'www');
    fs.mkdirSync(siteA, { recursive: true });
    fs.mkdirSync(siteB, { recursive: true });
    fs.writeFileSync(path.join(siteA, 'index.html'), '<h1>a</h1>');
    fs.writeFileSync(path.join(siteB, 'index.html'), '<h1>b</h1>');

    const removed = deleteSiteWorkspace(root, 5, 10);

    expect(removed).toBe(true);
    expect(fs.existsSync(siteA)).toBe(false);
    expect(fs.existsSync(siteB)).toBe(true);
  });

  it('returns false when selected site does not exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermit-sites-'));
    const removed = deleteSiteWorkspace(root, 404, 505);
    expect(removed).toBe(false);
  });

  it('deletes one app folder without removing full www folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermit-sites-'));
    const appA = path.join(root, '9_4', 'www', 'alpha');
    const appB = path.join(root, '9_4', 'www', 'beta');
    fs.mkdirSync(appA, { recursive: true });
    fs.mkdirSync(appB, { recursive: true });
    fs.writeFileSync(path.join(appA, 'index.html'), 'a');
    fs.writeFileSync(path.join(appB, 'index.html'), 'b');

    const removed = deleteWebApp(root, 9, 4, 'alpha');
    expect(removed).toBe(true);
    expect(fs.existsSync(appA)).toBe(false);
    expect(fs.existsSync(appB)).toBe(true);
  });
});
