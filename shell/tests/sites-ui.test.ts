import { describe, it, expect } from 'vitest';
import { renderSitesTable } from '../../dashboard/src/public/sites-ui.js';

describe('sites-ui renderer', () => {
  it('renders empty state', () => {
    const html = renderSitesTable([]);
    expect(html).toContain('No published web apps found');
  });

  it('renders site rows with password controls', () => {
    const html = renderSitesTable([
      {
        agentId: 7,
        userId: 42,
        agentName: 'Builder',
        imageLabel: 'hermitshell/python',
        previewUrl: 'https://demo.example/preview/7/8080/',
        hasPassword: true,
        passwordUpdatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]);

    expect(html).toContain('Builder');
    expect(html).toContain('https://demo.example/preview/7/8080/');
    expect(html).toContain('Reveal Password');
    expect(html).toContain('js-regenerate-password');
    expect(html).toContain('js-delete-site');
    expect(html).toContain('site-password-7-8080');
  });
});
