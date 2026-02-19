# HermitClaw

"Intelligence in a Disposable Shell" - A secure, multi-agent AI orchestration platform where each agent lives in its own Docker "cubicle."

## Overview

HermitClaw is an evolution from a single Telegram bot to a **Secure Agentic Operating System**. Each AI agent runs in an ephemeral Docker container ("Cubicle") with its own Telegram bot identity, role, and budget.

### Key Features

- **Multi-Agent Support**: Create multiple AI agents with different personalities, roles, and Docker images
- **Per-Agent Budgeting**: Track and limit spending for each agent individually
- **Human-in-the-Loop (HITL)**: Require approval before executing dangerous commands
- **Audit Logs**: Complete searchable history of all agent commands
- **Web Terminal**: Attach to running agent containers via xterm.js
- **Web Dashboard**: Manage agents, users, and settings via a built-in GUI
- **Cubicle Security**: Each agent is isolated in its own container - complete freedom inside, steel walls outside
- **Ephemeral Execution**: Agents only exist during task execution, then vanish
- **Tool-Ready**: Agents can execute commands (curl, python, nmap, etc.) and see real results
- **Vector Memory**: libSQL-powered semantic memory storage for agents
- **Agent Meetings**: Agents can delegate sub-tasks to other specialized agents
- **Real-time Testing**: Test agents directly from the dashboard with live container execution

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HermitClaw                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Web Dashboard (Port 3000)              │   │
│  │  - Agent Management  - Budget Tracking  - Settings   │   │
│  │  - Audit Logs       - Web Terminal    - Test Agent   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Node.js Shell (Orchestrator)             │   │
│  │  - libSQL DB  - Docker Management  - Webhooks        │   │
│  │  - HITL Controller  - Audit Logger  - Vector Memory  │   │
│  │  - Meeting Orchestration                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Agent A      │   │  Agent B      │   │  Agent C      │
│  "Sherlock"   │   │  "DevOps"     │   │  "Researcher" │
│  hermit/base  │   │ hermit/python │   │ hermit/netsec │
│  [HITL: ON]   │   │  Container    │   │  Container    │
│  [Memory: ✓]  │   │  [Memory: ✓]  │   │  [Memory: ✓]  │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                    Agent Meetings (DELEGATE)
```

## Directory Structure

```
hermitclaw/
├── docker-compose.yml    # Docker Compose setup (optional)
├── shell/                # Node.js orchestrator
│   ├── src/
│   │   ├── server.ts     # Fastify server + webhook handler
│   │   ├── db.ts         # libSQL database + vector memory + meetings
│   │   ├── docker.ts     # Docker container orchestration
│   │   ├── telegram.ts   # Telegram bot handler + HITL
│   │   └── auth.ts       # User validation
│   ├── dashboard/        # Web GUI (served at /dashboard)
│   └── package.json
├── crab/                 # Rust AI agent
│   ├── src/
│   │   ├── main.rs       # Entry point + agent loop + memory injection
│   │   ├── llm.rs        # OpenAI/OpenRouter client
│   │   └── tools.rs      # Command execution + HITL + delegation
│   └── Dockerfile
├── data/db/              # libSQL database (created at runtime)
└── config/               # Configuration files
```

## Quick Start

### 1. Run the Installer

```bash
chmod +x install.sh
./install.sh
```

### 2. Configure Environment

Edit `shell/.env`:
```bash
OPENROUTER_API_KEY=your_openrouter_key_here
OPENAI_API_KEY=your_openai_key_here  # Optional
MODEL=anthropic/claude-3-haiku
```

### 3. Start the System

```bash
cd shell && npm start
```

### 4. Initial Setup (First Run)

On first run, the dashboard will show an **Initialization Screen**. Create your admin account:

- **Operator ID**: Your admin username
- **Access Key**: Your admin password

After creation, you'll be redirected to the **Login Screen** to authenticate.

### 4.1 Access the Dashboard

Open http://localhost:3000/dashboard/ in your browser

### 5. Create Your First Agent

1. Go to Dashboard → Agents
2. Click "+ New Agent"
3. Fill in:
   - **Name**: e.g., "Sherlock"
   - **Role**: e.g., "Security Researcher"
   - **Telegram Token**: Get from @BotFather
   - **Docker Image**: hermit/base, hermit/python, or hermit/netsec
   - **Require Approval (HITL)**: Enable for dangerous command approval

### 6. Set Up Telegram Webhook

Dashboard → Settings:
1. Set your **Public URL** (required for webhooks - must be publicly accessible)
2. Select your agent from the dropdown
3. Click "Set Webhook" to configure automatically

Alternatively, via API:
```bash
curl -X POST "https://api.telegram.org/bot<AGENT_TOKEN>/setWebhook" \
  -d "url=https://your-public-url/webhook/<AGENT_TOKEN>"
