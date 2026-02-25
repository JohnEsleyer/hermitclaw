import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import { createAuditLog, getAgentById, getAllSettings, getSetting, getActiveMeetings } from './db';
import { sendApprovalRequest } from './telegram';

let docker: Docker;
try {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
} catch {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
}

interface Message { role: string; content: string; }

interface AgentConfig {
    agentId: number;
    agentName: string;
    agentRole: string;
    dockerImage: string;
    userMessage: string;
    history: Message[];
    maxTokens: number;
    requireApproval?: boolean;
    userId?: number;
    onProgress?: ProgressCallback;
    llmProvider?: string;
    llmModel?: string;
}

interface SpawnResult {
    containerId: string;
    output: string;
}

type ProgressCallback = (status: string, details?: string) => void;

const WORKSPACE_DIR = path.join(__dirname, '../../data/workspaces');
const CACHE_DIR = path.join(__dirname, '../../data/cache');

[WORKSPACE_DIR, CACHE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const LABEL_PREFIX = 'hermitshell.';
const LABELS = {
    AGENT_ID: `${LABEL_PREFIX}agent_id`,
    USER_ID: `${LABEL_PREFIX}user_id`,
    LAST_ACTIVE: `${LABEL_PREFIX}last_active`,
    STATUS: `${LABEL_PREFIX}status`,
    CREATED_AT: `${LABEL_PREFIX}created_at`
};

async function findContainerByLabels(agentId: number, userId: number) {
    const containers = await docker.listContainers({ all: true });
    for (const container of containers) {
        const labels = container.Labels || {};
        if (labels[LABELS.AGENT_ID] === String(agentId) && labels[LABELS.USER_ID] === String(userId)) {
            return { id: container.Id, state: container.State, labels: labels as Record<string, string> };
        }
    }
    return null;
}

export async function getOrCreateCubicle(config: AgentConfig): Promise<Docker.Container> {
    const userId = config.userId || 0;
    const existing = await findContainerByLabels(config.agentId, userId);

    if (existing) {
        const container = docker.getContainer(existing.id);
        if (existing.state !== 'running') {
            console.log(`[Cubicle] Waking up container ${existing.id.slice(0, 12)}`);
            await container.start();
        }
        await updateContainerLastActive(existing.id);
        return container;
    }

    return await createNewCubicle(config);
}

async function updateContainerLastActive(containerId: string): Promise<void> {
    try {
        const container = docker.getContainer(containerId);
        const now = new Date().toISOString();
        const existingInfo = await container.inspect();
        await container.update({
            Labels: { ...(existingInfo.Config?.Labels || {}), [LABELS.LAST_ACTIVE]: now, [LABELS.STATUS]: 'active' }
        });
    } catch (err) { }
}

async function createNewCubicle(config: AgentConfig): Promise<Docker.Container> {
    const imageName = config.dockerImage || 'hermit/base:latest';
    const userId = config.userId || 0;
    const workspaceId = `${config.agentId}_${userId}`;
    const workspacePath = path.join(WORKSPACE_DIR, workspaceId);

    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }
    fs.mkdirSync(path.join(workspacePath, 'out'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'in'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'www'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'work'), { recursive: true });

    const settings = await getAllSettings();
    const provider = config.llmProvider || settings.default_provider || 'openrouter';
    const model = config.llmModel || settings.default_model || 'auto';

    const envVars = [
        `AGENT_ID=${config.agentId}`,
        `AGENT_NAME=${config.agentName}`,
        `AGENT_ROLE=${config.agentRole}`,
        `DOCKER_IMAGE=${config.dockerImage}`,
        `LLM_PROVIDER=${provider}`,
        `LLM_MODEL=${model}`,
    ];

    if (config.requireApproval) envVars.push('HITL_ENABLED=true');

    const now = new Date().toISOString();
    const binds = [`${workspacePath}:/app/workspace:rw`];

    const pipCachePath = path.join(CACHE_DIR, 'pip');
    const npmCachePath = path.join(CACHE_DIR, 'npm');
    if (!fs.existsSync(pipCachePath)) fs.mkdirSync(pipCachePath, { recursive: true });
    if (!fs.existsSync(npmCachePath)) fs.mkdirSync(npmCachePath, { recursive: true });
    binds.push(`${pipCachePath}:/root/.cache/pip:rw`, `${npmCachePath}:/root/.npm:rw`);

    const createdContainer = await docker.createContainer({
        Image: imageName,
        Env: envVars,
        Cmd: ['sleep', 'infinity'],
        HostConfig: {
            AutoRemove: false,
            Memory: 512 * 1024 * 1024,
            CpuQuota: 100000,
            PidsLimit: 100,
            NetworkMode: 'bridge',
            Binds: binds,
        },
        Labels: {
            [LABELS.AGENT_ID]: String(config.agentId),
            [LABELS.USER_ID]: String(userId),
            [LABELS.LAST_ACTIVE]: now,
            [LABELS.STATUS]: 'active',
            [LABELS.CREATED_AT]: now,
        }
    });

    console.log(`[Cubicle] Created continuous container ${createdContainer.id.slice(0, 12)}`);
    await createdContainer.start();
    return createdContainer;
}

