// ===== DeepSeek 流式对话客户端 =====
// 调用 DeepSeek Chat API（OpenAI 兼容），SSE 流式返回对话内容
// 双语输出由 System Prompt 控制（session.ts），此处只负责 API 调用

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
          temperature: 0.8,
          max_tokens: 512,
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

  /** 中断当前流式请求 */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
