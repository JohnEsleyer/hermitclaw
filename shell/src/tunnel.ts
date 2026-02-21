import { spawn, ChildProcess } from 'child_process';
import { setSetting, getSetting } from './db';

let tunnelProcess: ChildProcess | null = null;
let currentUrl: string | null = null;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;

export function getTunnelUrl(): string | null {
    return currentUrl;
}

export function isTunnelRunning(): boolean {
    return tunnelProcess !== null && !tunnelProcess.killed;
}

export async function startTunnel(port: number): Promise<string | null> {
    if (tunnelProcess && !tunnelProcess.killed) {
        console.log('[Tunnel] Already running, returning existing URL');
        return currentUrl;
    }

    const existingUrl = await getSetting('public_url');
    if (existingUrl && existingUrl.includes('trycloudflare.com')) {
        const recent = await getSetting('tunnel_started_at');
        if (recent) {
            const startedAt = new Date(recent).getTime();
            const hoursSinceStart = (Date.now() - startedAt) / (1000 * 60 * 60);
            if (hoursSinceStart < 12) {
                console.log('[Tunnel] Using existing tunnel URL from DB');
                currentUrl = existingUrl;
                return existingUrl;
            }
        }
    }

    return new Promise((resolve) => {
        console.log('[Tunnel] Starting Cloudflare Quick Tunnel...');
        
        try {
            tunnelProcess = spawn('cloudflared', [
                'tunnel',
                '--url', `http://localhost:${port}`
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.log('[Tunnel] Timeout waiting for URL, continuing without tunnel');
                    resolve(null);
                }
            }, 30000);

            tunnelProcess.stderr?.on('data', async (data: Buffer) => {
                const line = data.toString();
                
                const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                if (match && !resolved) {
                    clearTimeout(timeout);
                    resolved = true;
                    currentUrl = match[0];
                    
                    console.log(`[Tunnel] ✅ Public URL: ${currentUrl}`);
                    
                    await setSetting('public_url', currentUrl);
                    await setSetting('tunnel_started_at', new Date().toISOString());
                    
                    restartAttempts = 0;
                    resolve(currentUrl);
                }
            });

            tunnelProcess.on('error', (err) => {
                console.error('[Tunnel] Failed to start:', err.message);
                if (!resolved) {
                    clearTimeout(timeout);
                    resolved = true;
                    resolve(null);
                }
            });

            tunnelProcess.on('exit', (code) => {
                console.log(`[Tunnel] Process exited with code ${code}`);
                tunnelProcess = null;
                
                if (!resolved) {
                    clearTimeout(timeout);
                    resolved = true;
                    resolve(null);
                } else if (code !== 0 && restartAttempts < MAX_RESTART_ATTEMPTS) {
                    restartAttempts++;
                    console.log(`[Tunnel] Restarting (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
                    setTimeout(() => startTunnel(port), 5000);
                }
            });
        } catch (err: any) {
            console.error('[Tunnel] Spawn error:', err.message);
            resolve(null);
        }
    });
}

export function stopTunnel(): void {
    if (tunnelProcess && !tunnelProcess.killed) {
        console.log('[Tunnel] Stopping...');
        tunnelProcess.kill('SIGTERM');
        tunnelProcess = null;
        currentUrl = null;
    }
}

export async function syncWebhooks(port: number): Promise<number> {
    const { getAllAgents } = await import('./db');
    const { registerWebhook } = await import('./telegram');
    
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'crabshell-webhook-secret';
    
    if (!currentUrl) {
        console.log('[Tunnel] No tunnel URL, skipping webhook sync');
        return 0;
    }
    
    const agents = await getAllAgents();
    let successCount = 0;
    
    for (const agent of agents) {
        if (agent.is_active && agent.telegram_token) {
            try {
                const ok = await registerWebhook(agent.telegram_token, currentUrl, WEBHOOK_SECRET);
                if (ok) successCount++;
            } catch (err) {
                console.error(`[Tunnel] Failed to sync webhook for agent ${agent.id}`);
            }
        }
    }
    
    console.log(`[Tunnel] Synced ${successCount}/${agents.length} webhooks`);
    return successCount;
}