export async function spawnAgent(config: AgentConfig): Promise<SpawnResult> {
    const settings = await getAllSettings();
    const provider = config.llmProvider || settings.default_provider || 'openrouter';
    const model = config.llmModel || settings.default_model || 'auto';
    const providerKeyMap: Record<string, { key: string; env: string }> = {
        'openai': { key: 'openai_api_key', env: 'OPENAI_API_KEY' },
        'anthropic': { key: 'anthropic_api_key', env: 'ANTHROPIC_API_KEY' },
        'google': { key: 'google_api_key', env: 'GOOGLE_API_KEY' },
        'groq': { key: 'groq_api_key', env: 'GROQ_API_KEY' },
        'openrouter': { key: 'openrouter_api_key', env: 'OPENROUTER_API_KEY' },
        'mistral': { key: 'mistral_api_key', env: 'MISTRAL_API_KEY' },
        'deepseek': { key: 'deepseek_api_key', env: 'DEEPSEEK_API_KEY' },
        'xai': { key: 'xai_api_key', env: 'XAI_API_KEY' },
    };

    if (!settings[providerKeyMap[provider]?.key] && !process.env[providerKeyMap[provider]?.env]) {
        return { containerId: '', output: `❌ **SYSTEM ERROR**: Missing API Key for '${provider}'.` };
    }

    try {
        const container = await getOrCreateCubicle(config);
        const containerId = container.id;

        const { getAgentMemories } = require('./db');
        const memories = await getAgentMemories(config.agentId, 20);
        let injectedHistory = [...config.history];

        if (memories && memories.length > 0) {
            const memoryText = memories.map((m: any) => `- ${m.content}`).join('\n');
            injectedHistory.unshift({
                role: 'system',
                content: `Here are important facts, rules, and preferences you should remember for this user:\n${memoryText}`
            });
        }

        const historyB64 = Buffer.from(JSON.stringify(injectedHistory)).toString('base64');

        const exec = await container.exec({
            Cmd: ['sh', '-c', 'python3 /usr/local/bin/agent.py 2>&1 | tee -a /app/workspace/work/.hermit.log'],
            Env: [
                `USER_MSG=${config.userMessage}`,
                `HISTORY=${historyB64}`,
                `MAX_TOKENS=${config.maxTokens}`,
                `LLM_PROVIDER=${provider}`,
                `LLM_MODEL=${model}`,
                `ORCHESTRATOR_URL=http://172.17.0.1:3000`,
                ...((await container.inspect()).Config.Env || [])
            ],
            AttachStdout: true,
            AttachStderr: true
        });

        const stream = await exec.start({ hijack: true, stdin: false });

        return await new Promise((resolve, reject) => {
            let output = '';
            let approvalLogId: number | null = null;
            let lastProgressUpdate = 0;
            let commandCount = 0;

            const sendProgress = (status: string, details?: string) => {
                const now = Date.now();
                if (now - lastProgressUpdate > 500) {
                    config.onProgress?.(status, details);
                    lastProgressUpdate = now;
                }
            };

            const outStream = new PassThrough();
            outStream.on('data', async (chunk: Buffer) => {
                const line = chunk.toString('utf8');
                output += line;

                if (line.includes('COMMAND:')) {
                    commandCount++;
                    const cmd = line.split('COMMAND:')[1]?.split('\n')[0]?.trim() || 'command';
                    sendProgress(`⚙️ Executing command #${commandCount}`, cmd.slice(0, 50));
                }
                if (line.includes('COMMAND_OUTPUT:')) {
                    sendProgress(`📤 Processing output...`);
                }
                if (line.includes('[HITL] APPROVAL_REQUIRED:')) {
                    try {
                        const cmd = line.split('REQUIRED:')[1]?.trim() || 'Unknown command';
                        approvalLogId = await createAuditLog(config.agentId, containerId, cmd, 'Pending approval');
                        await sendApprovalRequest(config.agentId, containerId, cmd, approvalLogId);
                        sendProgress('⏳ Waiting for approval...', cmd.slice(0, 40));
                    } catch (err) { }
                }
                if (line.includes('[HITL] APPROVED') || line.includes('[HITL] EXECUTED')) {
                    if (approvalLogId) await import('./db').then(m => m.updateAuditLog(approvalLogId as number, 'approved'));
                }
                if (line.includes('[MEETING]')) {
                    sendProgress('🤝 Coordinating with other agents...');
                }
            });

            if (stream) {
                docker.modem.demuxStream(stream, outStream, outStream);

                sendProgress('🧠 Thinking...');

                stream.on('end', async () => {
                    await updateContainerLastActive(containerId);

                    const lines = output.split('\n');
                    const filteredLines = lines.filter(l => {
                        const trimmed = l.trim();
                        if (!trimmed) return false;
                        if (trimmed.startsWith('{')) return false;
                        if (trimmed.startsWith('[Workspace]')) return false;
                        if (trimmed.includes('Working directory set to')) return false;
                        if (trimmed.startsWith('[HITL]')) return false;
                        if (trimmed.startsWith('[MEETING]')) return false;
                        if (trimmed.includes('TARGET_ROLE:')) return false;
                        if (trimmed.includes('DELEGATION_APPROVAL_REQUIRED')) return false;
                        return true;
                    });

                    let cleanOutput = filteredLines.join('\n').trim();

                    if (!cleanOutput || cleanOutput.length < 2) {
                        if (output.includes('Error:') || output.includes('error')) {
                            const errorLines = lines.filter(l => l.toLowerCase().includes('error'));
                            cleanOutput = `❌ Agent error:\n${errorLines.join('\n') || 'Unknown error occurred'}`;
                        } else {
                            cleanOutput = `⚠️ Agent completed but produced no visible output.\nTry:\n• Check if API keys are valid\n• Try a simpler request\n• Use /logs to see container logs`;
                        }
                    }

                    resolve({ containerId, output: cleanOutput });
                });

                stream.on('error', (err: Error) => reject(err));
            } else {
                reject(new Error('Failed to create exec stream'));
            }
        });
    } catch (error: any) {
        throw new Error(`Failed to execute agent: ${error.message}`);
    }
}

