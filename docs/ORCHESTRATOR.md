# The Orchestrator Shell

The **HermitShell Orchestrator** is a **Node.js (TypeScript)** application that manages agent lifecycles, provides a dashboard interface, and bridges communication between humans and containers.

## 🚀 Key Modules (`shell/src/`)

### 1. The Server (`server.ts`)
The main entry point built using **Fastify**.
- **Static Dashboard**: Serves the React-based frontend on `/dashboard/`.
- **API Routes**:
  - `/api/auth`: User session management and login.
  - `/api/agents`: CRUD operations for AI agents.
  - `/api/settings`: Global system configuration (API keys, public URL).
  - `/api/internal/llm`: **Critical Secure Proxy** for air-gapped container LLM calls.
  - `/api/asset-requests`: Handle asset procurement requests.
  - `/api/sites`: Manage web apps and tunnel sharing.
  - `/webhook/`: Receives incoming Telegram updates.
- **Middleware/Hooks**:
  - `preHandler`: Handles JWT-based authorization and internal bypasses.

### 2. Docker Management (`docker.ts`)
Responsible for every aspect of the agent's containerized existence.
- `spawnAgent()`: The high-level function that starts a container, passes environment variables (Agent Name, Max Tokens), and executes the `agent.py` script inside.
- `createNewCubicle()`: Handles the creation of the **Standardized Portal** folders (`/work`, `/in`, `/out`, `/www`) on the host filesystem for each agent/user pair.
- `stopCubicle()` / `removeCubicle()`: Lifecycle cleanup.

### 3. Database Layer (`db.ts`)
A lightweight **libSQL (SQLite compatibility)** implementation using `@libsql/client`.
- **Tables**: Agents, Budgets, Allowlist, Settings, Audit Logs, Calendar Events, Asset Requests, Site Screenshots, Site Tunnels, Agent Memory, Runtime Logs.
- **Initialization**: `initDb()` creates all tables and migrates schemas automatically.

### 4. Telegram Bridge (`telegram.ts`)
- `handleTelegramUpdate()`: Routes message, documents, and callback queries to the appropriate agent.
- `startFileWatcher()`: Uses **Chokidar** to monitor each agent's `/out/` directory.
- `processAgentMessage()`: Parses deterministic JSON output (`message`, `action`, `terminal`, `panelActions`) and sends explicit `FILE:<name>` actions from `/out/`.
- `sendApprovalRequest()`: Sends interactive buttons ("Approve" / "Deny") to the operator for HITL (Human-in-the-Loop) verification.
- `startCalendarScheduler()`: CRON-based scheduler that triggers calendar events at specified times.

### 5. Tunnel & Webhooks (`tunnel.ts`)
- Manages **Cloudflare Tunnels** (via the `cloudflared` process) to provide a secure public URL without manual port forwarding.
- Syncs Telegram webhooks automatically when the tunnel URL changes.
- Provides temporary tunnel URLs for site sharing (30-minute expiry).

### 6. Apps Management (`sites.ts`)
- Discovers web apps in workspace `www/` folders.
- Each subfolder in `www/` is treated as a separate web app (must have `index.html`).
- Validates web apps for `index.html` and CSS files.
- Supports per-app deletion and app metadata for dashboard cards.

## 🌉 Internal LLM Proxy

Containerized agents **cannot** reach the public internet. Instead, they call:
`POST http://172.17.0.1:3000/api/internal/llm`

The Orchestrator:
1.  Receives the request.
2.  Bypasses normal auth check for this internal route.
3.  Retrieves the provider-specific API key (OpenAI/Anthropic/etc.) from the `settings` table.
4.  Constructs the request and forwards it to the actual LLM provider.
5.  Returns the raw JSON response back to the container.

This ensures **API keys never leave the host** and agents cannot be used as proxies for arbitrary internet traffic.

## 🔧 Additional Features

### Asset Procurement
- Agents request files from the internet via `ASSET_REQUEST` panel action
- Users approve/decline requests via dashboard or Telegram
- Approved assets are downloaded to `/workspace/in/`

### Calendar Events
- CRON-based scheduling system
- Events stored in database with status tracking
- Automatically triggers agent at specified times

### Site Tunnel Sharing
- Temporary tunnel links (30 min expiry)
- Share via Telegram or dashboard
- Automatic deactivation after expiry
