# HermitShell

"Intelligence in a Persistent Shell" - A secure, multi-agent AI orchestration platform where each agent lives in its own Docker "cubicle" with persistent workspaces.

## Overview

HermitShell is a **Secure Agentic Operating System**. Each AI agent runs in a Docker container ("Cubicle") with its own Telegram bot identity, role, and budget. Containers run continuously until manually stopped, preserving state in persistent workspaces.

### Key Features

- **Multi-Agent Support**: Create multiple AI agents with different personalities, roles, and Docker images
- **Continuous Containers**: Containers run `sleep infinity` and execute commands via `docker exec` - instant response times
- **Persistent Workspaces**: Each agent+user pair gets a persistent workspace that survives container restarts
- **Auto Cloudflare Tunnel**: Automatic public URL generation on startup - no manual ngrok required
- **Web App Previews**: Agents can create web apps accessible via tunnel URL
- **Automatic File Delivery**: Files created by agents are auto-sent via Telegram
- **Agent Verification Handshake**: Verify Telegram tokens before creating agents via 6-digit code
- **Auto-Webhook Registration**: Webhooks automatically registered when agents are created
- **Sync Bots Button**: Re-register all webhooks with one click (useful when public URL changes)
- **Operator Auto-Allowlist**: Setting Operator ID automatically adds you to the allowlist
- **API Key Validation**: Dashboard blocks agent creation if API keys are missing
- **Per-Agent Budgeting**: Track and limit spending for each agent individually
- **Per-Agent LLM Selection**: Choose provider/model per agent (or inherit global defaults)
- **Persistent Chat Context**: Dashboard and Telegram keep context with explicit clear controls (`Clear` button and `/clear`)
- **Human-in-the-Loop (HITL)**: Require approval before executing dangerous commands
- **Delegation HITL**: Agent collaboration requires operator approval
- **Async Telegram Processing**: Instant responses with background processing and status updates
- **Audit Logs**: Complete searchable history of all agent commands
- **Web Terminal**: Attach to running agent containers via xterm.js
- **Web Dashboard**: Manage agents, users, and settings via a built-in GUI
- **Improved Agent Cards**: Less crowded cards with better action button fit and readability
- **File Browser**: Browse and download agent workspace files from dashboard
- **Manual Container Controls**: Start/Stop/Delete containers from the dashboard
- **Container Labels**: Track cubicles with `hermitshell.*` Docker labels

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HermitShell                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Web Dashboard (Port 3000)              │   │
│  │  - Agent Management  - Budget Tracking  - Settings   │   │
│  │  - Audit Logs       - Web Terminal    - Test Agent   │   │
│  │  - Cubicles View    - Sync Bots       - File Browser │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Node.js Shell (Orchestrator)             │   │
│  │  - libSQL DB  - Docker Management  - Webhooks        │   │
│  │  - HITL Controller  - Audit Logger  - API Key Check  │   │
│  │  - Auto-Webhook Registration  - Cloudflare Tunnel    │   │
│  │  - File Delivery   - Web Preview Proxy               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Cloudflare Quick Tunnel (cloudflared)      │   │
│  │  - Auto-generated public URL (trycloudflare.com)     │   │
│  │  - Webhook delivery  - Web preview access            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Agent A      │   │  Agent B      │   │  Agent C      │
│  "Sherlock"   │   │  "DevOps"     │   │  "Researcher" │
│ hermitshell/base │   │hermitshell/python│   │hermitshell/netsec│
│  [HITL: ON]   │   │  [HITL: OFF]  │   │  [HITL: ON]   │
│  [Workspace]  │   │  [Workspace]  │   │  [Workspace]  │
│  [Port 8080]  │   │  [Port 8080]  │   │  [Port 8080]  │
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
hermitshell/
├── docker-compose.yml    # Docker Compose setup (optional)
├── shell/                # Node.js orchestrator
│   ├── src/
│   │   ├── server.ts     # Fastify server + webhook handler + preview proxy
│   │   ├── db.ts         # libSQL database + vector memory + meetings
│   │   ├── docker.ts     # Docker orchestration + continuous containers
│   │   ├── telegram.ts   # Telegram handler + HITL + file delivery
│   │   ├── tunnel.ts     # Cloudflare tunnel management
│   │   └── auth.ts       # User validation + operator management
│   ├── dashboard/        # Built web GUI (auto-synced from dashboard/)
│   └── package.json
├── dashboard/            # Dashboard source (TypeScript/HTML)
│   ├── src/
│   │   └── public/       # Source files
│   ├── dist/             # Built files (synced to shell/dashboard/)
│   └── package.json
├── crab/                 # Rust AI agent
│   ├── src/
│   │   ├── main.rs       # Entry point + workspace management
│   │   ├── llm.rs        # OpenAI/OpenRouter client + system prompts
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

