import * as path from 'path';
import {
    getAllAgents, createAgent, updateAgent, deleteAgent, getAgentByToken,
    getBudget, updateSpend, canSpend, getAllowlist, addToAllowlist, removeFromAllowlist,
    isAllowed, getSetting, setSetting, getAllBudgets, initDb
} from '../shell/src/db';
import { spawnAgent, listContainers, checkDocker, getAvailableImages } from '../shell/src/docker';

const PORT = process.env.DASHBOARD_PORT || 3001;

const fastify = require('fastify')({ logger: true });

async function main() {
    await initDb();

    fastify.register(require('fastify-static'), {
        root: path.join(__dirname, 'public'),
        prefix: '/',
    });

    fastify.get('/api/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });

    fastify.get('/api/agents', async () => {
        const agents = await getAllAgents();
        const budgets = await getAllBudgets();
        return agents.map(a => {
            const budget = budgets.find(b => b.agent_id === a.id);
            return { ...a, budget: budget || { daily_limit_usd: 1, current_spend_usd:0 } };
        });
    });

    fastify.post('/api/agents', async (request: any) => {
        const { name, role, telegram_token, system_prompt, docker_image } = request.body;
        
        if (!name || !telegram_token) {
            return { error: 'Name and Telegram token are required' }, 400;
        }

        const id = await createAgent({
            name,
            role: role || 'General Assistant',
            telegram_token,
            system_prompt: system_prompt || `You are ${name}, a helpful AI assistant.`,
            docker_image: docker_image || 'hermit/base:latest',
            is_active: 1
        });

        return { id, message: 'Agent created successfully' };
    });

    fastify.put('/api/agents/:id', async (request: any) => {
        const { id } = request.params;
        const updates = request.body;
        await updateAgent(Number(id), updates);
        return { message: 'Agent updated successfully' };
    });

    fastify.delete('/api/agents/:id', async (request: any) => {
        const { id } = request.params;
        await deleteAgent(Number(id));
        return { message: 'Agent deleted successfully' };
    });

    fastify.get('/api/allowlist', async () => {
        return await getAllowlist();
    });

    fastify.post('/api/allowlist', async (request: any) => {
        const { user_id, username, first_name } = request.body;
        await addToAllowlist(user_id, username, first_name);
        return { message: 'User added to allowlist' };
    });

    fastify.delete('/api/allowlist/:userId', async (request: any) => {
        const { userId } = request.params;
        await removeFromAllowlist(Number(userId));
        return { message: 'User removed from allowlist' };
    });

    fastify.get('/api/settings', async () => {
        return {
            default_provider: await getSetting('default_provider') || 'openrouter',
            default_model: await getSetting('default_model') || 'anthropic/claude-3-haiku',
            openai_key_set: !!process.env.OPENAI_API_KEY,
            openrouter_key_set: !!process.env.OPENROUTER_API_KEY
        };
    });

    fastify.post('/api/settings', async (request: any) => {
        const { key, value } = request.body;
        await setSetting(key, value);
        return { message: 'Setting updated' };
    });

    fastify.post('/api/settings/batch', async (request: any) => {
        const settings = request.body;
        for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined && value !== null) {
                await setSetting(key, String(value));
            }
        }
        return { success: true };
    });

    fastify.get('/api/stats', async () => {
        const dockerOk = await checkDocker();
        const containers = await listContainers();
        const budgets = await getAllBudgets();
        const totalSpend = budgets.reduce((sum, b) => sum + b.current_spend_usd, 0);
        
        return {
            docker: dockerOk,
            activeContainers: containers.length,
            totalSpendToday: totalSpend,
            agentsCount: (await getAllAgents()).length,
            allowlistCount: (await getAllowlist()).length
        };
    });

    fastify.get('/api/images', async () => {
        return getAvailableImages();
    });

    fastify.post('/api/test-agent/:id', async (request: any) => {
        const { id } = request.params;
        const { message } = request.body;
        
        const agents = await getAllAgents();
        const agent = agents.find(a => a.id === Number(id));
        
        if (!agent) {
            return { error: 'Agent not found' }, 404;
        }

        if (!await canSpend(agent.id)) {
            return { error: 'Budget exceeded for this agent' }, 403;
        }

        try {
            const result = await spawnAgent({
                agentId: agent.id,
                agentName: agent.name,
                agentRole: agent.role,
                dockerImage: agent.docker_image,
                userMessage: message || 'Say hello and tell me about your environment.',
                history: [],
                maxTokens: 500
            });

            const estimatedCost = result.output.length * 0.00001;
            await updateSpend(agent.id, estimatedCost);

            return { output: result.output };
        } catch (error: any) {
            return { error: error.message };
        }
    });

    try {
        await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
        console.log(`📊 Dashboard listening on http://localhost:${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

main();
