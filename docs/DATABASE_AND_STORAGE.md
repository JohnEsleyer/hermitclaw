# Database & Storage

HermitShell uses **libSQL** (a SQLite-compatible database) for structured data and the host filesystem for agent workspaces.

## 🗄️ Database Schema (`hermitshell.db`)

The database is managed in `shell/src/db.ts`. Key tables include:

### 1. `agents`
Stores the configuration for each AI persona.
- `id`: Primary Key.
- `name`: Display name.
- `role`: System role (e.g., "DevOps Expert").
- `telegram_token`: Unique bot token.
- `docker_image`: The base image (default: `hermit/base`).
- `require_approval`: Boolean for HITL mode.
- `llm_provider` / `llm_model`: Provider-specific overrides.

### 2. `budgets`
Tracks daily spending limits to prevent runaway LLM costs.
- `daily_limit_usd`: Max spend per 24h.
- `current_spend_usd`: Accumulated cost since last reset.
- `last_reset_date`: Used to auto-reset at midnight.

### 3. `audit_logs`
A permanent record of every command executed by every agent.
- `command`: The raw shell command.
- `output_snippet`: Truncated output (first 500 chars).
- `status`: `pending`, `approved`, or `denied`.
- `approved_by`: Telegram ID of the admin who authorized it.

### 4. `agent_memory` (RAG)
Used for long-term "context" beyond the immediate chat history.
- `content`: The text snippet.
- `embedding`: JSON-serialized vector (for future semantic search).

### 5. `allowlist`
Manages access control for the Telegram bots.
- `user_id`: Telegram User ID.
- `is_operator`: Boolean for administrative privileges.

## 📂 Filesystem Storage (`data/`)

Persistent data that doesn't fit in the DB is stored in the `data/` directory:

- `data/db/`: The SQLite/libSQL database file.
- `data/workspaces/`: **Crucial Area.**
  - Folders are named `{agentId}_{userId}/`.
  - Content includes the `out/`, `in/`, `www/`, and `work/` portals.
- `data/history/`: JSON files containing the rolling conversation history for each agent/user pair.
- `data/certs/`: (Optional) SSL certificates if not using the Cloudflare tunnel.

## 🧠 Memory Management

- **Short-term Memory**: The last ~10-20 messages are loaded from `data/history/` and passed to the LLM with every request.
- **Long-term Memory**: Managed via the `agent_memory` table. The Orchestrator can inject relevant snippets into the system prompt based on the user's query.
