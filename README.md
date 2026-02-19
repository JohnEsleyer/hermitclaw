# HermitClaw

"Intelligence in a Hibernating Shell" - A secure, multi-agent AI orchestration platform where each agent lives in its own Docker "cubicle" with persistent workspaces.

## Overview

HermitClaw is a **Secure Agentic Operating System**. Each AI agent runs in a Docker container ("Cubicle") with its own Telegram bot identity, role, and budget. Containers hibernate when idle and wake up on demand, preserving state in persistent workspaces.

### Key Features

- **Multi-Agent Support**: Create multiple AI agents with different personalities, roles, and Docker images
- **Hibernating Cubicles**: Containers sleep when idle, wake instantly on demand - no more "amnesia"
- **Persistent Workspaces**: Each agent+user pair gets a persistent workspace that survives container restarts
- **Agent Verification Handshake**: Verify Telegram tokens before creating agents via 6-digit code
- **Operator-First Security**: Primary admin designated as "Operator" for all HITL approvals
- **Per-Agent Budgeting**: Track and limit spending for each agent individually
- **Human-in-the-Loop (HITL)**: Require approval before executing dangerous commands
- **Delegation HITL**: Agent collaboration requires operator approval
- **Async Telegram Processing**: Instant responses with background processing and status updates
- **Audit Logs**: Complete searchable history of all agent commands
- **Web Terminal**: Attach to running agent containers via xterm.js
- **Web Dashboard**: Manage agents, users, and settings via a built-in GUI
- **Container Labels**: Track cubicles with `hermitclaw.*` Docker labels
- **Automatic Reaper**: Hibernate idle containers (30min), remove old ones (48hrs)
- **Non-Root Security**: Containers run as `hermit` user, not root

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HermitClaw                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Web Dashboard (Port 3000)              │   │
│  │  - Agent Management  - Budget Tracking  - Settings   │   │
│  │  - Audit Logs       - Web Terminal    - Test Agent   │   │
│  │  - Verification Wizard   - Operator Config           │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Node.js Shell (Orchestrator)             │   │
│  │  - libSQL DB  - Docker Management  - Webhooks        │   │
│  │  - HITL Controller  - Audit Logger  - Vector Memory  │   │
│  │  - Meeting Orchestration  - Container Reaper         │   │
│  │  - Async Processing  - Operator Management           │   │
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
│  [Hibernating]│   │  [Active]     │   │  [Stopped]    │
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
│   │   ├── docker.ts     # Docker orchestration + labels + workspaces
│   │   ├── telegram.ts   # Telegram handler + HITL + delegation
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
│   ├── cache/            # pip/npm cache for faster builds
│   └── history_buffer/   # Session history files
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

The Operator ID is required for:
- Agent verification handshake codes
- HITL approval requests
- Delegation approval requests

### 5. Access the Dashboard

Open http://localhost:3000/dashboard/ in your browser

### 6. Create Your First Agent

1. Go to Dashboard → Agents
2. Click "+ New Agent"
3. Fill in Name, Role, and Telegram Token
4. **Verification Handshake**:
   - Click "Send Code" to receive a 6-digit code on Telegram
   - Enter the code to verify the bot works
   - Only verified agents can be created
5. Choose Docker Image and HITL settings

### 7. Set Up Telegram Webhook

Dashboard → Settings:
1. Set your **Public URL** (must be publicly accessible)
2. Select your agent from the dropdown
3. Click "Set Webhook"

## Core Concepts

### Hibernating Cubicles

Containers now use a **lease-based lifecycle** instead of immediate deletion:

| State | Condition | Action |
|-------|-----------|--------|
| **Active** | User is interacting | Container running, files accessible |
| **Hibernating** | Idle > 30 minutes | Container stopped, workspace preserved |
| **Removed** | Idle > 48 hours | Container deleted, workspace preserved |

Benefits:
- **No Amnesia**: Files persist across sessions in `/app/workspace`
- **Resource Efficient**: No idle containers consuming RAM
- **Fast Wake-up**: Stopped containers start in ~1 second vs ~10 seconds for new

