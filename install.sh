#!/bin/bash
set -e

echo "🦀 CrabShell Installation"
echo "========================="

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

echo "☁️ Installing Cloudflare Tunnel CLI..."
if command -v cloudflared &> /dev/null; then
    echo "  ✓ cloudflared already installed"
else
    ARCH=$(uname -m)
    case $ARCH in
        x86_64|amd64)
            CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
            ;;
        aarch64|arm64)
            CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
            ;;
        *)
            echo "  ⚠ Unsupported architecture: $ARCH, skipping cloudflared"
            CLOUDFLARED_URL=""
            ;;
    esac
    
    if [ -n "$CLOUDFLARED_URL" ]; then
        echo "  → Downloading cloudflared for $ARCH..."
        curl -L --output /tmp/cloudflared "$CLOUDFLARED_URL" 2>/dev/null
        chmod +x /tmp/cloudflared
        if [ -w /usr/local/bin ]; then
            mv /tmp/cloudflared /usr/local/bin/cloudflared
        else
            sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
        fi
        echo "  ✓ cloudflared installed"
    fi
fi

echo "📝 Creating environment file..."
if [ ! -f shell/.env ]; then
    cp shell/.env.example shell/.env
    echo "✅ Created shell/.env - please add your API keys"
fi

echo "🔐 Database will be initialized on first run..."

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

npm install @fastify/cookie@8.3.0 @fastify/static@6.12.0 --legacy-peer-deps 2>/dev/null || true

npm run build
cd ..

echo "📦 Building Dashboard..."
mkdir -p shell/dashboard/dist
cp -r dashboard/src/public/* shell/dashboard/dist/ 2>/dev/null || true

echo ""
echo "✅ INSTALLATION COMPLETE!"
echo "========================="
echo ""
echo "🌍 To start CrabShell:"
echo "   cd shell && npm start"
echo ""
echo "   Then open: http://localhost:3000/dashboard/"
echo ""
echo "⚠️  Before using, edit shell/.env and add:"
echo "   - OPENROUTER_API_KEY (or OPENAI_API_KEY)"
echo "   - TELEGRAM_BOT_TOKEN"
echo ""
