# Deployment Guide

Follow these steps to deploy **HermitShell** to your Linux VPS or server.

## 📋 Prerequisites

- **Linux OS** (Ubuntu 22.04+ recommended).
- **Docker** and **Docker Compose** installed.
- **Node.js 18+** and **npm**.
- **Python 3.10+**.
- **Cloudflare Account** (for automatic public tunnels).
- **Telegram Bot Token** (obtain from [@BotFather](https://t.me/BotFather)).

## 🚀 Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/JohnEsleyer/hermitclaw.git
cd hermitclaw
```

### 2. Install Dependencies
Run the main installation script to set up both the shell and the agent environments:
```bash
./install.sh
```

### 3. Initialize the Database
Build the orchestrator and initialize the libSQL database:
```bash
cd shell
npm install
npm run build
npm run dev # This will create the initial db/schema
```

### 4. Configure Settings
Access the **Dashboard** (usually `http://localhost:3000/dashboard/`) and enter:
- **Default LLM Provider**: (e.g., OpenRouter, OpenAI).
- **API Keys**: Enter your respective provider keys.
- **Public URL**: Leave blank if using the automatic Cloudflare tunnel, or enter your domain.

### 5. Start the Orchestrator
To keep the server running in the background, use a process manager like **PM2**:
```bash
npm install -g pm2
pm2 start dist/server.js --name "hermitshell"
```

## 🔐 Final Checklist

1.  **Grant Telegram Access**: Send `/start` to your bot. It will give you your **Telegram ID**.
2.  **Add to Allowlist**: Go to Dashboard -> Allowlist and add your ID.
3.  **Deploy First Agent**: Go to Dashboard -> Agents -> Create Agent. Add your bot token and save.
4.  **Sync Webhooks**: Click "Sync Webhooks" in the agent settings or restart the server.

You can now start chatting with your autonomous agent on Telegram!