### 3. Build and Start the System

```bash
cd shell && npm run build
```

The build command will:
1. Compile TypeScript to JavaScript
2. Automatically sync dashboard files from `dashboard/src/public/` to `shell/dashboard/dist/`

Then start the server:
```bash
cd shell && npm start
```

The server will:
1. Start listening on port 3000
2. Automatically start Cloudflare tunnel
3. Generate a public URL (e.g., `https://random.trycloudflare.com`)
4. Sync all agent webhooks with the new URL

### Updating After Pulling from Main

If you pulled new changes from GitHub, rebuild to sync the dashboard:

```bash
git pull origin main
cd shell && npm run build
cd shell && npm start
```

### 4. Initial Setup (First Run)

On first run, the dashboard will show an **Initialization Screen**:

1. **Admin Username**: Your admin login
2. **Admin Password**: Your admin password
3. **Operator Telegram ID**: Your Telegram User ID (get from @userinfobot)

After logging in, go to **Settings** and configure:

4. **Public URL**: Auto-generated by Cloudflare tunnel (or set manually for custom domains)
5. **API Keys**: Enter your LLM provider API keys (OpenRouter, OpenAI, etc.)
6. Click **"Save All Settings"**

> **Note:** Setting your Operator ID automatically adds you to the Allowlist. The Cloudflare tunnel starts automatically on server launch.

### 5. Access the Dashboard

Open http://localhost:3000/dashboard/ in your browser

### 6. Create Your First Agent

The dashboard uses a **3-Step Verification Wizard**:

**Step 1: Configuration**
- Enter agent **Name** (e.g., "Sherlock")
- Enter **Role** description (e.g., "Security Researcher")
- Paste your **Telegram Token** (from @BotFather)
- Select **Docker Image** (hermitshell/base, hermitshell/python, or hermitshell/netsec)
- Select **LLM Provider/Model** for this agent (or keep `default` to inherit global settings)
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
- Use `/clear` any time to explicitly reset the conversation context for that user+agent chat

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
| **Stopped** | Manually stopped | Click "Start" to wake up |
| **Deleted** | Manually removed | Will spawn fresh on next message |

### Persistent Workspaces

Each agent+user pair gets a dedicated workspace:

- **Host Path**: `data/workspaces/{agent_id}_{user_id}`
- **Container Path**: `/app/workspace`
- **Persistence**: Survives container restarts, stops, and deletions
- **Shared Files**: Download once, reference across multiple conversations

### Automatic Cloudflare Tunnel

On startup, HermitShell automatically creates a public tunnel:

- **Zero Configuration**: No need for ngrok or manual port forwarding
- **Auto-generated URL**: Random `trycloudflare.com` URL (e.g., `https://random-name-1234.trycloudflare.com`)
- **Auto-sync**: Webhooks are automatically registered with the tunnel URL
- **Free**: Cloudflare Quick Tunnels require no account

The tunnel URL is saved to the database and used for all webhook registrations.

### Web App Previews

Agents can create web applications that are accessible via the tunnel:

```
Agent creates web app:
  python3 -m http.server 8080
  streamlit run app.py --server.port 8080
  flask run --port 8080

User accesses via:
  https://<tunnel>.trycloudflare.com/preview/<agent_id>/8080/
```

**How it works:**
1. Agent starts a web server on port 8080 (or any port)
2. Shell proxies requests to the container's internal IP
3. User can preview the app in their browser

### Automatic File Delivery

When agents create files, they're automatically delivered to users:

**Agent syntax:**
```
FILE: /app/workspace/report.pdf
FILE: /app/workspace/data.csv
```

**What happens:**
1. Shell detects the `FILE:` marker in agent output
2. File is read from the workspace
3. File is sent via Telegram (up to 50MB)
4. User receives the file instantly on their phone

**Supported file types:** PDF, CSV, images, text files, any binary file under 50MB.

### Dashboard File Browser

Browse and download agent workspace files from the dashboard:

- **Access**: Dashboard → Agents → Files button
- **Download**: Click any file to download
- **Directory tree**: Navigate nested directories

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

## Agent Output Syntax

Agents use special syntax for enhanced features:

### File Delivery
```
FILE: /app/workspace/report.pdf
FILE: /app/workspace/analysis.csv
```
Files are automatically sent to the user via Telegram.

