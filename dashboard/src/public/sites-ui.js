(function (global) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderSitesTable(sites) {
    if (!sites || sites.length === 0) {
      return '<div class="text-slate-500 text-sm">No published web apps found. Ask an agent to place files in <span class="mono text-orange-300">/workspace/www</span>.</div>';
    }

    const rows = sites.map((site) => {
      const name = escapeHtml(site.agentName || `Agent #${site.agentId}`);
      const image = escapeHtml(site.imageLabel || 'unknown');
      const url = escapeHtml(site.previewUrl);
      const userId = escapeHtml(site.userId);
      const passwordMeta = site.passwordUpdatedAt
        ? `<div class="text-[11px] text-slate-500 mt-1">updated ${escapeHtml(new Date(site.passwordUpdatedAt).toLocaleString())}</div>`
        : '<div class="text-[11px] text-slate-500 mt-1">not generated yet</div>';

      return `
        <tr class="border-b border-slate-800/80 last:border-b-0">
          <td class="px-4 py-3 text-white font-medium">${name}<div class="text-xs text-slate-500 mt-1">user ${userId}</div></td>
          <td class="px-4 py-3"><span class="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs mono">${image}</span></td>
          <td class="px-4 py-3"><a class="text-orange-300 hover:text-orange-200 mono text-xs break-all" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-2">
              <button class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs py-1.5 px-2.5 rounded js-copy-site-url" data-copy-url="${url}">Copy URL</button>
              <button class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs py-1.5 px-2.5 rounded js-reveal-password" data-agent-id="${site.agentId}" data-port="8080">Reveal Password</button>
              <button class="bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/30 text-orange-300 text-xs py-1.5 px-2.5 rounded js-regenerate-password" data-agent-id="${site.agentId}" data-port="8080">Regenerate</button>
              <button class="bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 text-red-300 text-xs py-1.5 px-2.5 rounded js-delete-site" data-agent-id="${site.agentId}" data-user-id="${site.userId}">Delete Site</button>
            </div>
            <div class="text-xs text-slate-400 mt-2">Password: <span class="mono text-emerald-300" id="site-password-${site.agentId}-8080">${site.password || (site.hasPassword ? '••••••••' : 'Not set')}</span></div>
            ${passwordMeta}
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="flex items-center justify-between mb-3 text-xs text-slate-400">
        <span>${sites.length} published site${sites.length === 1 ? '' : 's'}</span>
        <span>Source: workspaces/*/www</span>
      </div>
      <div class="overflow-x-auto rounded-xl border border-slate-800/80">
        <table class="w-full text-sm">
          <thead class="bg-slate-800/50 text-slate-400">
            <tr>
              <th class="px-4 py-3 text-left font-mono">AGENT</th>
              <th class="px-4 py-3 text-left font-mono">IMAGE</th>
              <th class="px-4 py-3 text-left font-mono">TUNNEL URL</th>
              <th class="px-4 py-3 text-left font-mono">PASSWORD CONTROL</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const api = { renderSitesTable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SitesUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
