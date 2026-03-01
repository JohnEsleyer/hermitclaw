# HermitShell Documentation - Table of Contents

Welcome to the official documentation for **HermitShell**, the autonomous AI agent orchestrator. This guide will walk you through the system architecture, its core components, and how the various parts interact to create a secure, air-gapped environment for AI agents.

## 📖 Core Documentation

1.  **[System Architecture](./ARCHITECTURE.md)**
    *   High-level overview of the Orchestrator, Docker Cubicles, and Communication Proxy.
2.  **[The Orchestrator Shell](./ORCHESTRATOR.md)**
    *   Details on the Node.js Fastify server, API endpoints, and the internal proxy.
3.  **[Docker Cubicles & Isolation](./DOCKER_CUBICLES.md)**
    *   How containers are managed, workspace isolation (`/out`, `/in`, `/www`), and lifecycle hooks.
4.  **[The Python Agent (Crab)](./PYTHON_AGENT.md)**
    *   The core logic running inside the cubicle: command execution, LLM calls via proxy, and safety guards.
5.  **[Telegram Integration & The Portal](./TELEGRAM_INTEGRATION.md)**
    *   Handling Telegram webhooks, file uploads/downloads, and real-time interaction logs.
6.  **[Database & Storage](./DATABASE_AND_STORAGE.md)**
    *   libSQL schema overview, RAG memory implementation, and audit trail persistence.
7.  **[Security & HITL](./SECURITY.md)**
    *   Authentication, session management, and the Human-in-the-Loop approval system.

## 🚀 Operations

*   **[Deployment Guide](./DEPLOYMENT.md)**
    *   Setting up the orchestrator, configuring Cloudflare Tunnels, and initializing agents.
*   **[Contributing](./CONTRIBUTING.md)**
    *   Code style, testing procedures (Vitest), and adding new features.

## 📝 Notes

- The dashboard terminology uses **Apps** (formerly "Sites").
- Agent/controller interaction uses a deterministic JSON contract with `userId`, `message`, `action`, `terminal`, and optional `panelActions`.