### Persistent Workspaces

Each agent+user pair gets a dedicated workspace:

- **Host Path**: `data/workspaces/{agent_id}_{user_id}`
- **Container Path**: `/app/workspace`
- **Persistence**: Survives container restarts, hibernations, and deletions
- **Shared Files**: Download once, reference across multiple conversations

### Operator Security

The Operator is the primary human controller:

- **First Boot**: Required during initial setup
- **Verification Codes**: Sent to Operator's Telegram for agent creation
- **HITL Approvals**: All dangerous command approvals go to Operator
- **Delegation Control**: Agent collaboration requires Operator approval
- **Allowlist Priority**: Operator automatically added to allowlist with `is_operator=1`

### Async Telegram Processing

Webhooks return immediately to prevent timeouts:

1. **Receive webhook** → Return HTTP 202 Accepted
2. **Send typing indicator** → Show "Agent is waking up..."
3. **Spawn/wake container** → Edit message: "Agent is thinking..."
4. **Process message** → Edit message with final result
5. **Long outputs** → Send as file attachment (>4000 chars)

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
| `/start` | Start the bot |
| `/status` | Check cubicle status (running/hibernating) |
| `/reset` | Delete current cubicle (fresh start next message) |
| `/budget` | Check remaining daily budget |

## Container Labels

All cubicles are tagged with Docker labels for tracking:

```yaml
hermitclaw.agent_id: "1"
hermitclaw.user_id: "123456789"
hermitclaw.last_active: "2026-02-19T12:00:00Z"
hermitclaw.status: "active"
hermitclaw.created_at: "2026-02-19T10:00:00Z"
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
| `/api/agents` | POST | Create new agent (legacy) |
| `/api/agents/request-verification` | POST | Send verification code |
| `/api/agents/confirm-verification` | POST | Verify and create agent |
| `/api/test-agent/:id` | POST | Test agent with message |
| `/api/allowlist/set-operator/:userId` | POST | Designate operator |
| `/api/reaper/run` | POST | Manually trigger container cleanup |
| `/webhook/:token` | POST | Telegram webhook (returns 202) |

### Database Schema

- **agents**: id, name, role, telegram_token, system_prompt, docker_image, is_active, require_approval, created_at
- **budgets**: agent_id, daily_limit_usd, current_spend_usd, last_reset_date
- **allowlist**: user_id, username, first_name, **is_operator**, added_at
- **settings**: key, value (includes **operator_telegram_id**, public_url, default_model, etc.)
- **admins**: id, username, password_hash, salt, created_at
- **audit_logs**: id, agent_id, container_id, command, output_snippet, approved_by, approved_at, status, created_at
- **agent_memory**: id, agent_id, content, embedding, created_at
- **meetings**: id, initiator_id, participant_id, topic, transcript, status, created_at

## Security

- **Admin Authentication**: Dashboard protected with session-based auth
- **Operator-First Bootstrap**: Primary admin required during setup
- **Agent Verification**: Telegram tokens verified before agent creation
- **Webhook Secret**: All webhooks validated with secret token
- **Human-in-the-Loop**: Dangerous commands require approval
- **Delegation Control**: Agent collaboration requires approval
- **Cubicle Isolation**: Each agent runs in its own Docker container
- **Non-Root User**: Containers run as `hermit` user, not root
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

### Container not waking up
```bash
docker ps -a --filter "label=hermitclaw.agent_id"
docker start <container_id>
```

## Technology Stack

- **Orchestrator**: Node.js + Fastify + TypeScript
- **Database**: libSQL (SQLite-compatible)
- **Agent Runtime**: Rust + Tokio + Reqwest
- **Container Runtime**: Docker with labels
- **Frontend**: Vanilla JS + Tailwind CSS + xterm.js
- **LLM Providers**: OpenRouter / OpenAI / Anthropic / Google / Groq / Mistral / DeepSeek / xAI

## License

MIT