export async function stopCubicle(containerId: string): Promise<void> {
    try { await docker.getContainer(containerId).stop(); } catch (err) { }
}

export async function removeCubicle(containerId: string): Promise<void> {
    try { await docker.getContainer(containerId).remove({ force: true }); } catch (err) { }
}

export async function getCubicleStatus(agentId: number, userId: number) {
    const container = await findContainerByLabels(agentId, userId);
    return container ? { status: container.state, containerId: container.id } : null;
}

export async function listContainers() {
    return (await docker.listContainers({ all: true })).filter(c => c.Labels && c.Labels[LABELS.AGENT_ID]);
}

export async function checkDocker() {
    try { await docker.ping(); return true; } catch { return false; }
}

export function getAvailableImages() {
    return ['hermit/base:latest', 'hermit/python:latest', 'hermit/netsec:latest'];
}

export async function getContainerExec(containerId: string): Promise<Docker.Exec> {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ['/bin/bash']
    });
    return exec;
}

export async function restartAgentContainer(agentId: number, userId: number = 0): Promise<boolean> {
    const containerInfo = await findContainerByLabels(agentId, userId);
    if (!containerInfo) return false;

    try {
        const container = docker.getContainer(containerInfo.id);
        await container.stop();
        await container.start();
        console.log(`[Cubicle] Restarted container for agent ${agentId}`);
        return true;
    } catch (e) {
        console.error(`[Cubicle] Failed to restart container for agent ${agentId}:`, e);
        return false;
    }
}

export { docker };
