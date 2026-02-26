import { handleTelegramUpdate, sendTelegramMessage, smartReply, processAgentMessage, sendVerificationCode, setBotCommands, registerWebhook, startFileWatcher, startCalendarScheduler } from './telegram';
import {
    getAllAgents, isAllowed, initDb, getAdminCount, createAdmin, getAdmin, getFirstAdmin, updateAdmin,
    getAllSettings, setSetting, getBudget, getAllowlist, addToAllowlist, removeFromAllowlist,
    getTotalSpend, getAllBudgets, updateAgent, deleteAgent, updateBudget, createAgent,
    getAuditLogs, getAgentById, getAgentByToken, getSetting, setOperator, getOperator,
    createAgentRuntimeLog, getAgentRuntimeLogs, getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getCalendarEventById
} from './db';
import { checkDocker, listContainers, getContainerExec, docker, spawnAgent, restartAgentContainer } from './docker';
import { hashPassword, verifyPassword, generateSessionToken } from './auth';
import { startTunnel, syncWebhooks, getTunnelUrl } from './tunnel';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { execFileSync } from 'child_process';
import cookie from '@fastify/cookie';
import { loadHistory, saveHistory, clearHistory } from './history';
import { discoverSitesFromWorkspaces } from './sites';

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'hermitshell-secret-change-in-production';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'hermitshell-webhook-secret';

const pendingVerifications = new Map<string, { code: string; timestamp: number }>();
const previewPasswords = new Map<string, { password: string; updatedAt: number }>();

function previewKey(agentId: number, port: number): string {
    return `${agentId}_${port}`;
}

function generatePreviewPassword(): string {
    return Math.random().toString(36).slice(2, 10);
}

export function getPreviewPassword(agentId: number, port: number): { password?: string; updatedAt?: number } | null {
    return previewPasswords.get(previewKey(agentId, port)) || null;
}

export function setPreviewPassword(agentId: number, port: number, pass: string) {
    previewPasswords.set(previewKey(agentId, port), { password: pass, updatedAt: Date.now() });
}

export function ensurePreviewPassword(agentId: number, port: number): { password: string; updatedAt: number } {
    const key = previewKey(agentId, port);
    const existing = previewPasswords.get(key);
    if (existing) return existing;
    const created = { password: generatePreviewPassword(), updatedAt: Date.now() };
    previewPasswords.set(key, created);
    return created;
}

export function regeneratePreviewPassword(agentId: number, port: number): { password: string; updatedAt: number } {
    const generated = { password: generatePreviewPassword(), updatedAt: Date.now() };
    previewPasswords.set(previewKey(agentId, port), generated);
    return generated;
}

