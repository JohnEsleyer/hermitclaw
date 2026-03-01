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
      return '<div class="text-slate-500 text-sm p-4">No apps found. Click Scan after agents create folders in <span class="mono text-orange-300">/workspace/www</span> with index.html.</div>';
    }

    const siteCards = sites.map((site) => {
      const name = escapeHtml(site.agentName || `Agent #${site.agentId}`);
      const userId = escapeHtml(site.userId);
      const webApps = site.webApps || [];
      
      const webAppCards = webApps.map(app => {
        const thumbnail = app.screenshotUrl
          ? `<img src="${escapeHtml(app.screenshotUrl)}" alt="${escapeHtml(app.siteName)}" class="w-full h-36 object-cover rounded-lg border border-slate-700">`
          : '<div class="w-full h-36 rounded-lg border border-dashed border-slate-700 bg-slate-900/60 flex items-center justify-center text-xs text-slate-500">No screenshot yet</div>';
        return `
        <div class="bg-slate-800/50 rounded-lg p-3">
          ${thumbnail}
          <div class="mt-3 flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-white font-medium">${escapeHtml(app.siteName)}</span>
                ${app.hasIndexHtml ? '<span class="text-xs px-1.5 py-0.5 rounded bg-green-600/20 text-green-400">index.html</span>' : ''}
              </div>
              <div class="text-xs text-slate-500 mt-1">${app.files?.length || 0} files</div>
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <button class="site-view-btn bg-orange-600 hover:bg-orange-500 text-white text-xs py-1.5 px-3 rounded-lg flex items-center gap-1"
                data-agent-id="${site.agentId}" data-user-id="${site.userId}" data-site-name="${app.siteName}" data-preview-url="${escapeHtml(app.previewUrl)}"
                onclick="openSitePreview(${site.agentId}, ${site.userId}, '${app.siteName}', '${app.previewUrl}')">
              <i data-lucide="eye" class="w-3 h-3"></i> Open
            </button>
            <button class="bg-purple-600 hover:bg-purple-500 text-white text-xs py-1.5 px-3 rounded-lg" onclick="captureSiteScreenshotFor(${site.agentId}, ${site.userId}, '${app.siteName}')">Screenshot</button>
            <button class="js-delete-app text-red-400 hover:text-red-300 text-xs py-1.5 px-2 rounded-lg" data-agent-id="${site.agentId}" data-user-id="${site.userId}" data-site-name="${escapeHtml(app.siteName)}">Delete</button>
          </div>
        </div>`;
      }).join('');

      const avatar = site.profilePictureUrl
        ? `<img src="${escapeHtml(site.profilePictureUrl)}" alt="${name}" class="agent-avatar-mini">`
        : '<div class="agent-avatar-mini"></div>';

      return `
        <div class="glass-card p-4 rounded-xl">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h4 class="text-white font-bold">${name}</h4>
              <div class="text-xs text-slate-500">User: ${userId} | Container: ${escapeHtml(site.containerLabel || site.workspaceId || 'unknown')}</div>
            </div>
            <button class="js-delete-site text-red-400 hover:text-red-300 p-1 rounded" data-agent-id="${site.agentId}" data-user-id="${site.userId}" title="Delete Site">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-400 mb-3">${avatar}<span>${name}</span></div>
          <div class="space-y-2">
            ${webAppCards || '<div class="text-xs text-slate-500">No web apps detected. Create folders in www/ with index.html</div>'}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="flex items-center justify-between mb-4 text-xs text-slate-400">
        <span>${sites.length} workspace${sites.length === 1 ? '' : 's'} with www/</span>
        <span>Apps: each folder in www/ with index.html</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${siteCards}
      </div>`;
  }

  const api = { renderSitesTable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SitesUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
