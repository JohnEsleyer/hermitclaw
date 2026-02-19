import { createClient, Client } from '@libsql/client';
import * as fs from 'fs';
import * as path from 'path';

let client: Client | null = null;
const DB_PATH = path.join(__dirname, '../../data/db/hermit.db');

async function getClient(): Promise<Client> {
    if (client) return client;

    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    client = createClient({
        url: `file:${DB_PATH}`,
    });

    return client;
}

export interface Agent {
    id: number;
    name: string;
    role: string;
    telegram_token: string;
    system_prompt: string;
    docker_image: string;
    is_active: number;
    require_approval: number;
    created_at: string;
    budget?: {
        daily_limit_usd: number;
        current_spend_usd: number;
    };
}

export interface Budget {
    agent_id: number;
    daily_limit_usd: number;
    current_spend_usd: number;
    last_reset_date: string;
    agent_name?: string;
}

export interface AllowlistUser {
    user_id: number;
    username: string;
    first_name: string;
    added_at: string;
}

export interface AuditLog {
    id: number;
    agent_id: number;
    container_id: string;
    command: string;
    output_snippet: string;
    approved_by: number | null;
    approved_at: string | null;
    status: string;
    created_at: string;
}

export async function initDb(): Promise<void> {
    const db = await getClient();

    await db.executeMultiple(`
        CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            telegram_token TEXT UNIQUE,
            system_prompt TEXT,
            docker_image TEXT DEFAULT 'hermit/base',
            is_active INTEGER DEFAULT 1,
            require_approval INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS budgets (
            agent_id INTEGER PRIMARY KEY,
            daily_limit_usd REAL DEFAULT 1.00,
            current_spend_usd REAL DEFAULT 0.00,
            last_reset_date TEXT DEFAULT (date('now')),
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS allowlist (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            salt TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER,
            container_id TEXT,
            command TEXT,
            output_snippet TEXT,
            approved_by INTEGER,
            approved_at DATETIME,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS agent_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER,
            content TEXT,
            embedding TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            initiator_id INTEGER,
            participant_id INTEGER,
            topic TEXT,
            transcript TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (initiator_id) REFERENCES agents(id),
            FOREIGN KEY (participant_id) REFERENCES agents(id)
        );

        INSERT OR IGNORE INTO settings (key, value) VALUES ('default_provider', 'openrouter');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('default_model', 'auto');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('public_url', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('default_daily_limit', '1.00');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('hitl_enabled', 'false');
    `);
}

export async function getAllAgents(): Promise<Agent[]> {
    const db = await getClient();
    const rs = await db.execute('SELECT * FROM agents ORDER BY created_at DESC');
    
    const agents: Agent[] = rs.rows.map(row => {
        const agent: any = { ...row };
        return agent as Agent;
    });
    
    for (const agent of agents) {
        const bRs = await db.execute({
            sql: 'SELECT daily_limit_usd, current_spend_usd FROM budgets WHERE agent_id = ?',
            args: [agent.id]
        });
        if (bRs.rows.length > 0) {
            agent.budget = {
                daily_limit_usd: bRs.rows[0].daily_limit_usd as number,
                current_spend_usd: bRs.rows[0].current_spend_usd as number
            };
        } else {
            agent.budget = { daily_limit_usd: 1, current_spend_usd: 0 };
        }
    }
    return agents;
}

export async function getAgentByToken(token: string): Promise<Agent | undefined> {
    const db = await getClient();
    const rs = await db.execute({
        sql: 'SELECT * FROM agents WHERE telegram_token = ? AND is_active = 1',
        args: [token]
    });
    
    if (rs.rows.length > 0) {
        return rs.rows[0] as unknown as Agent;
    }
    return undefined;
}

export async function getAgentById(id: number): Promise<Agent | undefined> {
    const db = await getClient();
    const rs = await db.execute({
        sql: 'SELECT * FROM agents WHERE id = ?',
        args: [id]
    });
    
    if (rs.rows.length > 0) {
        return rs.rows[0] as unknown as Agent;
    }
    return undefined;
}