### Web App Preview
Agents should run web servers on port 8080:
```bash
python3 -m http.server 8080
streamlit run app.py --server.port 8080
flask run --port 8080
```
Access at: `https://<tunnel>/preview/<agent_id>/8080/`

### Delegation
```
ACTION: DELEGATE
TARGET_ROLE: Python Expert
TASK: Analyze the data file
```
Requires operator approval before spawning sub-agent.

## Container Labels

All cubicles are tagged with Docker labels for tracking:

```yaml
hermitshell.agent_id: "1"
hermitshell.user_id: "123456789"
hermitshell.last_active: "2026-02-20T12:00:00Z"
hermitshell.status: "active"
hermitshell.created_at: "2026-02-20T10:00:00Z"
```

## Agent Images

| Image | Tools | Use Case |
|-------|-------|----------|
| `hermitshell/base:latest` | curl, jq, sed, awk, bash | General tasks |
| `hermitshell/python:latest` | python3, pandas, numpy | Data analysis |
| `hermitshell/netsec:latest` | nmap, dig, openssl | Security research |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `SESSION_SECRET` | Session cookie secret | `hermitshell-secret-change-in-production` |
| `WEBHOOK_SECRET` | Telegram webhook secret | `hermitshell-webhook-secret` |
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
| `/api/files/:agentId/:userId` | GET | List workspace files |
| `/api/files/:agentId/:userId/download/*` | GET | Download a file |
| `/preview/:agentId/:port/*` | GET | Proxy to agent's web app |
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
- **Preview Proxy Isolation**: Web previews only access container internal IP
- **File Path Validation**: File downloads restricted to workspace directory

## Troubleshooting

### Initial page shows a locked login page instead of setup
**Issue:** After cleaning and reinstalling the app, the initial page shows a locked login page instead of user credentials setup. How can I log in if I don't have credentials setup yet?

**Reason:** This issue occurs because the HermitShell server detects that an entry already exists in the `admins` table of your database. Even after a "clean reinstall," the persistent data stored in the `data/` directory often survives unless explicitly deleted.

**Solution:** To fix this and trigger the **Initialization Screen** (Setup), follow these steps:

#### 1. Wipe the existing database
The database file is stored in `data/db/`. You need to delete this file to force the system to return to "Setup Mode."

Run this command from the root of the `hermitshell` folder:
```bash
rm -rf data/db/*.db
```
*(Note: The database file is named `hermitshell.db`. Deleting everything in that folder ensures it is gone.)*

#### 2. Restart the Shell server
Once the database file is deleted, you must restart the Node.js process so it can re-initialize the schema and detect that there are zero admins.

```bash
cd shell
npm start
```

#### 3. Refresh the Dashboard
Open your browser to: `http://localhost:3000/dashboard/`

You should now see the **"INITIALIZE SYSTEM"** screen with the **"First Time Setup"** notice, allowing you to create your admin username, password, and Operator ID.

---

**Why did this happen?**
In your `shell/src/server.ts` file, the logic that decides which screen to show is:
```typescript
const adminCount = await getAdminCount();
if (adminCount === 0) {
    return { status: 'setup_required' }; // Shows the Registration page
}
```
If you didn't delete the `data/` folder during your "clean reinstall," the old `hermitshell.db` file was still there. Since that file contained your old admin account, the system skipped setup and went straight to the login (Locked) screen.

**Troubleshooting persistence (Docker)**
If you are running HermitShell via **Docker Compose**, the data is likely trapped in a Docker Volume. To truly wipe it, run:
```bash
docker-compose down -v
```
The `-v` flag deletes the volumes associated with the containers, ensuring the database is actually destroyed.


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
rm -rf data/db/hermitshell.db
```

### Find your Telegram User ID
Send `/start` to @userinfobot on Telegram

### Bot not responding to messages
1. Check server logs for tunnel URL (should show `✅ Tunnel active: https://...`)
2. If no tunnel, verify cloudflared is installed: `cloudflared --version`
3. Click **"Sync Bots"** button in the dashboard header
4. Verify the webhook was registered (check server logs for `[Tunnel] Synced X webhooks`)

### 401 Unauthorized error
1. Go to **Settings → API Keys**
2. Enter your API key for the selected provider
3. Click **"Save All Settings"**
4. Send `/reset` to your bot or delete the container from Cubicles tab
5. Try again

### Container not waking up
```bash
docker ps -a --filter "label=hermitshell.agent_id"
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
