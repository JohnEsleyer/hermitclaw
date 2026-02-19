#!/bin/bash
set -e

echo "🐚 HermitClaw Installation"
echo "=========================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is required but not installed."
        return 1
    fi
    return 0
}

echo "🔍 Checking prerequisites..."
MISSING=""
check_command docker || MISSING="$MISSING docker"
check_command node || MISSING="$MISSING node"  
check_command npm || MISSING="$MISSING npm"

if [ -n "$MISSING" ]; then
    echo "Missing:$MISSING"
    echo "Please install Docker, Node.js and npm first."
    exit 1
fi

echo "📁 Setting up directories..."
mkdir -p data/db data/history config/images
mkdir -p shell/uploads

echo "📝 Creating environment file..."
if [ ! -f shell/.env ]; then
    cp shell/.env.example shell/.env
    echo "✅ Created shell/.env - please add your API keys"
fi

echo "🔐 Setting up SQLite database..."
sqlite3 data/db/hermit.db << 'EOF'
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    telegram_token TEXT UNIQUE,
    system_prompt TEXT,
    docker_image TEXT DEFAULT 'hermit/base',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
    agent_id INTEGER PRIMARY KEY,
    daily_limit_usd REAL DEFAULT 1.00,
    current_spend_usd REAL DEFAULT 0.00,
    last_reset_date TEXT DEFAULT (date('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS allowlist (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    initiator_agent_id INTEGER,
    participant_agent_id INTEGER,
    topic TEXT,
    transcript TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('default_provider', 'openrouter');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_model', 'anthropic/claude-3-haiku');
EOF
echo "✅ Database initialized"

echo "🦀 Building Docker images (this may take a few minutes)..."

DOCKER="docker"
if ! docker ps &>/dev/null; then
    DOCKER="sudo docker"
fi

echo "  → Building hermit-crab (AI Agent)..."
$DOCKER build -t hermit-crab:latest crab/

echo "  → Building hermit/base..."
$DOCKER build -t hermit/base:latest -f - . << 'EOF'
FROM hermit-crab:latest AS crab-source
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl jq sed gawk bash coreutils iputils-ping dnsutils ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=crab-source /usr/local/bin/crab /usr/local/bin/crab
WORKDIR /workspace
CMD ["crab"]
EOF

echo "  → Building hermit/python..."
$DOCKER build -t hermit/python:latest -f - . << 'EOF'
FROM hermit-crab:latest AS crab-source
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl jq ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir requests pandas numpy
COPY --from=crab-source /usr/local/bin/crab /usr/local/bin/crab
WORKDIR /workspace
CMD ["crab"]
EOF

echo "  → Building hermit/netsec..."
$DOCKER build -t hermit/netsec:latest -f - . << 'EOF'
FROM hermit-crab:latest AS crab-source
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl jq nmap iputils-ping dnsutils net-tools openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=crab-source /usr/local/bin/crab /usr/local/bin/crab
WORKDIR /workspace
CMD ["crab"]
EOF

echo "📦 Installing Node.js dependencies..."
cd shell
npm install --legacy-peer-deps 2>/dev/null || npm install

npm install @fastify/cookie@^10.0.0 @fastify/static@^8.0.0 --legacy-peer-deps 2>/dev/null || true

npm run build
cd ..

echo "📦 Building Dashboard..."
mkdir -p shell/dashboard/dist
cp -r dashboard/src/public/* shell/dashboard/dist/ 2>/dev/null || true

echo ""
echo "✅ INSTALLATION COMPLETE!"
echo "=========================="
echo ""
echo "🌍 To start HermitClaw:"
echo "   cd shell && npm start"
echo ""
echo "   Then open: http://localhost:3000/dashboard/"
echo ""
echo "⚠️  Before using, edit shell/.env and add:"
echo "   - OPENROUTER_API_KEY (or OPENAI_API_KEY)"
echo "   - TELEGRAM_BOT_TOKEN"
echo ""
