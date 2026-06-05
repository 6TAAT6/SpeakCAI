// ===== 讯飞 实时语音转写大模型 ASR 客户端 =====
// 每个浏览器客户端对应一个 XunfeiASR 实例，管理独立的讯飞 WebSocket 连接
//
// 协议：浏览器 WebSocket → 讯飞 ASR WebSocket → 识别文本流
// 参考：https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html

import WebSocket from 'ws';
import { createHmac, randomUUID } from 'crypto';

// ---- 配置 ----
export interface ASRConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

// ---- 回调 ----
export interface ASREventHandler {
  /** 中间识别结果（边说边出） */
  onPartial: (text: string) => void;
  /** 最终识别结果（整句确认） */
  onFinal: (text: string) => void;
  /** 连接/识别异常 */
  onError: (error: Error) => void;
}

// 实时语音转写大模型 WebSocket 地址
const ASR_URL = 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1';

// ---- 签名 ----
function generateSignature(params: Record<string, string>, apiSecret: string): string {
  const sorted = Object.keys(params).sort();
  const baseString = sorted
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  return createHmac('sha1', apiSecret).update(baseString).digest('base64');
}

// ---- ISO 8601 with timezone offset ----
function utcString(): string {
  const d = new Date();
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const tz =
    sign +
    String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0') +
    String(Math.abs(offset) % 60).padStart(2, '0');
  const iso = d.toISOString(); // "2025-09-04T15:38:07.000Z"
  return iso.replace(/\.\d{3}Z$/, tz);
}

// ---- 讯飞返回的消息结构 ----
interface ASRMessage {
  msg_type?: string;
  res_type?: string;
  action?: string;
  code?: string;
  desc?: string;
  data?: string | ASRDataPayload;
  sid?: string;
}

interface ASRDataPayload {
  seg_id?: number;
  cn?: {
    st?: {
      rt?: Array<{
        ws: Array<{ cw: Array<{ w: string; wp?: string; lg?: string }> }>;
      }>;
      type: string;
    };
  };
  ls?: boolean;
}

export class XunfeiASR {
  private ws: WebSocket | null = null;
  private readonly config: ASRConfig;
  private readonly handler: ASREventHandler;
  private readonly uuid: string;

  constructor(config: ASRConfig, handler: ASREventHandler) {
    this.config = config;
    this.handler = handler;
    this.uuid = randomUUID();
  }

  /** 建立与讯飞 ASR 的 WebSocket 连接 */
  connect(): void {
    const { appId, apiKey, apiSecret } = this.config;
    const utc = utcString();
    const lang = 'en';
    const audioEncode = 'pcm_s16le';
    const sampleRate = '16000';

    // 签名参数（不含 signature 本身，按字母序排列）
    const params: Record<string, string> = {
      accessKeyId: apiKey,
      appId,
      audio_encode: audioEncode,
      lang,
      samplerate: sampleRate,
      utc,
      uuid: this.uuid,
    };

    const signature = generateSignature(params, apiSecret);
    const query = Object.entries({ ...params, signature })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const url = `${ASR_URL}?${query}`;
    console.log('🔊 讯飞 ASR 连接中:', url.slice(0, 150) + '...');

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('🔊 讯飞 ASR 已连接');
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg: ASRMessage = JSON.parse(raw.toString());
        const preview = JSON.stringify(msg).slice(0, 300);
        console.log('📩 讯飞消息:', preview);

        // 握手成功 / 心跳
        if (msg.action === 'started') {
          console.log('✅ 讯飞 ASR 握手成功');
          return;
        }

        // 错误帧
        if (msg.action === 'error' || (msg.code && msg.code !== '0')) {
          console.error('❌ 讯飞返回错误:', preview);
          return;
        }

        // 识别结果
        if (msg.msg_type === 'result' && msg.res_type === 'asr') {
          const data = msg.data as ASRDataPayload;
          const result = this.extractResult(data);
          if (result) {
            if (result.isFinal) {
              this.handler.onFinal(result.text);
            } else {
              this.handler.onPartial(result.text);
            }
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
      console.log(
        `🔇 讯飞 ASR 断开 (code: ${code}, reason: ${reason?.toString() || 'N/A'})`,
      );
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

  // ---- 解析讯飞返回的识别结果 ----
  private extractResult(data: ASRDataPayload): { text: string; isFinal: boolean } | null {
    const st = data?.cn?.st;
    if (!st) return null;

    const text =
      st.rt
        ?.flatMap((seg) => seg.ws.flatMap((w) => w.cw.map((c) => c.w)))
        .join('') || '';

    if (!text) return null;

    // type: "0" = 确定性结果（final）, "1" = 中间结果（partial）
    return { text, isFinal: st.type === '0' };
  }
}