export async function startServer() {
    await initDb();
    startFileWatcher();
    startCalendarScheduler();

    const fastify = require('fastify')({ logger: true });

    fastify.get('/api/agents/:id/memory', async (request: any, reply: any) => {
        try {
            const agentId = Number(request.params.id);
            const { getAgentMemories } = require('./db');
            const memories = await getAgentMemories(agentId, 50);
            return { memories };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.post('/api/agents/:id/memory', async (request: any, reply: any) => {
        try {
            const agentId = Number(request.params.id);
            const { content } = request.body;
            if (!content) return reply.code(400).send({ error: 'Missing content' });
            const { storeMemory } = require('./db');
            const id = await storeMemory(agentId, content, [0]);
            return { success: true, memoryId: id };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.delete('/api/agents/:agentId/memory/:memoryId', async (request: any, reply: any) => {
        try {
            const memoryId = Number(request.params.memoryId);
            const { deleteMemory } = require('./db');
            await deleteMemory(memoryId);
            return { success: true };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    await fastify.register(cookie);

    fastify.register(require('@fastify/websocket'));

    const publicRoutes = [
        '/api/auth/status',
        '/api/auth/login',
        '/api/auth/change',
        '/health',
        '/dashboard',
        '/dashboard/'
    ];

    const getSessionToken = (request: any): string | undefined => {
        const cookieToken = request.cookies?.hermitshell_session;
        if (cookieToken) return cookieToken;

        const authHeader = request.headers?.authorization;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7).trim();
        }

        const queryToken = request.query?.token;
        if (typeof queryToken === 'string') return queryToken;

        return undefined;
    };

    fastify.addHook('preHandler', async (request: any, reply: any) => {
        if (request.url.startsWith('/webhook/')) return;
        if (request.url.startsWith('/api/terminal')) return;
        if (request.url.startsWith('/preview')) return;
        if (request.url.includes('/api/internal/')) return;

        if (publicRoutes.includes(request.url)) return;

        if (request.url.startsWith('/dashboard') || request.url === '/') return;

        if (request.url.startsWith('/api/auth')) return;

        const token = getSessionToken(request);
        if (!token) {
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }
    });

    fastify.get('/api/auth/status', async (request: any, reply: any) => {
        const adminCount = await getAdminCount();
        if (adminCount === 0) {
            const { hash, salt } = hashPassword('crab123');
            await createAdmin('admin', hash, salt);
            console.log('🔒 Initialized default admin credentials: admin / crab123');
        }

        const admin = await getFirstAdmin();
        let usingDefault = false;
        if (admin) {
            usingDefault = admin.username === 'admin' && verifyPassword('crab123', admin.password_hash, admin.salt);
        }

        const operator = await getOperator();
        const token = getSessionToken(request);
        if (token) {
            return { status: 'authenticated', hasOperator: !!operator, usingDefault };
        }

        return { status: 'login_required', hasOperator: !!operator, usingDefault };
    });

    fastify.post('/api/auth/login', async (request: any, reply: any) => {
        const { username, password } = request.body;
        const admin = await getAdmin(username);

        if (!admin || !verifyPassword(password, admin.password_hash, admin.salt)) {
            return reply.code(401).send({ error: 'Invalid credentials' });
        }

        const token = generateSessionToken(admin.id);

        reply.setCookie('hermitshell_session', token, {
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7
        });

        return { success: true, token };
    });

    fastify.post('/api/auth/logout', async (request: any, reply: any) => {
        reply.clearCookie('hermitshell_session');
        return { success: true };
    });

    fastify.post('/api/auth/change', async (request: any, reply: any) => {
        const { username, password } = request.body;
        if (!username || !password) return reply.code(400).send({ error: 'Username and password are required' });

        const admin = await getFirstAdmin();
        if (admin) {
            const { hash, salt } = hashPassword(password);
            await updateAdmin(admin.id, username, hash, salt);
            reply.clearCookie('hermitshell_session');
            return { success: true };
        }
        return reply.code(400).send({ error: 'Admin record not found' });
    });

    fastify.get('/health', async () => {
        const dockerOk = await checkDocker();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            docker: dockerOk ? 'online' : 'offline'
        };
    });

    fastify.get('/api/stats', async () => {
        const dockerOk = await checkDocker();
        const containers = dockerOk ? await listContainers() : [];
        const agents = await getAllAgents();
        const totalSpend = await getTotalSpend();
        const allowlist = await getAllowlist();
        const operator = await getOperator();

        const auditLogs = await getAuditLogs(undefined, 500);
        const runtimeLogs = await getAgentRuntimeLogs(undefined, 500);
        const errors24h = runtimeLogs.filter(l => l.level === 'error').length;
        const approvedCount = auditLogs.filter(l => l.status === 'approved').length;
        const pendingCount = auditLogs.filter(l => l.status === 'pending').length;

        return {
            dockerStatus: dockerOk ? 'online' : 'offline',
            activeContainers: containers.length,
            totalAgents: agents.length,
            activeAgents: agents.filter(a => a.is_active).length,
            totalSpendToday: totalSpend,
            allowlistCount: allowlist.length,
            metrics: {
                auditApprovals: approvedCount,
                auditPending: pendingCount,
                runtimeErrors: errors24h,
                runtimeLogCount: runtimeLogs.length
            },
            operator: operator,
            agents: agents.map(a => ({
                ...a,
                budget: a.budget || { daily_limit_usd: 1, current_spend_usd: 0 }
            }))
        };
    });

    fastify.get('/api/settings', async () => {
        return await getAllSettings();
    });

    fastify.post('/api/settings', async (request: any) => {
        const { key, value } = request.body;
        if (!key) return { error: 'Key required' };
        await setSetting(key, value);
        return { success: true };
    });

    fastify.post('/api/settings/batch', async (request: any) => {
        const settings = request.body;
        for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined && value !== null) {
                const valStr = String(value).trim();
                await setSetting(key, valStr);

                if (key === 'operator_telegram_id' && valStr) {
                    await addToAllowlist(Number(valStr), 'operator', 'Operator', true);
                    await setOperator(Number(valStr));
                }
            }
        }
        return { success: true };
    });

    fastify.get('/api/allowlist', async () => {
        return await getAllowlist();
    });

    fastify.post('/api/allowlist', async (request: any) => {
        const { user_id, username, first_name, is_operator } = request.body;
        if (!user_id) return { error: 'user_id required' };
        await addToAllowlist(Number(user_id), username, first_name, is_operator === true);

        if (is_operator) {
            await setOperator(Number(user_id));
        }

        return { success: true };
    });

    fastify.post('/api/allowlist/set-operator/:userId', async (request: any) => {
        const userId = Number(request.params.userId);
        await setOperator(userId);
        return { success: true };
    });

    fastify.delete('/api/allowlist/:id', async (request: any) => {
        await removeFromAllowlist(Number(request.params.id));
        return { success: true };
    });

    fastify.get('/api/audit', async (request: any) => {
        const agentId = request.query.agentId ? Number(request.query.agentId) : undefined;
        const limit = request.query.limit ? Number(request.query.limit) : 50;
        return await getAuditLogs(agentId, limit);
    });

    fastify.get('/api/runtime-logs', async (request: any) => {
        const agentId = request.query.agentId ? Number(request.query.agentId) : undefined;
        const limit = request.query.limit ? Number(request.query.limit) : 100;
        return await getAgentRuntimeLogs(agentId, limit);
    });

    fastify.post('/api/telegram/webhook', async (request: any, reply: any) => {
        const { token } = request.body;
        if (!token) return reply.code(400).send({ error: 'Token required' });

        const settings = await getAllSettings();
        const baseUrl = settings.public_url;

        if (!baseUrl || baseUrl === '') {
            return reply.code(400).send({
                error: 'Public URL not configured. Please set your public URL in Settings first.'
            });
        }

        const success = await registerWebhook(token, baseUrl, WEBHOOK_SECRET);
        if (success) {
            return { ok: true, description: "Webhook was set successfully" };
        } else {
            return reply.code(500).send({ error: "Failed to set webhook. Check your Public url and Token." });
        }
    });

    fastify.post('/api/webhooks/sync', async (_request: any, reply: any) => {
        const settings = await getAllSettings();
        const baseUrl = settings.public_url;

        if (!baseUrl) {
            return reply.code(400).send({ error: 'Public URL not configured. Set it in Settings first.' });
        }

        const agents = await getAllAgents();
        let successCount = 0;

        for (const agent of agents) {
            if (agent.is_active && agent.telegram_token) {
                console.log(`[Webhook] Syncing bot ${agent.name} (${agent.telegram_token.slice(0, 8)}...)`);
                const ok = await registerWebhook(agent.telegram_token, baseUrl, WEBHOOK_SECRET);
                if (ok) successCount++;
            }
        }

        return { success: true, count: successCount, total: agents.length };
    });

    fastify.post('/api/webhooks/reset/:agentId', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const agent = await getAgentById(agentId);

        if (!agent || !agent.telegram_token) {
            return reply.code(404).send({ error: 'Agent or token not found' });
        }

        const settings = await getAllSettings();
        if (!settings.public_url) {
            return reply.code(400).send({ error: 'Public URL not configured' });
        }

        console.log(`[Webhook] Resetting webhook for agent ${agent.name}`);
        const ok = await registerWebhook(agent.telegram_token, settings.public_url, WEBHOOK_SECRET);

        return { success: ok };
    });

    fastify.get('/api/agents', async () => {
        const agents = await getAllAgents();
        const budgets = await getAllBudgets();

        return agents.map(agent => {
            const budget = budgets.find(b => b.agent_id === agent.id);
            return {
                ...agent,
                budget: budget || { daily_limit_usd: 1, current_spend_usd: 0 }
            };
        });
    });

    fastify.get('/api/agents/:agentId/calendars', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const agent = await getAgentById(agentId);
        if (!agent) return reply.code(404).send({ error: 'Agent not found' });
        const events = await getCalendarEvents(agentId);
        return { events };
    });

    fastify.post('/api/agents/:agentId/calendars', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const agent = await getAgentById(agentId);
        if (!agent) return reply.code(404).send({ error: 'Agent not found' });

        const { title, prompt, start_time, end_time, target_user_id } = request.body || {};
        if (!title || !prompt || !start_time || !target_user_id) {
            return reply.code(400).send({ error: 'title, prompt, start_time and target_user_id are required' });
        }

        const id = await createCalendarEvent({
            agent_id: agentId,
            title: String(title),
            prompt: String(prompt),
            start_time: String(start_time),
            end_time: end_time ? String(end_time) : null,
            target_user_id: Number(target_user_id)
        });
        return { success: true, id };
    });

    fastify.put('/api/agents/:agentId/calendars/:eventId', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const eventId = Number(request.params.eventId);
        const agent = await getAgentById(agentId);
        if (!agent) return reply.code(404).send({ error: 'Agent not found' });
        const event = await getCalendarEventById(eventId);
        if (!event || event.agent_id !== agentId) return reply.code(404).send({ error: 'Calendar event not found' });

        const allowed = ['title', 'prompt', 'start_time', 'end_time', 'target_user_id', 'status'];
        const updates: any = {};
        for (const key of allowed) {
            if (request.body?.[key] !== undefined) updates[key] = request.body[key];
        }
        if (updates.target_user_id !== undefined) updates.target_user_id = Number(updates.target_user_id);

        await updateCalendarEvent(eventId, updates);
        return { success: true };
    });

    fastify.delete('/api/agents/:agentId/calendars/:eventId', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const eventId = Number(request.params.eventId);
        const agent = await getAgentById(agentId);
        if (!agent) return reply.code(404).send({ error: 'Agent not found' });
        const event = await getCalendarEventById(eventId);
        if (!event || event.agent_id !== agentId) return reply.code(404).send({ error: 'Calendar event not found' });
        await deleteCalendarEvent(eventId);
        return { success: true };
    });

    fastify.post('/api/agents/request-verification', async (request: any, reply: any) => {
        const { token } = request.body;

        const operatorId = await getSetting('operator_telegram_id');
        if (!operatorId) {
            return reply.code(400).send({ error: 'Operator Telegram ID not set. Please configure it in Settings or during initial setup.' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        pendingVerifications.set(token, { code, timestamp: Date.now() });

        try {
            const sent = await sendVerificationCode(token, Number(operatorId), code);
            if (!sent) {
                return reply.code(400).send({ error: 'Failed to send verification code. Make sure the bot token is valid and you have started a conversation with the bot.' });
            }
            return { success: true, message: 'Verification code sent to operator Telegram.' };
        } catch (e: any) {
            return reply.code(400).send({ error: `Failed to send verification code: ${e.message}. Make sure you have sent /start to the bot first.` });
        }
    });

    fastify.post('/api/agents/confirm-verification', async (request: any, reply: any) => {
        const { token, code, agentData, editAgentId } = request.body;

        const pending = pendingVerifications.get(token);

        if (!pending) {
            return reply.code(400).send({ error: 'No pending verification for this token. Please request a new verification code.' });
        }

        if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
            pendingVerifications.delete(token);
            return reply.code(400).send({ error: 'Verification code expired. Please request a new one.' });
        }

        if (pending.code !== code) {
            return reply.code(400).send({ error: 'Invalid verification code.' });
        }

        try {
            let id;
            if (editAgentId) {
                await updateAgent(Number(editAgentId), {
                    name: agentData.name,
                    role: agentData.role || '',
                    docker_image: agentData.docker_image || 'hermit/base:latest',
                    is_active: agentData.is_active !== undefined ? agentData.is_active : 1,
                    require_approval: agentData.require_approval || 0,
                    profile_picture_url: agentData.profile_picture_url || '',
                    profile_bio: agentData.profile_bio || '',
                    llm_provider: agentData.llm_provider || 'default',
                    llm_model: agentData.llm_model || '',
                    personality: agentData.personality || ''
                });
                id = editAgentId;
            } else {
                id = await createAgent({
                    name: agentData.name,
                    role: agentData.role || '',
                    telegram_token: token,
                    system_prompt: agentData.system_prompt || '',
                    docker_image: agentData.docker_image || 'hermit/base:latest',
                    is_active: agentData.is_active !== undefined ? agentData.is_active : 1,
                    require_approval: agentData.require_approval || 0,
                    profile_picture_url: agentData.profile_picture_url || '',
                    profile_bio: agentData.profile_bio || '',
                    llm_provider: agentData.llm_provider || 'default',
                    llm_model: agentData.llm_model || 'default',
                    personality: agentData.personality || ''
                });

                const settings = await getAllSettings();
                if (settings.public_url) {
                    await registerWebhook(token, settings.public_url, WEBHOOK_SECRET);
                }
            }

            pendingVerifications.delete(token);
            return { success: true, id };
        } catch (e: any) {
            return reply.code(500).send({ error: `Failed to create agent: ${e.message}` });
        }
    });

    fastify.post('/api/agents', async (request: any) => {
        const { name, role, telegram_token, docker_image, system_prompt, is_active, require_approval, profile_picture_url, profile_bio, llm_provider, llm_model, personality } = request.body;
        const id = await createAgent({
            name,
            role: role || '',
            telegram_token,
            system_prompt: system_prompt || '',
            docker_image: docker_image || 'hermit/base:latest',
            is_active: is_active !== undefined ? is_active : 1,
            require_approval: require_approval || 0,
            profile_picture_url: profile_picture_url || '',
            profile_bio: profile_bio || '',
            llm_provider: llm_provider || 'default',
            llm_model: llm_model || 'default',
            personality: personality || ''
        });
        return { id, success: true };
    });

    fastify.put('/api/agents/:id', async (request: any) => {
        const id = Number(request.params.id);
        const { name, role, telegram_token, docker_image, system_prompt, is_active, daily_limit_usd, require_approval, profile_picture_url, profile_bio, llm_provider, llm_model, personality } = request.body;

        await updateAgent(id, {
            name,
            role,
            telegram_token,
            docker_image,
            system_prompt,
            is_active,
            require_approval,
            profile_picture_url,
            profile_bio,
            llm_provider,
            llm_model,
            personality
        });

        if (daily_limit_usd !== undefined) {
            await updateBudget(id, daily_limit_usd);
        }

        if (llm_provider !== undefined || llm_model !== undefined) {
            await restartAgentContainer(id);
        }

        return { success: true };
    });



    fastify.delete('/api/agents/:id', async (request: any) => {
        await deleteAgent(Number(request.params.id));
        return { success: true };
    });

    fastify.post('/api/test-agent/:id', async (request: any, reply: any) => {
        const agentId = Number(request.params.id);
        const { message } = request.body;

        const agent = await getAgentById(agentId);
        if (!agent) {
            return reply.code(404).send({ error: 'Agent not found' });
        }

        try {
            const result = await spawnAgent({
                agentId: agent.id,
                agentName: agent.name,
                agentRole: agent.role,
                dockerImage: agent.docker_image,
                userMessage: message || 'Say hello and tell me about your environment.',
                history: [],
                maxTokens: 1000,
                requireApproval: false
            });

            if (result.output.includes('401') && (result.output.includes('Unauthorized') || result.output.includes('Authentication'))) {
                result.output = `❌ API Key Error (401 Unauthorized)\n\nYour API key is missing or invalid.\n\nHow to fix:\n1. Go to Settings -> API Keys\n2. Enter a valid key and click Save\n3. Go to Cubicles tab and Delete the existing container\n4. Try testing again.`;
            }

            return { output: result.output, containerId: result.containerId };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.post('/api/chat/:agentId', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const { message, userId } = request.body || {};
        if (!message) return reply.code(400).send({ error: 'message is required' });

        const agent = await getAgentById(agentId);
        if (!agent) return reply.code(404).send({ error: 'Agent not found' });

        const scopedUserId = Number(userId || 0);
        const historyKey = `dashboard_${agent.id}_${scopedUserId}`;

        try {
            const history = loadHistory(historyKey);
            const result = await spawnAgent({
                agentId: agent.id,
                agentName: agent.name,
                agentRole: agent.role,
                dockerImage: agent.docker_image,
                userMessage: message,
                history: history.slice(-20),
                maxTokens: 1000,
                requireApproval: agent.require_approval === 1,
                userId: scopedUserId,
                llmProvider: agent.llm_provider && agent.llm_provider !== 'default' ? agent.llm_provider : undefined,
                llmModel: agent.llm_model && agent.llm_model !== 'default' ? agent.llm_model : undefined
            });

            history.push({ role: 'user', content: message });
            history.push({ role: 'assistant', content: result.output });
            saveHistory(historyKey, history.slice(-40));

            const estimatedCost = result.output.length * 0.00001;
            await import('./db').then(m => m.updateSpend(agent.id, estimatedCost));
            await createAgentRuntimeLog(agent.id, 'info', 'dashboard-chat', 'Chat message processed', { userId: scopedUserId });

            return { output: result.output, containerId: result.containerId };
        } catch (e: any) {
            await createAgentRuntimeLog(agent.id, 'error', 'dashboard-chat', e.message || 'Chat failed', { userId: scopedUserId });
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.get('/api/chat/:agentId/history/:userId', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const userId = Number(request.params.userId || 0);
        const agent = await getAgentById(agentId);
        if (!agent) return reply.code(404).send({ error: 'Agent not found' });

        const historyKey = `dashboard_${agent.id}_${userId}`;
        return { history: loadHistory(historyKey).slice(-40) };
    });

    fastify.post('/api/chat/:agentId/clear', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const { userId } = request.body || {};
        const agent = await getAgentById(agentId);
        if (!agent) return reply.code(404).send({ error: 'Agent not found' });

        const historyKey = `dashboard_${agent.id}_${Number(userId || 0)}`;
        clearHistory(historyKey);
        return { success: true };
    });

    fastify.post('/api/internal/llm', async (request: any, reply: any) => {
        try {
            const { messages, agentId } = request.body;
            if (!messages || !agentId) return reply.code(400).send({ error: 'Missing messages or agentId' });

            const agent = await getAgentById(Number(agentId));
            if (!agent) return reply.code(404).send({ error: 'Agent not found' });

            const settings = await getAllSettings();
            const provider = agent.llm_provider && agent.llm_provider !== 'default' ? agent.llm_provider : (settings.default_provider || 'openrouter');
            const model = agent.llm_model && agent.llm_model !== 'default' ? agent.llm_model : (settings.default_model || 'auto');

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

            const apiKey = settings[providerKeyMap[provider]?.key] || process.env[providerKeyMap[provider]?.env];

            if (!apiKey) {
                return { output: `❌ **SYSTEM ERROR**: Missing API Key for '${provider}'.` };
            }

            let url = '';
            let headers: any = { 'Content-Type': 'application/json' };
            let body: any = { messages, max_tokens: 4000 };

            if (provider === 'google') {
                url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const mappedMessages = messages.map((m: any) => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));
                body = { contents: mappedMessages };
                const sysMsg = messages.find((m: any) => m.role === 'system');
                if (sysMsg) {
                    body.systemInstruction = { parts: [{ text: sysMsg.content }] };
                    body.contents = body.contents.filter((m: any) => m.role !== 'system');
                }
            } else if (provider === 'anthropic') {
                url = 'https://api.anthropic.com/v1/messages';
                headers['x-api-key'] = apiKey;
                headers['anthropic-version'] = '2023-06-01';
                body.model = model;
                const sysMsg = messages.find((m: any) => m.role === 'system')?.content;
                if (sysMsg) body.system = sysMsg;
                body.messages = messages.filter((m: any) => m.role !== 'system');
            } else {
                headers['Authorization'] = `Bearer ${apiKey}`;
                body.model = model;
                if (provider === 'openrouter') { url = 'https://openrouter.ai/api/v1/chat/completions'; headers['HTTP-Referer'] = 'https://crabshell.local'; headers['X-Title'] = 'CrabShell'; }
                else if (provider === 'openai') url = 'https://api.openai.com/v1/chat/completions';
                else if (provider === 'groq') url = 'https://api.groq.com/openai/v1/chat/completions';
                else if (provider === 'mistral') url = 'https://api.mistral.ai/v1/chat/completions';
                else if (provider === 'deepseek') url = 'https://api.deepseek.com/v1/chat/completions';
                else if (provider === 'xai') url = 'https://api.x.ai/v1/chat/completions';
                else url = 'https://openrouter.ai/api/v1/chat/completions';
            }

            const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
            const data = await (response as any).json();

            if (!response.ok) {
                console.error('LLM API Error:', data);
                return { output: `❌ **API ERROR**: ${JSON.stringify(data)}` };
            }

            let output = '';
            if (provider === 'google') output = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            else if (provider === 'anthropic') output = data.content?.[0]?.text || '';
            else output = data.choices?.[0]?.message?.content || '';

            return { output: output || 'Error extracting LLM response' };
        } catch (e: any) {
            console.error('Proxy LLM Error:', e);
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.get('/webhook/:token', async (_request: any, _reply: any) => {
        return { message: 'Use POST /webhook/:token for Telegram updates' };
    });

    fastify.post('/webhook/:token', async (request: any, reply: any) => {
        const cleanSecret = WEBHOOK_SECRET.replace(/[^a-zA-Z0-9_-]/g, '') || 'hermitSecret123';
        const requestSecret = request.query.secret;
        const headerSecret = request.headers['x-telegram-bot-api-secret-token'];

        console.log(`[Webhook] Received request for token ${request.params.token.slice(0, 8)}...`, { querySecret: requestSecret, headerSecret: headerSecret ? 'present' : 'missing' });

        if (requestSecret !== cleanSecret && headerSecret !== cleanSecret) {
            console.log(`[Webhook] Secret mismatch. Expected: ${cleanSecret}`);
            return reply.code(403).send({ error: 'Forbidden: Invalid webhook secret' });
        }

        const token = request.params.token;
        const update = request.body as any;

        reply.code(200).send({ ok: true, status: 'accepted' });

        setImmediate(async () => {
            try {
                const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
                const userId = update.message?.from?.id || update.callback_query?.from?.id;

                const immediateResponse = await handleTelegramUpdate(token, update);

                if (immediateResponse && chatId) {
                    await sendTelegramMessage(token, chatId, immediateResponse);
                    return;
                }

                if (update.message?.text && chatId && userId) {
                    const text = update.message.text;

                    if (!text.startsWith('/')) {
                        const agent = await getAgentByToken(token);
                        const agentName = agent?.name || update.message.from?.first_name || 'Agent';
                        const statusMsg = await sendTelegramMessage(token, chatId, `🔄 *${agentName}* is waking up...`);

                        const result = await processAgentMessage(token, chatId, userId, text, statusMsg);
                        const tokenAgent = await getAgentByToken(token);
                        if (tokenAgent) {
                            await createAgentRuntimeLog(tokenAgent.id, 'info', 'telegram', 'Telegram message processed', { userId, textPreview: text.slice(0, 120) });
                        }

                        await smartReply(token, chatId, result.output, statusMsg);
                    }
                }
            } catch (error) {
                console.error('Error processing webhook in background:', error);
                const tokenAgent = await getAgentByToken(token);
                if (tokenAgent) {
                    await createAgentRuntimeLog(tokenAgent.id, 'error', 'telegram', String(error), { updateType: Object.keys(update || {}) });
                }
            }
        });
    });

    fastify.get('/api/docker/status', async () => {
        return { ok: await checkDocker() };
    });

    fastify.get('/api/containers', async () => {
        return await listContainers();
    });

    fastify.post('/api/containers/:id/stop', async (request: any, reply: any) => {
        const containerId = request.params.id;
        try {
            const container = docker.getContainer(containerId);
            await container.stop();
            return { success: true };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.post('/api/containers/:id/start', async (request: any, reply: any) => {
        const containerId = request.params.id;
        try {
            const container = docker.getContainer(containerId);
            await container.start();
            return { success: true };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.post('/api/containers/:id/remove', async (request: any, reply: any) => {
        const containerId = request.params.id;
        try {
            const container = docker.getContainer(containerId);
            await container.remove({ force: true });
            return { success: true };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.get('/api/terminal/:containerId', { websocket: true }, async (connection: any, req: any) => {
        const containerId = req.params.containerId;

        try {
            const container = docker.getContainer(containerId);

            const exec = await container.exec({
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true,
                Tty: true,
                Cmd: ['/bin/bash']
            });

            const stream = await exec.start({
                stdin: true,
                hijack: true
            });

            if (!stream) {
                connection.socket.close();
                return;
            }

            (stream as any).on('data', (chunk: Buffer) => {
                if (connection.socket.readyState === 1) {
                    connection.socket.send(chunk.toString('base64'));
                }
            });

            (stream as any).on('end', () => {
                connection.socket.close();
            });

            connection.socket.on('message', (msg: any) => {
                const data = Buffer.from(msg, 'base64');
                (stream as any).write(data);
            });

            connection.socket.on('close', () => {
                (stream as any).end();
            });

            connection.socket.on('error', (err: Error) => {
                console.error('WebSocket error:', err);
                (stream as any).end();
            });
        } catch (err) {
            console.error('Terminal error:', err);
            connection.socket.close();
        }
    });

    const WORKSPACE_DIR = path.join(__dirname, '../../data/workspaces');

    fastify.get('/api/sites', async (_request: any, reply: any) => {
        try {
            const [agents, settings] = await Promise.all([getAllAgents(), getAllSettings()]);
            const baseUrl = settings.public_url || `http://localhost:${PORT}`;
            const sites = discoverSitesFromWorkspaces(WORKSPACE_DIR, agents, baseUrl, (agentId, port) => ensurePreviewPassword(agentId, port));
            return { sites };
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.post('/api/sites/:agentId/:port/password/regenerate', async (request: any, reply: any) => {
        const agentId = Number(request.params.agentId);
        const port = Number(request.params.port);
        if (!Number.isFinite(agentId) || !Number.isFinite(port)) {
            return reply.code(400).send({ error: 'Invalid agentId/port' });
        }

        const generated = regeneratePreviewPassword(agentId, port);
        return {
            agentId,
            port,
            password: generated.password,
            updatedAt: new Date(generated.updatedAt).toISOString()
        };
    });


    fastify.get('/api/files/:agentId/:userId', async (request: any, reply: any) => {
        const { agentId, userId } = request.params;
        const workspacePath = path.join(WORKSPACE_DIR, `${agentId}_${userId}`);

        if (!fs.existsSync(workspacePath)) {
            return reply.code(404).send({ error: 'Workspace not found' });
        }

        const listFiles = (dir: string, baseDir: string): any[] => {
            const items: any[] = [];
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const fullPath = path.join(dir, file);
                    const relPath = path.relative(baseDir, fullPath);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            items.push({
                                name: file,
                                type: 'directory',
                                path: relPath,
                                children: listFiles(fullPath, baseDir)
                            });
                        } else {
                            items.push({
                                name: file,
                                type: 'file',
                                path: relPath,
                                size: stat.size,
                                modified: stat.mtime
                            });
                        }
                    } catch { }
                }
            } catch { }
            return items.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        };

        return { files: listFiles(workspacePath, workspacePath) };
    });

    fastify.get('/api/files/:agentId/:userId/download/*', async (request: any, reply: any) => {
        const { agentId, userId } = request.params;
        const filePath = request.params['*'];
        const workspacePath = path.join(WORKSPACE_DIR, `${agentId}_${userId}`);
        const fullPath = path.join(workspacePath, filePath);

        if (!fullPath.startsWith(workspacePath)) {
            return reply.code(403).send({ error: 'Access denied' });
        }

        if (!fs.existsSync(fullPath)) {
            return reply.code(404).send({ error: 'File not found' });
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            return reply.code(400).send({ error: 'Cannot download directory' });
        }

        return reply.sendFile(filePath, workspacePath);
    });

    fastify.get('/api/files/:agentId/:userId/download-all', async (request: any, reply: any) => {
        const { agentId, userId } = request.params;
        const workspacePath = path.join(WORKSPACE_DIR, `${agentId}_${userId}`);
        if (!fs.existsSync(workspacePath)) {
            return reply.code(404).send({ error: 'Workspace not found' });
        }

        const outName = `workspace_${agentId}_${userId}.tar.gz`;
        const tmpArchive = path.join(WORKSPACE_DIR, outName);
        execFileSync('tar', ['-czf', tmpArchive, '-C', workspacePath, '.']);
        reply.header('Content-Disposition', `attachment; filename="${outName}"`);
        return reply.send(fs.createReadStream(tmpArchive));
    });

    fastify.post('/api/files/:agentId/:userId/upload', async (request: any, reply: any) => {
        const { agentId, userId } = request.params;
        const { fileName, contentBase64 } = request.body || {};
        if (!fileName || !contentBase64) return reply.code(400).send({ error: 'fileName and contentBase64 required' });

        const workspacePath = path.join(WORKSPACE_DIR, `${agentId}_${userId}`);
        if (!fs.existsSync(workspacePath)) fs.mkdirSync(workspacePath, { recursive: true });
        const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const fullPath = path.join(workspacePath, safeName);
        fs.writeFileSync(fullPath, Buffer.from(contentBase64, 'base64'));
        return { success: true, path: safeName };
    });

    fastify.get('/api/agents/:id/runtime-logs/:userId', async (request: any, reply: any) => {
        const { id, userId } = request.params;
        const logPath = path.join(WORKSPACE_DIR, `${id}_${userId}`, '.hermit.log');

        if (!fs.existsSync(logPath)) {
            return { logs: "No logs found yet. Send a message to the agent first!" };
        }

        try {
            const content = fs.readFileSync(logPath, 'utf-8');
            return { logs: content.slice(-5000) };
        } catch (e: any) {
            return { logs: `Error reading logs: ${e.message}` };
        }
    });

    fastify.post('/preview-login', async (request: any, reply: any) => {
        const { agentId, port, password } = request.body || {};
        const key = `${agentId}_${port}`;

        const auth = previewPasswords.get(key);
        if (auth?.password === password) {
            reply.setCookie(`preview_auth_${agentId}_${port}`, password, {
                path: '/',
                maxAge: 60 * 60 * 24,
                httpOnly: true,
                sameSite: 'strict'
            });
            return { success: true };
        }

        return reply.code(401).send({ error: 'Invalid password' });
    });

    fastify.get('/preview/:agentId/:port/*', async (request: any, reply: any) => {
        const { agentId, port } = request.params;
        const targetPath = request.params['*'] || '';
        const targetPort = parseInt(port, 10);

        const authKey = `${agentId}_${targetPort}`;
        const expectedPassword = previewPasswords.get(authKey)?.password;
        if (expectedPassword) {
            const cookieName = `preview_auth_${agentId}_${targetPort}`;
            if (request.cookies[cookieName] !== expectedPassword) {
                return reply.type('text/html').send(`<!DOCTYPE html>
<html>
<head><title>Secure Web App</title></head>
<body style="background:#0f172a;color:white;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
  <form onsubmit="login(event)" style="background:#1e293b;padding:2rem;border-radius:8px;width:320px;text-align:center;border:1px solid #ff6b3540;">
    <h2 style="margin-top:0;">🔒 App Locked</h2>
    <p style="font-size:14px;color:#94a3b8;margin-bottom:20px;">Enter the password shared in Telegram.</p>
    <input type="password" id="pwd" placeholder="Password" style="width:100%;padding:10px;margin-bottom:15px;border-radius:4px;border:1px solid #334155;background:#0f172a;color:white;box-sizing:border-box;" required />
    <button type="submit" style="width:100%;padding:10px;background:#ff6b35;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">Unlock Web App</button>
  </form>
  <script>
  async function login(e) {
      e.preventDefault();
      const res = await fetch('/preview-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: '${agentId}', port: ${targetPort}, password: document.getElementById('pwd').value })
      });
      if (res.ok) window.location.reload();
      else alert('Invalid password');
  }
  </script>
</body>
</html>`);
            }
        }

        if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
            return reply.code(400).send({ error: 'Invalid port' });
        }

        const containers = await listContainers();
        const target = containers.find((c: any) => c.Labels?.['hermitshell.agent_id'] === String(agentId));

        if (!target || target.State !== 'running') {
            return reply.code(404).send({ error: 'Agent container not running' });
        }

        try {
            const containerInfo = await docker.getContainer(target.Id).inspect();
            const ip = containerInfo.NetworkSettings?.IPAddress;

            if (!ip) {
                return reply.code(500).send({ error: 'Container has no IP address' });
            }

            const targetUrl = `http://${ip}:${targetPort}/${targetPath}`;

            return new Promise((resolve, reject) => {
                const proxyReq = http.request(targetUrl, {
                    method: request.method,
                    headers: {
                        ...request.headers,
                        host: `${ip}:${targetPort}`
                    }
                }, (proxyRes) => {
                    reply.code(proxyRes.statusCode || 200);
                    reply.headers(proxyRes.headers as any);
                    proxyRes.pipe(reply.raw);
                    proxyRes.on('end', () => resolve(reply));
                });

                proxyReq.on('error', (err) => {
                    reply.code(502).send({ error: `Proxy error: ${err.message}` });
                    resolve(reply);
                });

                proxyReq.end();
            });
        } catch (err: any) {
            return reply.code(500).send({ error: err.message });
        }
    });

    fastify.all('/preview/:agentId/:port', async (request: any, reply: any) => {
        const { agentId, port } = request.params;
        const targetPort = parseInt(port, 10);

        const authKey = `${agentId}_${targetPort}`;
        const expectedPassword = previewPasswords.get(authKey)?.password;
        if (expectedPassword) {
            const cookieName = `preview_auth_${agentId}_${targetPort}`;
            if (request.cookies[cookieName] !== expectedPassword) {
                return reply.redirect(`/preview/${agentId}/${targetPort}/`);
            }
        }

        if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
            return reply.code(400).send({ error: 'Invalid port' });
        }

        const containers = await listContainers();
        const target = containers.find((c: any) => c.Labels?.['hermitshell.agent_id'] === String(agentId));

        if (!target || target.State !== 'running') {
            return reply.code(404).send({ error: 'Agent container not running' });
        }

        try {
            const containerInfo = await docker.getContainer(target.Id).inspect();
            const ip = containerInfo.NetworkSettings?.IPAddress;

            if (!ip) {
                return reply.code(500).send({ error: 'Container has no IP address' });
            }

            const targetUrl = `http://${ip}:${targetPort}/`;

            return new Promise((resolve) => {
                const proxyReq = http.request(targetUrl, {
                    method: request.method,
                    headers: {
                        ...request.headers,
                        host: `${ip}:${targetPort}`
                    }
                }, (proxyRes) => {
                    reply.code(proxyRes.statusCode || 200);
                    reply.headers(proxyRes.headers as any);
                    proxyRes.pipe(reply.raw);
                    proxyRes.on('end', () => resolve(reply));
                });

                proxyReq.on('error', (err: any) => {
                    reply.code(502).send({ error: `Proxy error: ${err.message}` });
                    resolve(reply);
                });

                if (request.body) {
                    proxyReq.write(typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
                }
                proxyReq.end();
            });
        } catch (err: any) {
            return reply.code(500).send({ error: err.message });
        }
    });

    fastify.register(require('@fastify/static'), {
        root: path.join(__dirname, '../dashboard/dist'),
        prefix: '/dashboard/',
        setHeaders: (res: any) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        }
    });

    fastify.get('/dashboard', async (_request: any, reply: any) => {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
        return reply.sendFile('index.html');
    });

    fastify.get('/dashboard/', async (_request: any, reply: any) => {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
        return reply.sendFile('index.html');
    });

    fastify.get('/', async (_request: any, reply: any) => {
        return reply.redirect('/dashboard/');
    });

    setInterval(() => {
        const now = Date.now();
        for (const [token, data] of pendingVerifications.entries()) {
            if (now - data.timestamp > 10 * 60 * 1000) {
                pendingVerifications.delete(token);
            }
        }
    }, 60 * 1000);

    await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
    console.log(`🦀 Shell listening on port ${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}/dashboard/`);

    const existingUrl = await getSetting('public_url');
    if (!existingUrl || existingUrl === '') {
        console.log('🚇 Starting Cloudflare Tunnel...');
        const tunnelUrl = await startTunnel(Number(PORT));
        if (tunnelUrl) {
            console.log(`✅ Tunnel active: ${tunnelUrl}`);
            console.log('🔄 Syncing webhooks...');
            await syncWebhooks(Number(PORT));
        } else {
            console.log('⚠️ Tunnel failed to start. Set public_url manually in Settings.');
        }
    } else {
        console.log(`🌐 Using configured public URL: ${existingUrl}`);
    }
}

if (require.main === module) {
    require('dotenv').config();
    startServer().catch(console.error);
}
