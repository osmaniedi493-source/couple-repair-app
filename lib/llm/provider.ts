export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionChoice = {
  message?: {
    content?: string;
  };
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
  error?: {
    message?: string;
  };
};

export async function completeWithModel(messages: ChatMessage[], options?: { temperature?: number }) {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-5";

  if (!apiKey) {
    throw new Error("缺少 LLM_API_KEY 或 OPENAI_API_KEY。请在 .env.local 中配置。");
  }

  if (baseUrl === "https://api.openai.com/v1") {
    const system = messages.find((message) => message.role === "system")?.content || "";
    const input = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: [{ type: "input_text", text: message.content }]
      }));

    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        instructions: system,
        input
      })
    });

    const data = (await readJsonResponse(response, "OpenAI")) as Record<string, unknown>;
    if (!response.ok) {
      const error = data.error as { message?: string } | undefined;
      throw new Error(error?.message || `模型请求失败：${response.status}`);
    }

    const content = extractResponsesText(data);
    if (!content) throw new Error("模型没有返回内容。");
    return content;
  }

  const wantsJson = messages.some((message) => message.content.includes("只返回 JSON"));
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.35,
    stream: false
  };
  if (wantsJson) body.response_format = { type: "json_object" };
  if (baseUrl.includes("deepseek.com")) body.thinking = { type: "disabled" };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = (await readJsonResponse(response, "OpenAI-compatible")) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `模型请求失败：${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("模型没有返回内容。");
  return content;
}

async function readJsonResponse(response: Response, label: string) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const preview = text.trim().slice(0, 160);
    throw new Error(`${label} 接口没有返回可读取的 JSON。状态码：${response.status}。返回内容：${preview}`);
  }
}

function extractResponsesText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text.trim();
  const output = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content)
      : [];
    for (const contentItem of content) {
      if (contentItem && typeof contentItem === "object" && typeof (contentItem as { text?: unknown }).text === "string") {
        parts.push((contentItem as { text: string }).text);
      }
    }
  }
  return parts.join("\n").trim();
}

/**
 * Transcribes one chat-app screenshot (e.g. WeChat) into a plain speaker: text
 * transcript, using a vision-capable model. Kept separate from
 * completeWithModel because it needs an image content part, which the plain
 * ChatMessage type above doesn't carry.
 */
export async function transcribeChatScreenshot(params: {
  imageDataUrl: string;
  selfName: string;
  otherName: string;
}): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const visionModel = process.env.LLM_VISION_MODEL || "deepseek-v4-flash-vision-exp";

  if (!apiKey) {
    throw new Error("缺少 LLM_API_KEY 或 OPENAI_API_KEY。请在 .env.local 中配置。");
  }

  const systemPrompt = `你在识别一张聊天软件（例如微信）的对话截图。规则：
- 右侧、通常是绿色的气泡是"${params.selfName}"自己发的消息；左侧、通常是白色或灰色的气泡是"${params.otherName}"发的消息。
- 按从上到下的顺序，逐条还原文字内容，每条前面写"${params.selfName}："或"${params.otherName}："。
- 只输出你能确定看清的文字，看不清或无法辨认的地方标注"[看不清]"，绝对不要编造内容。
- 跳过时间分隔线、系统提示、红包或转账卡片上的图形，除非上面有清楚可读的文字。
- 只做逐条转录，不要添加任何总结、分析或评论。`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: visionModel,
      temperature: 0,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "请转录这张聊天截图里的对话内容。" },
            { type: "image_url", image_url: { url: params.imageDataUrl } }
          ]
        }
      ]
    })
  });

  const data = (await readJsonResponse(response, "DeepSeek Vision")) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `图片识别失败：${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("没有识别出可用内容，请换一张更清晰的截图。");
  return content;
}

export function parseJsonObject<T>(text: string): T {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型没有返回可读取的 JSON。");
    return JSON.parse(match[0]) as T;
  }
}
