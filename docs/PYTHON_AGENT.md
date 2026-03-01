# The Python Agent (Crab)

The **HermitShell Agent**, also known as **Crab**, is the core logic running inside the Docker Cubicle. It's a Python-based daemon (`crab/agent.py`) that acts as the bridge between the LLM and the local Linux environment.

## 🤖 Core Functionality

The Python agent is the brain of the container. It's responsible for:
- **Prompt Engineering**: Building the system prompt and context for the LLM.
- **LLM Communication**: Sending requests to the Orchestrator's internal proxy.
- **Action Extraction**: Parsing the LLM's response to identify and execute actions.
- **Safety Checks**: Validating commands to prevent dangerous or unintended operations.
- **Execution**: Running bash commands natively and capturing their output.
- **State Management**: Handling conversation history and memory.
- **Status Tracking**: Reporting idle/active status to the orchestrator.

## ⚙️ How it Works

The agent follows a standard Loop:
1.  **Receive Message**: Accepts a user message and conversation history.
2.  **Call LLM**: Sends the prompt and history to the Orchestrator's internal LLM proxy (`/api/internal/llm`).
3.  **Process Actions**:
    - **No Action**: Returns the LLM's text response to the user.
    - **EXECUTE Action**:
        - Extracts the bash command.
        - Checks for dangerous keywords (`rm`, `sudo`, `docker`).
        - If dangerous, enters **HITL (Human-in-the-Loop)** mode and waits for user approval.
        - Executes the command natively in the shell.
        - Captures the command's stdout and stderr.
        - Appends the output to the conversation history.
4.  **Repeat**: Sends the command output back to the LLM and repeats until the task is complete or a maximum iteration limit is reached.

## 🛠️ Key Components in `agent.py`

- `build_system_prompt()`: Dynamically creates the system instruction based on the agent's name, role, and personality. Includes instructions for:
  - Workspace directory structure (work/, in/, out/, www/)
  - Calendar events for scheduling future tasks (stored in calendar.db)
  - RAG memory for persistent facts (stored in rag.db)
  - Asset procurement for requesting files from the internet
  - Telegram message optimization (concise outputs)
  - Web app creation (vanilla HTML/CSS/JS, index.html required)
  - ClawMotion for video creation
- `call_llm()`: Uses Python's `urllib.request` to securely call the Orchestrator proxy. Since the container is air-gapped, this is the **only** way the agent can communicate with the outside world.
- `extract_command()`: Prioritizes JSON `terminal` command; legacy `ACTION: EXECUTE` remains as fallback compatibility.
- `extract_panel_actions()`: Parses JSON output for control panel actions.
- `is_dangerous()`: A list of restricted commands that trigger a Human-in-the-Loop check.
- `wait_for_approval()`: Creates and monitors lock files (`/tmp/hermit_approval.lock`) that the Orchestrator writes when a user clicks an "Approve" button in Telegram or the Dashboard.

## 📂 File Delivery via the Agent

The agent is instructed to use the `/app/workspace/out/` directory for file delivery:
- Simply save any file (PDF, CSV, image, video) to `/app/workspace/out/`
- The Orchestrator's **File Watcher** detects new files and delivers to Telegram automatically

Workspace structure:
- `/app/workspace/work/`: Primary working directory (always cd here first)
- `/app/workspace/in/`: Files uploaded by user via Telegram
- `/app/workspace/out/`: Files auto-delivered to user via Telegram
- `/app/workspace/www/`: Web apps (each subfolder = separate app with index.html)

## 📝 Panel Actions

Agents are expected to return deterministic JSON:

```json
{
  "userId": "123456789",
  "message": "Task completed",
  "action": "FILE:report.pdf",
  "terminal": "",
  "panelActions": ["CALENDAR_CREATE:Title|Prompt|2026-02-28T09:00:00Z|"]
}
```

### Available Actions:
- **Calendar**: `CALENDAR_CREATE`, `CALENDAR_UPDATE`, `CALENDAR_DELETE`, `CALENDAR_LIST`
- **Assets**: `ASSET_REQUEST:description|url|file_type`
- **ClawMotion**: `CLAWMOTION:prompt|duration|output_file`

## 🌐 Web App Creation

Agents create web apps in `/app/workspace/www/[app_name]/`:
- **Each subfolder is a separate web app**
- **Required**: Each web app MUST have an `index.html` file
- Use **vanilla** HTML, CSS, and JavaScript only (no frameworks like React/Vue)
- Images go in `assets/` subfolder
- Start server on port 8080 for user preview

## 📝 Logging & Auditing

All command executions and agent thoughts are streamed to the `.hermit.log` file in the agent's workspace. This file is used by the Orchestrator to provide real-time logs in the dashboard and to maintain a permanent audit trail of every action the agent took.
