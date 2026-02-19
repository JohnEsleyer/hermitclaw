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

pub fn get_provider_config(provider: &str) -> (&'static str, &'static str) {
    match provider {
        "openai" => ("https://api.openai.com/v1/chat/completions", "Bearer"),
        "anthropic" => ("https://api.anthropic.com/v1/messages", "x-api-key"),
        "google" => (
            "https://generativelanguage.googleapis.com/v1beta/models",
            "Key",
        ),
        "groq" => ("https://api.groq.com/openai/v1/chat/completions", "Bearer"),
        "openrouter" => ("https://openrouter.ai/api/v1/chat/completions", "Bearer"),
        "mistral" => ("https://api.mistral.ai/v1/chat/completions", "Bearer"),
        "deepseek" => ("https://api.deepseek.com/v1/chat/completions", "Bearer"),
        "xai" => ("https://api.x.ai/v1/chat/completions", "Bearer"),
        _ => ("https://openrouter.ai/api/v1/chat/completions", "Bearer"),
    }
}

impl LLMClient {
    pub fn new() -> Self {
        let provider = env::var("LLM_PROVIDER").unwrap_or_else(|_| "openrouter".to_string());

        let (api_key, model) = match provider.as_str() {
            "openai" => (
                env::var("OPENAI_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "gpt-4o".to_string()),
            ),
            "anthropic" => (
                env::var("ANTHROPIC_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "claude-3-5-sonnet-20241022".to_string()),
            ),
            "google" => (
                env::var("GOOGLE_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "gemini-1.5-pro".to_string()),
            ),
            "groq" => (
                env::var("GROQ_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "llama-3.3-70b-versatile".to_string()),
            ),
            "openrouter" => (
                env::var("OPENROUTER_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "anthropic/claude-3.5-sonnet".to_string()),
            ),
            "mistral" => (
                env::var("MISTRAL_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "mistral-large-latest".to_string()),
            ),
            "deepseek" => (
                env::var("DEEPSEEK_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "deepseek-chat".to_string()),
            ),
            "xai" => (
                env::var("XAI_API_KEY")
                    .or_else(|_| env::var("LLM_API_KEY"))
                    .unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "grok-beta".to_string()),
            ),
            _ => (
                env::var("LLM_API_KEY").unwrap_or_default(),
                env::var("LLM_MODEL").unwrap_or_else(|_| "auto".to_string()),
            ),
        };

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
        if self.provider == "google" {
            return self.complete_google(messages, max_tokens);
        }

        if self.provider == "anthropic" {
            return self.complete_anthropic(messages, max_tokens);
        }

        let (url, auth_prefix) = get_provider_config(&self.provider);

        let request_body = ChatRequest {
            model: self.model.clone(),
            messages: messages.to_vec(),
            max_tokens: Some(max_tokens),
        };

        let mut request = self
            .client
            .post(url)
            .header("Authorization", format!("{} {}", auth_prefix, self.api_key))
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

    fn complete_anthropic(
        &self,
        messages: &[Message],
        max_tokens: u32,
    ) -> Result<(String, u32), String> {
        let url = "https://api.anthropic.com/v1/messages";

        #[derive(Serialize)]
        struct AnthropicRequest {
            model: String,
            messages: Vec<Message>,
            max_tokens: u32,
        }

        let request_body = AnthropicRequest {
            model: self.model.clone(),
            messages: messages.to_vec(),
            max_tokens,
        };

        let response = self
            .client
            .post(url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            return Err(format!("API error ({}): {}", status, body));
        }

        #[derive(Deserialize)]
        struct AnthropicResponse {
            content: Vec<AnthropicContent>,
            usage: Option<AnthropicUsage>,
        }

        #[derive(Deserialize)]
        struct AnthropicContent {
            text: String,
        }

        #[derive(Deserialize)]
        struct AnthropicUsage {
            input_tokens: u32,
            output_tokens: u32,
        }

        let body: AnthropicResponse = response
            .json()
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let content = body
            .content
            .first()
            .map(|c| c.text.clone())
            .ok_or_else(|| "No response from API".to_string())?;

        let tokens = body
            .usage
            .map(|u| u.input_tokens + u.output_tokens)
            .unwrap_or(0);

        Ok((content, tokens))
    }

    fn complete_google(
        &self,
        messages: &[Message],
        max_tokens: u32,
    ) -> Result<(String, u32), String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            self.model, self.api_key
        );

        #[derive(Serialize)]
        struct GoogleRequest {
            contents: Vec<GoogleContent>,
            generationConfig: GoogleConfig,
        }

        #[derive(Serialize)]
        struct GoogleContent {
            parts: Vec<GooglePart>,
        }

        #[derive(Serialize, Deserialize)]
        struct GooglePart {
            text: String,
        }

        #[derive(Serialize)]
        struct GoogleConfig {
            maxOutputTokens: u32,
        }

        let contents: Vec<GoogleContent> = messages
            .iter()
            .map(|m| GoogleContent {
                parts: vec![GooglePart {
                    text: m.content.clone(),
                }],
            })
            .collect();

        let request_body = GoogleRequest {
            contents,
            generationConfig: GoogleConfig {
                maxOutputTokens: max_tokens,
            },
        };

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            return Err(format!("API error ({}): {}", status, body));
        }

        #[derive(Deserialize)]
        struct GoogleResponse {
            candidates: Vec<GoogleCandidate>,
        }

        #[derive(Deserialize)]
        struct GoogleCandidate {
            content: GoogleResponseContent,
        }

        #[derive(Deserialize)]
        struct GoogleResponseContent {
            parts: Vec<GooglePart>,
        }

        let body: GoogleResponse = response
            .json()
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let content = body
            .candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.clone())
            .ok_or_else(|| "No response from API".to_string())?;

        Ok((content, 0))
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
