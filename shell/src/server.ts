import { handleTelegramUpdate, sendTelegramMessage, smartReply, processAgentMessage, sendVerificationCode, setBotCommands, registerWebhook } from './telegram';
import { 
    getAllAgents, isAllowed, initDb, getAdminCount, createAdmin, getAdmin,
    getAllSettings, setSetting, getBudget, getAllowlist, addToAllowlist, removeFromAllowlist,
    getTotalSpend, getAllBudgets, updateAgent, deleteAgent, updateBudget, createAgent,
    getAuditLogs, getAgentById, getAgentByToken, getSetting, setOperator, getOperator
} from './db';
import { checkDocker, listContainers, getContainerExec, docker, spawnAgent } from './docker';
import { hashPassword, verifyPassword, generateSessionToken } from './auth';
import { startTunnel, syncWebhooks, getTunnelUrl } from './tunnel';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import cookie from '@fastify/cookie';

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'crabshell-secret-change-in-production';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'crabshell-webhook-secret';

const pendingVerifications = new Map<string, { code: string; timestamp: number }>();

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

        const token = request.cookies.crabshell_session;
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
        
        const operator = await getOperator();
        const token = request.cookies.crabshell_session;
        if (token) {
            return { status: 'authenticated', hasOperator: !!operator };
        }
        
        return { status: 'login_required', hasOperator: !!operator };
    });

    fastify.post('/api/auth/setup', async (request: any, reply: any) => {
        const count = await getAdminCount();
        if (count > 0) return reply.code(403).send({ error: 'Setup already completed' });

        const { username, password, operator_telegram_id } = request.body;
        if (!username || !password) return reply.code(400).send({ error: 'Missing credentials' });

        const { hash, salt } = hashPassword(password);
        await createAdmin(username, hash, salt);

        if (operator_telegram_id) {
            await addToAllowlist(Number(operator_telegram_id), 'operator', 'Operator', true);
        }

        return { message: 'Admin created. Please login.' };
    });

    fastify.post('/api/auth/login', async (request: any, reply: any) => {
        const { username, password } = request.body;
        const admin = await getAdmin(username);

        if (!admin || !verifyPassword(password, admin.password_hash, admin.salt)) {
            return reply.code(401).send({ error: 'Invalid credentials' });
        }

        const token = generateSessionToken(admin.id);
        
        reply.setCookie('crabshell_session', token, {
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 * 7
        });

        return { success: true };
    });

    fastify.post('/api/auth/logout', async (request: any, reply: any) => {
        reply.clearCookie('crabshell_session');
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
        const operator = await getOperator();
        
        return {
            dockerStatus: dockerOk ? 'online' : 'offline',
            activeContainers: containers.length,
            totalAgents: agents.length,
            activeAgents: agents.filter(a => a.is_active).length,
            totalSpendToday: totalSpend,
            allowlistCount: allowlist.length,
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
                const ok = await registerWebhook(agent.telegram_token, baseUrl, WEBHOOK_SECRET);
                if (ok) successCount++;
            }
        }
        
        return { success: true, count: successCount, total: agents.length };
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
        const { token, code, agentData } = request.body;
        
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
            const id = await createAgent({
                name: agentData.name,
                role: agentData.role || '',
                telegram_token: token,
                system_prompt: agentData.system_prompt || '',
                docker_image: agentData.docker_image || 'hermit/base:latest',
                is_active: agentData.is_active !== undefined ? agentData.is_active : 1,
                require_approval: agentData.require_approval || 0
            });
            
            const settings = await getAllSettings();
            if (settings.public_url) {
                await registerWebhook(token, settings.public_url, WEBHOOK_SECRET);
            }

            pendingVerifications.delete(token);
            return { success: true, id };
        } catch (e: any) {
            return reply.code(500).send({ error: `Failed to create agent: ${e.message}` });
        }
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

    fastify.get('/webhook/:token', async (_request: any, _reply: any) => {
        return { message: 'Use POST /webhook/:token for Telegram updates' };
    });

    fastify.post('/webhook/:token', async (request: any, reply: any) => {
        const cleanSecret = WEBHOOK_SECRET.replace(/[^a-zA-Z0-9_-]/g, '') || 'hermitSecret123';
        const requestSecret = request.query.secret;
        const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
        
        if (requestSecret !== cleanSecret && headerSecret !== cleanSecret) {
            return reply.code(403).send({ error: 'Forbidden: Invalid webhook secret' });
        }
        
        const token = request.params.token;
        const update = request.body as any;
        
        reply.code(202).send({ ok: true, status: 'accepted' });
        
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
                        
                        await smartReply(token, chatId, result.output, statusMsg);
                    }
                }
            } catch (error) {
                console.error('Error processing webhook in background:', error);
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
                    } catch {}
                }
            } catch {}
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

    fastify.get('/preview/:agentId/:port/*', async (request: any, reply: any) => {
        const { agentId, port } = request.params;
        const targetPath = request.params['*'] || '';
        const targetPort = parseInt(port, 10);
        
        if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
            return reply.code(400).send({ error: 'Invalid port' });
        }
        
        const containers = await listContainers();
        const target = containers.find((c: any) => c.Labels?.['crabshell.agent_id'] === String(agentId));
        
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
        
        if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
            return reply.code(400).send({ error: 'Invalid port' });
        }
        
        const containers = await listContainers();
        const target = containers.find((c: any) => c.Labels?.['crabshell.agent_id'] === String(agentId));
        
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