```

## New Features

### Human-in-the-Loop (HITL)

When enabled, dangerous commands require approval via Telegram:

1. Agent attempts dangerous command (rm, curl, nmap, etc.)
2. Shell sends approval request to Telegram with Approve/Deny buttons
3. Admin clicks button to approve or deny
4. If approved, command executes; if denied, agent receives error

**Dangerous commands detected:**
- File manipulation: rm, chmod, chown
- Network: curl, wget, nmap, nc, netcat
- System: sudo, su, kill, shutdown
- Docker: docker, podman
- Agent spawning: spawn_agent

### Web Terminal

Attach to running agent containers directly from the dashboard:

1. Click "Terminal" on any agent card
2. Click "Link" button to attach
3. Interact with the container's bash shell in real-time
4. Manual intervention in agent execution

### Audit Logs

All agent commands are logged with:
- Timestamp
- Agent name
- Command executed
- Approval status (pending/approved/denied)
- Output snippet

View logs in Dashboard → Audit Logs section

### Vector Memory

Agents can store and retrieve memories using libSQL:

- **Automatic Storage**: Agent interactions are stored with embeddings
- **Semantic Search**: Retrieve relevant past experiences
- **Per-Agent Isolation**: Each agent has its own memory space
- **Context Injection**: Memories are injected before LLM calls

Memory is managed via the `agent_memory` table and the `searchMemory()` function.

### Agent Meetings (Collaboration)

Agents can delegate sub-tasks to other specialized agents:

```
Agent: I need to analyze this data.
ACTION: DELEGATE
AGENT_ROLE: Python Expert
TASK: Analyze the CSV file at /data/sales.csv and return a summary
```

The orchestrator logs delegation requests and can route them to appropriate agents. Meeting transcripts are stored in the `meetings` table.

### Real-time Agent Testing

Test agents directly from the dashboard:

1. Click "Test" on any agent card
2. Enter a test message
3. Agent spawns in a real Docker container
4. View the live response

No HITL approval required for dashboard tests - safe for quick experimentation.

## Dashboard Features

- **Agents**: Deploy and manage AI agents with different roles and Docker images
- **Audit Logs**: Complete searchable history of all agent commands
- **Metrics**: View Docker status, container counts, and per-agent budget spending
- **Allowlist**: Manage authorized Telegram users
- **Settings**: Configure public URL, default model, daily budget limits, and webhook setup

## Agent Images

| Image | Tools | Use Case |
|-------|-------|----------|
| `hermit/base:latest` | curl, jq, sed, awk, bash | General tasks |
| `hermit/python:latest` | python3, pandas, numpy | Data analysis |
| `hermit/netsec:latest` | nmap, dig, openssl | Security research |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `SESSION_SECRET` | Session cookie secret | `hermit-secret-change-in-production` |
| `OPENROUTER_API_KEY` | OpenRouter API key | Required |
| `OPENAI_API_KEY` | OpenAI API key (optional) | - |
| `MODEL` | Default model | anthropic/claude-3-haiku |

> **Security Note**: For production deployments, always set a unique `SESSION_SECRET` environment variable.

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/status` | GET | Check auth status |
| `/api/auth/setup` | POST | Create initial admin |
| `/api/auth/login` | POST | Admin login |
| `/api/auth/logout` | POST | Admin logout |
| `/api/agents` | GET | List all agents |
| `/api/agents` | POST | Create new agent |
| `/api/agents/:id` | PUT | Update agent |
| `/api/agents/:id` | DELETE | Delete agent |
| `/api/test-agent/:id` | POST | Test agent with message (spawns container) |
| `/api/stats` | GET | System statistics |
| `/api/settings` | GET | Get all settings |
| `/api/settings` | POST | Update a setting |
| `/api/allowlist` | GET | List allowlisted users |
| `/api/allowlist` | POST | Add user to allowlist |
| `/api/allowlist/:id` | DELETE | Remove user |
| `/api/audit` | GET | Get audit logs |
| `/api/telegram/webhook` | POST | Set webhook for agent |
| `/api/terminal/:containerId` | WS | WebSocket terminal |
| `/webhook/:token` | POST | Telegram webhook endpoint |

