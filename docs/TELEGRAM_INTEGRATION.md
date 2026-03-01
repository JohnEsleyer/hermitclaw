# Telegram Integration & The Portal

**HermitShell's Telegram Integration** provides a seamless interface for users to communicate with their agents, manage files, and interact with hosted websites—all from within their Telegram app.

## 📡 Webhook Management

The Orchestrator automatically handles **Telegram Webhook Registration**:
1.  **Cloudflare Tunnel Startup**: During launch, the Orchestrator starts a `cloudflared` tunnel to get a public URL (e.g., `https://random-subdomain.trycloudflare.com`).
2.  **Webhook Sync**: The Orchestrator automatically calls the `setWebhook` API for each configured agent using this public URL.
3.  **Incoming Updates**: When a user messages a bot, Telegram sends a POST request back to the Orchestrator's `/webhook/{token}` endpoint.

## 📁 The Portal (File Handlers)

The **Portal** refers to the automated file transfer mechanism that handles **uploading** and **downloading** files between a user's Telegram chat and the agent's Docker Cubicle workspace.

### 1. Inbound (User to Agent)
Any file dropped into a Telegram chat with the bot (e.g., a `.csv`, `.py`, or `.txt` file) is:
- Downloaded by the Orchestrator's `handleFileUpload()` in `telegram.ts`.
- Saved into the agent's workspace at `/app/workspace/in/`.
- The user's optional caption is passed as the `USER_MSG` to the agent.

### 2. Outbound (Agent to User)
When an agent creates a file it wants the user to see:
- It writes the file to `/app/workspace/out/`.
- It emits deterministic JSON output with `"action": "FILE:<filename>"`.
- The Orchestrator's **Chokidar-based File Watcher** detects the add/write event.
- It triggers `sendFileViaTelegram()`, which uploads the file back to the original Telegram chat as a document.

## 🌍 Web Portal (Hosted Websites)

If an agent hosts a simple website (e.g., by running `python -m http.server`), the user can access it directly:

- The agent places HTML/CSS/JS files in `/app/workspace/www/[app_name]/`
- **Each subfolder is a separate web app** with its own `index.html`
- Use vanilla HTML/CSS/JS only (no frameworks)
- The Orchestrator serves these files under a unique URL like:
  `{public_url}/preview/{agentId}_{userId}/`
- This allows for rich, interactive UIs to be built and "deployed" instantly by an agent.

## ⌨️ Bot Commands & Interactivity

The Telegram bot is more than just text-based. It includes:
- **Custom Keyboard**: Quick access to `/status`, `/workspace`, `/budget`, `/reset`, and `/help`.
- **Inline Buttons**:
  - **HITL Approvals**: Direct buttons to "Approve" or "Deny" dangerous commands.
  - **Web Previews**: Buttons that appear when the agent is hosting a preview site.
- **Admin Commands**:
  - `/containers`: For the owner/operator to see all active agent cubicles.
  - `/agents`: List all configured agents and their status.
  - `/logs`: Retrieve the last 30 lines of the agent's internal `.hermit.log`.
- **Reset/Clear**:
  - `/reset`: This stops and removes the current Docker container and spawns a fresh one.
  - `/clear`: Deletes the conversation history but keeps the existing container.
