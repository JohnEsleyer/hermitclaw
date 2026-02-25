# Contributing to HermitShell

We welcome contributions to HermitShell! Whether you are fixing bugs, improving documentation, or adding new features, your help is appreciated.

## 🛠️ Development Setup

1. **Follow the [Deployment Guide](./DEPLOYMENT.md)** to get a local instance running.
2. **Key Repositories**:
   - `shell/`: Node.js/TypeScript Orchestrator.
   - `crab/`: Python-based Agent.
   - `dashboard/`: React-based Web UI.

## 🧪 Testing

We use **Vitest** for backend testing. Always ensure tests pass before submitting changes.

```bash
cd shell
npm test
```

## 📝 Code Style

- **TypeScript**: Use functional patterns where possible, maintain strict typing, and document exported functions.
- **Python**: Follow PEP 8 guidelines. Ensure the agent remains compatible with a standard Debian environment.

## 🚀 Pull Request Process

1. Create a new branch for your feature or fix.
2. Include unit tests if applicable.
3. Update the documentation in the `docs/` folder if you change system behavior.
4. Open a Pull Request with a clear description of your changes.

## ⚖️ License

HermitShell is released under the MIT License.
