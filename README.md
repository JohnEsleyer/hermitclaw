# HermitClaw

"Intelligence in a Hibernating Shell" - A secure, multi-agent AI orchestration platform where each agent lives in its own Docker "cubicle" with persistent workspaces.

## Overview

HermitClaw is a **Secure Agentic Operating System**. Each AI agent runs in a Docker container ("Cubicle") with its own Telegram bot identity, role, and budget. Containers run continuously and hibernate when idle, preserving state in persistent workspaces.

### Key Features

- **Multi-Agent Support**: Create multiple AI agents with different personalities, roles, and Docker images
- **Continuous Containers**: Containers run `sleep infinity` and execute commands via `docker exec` - instant response times
- **Persistent Workspaces**: Each agent+user pair gets a persistent workspace that survives container restarts
- **Agent Verification Handshake**: Verify Telegram tokens before creating agents via 6-digit code
- **Auto-Webhook Registration**: Webhooks automatically registered when agents are created
- **Sync Bots Button**: Re-register all webhooks with one click (useful when public URL changes)
- **Operator Auto-Allowlist**: Setting Operator ID automatically adds you to the allowlist
- **API Key Validation**: Dashboard blocks agent creation if API keys are missing
- **Per-Agent Budgeting**: Track and limit spending for each agent individually
- **Human-in-the-Loop (HITL)**: Require approval before executing dangerous commands
- **Delegation HITL**: Agent collaboration requires operator approval
- **Async Telegram Processing**: Instant responses with background processing and status updates
- **Audit Logs**: Complete searchable history of all agent commands
- **Web Terminal**: Attach to running agent containers via xterm.js
- **Web Dashboard**: Manage agents, users, and settings via a built-in GUI
- **Manual Container Controls**: Start/Stop/Delete containers from the dashboard
- **Container Labels**: Track cubicles with `hermitclaw.*` Docker labels
- **Automatic Reaper**: Hibernate idle containers (30min), remove old ones (48hrs)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HermitClaw                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Web Dashboard (Port 3000)              │   │
│  │  - Agent Management  - Budget Tracking  - Settings   │   │
│  │  - Audit Logs       - Web Terminal    - Test Agent   │   │
│  │  - Cubicles View    - Sync Bots       - Start/Stop   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Node.js Shell (Orchestrator)             │   │
│  │  - libSQL DB  - Docker Management  - Webhooks        │   │
│  │  - HITL Controller  - Audit Logger  - API Key Check  │   │
│  │  - Auto-Webhook Registration  - Container Reaper     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Agent A      │   │  Agent B      │   │  Agent C      │
│  "Sherlock"   │   │  "DevOps"     │   │  "Researcher" │
│  hermit/base  │   │ hermit/python │   │ hermit/netsec │
│  [HITL: ON]   │   │  [HITL: OFF]  │   │  [HITL: ON]   │
│  [Workspace]  │   │  [Workspace]  │   │  [Workspace]  │
│  [Running]    │   │  [Running]    │   │  [Stopped]    │
│  (continuous) │   │  (continuous) │   │  (can start)  │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                    Agent Meetings (DELEGATE)
                    Requires Operator Approval
