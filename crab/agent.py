#!/usr/bin/env python3
import os
import json
import base64
import urllib.request
import urllib.error
import subprocess
import time
import sys

WORKSPACE_DIR = "/app/workspace"
OUT_DIR = os.path.join(WORKSPACE_DIR, "out")
IN_DIR = os.path.join(WORKSPACE_DIR, "in")
WORK_DIR = os.path.join(WORKSPACE_DIR, "work")
WWW_DIR = os.path.join(WORKSPACE_DIR, "www")

for d in [OUT_DIR, IN_DIR, WORK_DIR, WWW_DIR]:
    os.makedirs(d, exist_ok=True)

# Important to work in WORK_DIR so out/ isn't polluted by accident
os.chdir(WORK_DIR)

def build_system_prompt():
    name = os.environ.get("AGENT_NAME", "Agent")
    role = os.environ.get("AGENT_ROLE", "Assistant")
    return f"""You are {name}, an autonomous AI agent trapped in a secure Linux 'Cubicle' (Docker container).
Your Role: {role}
Your Environment:
- OS: Debian/Linux (Docker)
- Network: Air-gapped (You cannot access the internet directly).
- Workspace: All your files are in /app/workspace.
  - /app/workspace/out/ : Put final files here to send them to the user automatically!
  - /app/workspace/in/  : Files uploaded by the user will appear here.
  - /app/workspace/www/ : Files here are served as a public website.
  - /app/workspace/work/: Scratchpad for intermediate work.

CAPABILITIES & INSTRUCTIONS:
1. You can execute commands. To execute commands, strictly use the format:
ACTION: EXECUTE
COMMAND: <your bash command here>

2. FILE DELIVERY:
To send a file to the user, simply move or copy it to /app/workspace/out/. The system will automatically detect and send it! No special syntax is needed. Example:
ACTION: EXECUTE
COMMAND: echo "Hello" > /app/workspace/out/hello.txt

Wait for the COMMAND_OUTPUT before proceeding.
"""

def extract_command(response):
    if "ACTION: EXECUTE" not in response:
        return None
    
    lines = response.split("\n")
    cmd_lines = []
    in_cmd = False
    
    for line in lines:
        if line.strip().startswith("COMMAND:"):
            in_cmd = True
            cmd_lines.append(line[len("COMMAND:"):].strip())
            continue
        if in_cmd:
            if line.strip().startswith("ACTION:") or line.strip().startswith("FILE:"):
                break
            cmd_lines.append(line)
            
    if cmd_lines:
        return "\n".join(cmd_lines).strip()
    return None

def is_dangerous(cmd):
    dangerous_tools = ["rm", "sudo", "su", "shutdown", "reboot", "nmap", "kill", "docker", "spawn_agent"]
    base = cmd.strip().split()[0] if cmd.strip() else ""
    for tool in dangerous_tools:
         if base == tool or base.startswith(tool):
             return True
    return False

def wait_for_approval():
    print("[HITL] Waiting for approval...", flush=True)
    lock_file = "/tmp/hermit_approval.lock"
    deny_file = "/tmp/hermit_deny.lock"
    waited = 0
    while waited < 600:
        if os.path.exists(lock_file):
            os.remove(lock_file)
            print("[HITL] Approved!", flush=True)
            return True
        if os.path.exists(deny_file):
            os.remove(deny_file)
            print("[HITL] Denied!", flush=True)
            return False
        time.sleep(1)
        waited += 1
    return False

def call_llm(messages):
    orchestrator_url = os.environ.get("ORCHESTRATOR_URL", "http://172.17.0.1:3000")
    agent_id = os.environ.get("AGENT_ID", "0")
    
    req_body = json.dumps({
        "messages": messages,
        "agentId": agent_id
    }).encode("utf-8")
    
    req = urllib.request.Request(f"{orchestrator_url}/api/internal/llm", data=req_body, headers={"Content-Type": "application/json"})
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data.get("output", "")
    except Exception as e:
        return f"Error communicating with Orchestrator Proxy: {str(e)}"

def main():
    user_msg = os.environ.get("USER_MSG", "")
    history_b64 = os.environ.get("HISTORY", "")
    hitl_enabled = os.environ.get("HITL_ENABLED", "false") == "true"
    
    history = []
    if history_b64:
        try:
            history = json.loads(base64.b64decode(history_b64).decode("utf-8"))
        except:
            pass

    # Note: RAG Memories are injected by the Orchestrator via the proxy, 
    # so we just need to send the standard system prompt.
    messages = [{"role": "system", "content": build_system_prompt()}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_msg})
    
    max_iters = 5
    iters = 0
    
    while iters < max_iters:
        iters += 1
        response = call_llm(messages)
        
        # print COMMAND lines for visual streaming in UI
        for line in response.split("\n"):
            if line.strip().startswith("COMMAND:"):
                print(line.strip(), flush=True)
                
        messages.append({"role": "assistant", "content": response})
        
        cmd = extract_command(response)
        if cmd:
            if is_dangerous(cmd) and hitl_enabled:
                print(f"[HITL] APPROVAL_REQUIRED: {cmd}", flush=True)
                if not wait_for_approval():
                    messages.append({"role": "user", "content": "ERROR: Command denied by user"})
                    continue
                print(f"[HITL] EXECUTING: {cmd}", flush=True)
            
            # Execute command
            try:
                result = subprocess.run(cmd, shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
                out = result.stdout
                if not out:
                    out = "Command executed successfully with no output."
                messages.append({"role": "user", "content": f"COMMAND_OUTPUT:\n{out}"})
            except Exception as e:
                messages.append({"role": "user", "content": f"ERROR executing command: {str(e)}"})
        else:
            # Done, no more commands
            print(response, flush=True)
            break

if __name__ == "__main__":
    main()
