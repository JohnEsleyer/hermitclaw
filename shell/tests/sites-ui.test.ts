import { describe, it, expect } from 'vitest';
import { renderSitesTable } from '../../dashboard/src/public/sites-ui.js';

describe('sites-ui renderer', () => {
  it('renders empty state', () => {
    const html = renderSitesTable([]);
    expect(html).toContain('No apps found');
  });

  it('renders site rows with web apps', () => {
    const html = renderSitesTable([
      {
        agentId: 7,
        userId: 42,
        agentName: 'Builder',
        imageLabel: 'hermitshell/python',
        webApps: [
          {
            agentId: 7,
            userId: 42,
            workspaceId: '7_42',
            siteName: 'myapp',
            agentName: 'Builder',
            imageLabel: 'hermitshell/python',
            previewUrl: 'https://demo.example/preview/7/8080/',
            localUrl: 'http://localhost:8080/',
            hasPassword: false,
            hasIndexHtml: true,
            hasStyles: false,
            files: ['index.html', 'style.css'],
            containerLabel: '7_42'
          }
        ],
        hasPassword: false,
        passwordUpdatedAt: '2026-01-01T00:00:00.000Z',
        containerLabel: '7_42'
      }
    ]);

    expect(html).toContain('Builder');
    expect(html).toContain('myapp');
    expect(html).toContain('index.html');
    expect(html).toContain('Open');
    expect(html).toContain('js-delete-site');
    expect(html).toContain('Container: 7_42');
  });
});
