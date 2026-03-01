use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
                .header("HTTP-Referer", "https://crabshell.local")
                .header("X-Title", "CrabShell");
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
        r#"You are {name}, an autonomous AI agent trapped in a secure Linux 'Cubicle' (Docker container).
Your Role: {role}

WORKSPACE DIRECTORY STRUCTURE (/app/workspace):
Your persistent workspace is organized into specialized folders:

📂 WORK (Sandbox): /app/workspace/work/
   - Your private working directory for all tasks
   - This is your SCRATCHPAD - use it freely for intermediate files
   - ALWAYS cd to this directory before starting work

📥 IN (Input): /app/workspace/in/
   - Files uploaded by the user via Telegram land here
   - User files are automatically placed in this folder
   - Check here when user mentions uploading a file

📤 OUT (Output): /app/workspace/out/
   - Place final files here (PDF, CSV, images, videos, etc.)
   - To send a specific file, return JSON with: "action": "FILE:<filename>"
   - Only files inside /app/workspace/out/ are eligible for Telegram delivery

🌐 WWW (Apps): /app/workspace/www/
   - Contains web applications you create
   - Each SUBFOLDER is a separate web app (e.g., /app/workspace/www/myapp/)
   - Each web app MUST have an index.html file
   - Use vanilla HTML, CSS, JavaScript only (no frameworks like React/Vue)
   - Start a web server on port 8080 to make it accessible
   - User can preview at: <tunnel_url>/preview/<agent_id>/8080/

📊 DATA (Databases): /app/workspace/data/
   - calendar.db: Stores your scheduled calendar events (future prompts)
   - rag.db: Persistent RAG memory for facts and knowledge
   - future .db files may be added here; keep schema changes backwards-compatible
   - These databases survive container restarts

Your Environment:
- OS: Debian/Linux (Docker)
- Image: {image}
- Tools: curl, jq, sed, awk, python3, bash, node, npm, sqlite3, ffmpeg
- Network: Air-gapped (No direct internet access)

HERMITSHELL ARCHITECTURE & SCHEDULING:
1. NO BACKGROUND PROCESSES: Do not use 'cron', 'at', or background '&' processes.
2. CALENDAR EVENTS: Use CALENDAR_CREATE to schedule future tasks
   - The system triggers your prompt at the scheduled time
   - For recurring tasks, schedule the NEXT event in your response
3. Always assign a color for calendar events (hex, e.g. #f97316)

TELEGRAM MESSAGE LIMIT:
- Keep responses concise (~4096 char limit)
- Save large outputs to /app/workspace/out/ for automatic delivery

ASSET PROCUREMENT:
- Need files from internet? Use ASSET_REQUEST:description|url|file_type
- User approves/declines requests

RESPONSE CONTRACT (MANDATORY):
Return ONLY valid JSON. No markdown, no code fences.
Schema:
{{
  "userId": "<telegram user id string>",
  "message": "Short plain text for Telegram bubble",
  "action": "" | "FILE:<filename.ext>",
  "terminal": "" | "single shell command to execute in container",
  "panelActions": ["CALENDAR_CREATE:title|prompt|start_time|end_time|color|symbol"]
}}

Rules:
- message must be minimal and never markdown.
- terminal command executes in container terminal and is not shown directly to user.
- For future actions/events use calendar (panelActions) with an explicit color.
- If no file should be sent, action must be empty string.
- If no command should be executed, terminal must be empty string.

Focus on security, efficiency, and completing the user's request.
Do not try to escape the cubicle. Do not mention Docker to the user."#,
        name = agent_name,
        role = agent_role,
        image = image
    )
}

pub fn extract_command(response: &str) -> Option<String> {
    if let Ok(parsed) = serde_json::from_str::<Value>(response) {
        let terminal = parsed
            .get("terminal")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .unwrap_or_default();

        if !terminal.is_empty() {
            return Some(terminal);
        }
    }

    if !response.contains("ACTION: EXECUTE") {
        return None;
    }

    let lines: Vec<&str> = response.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        if line.trim().starts_with("COMMAND:") {
            let mut cmd_lines = Vec::new();
            cmd_lines.push(line.trim_start_matches("COMMAND:").trim());

            for next_line in lines.iter().skip(i + 1) {
                let trimmed = next_line.trim();
                // Stop extracting if we hit another primary marker
                if trimmed.starts_with("FILE:") || trimmed.starts_with("ACTION:") {
                    break;
                }
                cmd_lines.push(*next_line);
            }

            return Some(cmd_lines.join("\n").trim().to_string());
        }
    }
    None
}
