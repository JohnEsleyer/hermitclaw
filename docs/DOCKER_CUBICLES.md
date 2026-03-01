# Docker Cubicles & Isolation

The **HermitShell Docker Cubicles** provide the core security and functional isolation for each AI agent. This specialized environment ensures that agents can only interact with the outside world through the **HermitShell Orchestrator**.

## 🥅 Isolation Model

Each agent is spun up in a **Debian-based Docker container** with the following restrictions:
- **Network Isolation**: Direct outgoing internet connections are disabled. Agents must use the Orchestrator as a proxy for LLM calls.
- **Volume Mounting**: A persistent workspace is mounted for each agent (`/app/workspace/`). This folder is physically located on the host machine but logically presented to the agent.
- **Runtime Persistence**: Containers can be set to persistent mode, allowing them to maintain state across multiple interactions.

## 🏗️ The Portal (Standardized Directory Structure)

The workspace is organized into specialized folders:

### 1. 📂 `/app/workspace/work/` (Sandbox)
- The agent's primary working directory
- Use this for all tasks and intermediate files
- Always `cd` here before starting work
- Contains the `.hermit.log` audit file

### 2. 📥 `/app/workspace/in/` (Incoming Portal)
- Files uploaded by the user (via Telegram or Dashboard) appear here
- Check this folder when user mentions uploading a file
- Agent can read these files to process data, summarize documents, or analyze code

### 3. 📤 `/app/workspace/out/` (Outgoing Portal)
- Monitored in real-time by the Orchestrator's file pipeline
- Files can be delivered to Telegram through explicit agent JSON action `FILE:<filename>`
- Works for PDFs, CSV, images, videos, or any file type

### 4. 🌐 `/app/workspace/www/` (Apps Portal)
- Contains web applications created by the agent
- **Each subfolder is a separate web app** (e.g., `/app/workspace/www/myapp/`)
- **Each web app MUST have an `index.html` file**
- Use vanilla HTML, CSS, JavaScript only (no frameworks like React/Vue)
- Start a web server on port 8080 for the user to preview

### 5. 📊 Workspace Data Directory (`/app/workspace/data/`)
Workspace-local databases are stored here:

| Database | Purpose |
|----------|---------|
| `calendar.db` | Stores scheduled calendar events (future prompts). When the time arrives, the system triggers your prompt automatically. |
| `rag.db` | Persistent RAG memory for facts and knowledge. Survives container restarts. |
| `*.db` | Future libSQL databases for additional capabilities. |

## 📜 Lifecycle of a Cubicle

1.  **Creation**: The Orchestrator calls `spawnAgent()`, creating the host-side directories first (`/data/workspaces/{agentId}_{userId}/`).
2.  **Startup**: A Docker container is created from the `hermit/base:latest` image. Environment variables (Agent Name, Role, User Message, etc.) are injected.
3.  **Execution**: The container's entrypoint script starts the Python agent (`agent.py`).
4.  **Monitoring**: The Orchestrator monitors the container's status and resource usage.
5.  **Termination/Persistence**: Depending on the configuration, the container is either removed after the task completes or left running for future interactions.

## 🛡️ Role of `hermit/base` Image

The base image is a lightweight Debian installation pre-configured with:
- **Python 3**: For running the agent logic.
- **Node.js**: For running JavaScript-based tools or servers.
- **Common Utilities**: `curl`, `jq`, `gcc`, `make`, `git`, and other standard Linux CLI tools.
- **Security hardening**: Restricted user privileges and minimized attack surface.
