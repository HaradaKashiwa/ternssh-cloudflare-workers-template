const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";

export interface AiGenerateInput {
  prompt: string;
  history?: string[];
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

export class AiCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiCommandError";
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function validateApiBaseUrl(url: string): string {
  const normalized = normalizeBaseUrl(url);
  if (!normalized) {
    throw new AiCommandError("API base URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new AiCommandError("Invalid API base URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AiCommandError("API base URL must use http or https");
  }

  if (!parsed.hostname) {
    throw new AiCommandError("Invalid API base URL");
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")}`;
}

function buildSystemPrompt(history: string[]): string {
  const lines = [
    "You are a shell command generator for Linux/Unix terminals.",
    "Your ONLY job is to output executable shell command text.",
    "",
    "Strict output rules:",
    "- Output raw shell commands only. No prose, markdown, code fences, or quotes.",
    "- Do NOT explain, apologize, or add labels like 'Command:' or 'Run:'.",
    "- Do NOT start with '$', '>', or '# ' unless it is a shebang or comment line.",
    "- Prefer one line; chain with && for a few steps.",
    "- For multi-line shell scripts (shebang, if/for/while/function), output the script body only.",
    "- Prefer safe read-only commands when the request is ambiguous.",
  ];

  if (history.length > 0) {
    lines.push("", "Recent commands on this server for context:");
    for (const item of history.slice(0, 10)) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
}

const PROSE_LINE_PATTERN =
  /^(here(?:'s| is)|this (?:command|will)|you (?:can|should|need)|to (?:do|view|check|find)|please note|note that|sorry|i (?:cannot|can't|am unable)|the following|as follows|output:|answer:)/i;

const COMMAND_LINE_PATTERN =
  /^(?:sudo\s+)?(?:[A-Za-z_./~][A-Za-z0-9_./~-]*|[A-Za-z_][A-Za-z0-9_]*=)/;

const SHELL_OPERATOR_PATTERN = /[|;&><$`()[\]\\]|&&|\|\||\$\(/;

function sanitizeCommandLine(line: string): string {
  let current = line.trim();
  current = current.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "");
  current = current.replace(/^\$\s+/, "");
  current = current.replace(/^(?:here(?:'s| is)|run(?: this)?|try(?: this)?|use|command):\s*/i, "");
  return current.trim();
}

export function extractCommandContent(text: string): string {
  let trimmed = text.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { command?: unknown };
      if (typeof parsed.command === "string" && parsed.command.trim()) {
        return normalizeCommandBlock(parsed.command);
      }
    } catch {
      // Not JSON — continue with plain-text extraction.
    }
  }

  const codeBlock = trimmed.match(/```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/);
  if (codeBlock) {
    trimmed = codeBlock[1].trim();
  } else if (/^`[^`\n]+`$/.test(trimmed)) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  return normalizeCommandBlock(trimmed);
}

function normalizeCommandBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => sanitizeCommandLine(line))
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

export function looksLikeShellCommand(text: string): boolean {
  if (
    text.includes('script="/tmp/ternssh-$$.sh"') &&
    text.includes('cat > "$script" <<') &&
    text.includes('chmod +x "$script"') &&
    text.includes('bash "$script"')
  ) {
    return true;
  }

  const lines = text
    .split("\n")
    .map((line) => sanitizeCommandLine(line))
    .filter((line) => line.length > 0);

  if (lines.length === 0) return false;

  let commandLikeLines = 0;

  for (const line of lines) {
    if (line.startsWith("#!")) {
      commandLikeLines += 1;
      continue;
    }
    if (line.startsWith("#")) {
      continue;
    }

    if (PROSE_LINE_PATTERN.test(line)) {
      return false;
    }

    const wordCount = line.split(/\s+/).length;
    const hasOperator = SHELL_OPERATOR_PATTERN.test(line);
    const hasCommandPrefix = COMMAND_LINE_PATTERN.test(line);

    if (!hasCommandPrefix && !hasOperator) {
      return false;
    }

    if (wordCount > 16 && !hasOperator && !line.includes("/") && !line.includes("=")) {
      return false;
    }

    commandLikeLines += 1;
  }

  return commandLikeLines > 0;
}

const SCRIPT_CONTROL_PATTERN =
  /^\s*(if|elif|else|for|while|until|case|function|select)\b|^\s*(then|do|fi|done|esac|else)\b|\bfunction\s+\w+/;

const ALREADY_WRAPPED_PATTERN =
  /\b(cat|tee)\s+[^\n]*<<|<\s*\(\s*cat|mktemp[^\n]*<<|bash\s+["']?\$script/;

function pickHeredocDelimiter(body: string): string {
  const candidates = [
    "TERNSSH_SCRIPT_EOF",
    "TS_SCRIPT_EOF",
    "EOF_TERNSSH_SCRIPT",
  ];
  for (const delimiter of candidates) {
    if (!body.split("\n").some((line) => line.trim() === delimiter)) {
      return delimiter;
    }
  }
  return `TERNSSH_${Date.now()}`;
}

export function looksLikeScript(text: string): boolean {
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length <= 1) return false;
  if (ALREADY_WRAPPED_PATTERN.test(text)) return false;

  if (lines.some((line) => line.startsWith("#!"))) return true;

  const codeLines = lines.filter((line) => !line.trim().startsWith("#"));
  if (codeLines.length === 0) return false;

  const hasControlFlow = codeLines.some((line) =>
    SCRIPT_CONTROL_PATTERN.test(line),
  );
  if (hasControlFlow) return true;

  const hasFunctionBlock = codeLines.some((line) => /^\s*\w+\s*\(\s*\)\s*\{/.test(line));
  if (hasFunctionBlock) return true;

  return false;
}

export function wrapScriptAsFileCommand(script: string): string {
  const body = script.replace(/\r\n/g, "\n").trimEnd();
  const delimiter = pickHeredocDelimiter(body);
  return [
    'script="/tmp/ternssh-$$.sh"',
    `cat > "$script" << '${delimiter}'`,
    body,
    delimiter,
    'chmod +x "$script"',
    'bash "$script"',
  ].join("\n");
}

function finalizeCommand(command: string): string {
  if (looksLikeScript(command)) {
    return wrapScriptAsFileCommand(command);
  }
  return command;
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function requestCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      }
    | null;

  if (!response.ok) {
    const message =
      body?.error?.message ??
      `Request failed (${response.status} ${response.statusText})`;
    throw new AiCommandError(message);
  }

  const content = body?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new AiCommandError("Empty response from AI");
  }

  return content;
}

function parseCommandFromResponse(content: string): string {
  const extracted = extractCommandContent(content);
  if (!extracted) {
    throw new AiCommandError("Could not parse command from AI response");
  }

  const command = finalizeCommand(extracted);
  if (!looksLikeShellCommand(command)) {
    throw new AiCommandError("AI response is not a valid shell command");
  }
  return command;
}

export async function generateShellCommand(input: AiGenerateInput): Promise<string> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new AiCommandError("Prompt is required");
  }

  const apiKey = input.apiKey.trim();
  const model = input.model.trim();
  const baseUrl = validateApiBaseUrl(input.apiBaseUrl || DEFAULT_API_BASE_URL);

  if (!apiKey) {
    throw new AiCommandError("API key is required");
  }
  if (!model) {
    throw new AiCommandError("Model is required");
  }

  const history = Array.isArray(input.history)
    ? input.history.filter((item): item is string => typeof item === "string")
    : [];

  const systemPrompt = buildSystemPrompt(history);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  let content = await requestCompletion(baseUrl, apiKey, model, messages);

  try {
    return parseCommandFromResponse(content);
  } catch (firstError) {
    if (!(firstError instanceof AiCommandError)) {
      throw firstError;
    }
    if (firstError.message === "Empty response from AI") {
      throw firstError;
    }
  }

  messages.push({ role: "assistant", content });
  messages.push({
    role: "user",
    content:
      "That was not valid executable shell command text. Reply with ONLY the raw shell command(s). No explanation.",
  });

  content = await requestCompletion(baseUrl, apiKey, model, messages);
  return parseCommandFromResponse(content);
}
