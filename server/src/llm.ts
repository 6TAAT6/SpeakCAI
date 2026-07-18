// ===== DeepSeek 流式对话客户端 =====
// 调用 DeepSeek Chat API（OpenAI 兼容），SSE 流式返回对话 + 非流式翻译
// 模型只生成英语，翻译由独立 chatOnce 调用完成

import type { ChatMessage } from './session.ts';

// ---- 配置 ----
export interface LLMConfig {
  apiKey: string;
  model: string;
}

// ---- 回调 ----
export interface LLMHandler {
  /** 流式输出的增量文本（每次一块） */
  onStream: (text: string) => void;
  /** 完整回复结束 */
  onDone: (fullText: string) => void;
  /** API 调用异常 */
  onError: (error: Error) => void;
}

const API_BASE = 'https://api.deepseek.com/v1';

interface DeltaChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

export class DeepSeekLLM {
  private readonly config: LLMConfig;
  private abortController: AbortController | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** 发起流式对话请求 */
  async chat(messages: ChatMessage[], handler: LLMHandler): Promise<void> {
    this.abortController = new AbortController();
    let fullText = '';

    try {
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: true,
          temperature: 0.6,
          max_tokens: 2048,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`DeepSeek API ${response.status}: ${body.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error('DeepSeek API returned empty response body');
      }

      // 流式读取 SSE
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // 最后一行可能不完整，保留到下次
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const chunk: DeltaChunk = JSON.parse(jsonStr);
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              handler.onStream(content);
            }
          } catch {
            // 跳过无法解析的行
          }
        }
      }

      handler.onDone(fullText);
    } catch (err) {
      // AbortError: 用户主动打断，不触发任何回调
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      handler.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** 简单非流式请求（翻译/纠错等辅助任务） */
  async chatOnce(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          temperature: 0.3,
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.warn(`⚠️ 翻译 API ${response.status}: ${errText.slice(0, 100)}`);
        return '';
      }
      const data = await response.json() as any;
      return data?.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.warn(`⚠️ 翻译异常: ${err.message}`);
      }
      return '';
    }
  }

  /** 中断当前流式请求 */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
