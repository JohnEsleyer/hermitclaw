use std::process::Command;

pub fn execute_command(cmd: &str) -> Result<String, String> {
    let parts: Vec<&str> = cmd.split_whitespace().collect();

    if parts.is_empty() {
        return Err("Empty command".to_string());
    }

    let output = Command::new("sh")
        .arg("-c")
        .arg(cmd)
        .output()
        .map_err(|e| format!("Failed to execute: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn can_execute_command(cmd: &str) -> bool {
    let allowed = [
        "curl", "jq", "cat", "ls", "echo", "grep", "awk", "sed", "python3", "node",
    ];

    let parts: Vec<&str> = cmd.split_whitespace().collect();
    if parts.is_empty() {
        return false;
    }

    let base_cmd = parts[0];
    allowed
        .iter()
        .any(|&a| base_cmd == a || base_cmd.starts_with(a))
}

pub fn is_dangerous_command(cmd: &str) -> bool {
    let dangerous = [
        "rm",
        "nmap",
        "curl",
        "wget",
        "dd",
        "mkfs",
        "fdisk",
        "parted",
        "shutdown",
        "reboot",
        "halt",
        "poweroff",
        "init",
        "chmod",
        "chown",
        "chgrp",
        "kill",
        "killall",
        "pkill",
        "wget",
        "curl",
        "nc",
        "netcat",
        "socat",
        "sudo",
        "su",
        "passwd",
        "useradd",
        "userdel",
        "usermod",
        "groupadd",
        "groupdel",
        "iptables",
        "ufw",
        "firewall-cmd",
        "docker",
        "podman",
        "ssh",
        "scp",
        "sftp",
        "base64",
        "xxd",
        "xxencode",
        "spawn_agent",
    ];

    let parts: Vec<&str> = cmd.split_whitespace().collect();
    if parts.is_empty() {
        return false;
    }

    let base_cmd = parts[0];
    dangerous
        .iter()
        .any(|&d| base_cmd == d || base_cmd.starts_with(d))
}

pub fn build_meeting_prompt() -> String {
    r#"
AGENT COLLABORATION PROTOCOL:
To delegate a sub-task to another agent, use:
ACTION: DELEGATE
AGENT_ROLE: <role needed, e.g., 'Python Expert'>
TASK: <detailed task description>

The system will automatically route this to an appropriate agent if available.
"#
    .to_string()
}

pub fn extract_delegate_action(response: &str) -> Option<(String, String)> {
    if !response.contains("ACTION: DELEGATE") {
        return None;
    }

    let mut agent_role = None;
    let mut task = None;

    for line in response.lines() {
        let line = line.trim();
        if line.starts_with("AGENT_ROLE:") {
            agent_role = Some(
                line.strip_prefix("AGENT_ROLE:")
                    .unwrap_or("")
                    .trim()
                    .to_string(),
            );
        }
        if line.starts_with("TASK:") {
            task = Some(line.strip_prefix("TASK:").unwrap_or("").trim().to_string());
        }
    }

    match (agent_role, task) {
        (Some(role), Some(t)) => Some((role, t)),
        _ => None,
    }
}