```

## Directory Structure

```
hermitclaw/
├── docker-compose.yml    # Docker Compose setup (optional)
├── shell/                # Node.js orchestrator
│   ├── src/
│   │   ├── server.ts     # Fastify server + webhook handler + reaper
│   │   ├── db.ts         # libSQL database + vector memory + meetings
│   │   ├── docker.ts     # Docker orchestration + continuous containers
│   │   ├── telegram.ts   # Telegram handler + HITL + webhook registration
│   │   └── auth.ts       # User validation + operator management
│   ├── dashboard/        # Web GUI (served at /dashboard)
│   └── package.json
├── crab/                 # Rust AI agent
│   ├── src/
│   │   ├── main.rs       # Entry point + workspace management
│   │   ├── llm.rs        # OpenAI/OpenRouter client
│   │   └── tools.rs      # Command execution + HITL + delegation
│   └── Dockerfile
├── data/
│   ├── db/               # libSQL database
│   ├── workspaces/       # Persistent agent workspaces
│   │   └── {agent_id}_{user_id}/
│   └── cache/            # pip/npm cache for faster builds
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
WEBHOOK_SECRET=your_random_secret_here  # For webhook security
```

### 3. Start the System

```bash
cd shell && npm start
```

### 4. Initial Setup (First Run)

On first run, the dashboard will show an **Initialization Screen**:

1. **Admin Username**: Your admin login
2. **Admin Password**: Your admin password
3. **Operator Telegram ID**: Your Telegram User ID (get from @userinfobot)

After logging in, go to **Settings** and configure:

4. **Public URL**: Your public-facing URL (e.g., from ngrok or Cloudflare tunnel)
5. **API Keys**: Enter your LLM provider API keys (OpenRouter, OpenAI, etc.)
6. Click **"Save All Settings"**

> **Note:** Setting your Operator ID automatically adds you to the Allowlist.

### 5. Access the Dashboard

Open http://localhost:3000/dashboard/ in your browser

### 6. Create Your First Agent

The dashboard uses a **3-Step Verification Wizard**:

**Step 1: Configuration**
- Enter agent **Name** (e.g., "Sherlock")
- Enter **Role** description (e.g., "Security Researcher")
- Paste your **Telegram Token** (from @BotFather)
- Select **Docker Image** (hermit/base, hermit/python, or hermit/netsec)
- Toggle **HITL** if you want approval for dangerous commands

**Step 2: Verification Handshake**
- Click **"Send Verification Code"** - a 6-digit code will be sent to your Operator Telegram
- Wait for the code to arrive

**Step 3: Enter Code**
- Enter the 6-digit verification code
- Click **"Create Agent"** to complete setup
- Webhook is automatically registered!

**Step 4: Start the Bot**
- Go to your bot on Telegram and send `/start`

> **Why verification?** This ensures your bot token is valid. The webhook is automatically registered so Telegram can send messages to your bot.

## Core Concepts

### Continuous Containers

Containers run continuously using `sleep infinity`:

- **Instant Response**: No container boot time - commands execute immediately via `docker exec`
- **State Preservation**: Background tasks, downloaded tools, and memory states persist between messages
- **No File Mount Issues**: History passed via Base64 ENV instead of file mounts
- **Manual Control**: Start/Stop/Delete containers from the Cubicles dashboard

| State | Condition | Action |
|-------|-----------|--------|
| **Running** | Container active | Commands execute instantly |
| **Stopped** | Manually stopped or hibernated | Click "Start" to wake up |
| **Deleted** | Manually removed | Will spawn fresh on next message |

### Persistent Workspaces

Each agent+user pair gets a dedicated workspace:

- **Host Path**: `data/workspaces/{agent_id}_{user_id}`
- **Container Path**: `/app/workspace`
- **Persistence**: Survives container restarts, stops, and deletions
- **Shared Files**: Download once, reference across multiple conversations

### Operator Security

The Operator is the primary human controller:

- **Configuration**: Set Operator Telegram ID in Settings
- **Auto-Allowlist**: Setting Operator ID automatically adds you to the Allowlist
- **Verification Codes**: Sent to Operator's Telegram for agent creation
- **HITL Approvals**: All dangerous command approvals go to Operator
- **Delegation Control**: Agent collaboration requires Operator approval

### API Key Validation

The system validates API keys at multiple levels:

1. **Dashboard Prevention**: Cannot create agents if API key for selected provider is missing
2. **Pre-flight Check**: Container won't spawn if API key is missing
3. **Error Interception**: 401 Unauthorized errors are caught and shown as friendly messages

### Auto-Webhook Registration

Webhooks are automatically registered when:

- An agent is created via verification
- You click **"Sync Bots"** button in the dashboard header

Use **Sync Bots** when:
- Your public URL changes (ngrok restart, Cloudflare tunnel changes)
- Bot stops responding to messages
- After server restarts with a new URL

## Human-in-the-Loop (HITL)

When enabled, dangerous commands require approval via Telegram:

1. Agent attempts dangerous command (rm, curl, nmap, etc.)
2. Shell sends approval request to Operator with Approve/Deny buttons
3. Operator clicks button to approve or deny
4. If approved, command executes; if denied, agent receives error

**Dangerous commands detected:**
- File manipulation: rm, chmod, chown
- Network: curl, wget, nmap, nc, netcat
- System: sudo, su, kill, shutdown
- Docker: docker, podman
- Agent spawning: spawn_agent

### Delegation HITL

When an agent delegates to another agent:

```
ACTION: DELEGATE
AGENT_ROLE: Python Expert
TASK: Analyze the CSV file
```

The Operator receives:
- Delegation request with target role and task
- Approve/Deny buttons
- On approval: New cubicle spawned for sub-task

## Built-in Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and show welcome message |
| `/status` | Check cubicle status (running/stopped) |
| `/reset` | Delete current cubicle (fresh start next message) |
| `/budget` | Check remaining daily budget |
| `/debug` | Show detailed debug info |
| `/logs` | View recent container logs |
| `/workspace` | List files in persistent workspace |
| `/help` | Show all commands |

**Operator-only commands:**
| Command | Description |
|---------|-------------|
| `/containers` | List all running containers |
| `/agents` | List all registered agents |

## Container Labels

All cubicles are tagged with Docker labels for tracking:

```yaml
hermitclaw.agent_id: "1"
hermitclaw.user_id: "123456789"
hermitclaw.last_active: "2026-02-20T12:00:00Z"
hermitclaw.status: "active"
hermitclaw.created_at: "2026-02-20T10:00:00Z"
```

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
| `WEBHOOK_SECRET` | Telegram webhook secret | `hermit-webhook-secret` |
| `OPENROUTER_API_KEY` | OpenRouter API key | Required |
| `OPENAI_API_KEY` | OpenAI API key (optional) | - |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/status` | GET | Check auth status |
| `/api/auth/setup` | POST | Create initial admin + operator |
| `/api/auth/login` | POST | Admin login |
| `/api/agents` | GET | List all agents |
| `/api/agents/request-verification` | POST | Send verification code |
| `/api/agents/confirm-verification` | POST | Verify and create agent |
| `/api/test-agent/:id` | POST | Test agent with message |
| `/api/containers/:id/start` | POST | Start a stopped container |
| `/api/containers/:id/stop` | POST | Stop a running container |
| `/api/containers/:id/remove` | POST | Delete a container |
| `/api/webhooks/sync` | POST | Re-register all agent webhooks |
| `/api/settings/batch` | POST | Save settings (trims values, auto-allowlist) |
| `/webhook/:token` | POST | Telegram webhook (returns 202) |

