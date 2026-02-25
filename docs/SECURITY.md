# Security & Human-in-the-Loop (HITL)

**HermitShell** is architected to run untrusted AI agents. Its security model assumes that the agent **might** attempt malicious bash commands and uses three layers of defense.

## 🛡️ Layer 1: Container Isolation

As discussed in [Docker Cubicles](./DOCKER_CUBICLES.md), agents are strictly isolated.
- **No Direct Internet**: Prevents data exfiltration and external C2 communication.
- **Resource Limits**: Configurable (RAM, CPU) to prevent DoS (Denial of Service).
- **Read-Only Host**: The host filesystem is only accessible through the mounted `/app/workspace/` volume.

## 🛂 Layer 2: Human-in-the-Loop (HITL)

The most distinctive security feature is the **Human-in-the-Loop (HITL)** system.

### 🚩 Detection
The Python agent uses `is_dangerous()` to scan every command for keywords:
- `rm`, `sudo`, `su`, `shutdown`, `reboot`, `nmap`, `kill`, `docker`, `spawn_agent`.

### ⏸️ Interception
If a dangerous command is detected:
1.  **Agent Pauses**: The Python agent script enters a sleep-wait loop.
2.  **Notification**: The Orchestrator sends an **interactive Telegram message** to the operator.
3.  **Audit**: The command is logged in the `audit_logs` table with status `pending`.

### 🔘 Decision
The operator has two buttons:
- **✅ Approve**: The Orchestrator writes `/tmp/hermit_approval.lock` inside the container. The agent detects it and executes.
- **❌ Deny**: The Orchestrator writes `/tmp/hermit_deny.lock`. The agent skips the command and notifies the LLM.

## 🔐 Layer 3: Authentication & API Security

### 1. Dashboard Access
- Protected by **JWT (JSON Web Token)** authentication.
- Users must login via the dashboard with an admin username/password.
- Session tokens are stored in the user's browser as a cookie.

### 2. Internal Proxy Security
- The proxy endpoint `/api/internal/llm` is **only** accessible from the host (`127.0.0.1`) and the Docker bridge network (`172.17.0.1`).
- Outside dashboard requests to this endpoint are rejected.

### 3. Telegram Allowlist
- Bots are "locked" by default.
- Only users whose **Telegram ID** is in the `allowlist` table can interact with the agent.
- New users are given a setup instruction to contact their administrator for inclusion.

### 4. Admin Chat ID
- The `admin_chat_id` and `operator_telegram_id` settings ensure that HITL requests only go to authorized administrators, even if the bot is in a group or public settings.
