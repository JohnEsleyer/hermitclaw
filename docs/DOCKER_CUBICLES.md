# Docker Cubicles & Isolation

The **HermitShell Docker Cubicles** provide the core security and functional isolation for each AI agent. This specialized environment ensures that agents can only interact with the outside world through the **HermitShell Orchestrator**.

## 🥅 Isolation Model

Each agent is spun up in a **Debian-based Docker container** with the following restrictions:
- **Network Isolation**: Direct outgoing internet connections are disabled. Agents must use the Orchestrator as a proxy for LLM calls.
- **Volume Mounting**: A persistent workspace is mounted for each agent (`/app/workspace/`). This folder is physically located on the host machine but logically presented to the agent.
- **Runtime Persistence**: Containers can be set to persistent mode, allowing them to maintain state across multiple interactions.

## 🏗️ The Portal (Standardized Directory Structure)

The workspace is divided into four main directories, each serving a specific role in the agent's interaction with the user:

### 1. `/app/workspace/in/` (Incoming Portal)
- Files uploaded by the user (via Telegram or Dashboard) appear here.
- The agent can read these files to process data, summarize documents, or analyze code.

### 2. `/app/workspace/out/` (Outgoing Portal)
- This directory is monitored in real-time by the **Orchestrator's File Watcher**.
- When the agent places a file here (e.g., `report.pdf`, `data.csv`), the Orchestrator automatically detects it and sends it to the user.

### 3. `/app/workspace/www/` (Web Preview Portal)
- Any file placed here is automatically served by the Orchestrator's static preview server.
- This allows agents to build and "host" simple web applications, dashboards, or static sites that the user can view via a public URL.

### 4. `/app/workspace/work/` (Scratchpad)
- This is the agent's primary working directory.
- It contains intermediate processing files, scripts, and the `.hermit.log` audit file.

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
