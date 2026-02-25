# HermitShell Architecture Overview

**HermitShell** is a secure, autonomous AI agent orchestrator designed to run untrusted agent code in a strictly isolated environment while maintaining a seamless user experience via Telegram and a Web Dashboard.

## 🏛️ System Layers

The system is divided into three distinct layers:

### 1. The Orchestrator (Host Shell)
Developed in **Node.js (TypeScript)** using **Fastify**. This is the brain of the operation.
- **API Server**: Serves the dashboard, manages agents, handles auth.
- **Docker Manager**: Spins up, stops, and communicates with containerized agents (Cubicles).
- **Internal Proxy**: A secure bridge for the air-gapped agents to call LLM APIs without having direct internet access.
- **Telegram Bot**: Bridges user messages and files directly to the agent's workspace.

### 2. The Cubicle (Docker Isolation)
A dedicated **Debian-based container** for each agent.
- **Air-Gapped**: Standard networking is disabled or heavily restricted (proxied through host).
- **Native Execution**: Agents run command-line tools natively inside their own environment.
- **The Portal**: A standardized directory structure shared between the host and container.
  - `/app/workspace/out/`: Outgoing files (sent to user).
  - `/app/workspace/in/`: Incoming files (uploaded by user).
  - `/app/workspace/www/`: Static assets served via a public preview preview URL.
  - `/app/workspace/work/`: Internal scratchpad and logs.

### 3. The Agent (Crab)
A **Python-based daemon** (formerly Rust `crab`) that lives inside the container.
- **LLM-Driven Execution**: Receives messages, calls the orchestrator proxy, extracts commands, and executes them.
- **HITL Verification**: Pauses execution and asks for approval via Telegram for dangerous commands (e.g., `rm`, `kill`).
- **Audit Logging**: Streams all stdout/stderr to a `.hermit.log` file monitored by the orchestrator.

## 🔄 Interaction Flow

1.  **User sends message** (Telegram/Web).
2.  **Orchestrator** identifies the agent and checks its budget/permission.
3.  **Orchestrator** starts the **Docker Cubicle** if it's inactive.
4.  **Agent (Python)** receives the message and decides on an ACTION (e.g., EXECUTE).
5.  **Agent** sends an LLM request to the orchestrator's **Internal Proxy**.
6.  **Orchestrator** retrieves the configured API key and proxies the request to the provider (OpenRouter/Anthropic/OpenAI).
7.  **Agent** executes the returned command and waits for output.
8.  **Orchestrator** detects any new files in the `/out` directory and delivers them to the user.
9.  **Agent** returns a final response to the user via the orchestrator.