### Database Schema

- **agents**: id, name, role, telegram_token, system_prompt, docker_image, is_active, require_approval, created_at
- **budgets**: agent_id, daily_limit_usd, current_spend_usd, last_reset_date
- **allowlist**: user_id, username, first_name, added_at
- **settings**: key, value (includes public_url, default_model, default_provider, default_daily_limit, hitl_enabled)
- **admins**: id, username, password_hash, salt, created_at
- **audit_logs**: id, agent_id, container_id, command, output_snippet, approved_by, approved_at, status, created_at
- **agent_memory**: id, agent_id, content, embedding, created_at (vector memory storage)
- **meetings**: id, initiator_id, participant_id, topic, transcript, status, created_at (agent collaboration)

## Agent Tool Loop

The Rust agent supports autonomous tool execution:

```
You: "Check if example.com is up"

Agent: I'll check that for you.
ACTION: EXECUTE
COMMAND: curl -s -o /dev/null -w "%{http_code}" https://example.com

[System returns: 200]

Agent: example.com is responding with HTTP 200 OK.
```

### Agent Collaboration Protocol

Agents can delegate tasks to other specialized agents:

```
Agent: I need Python expertise for this task.
ACTION: DELEGATE
AGENT_ROLE: Python Expert
TASK: Analyze the CSV file and create a visualization

[System logs delegation request]
[MEETING] Sub-task delegation requested...
[MEETING] TARGET_ROLE: Python Expert
[MEETING] TASK: Analyze the CSV file...
```

## Security

- **Admin Authentication**: Dashboard is protected with session-based auth
- **Human-in-the-Loop**: Dangerous commands require approval
- **Cubicle Isolation**: Each agent runs in its own Docker container
- **Resource Limits**: 512MB RAM, 1 CPU, 100 process limit
- **Auto-Remove**: Containers deleted after task completion
- **Network Isolation**: Agents can access internet but not host system
- **Budget Guards**: Per-agent spending limits prevent runaway costs
- **Audit Trail**: Complete logging of all executed commands
- **Memory Isolation**: Each agent's vector memory is isolated by agent_id
- **Delegation Control**: Agent spawning triggers HITL approval

## Troubleshooting

### Docker permission denied
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Build errors
```bash
# Install build dependencies
sudo apt install build-essential python3 pkg-config libssl-dev
```

### Database issues
The libSQL database is stored in `data/db/hermit.db`. Delete it to reset:
```bash
rm -rf data/db/hermit.db
```

## Technology Stack

- **Orchestrator**: Node.js + Fastify + TypeScript
- **Database**: libSQL (SQLite-compatible with extensions)
- **Agent Runtime**: Rust + Tokio + Reqwest
- **Container Runtime**: Docker
- **Frontend**: Vanilla JS + Tailwind CSS + xterm.js
- **LLM Providers**: OpenRouter / OpenAI

## License

MIT
