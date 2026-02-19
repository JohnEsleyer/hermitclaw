mod llm;
mod tools;

use llm::{build_system_prompt, extract_command, LLMClient, Message};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;
use tools::execute_command;

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    agent_name: String,
    agent_role: String,
    docker_image: String,
    user_msg: String,
    history: Vec<Message>,
    max_tokens: u32,
}

fn parse_history_from_file(file_path: &str) -> Vec<Message> {
    let path = Path::new(file_path);
    if !path.exists() {
        eprintln!("History file not found: {}", file_path);
        return Vec::new();
    }

    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|e| {
            eprintln!("Failed to parse history JSON: {}", e);
            Vec::new()
        }),
        Err(e) => {
            eprintln!("Failed to read history file: {}", e);
            Vec::new()
        }
    }
}

fn wait_for_approval(max_wait_secs: u64) -> bool {
    let lock_file = "/tmp/hermit_approval.lock";
    let deny_file = "/tmp/hermit_deny.lock";
    let mut waited = 0;

    println!("[HITL] Waiting for approval...");

    while waited < max_wait_secs {
        if Path::new(lock_file).exists() {
            let _ = fs::remove_file(lock_file);
            println!("[HITL] Approved!");
            return true;
        }

        if Path::new(deny_file).exists() {
            let _ = fs::remove_file(deny_file);
            println!("[HITL] Denied!");
            return false;
        }

        thread::sleep(Duration::from_secs(1));
        waited += 1;
    }

    println!("[HITL] Approval timeout!");
    false
}

fn main() {
    let agent_name = env::var("AGENT_NAME").unwrap_or_else(|_| "HermitClaw".to_string());
    let agent_role = env::var("AGENT_ROLE").unwrap_or_else(|_| "General Assistant".to_string());
    let docker_image = env::var("DOCKER_IMAGE").unwrap_or_else(|_| "hermit/base".to_string());
    let user_msg = env::var("USER_MSG").unwrap_or_default();
    let history_file = env::var("HISTORY_FILE").unwrap_or_default();
    let max_tokens: u32 = env::var("MAX_TOKENS")
        .unwrap_or_else(|_| "1000".to_string())
        .parse()
        .unwrap_or(1000);

    let hitl_enabled = env::var("HITL_ENABLED").unwrap_or_else(|_| "false".to_string()) == "true";

    let api_key = env::var("OPENAI_API_KEY")
        .or_else(|_| env::var("OPENROUTER_API_KEY"))
        .expect("No API key found");

    let history = if history_file.is_empty() {
        let history_b64 = env::var("HISTORY").unwrap_or_default();
        parse_history_from_base64(&history_b64)
    } else {
        parse_history_from_file(&history_file)
    };

    let system_prompt = build_system_prompt(&agent_name, &agent_role, &docker_image);

    let mut messages = vec![Message {
        role: "system".to_string(),
        content: system_prompt,
    }];

    for msg in &history {
        messages.push(msg.clone());
    }

    messages.push(Message {
        role: "user".to_string(),
        content: user_msg,
    });

    let client = LLMClient::new();
    let mut iterations = 0;
    let max_iterations = 5;

    while iterations < max_iterations {
        iterations += 1;

        match client.complete(&messages, max_tokens) {
            Ok((response, _tokens)) => {
                if let Some(cmd) = extract_command(&response) {
                    messages.push(Message {
                        role: "assistant".to_string(),
                        content: response.clone(),
                    });

                    let needs_approval = tools::is_dangerous_command(&cmd);

                    if needs_approval && hitl_enabled {
                        println!("[HITL] APPROVAL_REQUIRED: {}", cmd);

                        let approved = wait_for_approval(60);

                        if !approved {
                            let error_msg = "ERROR: Command denied by user".to_string();
                            messages.push(Message {
                                role: "user".to_string(),
                                content: error_msg,
                            });
                            continue;
                        }

                        println!("[HITL] EXECUTING: {}", cmd);
                    }

                    match execute_command(&cmd) {
                        Ok(output) => {
                            let output_msg = format!("COMMAND_OUTPUT:\n{}", output);
                            messages.push(Message {
                                role: "user".to_string(),
                                content: output_msg,
                            });
                        }
                        Err(e) => {
                            let error_msg = format!("ERROR: {}", e);
                            messages.push(Message {
                                role: "user".to_string(),
                                content: error_msg,
                            });
                        }
                    }
                } else {
                    println!("{}", response);
                    break;
                }
            }
            Err(e) => {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        }
    }

    if iterations >= max_iterations {
        eprintln!("Max iterations reached");
        std::process::exit(1);
    }
}

fn parse_history_from_base64(encoded: &str) -> Vec<Message> {
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok();

    match decoded {
        Some(bytes) => {
            let json_str = String::from_utf8(bytes).ok();
            match json_str {
                Some(s) => serde_json::from_str(&s).unwrap_or_default(),
                None => Vec::new(),
            }
        }
        None => Vec::new(),
    }
}
