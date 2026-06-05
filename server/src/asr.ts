// ===== 讯飞 实时语音转写大模型 ASR 客户端 =====
// 每个浏览器客户端对应一个 XunfeiASR 实例，管理独立的讯飞 WebSocket 连接
//
// 协议：浏览器 WebSocket → 讯飞 ASR WebSocket → 识别文本流
// 参考：https://www.xfyun.cn/doc/asr/rtasr/API.html

import WebSocket from 'ws';
import { createHmac } from 'crypto';

// ---- 配置 ----
export interface ASRConfig {
  appId: string;
  apiSecret: string;
}

// ---- 回调 ----
export interface ASREventHandler {
  /** 中间识别结果（边说边出） */
  onPartial: (text: string) => void;
  /** 最终识别结果（VAD 后确认） */
  onFinal: (text: string) => void;
  /** 连接/识别异常 */
  onError: (error: Error) => void;
}

// 讯飞实时语音转写 WebSocket 地址
const ASR_URL = 'wss://rtasr.xfyun.cn/v1/ws';

// ---- 签名 ----
function generateSign(appId: string, ts: string, apiSecret: string): string {
  return createHmac('sha256', apiSecret).update(appId + ts).digest('base64');
}

// 讯飞 ASR 返回的原始 JSON 结构（嵌套在 data 字段中）
interface ASRResultRaw {
  cn?: {
    st?: {
      rt?: Array<{
        ws: Array<{ cw: Array<{ w: string }> }>;
        type: string; // "0" = partial, "1" = final
      }>;
    };
  };
}

export class XunfeiASR {
  private ws: WebSocket | null = null;
  private readonly config: ASRConfig;
  private readonly handler: ASREventHandler;

  constructor(config: ASRConfig, handler: ASREventHandler) {
    this.config = config;
    this.handler = handler;
  }

  /** 建立与讯飞 ASR 的 WebSocket 连接 */
  connect(): void {
    const { appId, apiSecret } = this.config;
    const ts = Math.floor(Date.now() / 1000).toString();
    const signa = generateSign(appId, ts, apiSecret);
    const url = `${ASR_URL}?appid=${appId}&ts=${ts}&signa=${encodeURIComponent(signa)}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('🔊 讯飞 ASR 已连接');
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const result = this.extractResult(msg);
        if (result) {
          if (result.isFinal) {
            this.handler.onFinal(result.text);
          } else {
            this.handler.onPartial(result.text);
          }
        }
      } catch {
        // 忽略无法解析的帧
      }
    });

    this.ws.on('error', (err) => {
      console.error('❌ 讯飞 ASR 连接错误:', err.message);
      this.handler.onError(new Error(err.message));
    });

    this.ws.on('close', (code, reason) => {
      console.log(`🔇 讯飞 ASR 断开 (code: ${code}, reason: ${reason?.toString() || 'N/A'})`);
    });
  }

  /** 发送 Int16 16kHz mono PCM 音频数据 */
  sendAudio(data: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /** 通知讯飞 ASR 音频结束（触发最终结果确认） */
  end(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end' }));
    }
  }

  /** 断开与讯飞 ASR 的连接 */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
  }

  // ---- 解析讯飞返回的嵌套 JSON ----
  private extractResult(msg: Record<string, unknown>): { text: string; isFinal: boolean } | null {
    const { action, data } = msg as { action?: string; data?: string };

    // 忽略心跳和错误帧
    if (!action || action === 'error') return null;
    if (!data) return null;

    try {
      const parsed: ASRResultRaw = JSON.parse(data);
      const rt = parsed?.cn?.st?.rt?.[0];
      if (!rt) return null;

      const text = rt.ws
        ?.map((seg) => seg.cw.map((c) => c.w).join(''))
        .join('') || '';

      if (!text) return null;

      return { text, isFinal: rt.type === '1' };
    } catch {
      return null;
    }
  }
}
