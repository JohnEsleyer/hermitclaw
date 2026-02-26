import * as fs from 'fs';
import * as path from 'path';

type AgentLike = { id: number; name: string; docker_image?: string | null };

export type SiteRecord = {
    agentId: number;
    userId: number;
    workspaceId: string;
    agentName: string;
    imageLabel: string;
    previewUrl: string;
    localUrl: string;
    hasPassword: boolean;
    password?: string;
    passwordUpdatedAt?: string;
};

export type PasswordLookup = (agentId: number, port: number) => { password?: string; updatedAt?: number } | null;

function normalizeImageLabel(image?: string | null): string {
    if (!image || typeof image !== 'string') return 'unknown';
    return image.split(':')[0] || 'unknown';
}

function hasVisibleFiles(dir: string): boolean {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isFile()) return true;
        if (entry.isDirectory() && hasVisibleFiles(full)) return true;
    }
    return false;
}

function parseWorkspaceName(name: string): { agentId: number; userId: number } | null {
    const match = name.match(/^(\d+)_(\d+)$/);
    if (!match) return null;
    return { agentId: Number(match[1]), userId: Number(match[2]) };
}

export function discoverSitesFromWorkspaces(
    workspaceDir: string,
    agents: AgentLike[],
    baseUrl: string,
    getPassword: PasswordLookup
): SiteRecord[] {
    if (!fs.existsSync(workspaceDir)) return [];

    const byId = new Map(agents.map((a) => [Number(a.id), a]));
    const cleanBase = String(baseUrl || '').replace(/\/$/, '');
    const workspaces = fs.readdirSync(workspaceDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    const records: SiteRecord[] = [];

    for (const ws of workspaces) {
        const parsed = parseWorkspaceName(ws.name);
        if (!parsed) continue;

        const wwwPath = path.join(workspaceDir, ws.name, 'www');
        if (!fs.existsSync(wwwPath) || !fs.statSync(wwwPath).isDirectory()) continue;
        if (!hasVisibleFiles(wwwPath)) continue;

        const agent = byId.get(parsed.agentId);
        const password = getPassword(parsed.agentId, 8080);

        records.push({
            agentId: parsed.agentId,
            userId: parsed.userId,
            workspaceId: ws.name,
            agentName: agent?.name || `Agent #${parsed.agentId}`,
            imageLabel: normalizeImageLabel(agent?.docker_image),
            previewUrl: `${cleanBase}/preview/${parsed.agentId}/8080/`,
            localUrl: `/preview/${parsed.agentId}/8080/`,
            hasPassword: !!password?.password,
            password: password?.password,
            passwordUpdatedAt: password?.updatedAt ? new Date(password.updatedAt).toISOString() : undefined
        });
    }

    return records.sort((a, b) => {
        if (a.agentName !== b.agentName) return a.agentName.localeCompare(b.agentName);
        return a.userId - b.userId;
    });
}

export function deleteSiteWorkspace(workspaceDir: string, agentId: number, userId: number): boolean {
    if (!Number.isFinite(agentId) || !Number.isFinite(userId)) return false;
    const workspaceName = `${Math.trunc(agentId)}_${Math.trunc(userId)}`;
    const workspacePath = path.join(workspaceDir, workspaceName);
    const wwwPath = path.join(workspacePath, 'www');

    if (!fs.existsSync(wwwPath) || !fs.statSync(wwwPath).isDirectory()) return false;

    fs.rmSync(wwwPath, { recursive: true, force: true });

    const remaining = fs.readdirSync(workspacePath, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.'));
    if (remaining.length === 0) {
        fs.rmSync(workspacePath, { recursive: true, force: true });
    }

    return true;
}