### Database Schema

- **agents**: id, name, role, telegram_token, system_prompt, docker_image, is_active, require_approval, created_at
- **budgets**: agent_id, daily_limit_usd, current_spend_usd, last_reset_date
- **allowlist**: user_id, username, first_name, is_operator, added_at
- **settings**: key, value (includes operator_telegram_id, public_url, api keys, etc.)
- **admins**: id, username, password_hash, salt, created_at
- **audit_logs**: id, agent_id, container_id, command, output_snippet, approved_by, approved_at, status, created_at

## Security

- **Admin Authentication**: Dashboard protected with session-based auth
- **Operator-First Bootstrap**: Primary admin required during setup
- **Agent Verification**: Telegram tokens verified before agent creation
- **Webhook Secret**: All webhooks validated with secret token (alphanumeric only)
- **API Key Validation**: Multiple layers of checks prevent 401 errors
- **Human-in-the-Loop**: Dangerous commands require approval
- **Delegation Control**: Agent collaboration requires approval
- **Cubicle Isolation**: Each agent runs in its own Docker container
- **Resource Limits**: 512MB RAM, 1 CPU, 100 process limit
- **Network Isolation**: Agents can access internet but not host system
- **Budget Guards**: Per-agent spending limits prevent runaway costs
- **Audit Trail**: Complete logging of all executed commands

## Troubleshooting

### Docker permission denied
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Build errors
```bash
sudo apt install build-essential python3 pkg-config libssl-dev
```

### Database issues
```bash
rm -rf data/db/hermit.db
```

### Find your Telegram User ID
Send `/start` to @userinfobot on Telegram

### Bot not responding to messages
1. Check that your **Public URL** is set in Settings
2. Click **"Sync Bots"** button in the dashboard header
3. Verify the webhook was registered (check server logs)

### 401 Unauthorized error
1. Go to **Settings → API Keys**
2. Enter your API key for the selected provider
3. Click **"Save All Settings"**
4. Send `/reset` to your bot or delete the container from Cubicles tab
5. Try again

### Container not waking up
```bash
docker ps -a --filter "label=hermitclaw.agent_id"
```
Or use the **Start** button in the Cubicles dashboard tab.

## Technology Stack

- **Orchestrator**: Node.js + Fastify + TypeScript
- **Database**: libSQL (SQLite-compatible)
- **Agent Runtime**: Rust + Tokio + Reqwest
- **Container Runtime**: Docker with labels + exec
- **Frontend**: Vanilla JS + Tailwind CSS + xterm.js
- **LLM Providers**: OpenRouter / OpenAI / Anthropic / Google / Groq / Mistral / DeepSeek / xAI

## License

MIT
