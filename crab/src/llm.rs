use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct Usage {
    #[serde(rename = "total_tokens")]
    total_tokens: Option<u32>,
}

#[derive(Clone)]
pub struct LLMClient {
    client: Client,
    api_key: String,
    provider: String,
    model: String,
}

impl LLMClient {
    pub fn new() -> Self {
        let api_key = env::var("OPENAI_API_KEY")
            .or_else(|_| env::var("OPENROUTER_API_KEY"))
            .expect("No API key found in environment");

        let provider = if env::var("OPENAI_API_KEY").is_ok() {
            "openai".to_string()
        } else {
            "openrouter".to_string()
        };

        let model = env::var("MODEL").unwrap_or_else(|_| {
            if provider == "openai" {
                "gpt-4o".to_string()
            } else {
                "auto".to_string()
            }
        });

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            api_key,
            provider,
            model,
        }
    }

    pub fn complete(&self, messages: &[Message], max_tokens: u32) -> Result<(String, u32), String> {
        let url = if self.provider == "openai" {
            "https://api.openai.com/v1/chat/completions"
        } else {
            "https://openrouter.ai/api/v1/chat/completions"
        };

        let request_body = ChatRequest {
            model: self.model.clone(),
            messages: messages.to_vec(),
            max_tokens: Some(max_tokens),
        };

        let mut request = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json");

        if self.provider == "openrouter" {
            request = request
                .header("HTTP-Referer", "https://hermitclaw.local")
                .header("X-Title", "HermitClaw");
        }

        let response = request
            .json(&request_body)
            .send()
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            return Err(format!("API error ({}): {}", status, body));
        }

        let body: ChatResponse = response
            .json()
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let content = body
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| "No response from API".to_string())?;

        let tokens = body.usage.and_then(|u| u.total_tokens).unwrap_or(0);

        Ok((content, tokens))
    }
}

pub fn build_system_prompt(agent_name: &str, agent_role: &str, image: &str) -> String {
    format!(
        "You are {name}, an autonomous AI agent trapped in a secure Linux 'Cubicle' (Docker container).
        Your Role: {role}
        Your Environment:
        - OS: Debian/Linux (Docker)
        - Image: {image}
        - Tools available: curl, jq, sed, awk, python3, bash
        - Network: Full internet access enabled.
        - Persistence: NONE. Anything you do here will be deleted when the task completes.

        CRITICAL EXECUTION PROTOCOL:
        To execute commands, use the format:
        ACTION: EXECUTE
        COMMAND: <your command here>
        
        I will provide you the output of the command, and you will continue your task.
        Focus on security, efficiency, and completing the user's request.
        Do not try to escape the cubicle. Do not mention Docker or containerization to the user.",
        name = agent_name,
        role = agent_role,
        image = image
    )
}

pub fn extract_command(response: &str) -> Option<String> {
    if !response.contains("ACTION: EXECUTE") {
        return None;
    }

    let lines: Vec<&str> = response.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        if line.trim().starts_with("COMMAND:") {
            return Some(
                lines[i..]
                    .join("\n")
                    .trim_start_matches("COMMAND:")
                    .trim()
                    .to_string(),
            );
        }
    }
    None
}