export async function createAgent(agent: Omit<Agent, 'id' | 'created_at'>): Promise<number> {
    const db = await getClient();
    
    const rs = await db.execute({
        sql: `INSERT INTO agents (name, role, telegram_token, system_prompt, docker_image, is_active, require_approval) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [agent.name, agent.role, agent.telegram_token, agent.system_prompt, agent.docker_image, agent.is_active, agent.require_approval || 0]
    });
    
    const lastId = Number(rs.lastInsertRowid);
    await db.execute({
        sql: 'INSERT INTO budgets (agent_id, daily_limit_usd) VALUES (?, 1.00)',
        args: [lastId]
    });
    
    return lastId;
}

export async function updateAgent(id: number, updates: Partial<Agent>): Promise<void> {
    const db = await getClient();
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
    if (updates.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.system_prompt); }
    if (updates.docker_image !== undefined) { fields.push('docker_image = ?'); values.push(updates.docker_image); }
    if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }
    if (updates.require_approval !== undefined) { fields.push('require_approval = ?'); values.push(updates.require_approval); }
    
    if (fields.length > 0) {
        values.push(id);
        await db.execute({
            sql: `UPDATE agents SET ${fields.join(', ')} WHERE id = ?`,
            args: values
        });
    }
}

export async function deleteAgent(id: number): Promise<void> {
    const db = await getClient();
    await db.execute({ sql: 'DELETE FROM budgets WHERE agent_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM agents WHERE id = ?', args: [id] });
}

export async function getBudget(agentId: number): Promise<Budget | undefined> {
    const db = await getClient();
    const today = new Date().toISOString().split('T')[0];
    
    const rs = await db.execute({
        sql: 'SELECT * FROM budgets WHERE agent_id = ?',
        args: [agentId]
    });
    
    if (rs.rows.length > 0) {
        const budget = rs.rows[0] as unknown as Budget;
        
        if (budget.last_reset_date !== today) {
            await db.execute({
                sql: 'UPDATE budgets SET current_spend_usd = 0, last_reset_date = ? WHERE agent_id = ?',
                args: [today, agentId]
            });
            budget.current_spend_usd = 0;
            budget.last_reset_date = today;
        }
        
        return budget;
    }
    return undefined;
}

export async function updateSpend(agentId: number, amount: number): Promise<void> {
    const db = await getClient();
    await db.execute({
        sql: 'UPDATE budgets SET current_spend_usd = current_spend_usd + ? WHERE agent_id = ?',
        args: [amount, agentId]
    });
}

export async function updateBudget(agentId: number, limit: number): Promise<void> {
    const db = await getClient();
    await db.execute({
        sql: 'UPDATE budgets SET daily_limit_usd = ? WHERE agent_id = ?',
        args: [limit, agentId]
    });
}

export async function canSpend(agentId: number): Promise<boolean> {
    const budget = await getBudget(agentId);
    if (!budget) return false;
    return budget.current_spend_usd < budget.daily_limit_usd;
}

export async function getAllowlist(): Promise<AllowlistUser[]> {
    const db = await getClient();
    const rs = await db.execute('SELECT * FROM allowlist');
    return rs.rows as unknown as AllowlistUser[];
}

export async function addToAllowlist(userId: number, username?: string, firstName?: string): Promise<void> {
    const db = await getClient();
    await db.execute({
        sql: 'INSERT OR IGNORE INTO allowlist (user_id, username, first_name) VALUES (?, ?, ?)',
        args: [userId, username || null, firstName || null]
    });
}

export async function removeFromAllowlist(userId: number): Promise<void> {
    const db = await getClient();
    await db.execute({ sql: 'DELETE FROM allowlist WHERE user_id = ?', args: [userId] });
}

export async function isAllowed(userId: number): Promise<boolean> {
    const db = await getClient();
    const rs = await db.execute({ sql: 'SELECT 1 FROM allowlist WHERE user_id = ?', args: [userId] });
    return rs.rows.length > 0;
}

export async function getSetting(key: string): Promise<string | undefined> {
    const db = await getClient();
    const rs = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
    if (rs.rows.length > 0) {
        return rs.rows[0].value as string;
    }
    return undefined;
}

export async function setSetting(key: string, value: string): Promise<void> {
    const db = await getClient();
    await db.execute({ sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', args: [key, value] });
}

export async function getAllSettings(): Promise<Record<string, string>> {
    const db = await getClient();
    const rs = await db.execute('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of rs.rows) {
        settings[row.key as string] = row.value as string;
    }
    return settings;
}

export async function getTotalSpend(): Promise<number> {
    const db = await getClient();
    const rs = await db.execute("SELECT SUM(current_spend_usd) FROM budgets");
    if (rs.rows.length > 0) {
        return (rs.rows[0][0] as number) || 0;
    }
    return 0;
}

export async function getAllBudgets(): Promise<Budget[]> {
    const db = await getClient();
    const rs = await db.execute(`
        SELECT b.*, a.name as agent_name 
        FROM budgets b 
        JOIN agents a ON b.agent_id = a.id
    `);
    return rs.rows as unknown as Budget[];
}

export async function getAdminCount(): Promise<number> {
    const db = await getClient();
    const rs = await db.execute("SELECT COUNT(*) FROM admins");
    if (rs.rows.length > 0) {
        return Number(rs.rows[0][0]);
    }
    return 0;
}

export async function createAdmin(username: string, passwordHash: string, salt: string): Promise<void> {
    const db = await getClient();
    await db.execute({
        sql: 'INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)',
        args: [username, passwordHash, salt]
    });
}

export async function getAdmin(username: string): Promise<{id: number, password_hash: string, salt: string} | undefined> {
    const db = await getClient();
    const rs = await db.execute({
        sql: "SELECT id, password_hash, salt FROM admins WHERE username = ?",
        args: [username]
    });
    
    if (rs.rows.length > 0) {
        const row = rs.rows[0];
        return {
            id: row.id as number,
            password_hash: row.password_hash as string,
            salt: row.salt as string
        };
    }
    return undefined;
}

export async function createAuditLog(
    agentId: number,
    containerId: string,
    command: string,
    outputSnippet: string = ''
): Promise<number> {
    const db = await getClient();
    const rs = await db.execute({
        sql: 'INSERT INTO audit_logs (agent_id, container_id, command, output_snippet, status) VALUES (?, ?, ?, ?, ?)',
        args: [agentId, containerId, command, outputSnippet.substring(0, 500), 'pending']
    });
    return Number(rs.lastInsertRowid);
}

export async function updateAuditLog(
    logId: number,
    status: string,
    approvedBy?: number
): Promise<void> {
    const db = await getClient();
    if (approvedBy) {
        await db.execute({
            sql: 'UPDATE audit_logs SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
            args: [status, approvedBy, logId]
        });
    } else {
        await db.execute({
            sql: 'UPDATE audit_logs SET status = ? WHERE id = ?',
            args: [status, logId]
        });
    }
}

export async function getAuditLogs(agentId?: number, limit: number = 50): Promise<AuditLog[]> {
    const db = await getClient();
    let sql = 'SELECT * FROM audit_logs';
    const args: any[] = [];
    
    if (agentId) {
        sql += ' WHERE agent_id = ?';
        args.push(agentId);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ?';
    args.push(limit);
    
    const rs = await db.execute({ sql, args });
    return rs.rows as unknown as AuditLog[];
}

export function extractId(record: any): number {
    if (!record) return 0;
    if (typeof record === 'number') return record;
    if (typeof record === 'string') {
        const parts = record.split(':');
        return parseInt(parts[parts.length - 1], 10) || 0;
    }
    return 0;
}

export interface AgentMemory {
    id: number;
    agent_id: number;
    content: string;
    embedding: string;
    created_at: string;
}

export interface Meeting {
    id: number;
    initiator_id: number;
    participant_id: number;
    topic: string;
    transcript: string;
    status: string;
    created_at: string;
}

export async function storeMemory(agentId: number, content: string, embedding: number[]): Promise<number> {
    const db = await getClient();
    const rs = await db.execute({
        sql: 'INSERT INTO agent_memory (agent_id, content, embedding) VALUES (?, ?, ?)',
        args: [agentId, content, JSON.stringify(embedding)]
    });
    return Number(rs.lastInsertRowid);
}

export async function searchMemory(agentId: number, queryEmbedding: number[], limit: number = 5): Promise<AgentMemory[]> {
    const db = await getClient();
    const rs = await db.execute({
        sql: `SELECT id, agent_id, content, embedding, created_at FROM agent_memory 
              WHERE agent_id = ? 
              ORDER BY id DESC 
              LIMIT ?`,
        args: [agentId, limit]
    });
    return rs.rows as unknown as AgentMemory[];
}

export async function getAgentMemories(agentId: number, limit: number = 20): Promise<AgentMemory[]> {
    const db = await getClient();
    const rs = await db.execute({
        sql: 'SELECT id, agent_id, content, embedding, created_at FROM agent_memory WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
        args: [agentId, limit]
    });
    return rs.rows as unknown as AgentMemory[];
}

export async function createMeeting(initiatorId: number, participantId: number, topic: string): Promise<number> {
    const db = await getClient();
    const rs = await db.execute({
        sql: 'INSERT INTO meetings (initiator_id, participant_id, topic, status) VALUES (?, ?, ?, ?)',
        args: [initiatorId, participantId, topic, 'active']
    });
    return Number(rs.lastInsertRowid);
}

export async function updateMeetingTranscript(meetingId: number, transcript: string): Promise<void> {
    const db = await getClient();
    await db.execute({
        sql: 'UPDATE meetings SET transcript = ? WHERE id = ?',
        args: [transcript, meetingId]
    });
}

export async function closeMeeting(meetingId: number): Promise<void> {
    const db = await getClient();
    await db.execute({
        sql: 'UPDATE meetings SET status = ? WHERE id = ?',
        args: ['closed', meetingId]
    });
}

export async function getActiveMeetings(agentId?: number): Promise<Meeting[]> {
    const db = await getClient();
    if (agentId) {
        const rs = await db.execute({
            sql: 'SELECT * FROM meetings WHERE (initiator_id = ? OR participant_id = ?) AND status = ? ORDER BY created_at DESC',
            args: [agentId, agentId, 'active']
        });
        return rs.rows as unknown as Meeting[];
    }
    const rs = await db.execute({
        sql: 'SELECT * FROM meetings WHERE status = ? ORDER BY created_at DESC',
        args: ['active']
    });
    return rs.rows as unknown as Meeting[];
}
