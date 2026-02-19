import { handleTelegramUpdate, sendTelegramMessage } from './telegram';
import { 
    getAllAgents, isAllowed, initDb, getAdminCount, createAdmin, getAdmin,
    getAllSettings, setSetting, getBudget, getAllowlist, addToAllowlist, removeFromAllowlist,
    getTotalSpend, getAllBudgets, updateAgent, deleteAgent, updateBudget, createAgent,
    getAuditLogs
} from './db';
import { checkDocker, listContainers, getContainerExec, docker } from './docker';
import { hashPassword, verifyPassword, generateSessionToken } from './auth';
import * as fs from 'fs';
import * as path from 'path';
import cookie from '@fastify/cookie';

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'hermit-secret-change-in-production';

export async function startServer() {
    await initDb();
    
    const fastify = require('fastify')({ logger: true });

    await fastify.register(cookie);

    fastify.register(require('@fastify/websocket'));

    const publicRoutes = [
        '/api/auth/status',
        '/api/auth/setup',
        '/api/auth/login',
        '/health',
        '/dashboard',
        '/dashboard/'
    ];

    fastify.addHook('preHandler', async (request: any, reply: any) => {
        if (request.url.startsWith('/webhook/')) return;
        if (request.url.startsWith('/api/terminal')) return;
        
        if (publicRoutes.includes(request.url)) return;

        if (request.url.startsWith('/dashboard') || request.url === '/') return;

        if (request.url.startsWith('/api/auth')) return;

        const token = request.cookies.hermit_session;
        if (!token) {
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }
    });

    fastify.get('/api/auth/status', async (request: any, reply: any) => {
        const adminCount = await getAdminCount();
        if (adminCount === 0) {
            return { status: 'setup_required' };
        }
        
        const token = request.cookies.hermit_session;
        if (token) {
            return { status: 'authenticated' };
        }
        
        return { status: 'login_required' };
    });

    fastify.post('/api/auth/setup', async (request: any, reply: any) => {
        const count = await getAdminCount();
        if (count > 0) return reply.code(403).send({ error: 'Setup already completed' });

        const { username, password } = request.body;
        if (!username || !password) return reply.code(400).send({ error: 'Missing credentials' });

        const { hash, salt } = hashPassword(password);
        await createAdmin(username, hash, salt);

        return { message: 'Admin created. Please login.' };
    });

    fastify.post('/api/auth/login', async (request: any, reply: any) => {
        const { username, password } = request.body;
        const admin = await getAdmin(username);

        if (!admin || !verifyPassword(password, admin.password_hash, admin.salt)) {
            return reply.code(401).send({ error: 'Invalid credentials' });
        }

        const token = generateSessionToken(admin.id);
        
        reply.setCookie('hermit_session', token, {
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 * 7
        });

        return { success: true };
    });

    fastify.post('/api/auth/logout', async (request: any, reply: any) => {
        reply.clearCookie('hermit_session');
        return { success: true };
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
        
        return {
            dockerStatus: dockerOk ? 'online' : 'offline',
            activeContainers: containers.length,
            totalAgents: agents.length,
            activeAgents: agents.filter(a => a.is_active).length,
            totalSpendToday: totalSpend,
            allowlistCount: allowlist.length,
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

    fastify.get('/api/allowlist', async () => {
        return await getAllowlist();
    });

    fastify.post('/api/allowlist', async (request: any) => {
        const { user_id, username, first_name } = request.body;
        if (!user_id) return { error: 'user_id required' };
        await addToAllowlist(Number(user_id), username, first_name);
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

        const webhookUrl = `${baseUrl}/webhook/${token}`;
        const tgUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
        
        try {
            const response = await fetch(tgUrl);
            const data = await response.json();
            return data;
        } catch (e: any) {
            return reply.code(500).send({ error: e.message });
        }
    });

    fastify.get('/api/agents', async () => {
        const agents = await getAllAgents();
        const budgets = await getAllBudgets();
        
        return agents.map(agent => {
            const budget = budgets.find(b => b.agent_id === agent.id);
            return {
                ...agent,
                budget: budget || { daily_limit_usd: 1, current_spend_usd:0 }
            };
        });
    });

    fastify.post('/api/agents', async (request: any) => {
        const { name, role, telegram_token, docker_image, system_prompt, is_active, require_approval } = request.body;
        const id = await createAgent({
            name,
            role: role || '',
            telegram_token,
            system_prompt: system_prompt || '',
            docker_image: docker_image || 'hermit/base:latest',
            is_active: is_active !== undefined ? is_active : 1,
            require_approval: require_approval || 0
        });
        return { id, success: true };
    });

    fastify.put('/api/agents/:id', async (request: any) => {
        const id = Number(request.params.id);
        const { name, role, telegram_token, docker_image, system_prompt, is_active, daily_limit_usd, require_approval } = request.body;
        
        await updateAgent(id, { 
            name, 
            role, 
            telegram_token, 
            docker_image, 
            system_prompt, 
            is_active,
            require_approval 
        });
        
        if (daily_limit_usd !== undefined) {
            await updateBudget(id, daily_limit_usd);
        }
        
        return { success: true };
    });

    fastify.delete('/api/agents/:id', async (request: any) => {
        await deleteAgent(Number(request.params.id));
        return { success: true };
    });

    fastify.post('/api/test-agent/:id', async (request: any) => {
        const agentId = Number(request.params.id);
        const { message } = request.body;
        
        const agent = await getAllAgents().then(agents => agents.find(a => a.id === agentId));
        if (!agent) {
            return { error: 'Agent not found' };
        }
        
        return { 
            output: `[Simulated] Agent ${agent.name} would execute: ${message}\n\nContainer execution not yet implemented.`,
            agent_id: agentId
        };
    });

    fastify.get('/webhook/:token', async (_request: any, _reply: any) => {
        return { message: 'Use POST /webhook/:token for Telegram updates' };
    });

    fastify.post('/webhook/:token', async (request: any, _reply: any) => {
        try {
            const token = request.params.token;
            const update = request.body as any;
            
            const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
            const response = await handleTelegramUpdate(token, update);

            if (response && chatId) {
                await sendTelegramMessage(token, chatId, response);
            }

            return { ok: true };
        } catch (error) {
            console.error('Error handling webhook:', error);
            return { ok: false, error: 'Internal error' };
        }
    });

    fastify.get('/api/docker/status', async () => {
        return { ok: await checkDocker() };
    });

    fastify.get('/api/containers', async () => {
        return await listContainers();
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

    fastify.register(require('@fastify/static'), {
        root: path.join(__dirname, '../dashboard/dist'),
        prefix: '/dashboard/',
    });

    fastify.get('/dashboard', async (_request: any, reply: any) => {
        return reply.sendFile('index.html');
    });

    fastify.get('/dashboard/', async (_request: any, reply: any) => {
        return reply.sendFile('index.html');
    });

    fastify.get('/', async (_request: any, reply: any) => {
        return reply.redirect('/dashboard/');
    });

    await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
    console.log(`🦀 Shell listening on port ${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}/dashboard/`);
}

if (require.main === module) {
    require('dotenv').config();
    startServer().catch(console.error);
}
