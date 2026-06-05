// ===== 讯飞 在线语音合成 TTS v2 客户端 =====
// 在 LLM 回复完成后，将文本发送到讯飞 TTS，流式接收 PCM 音频帧
// 参考：https://www.xfyun.cn/doc/tts/online_tts/API.html

import WebSocket from 'ws';
import { createHmac } from 'crypto';

// ---- 配置 ----
export interface TTSConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
  /** 发音人，默认英文女声 */
  voiceName?: string;
  /** 语速 0-100，默认 50 */
  speed?: number;
}

// ---- 回调 ----
export interface TTSEventHandler {
  /** PCM 音频数据块（16kHz, 16bit, mono） */
  onAudio: (chunk: Buffer) => void;
  /** 合成完毕 */
  onDone: () => void;
  /** 异常 */
  onError: (error: Error) => void;
}

const TTS_HOST = 'tts-api.xfyun.cn';
const TTS_PATH = '/v2/tts';
const TTS_URL = `wss://${TTS_HOST}${TTS_PATH}`;

// ---- HMAC-SHA256 鉴权 ----
function buildAuthParams(apiKey: string, apiSecret: string): {
  authorization: string;
  date: string;
  host: string;
} {
  const date = new Date().toUTCString();
  const requestLine = `GET ${TTS_PATH} HTTP/1.1`;
  const signatureOrigin = `host: ${TTS_HOST}\ndate: ${date}\n${requestLine}`;

  const signature = createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64');

  const authorizationOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line", signature="${signature}"`;

  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  return { authorization, date, host: TTS_HOST };
}

export class XunfeiTTS {
  private readonly config: Required<TTSConfig>;
  private ws: WebSocket | null = null;

  constructor(config: TTSConfig) {
    this.config = {
      voiceName: config.voiceName || 'aisxiaoyaxi',
      speed: config.speed ?? 50,
      ...config,
    };
  }

  /** 合成文本 → 流式输出 PCM 音频 */
  synthesize(text: string, handler: TTSEventHandler): void {
    const { authorization, date, host } = buildAuthParams(
      this.config.apiKey,
      this.config.apiSecret,
    );

    const url =
      `${TTS_URL}?authorization=${encodeURIComponent(authorization)}` +
      `&host=${encodeURIComponent(host)}&date=${encodeURIComponent(date)}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      // 发送合成参数 + 文本
      const frame = JSON.stringify({
        common: { app_id: this.config.appId },
        business: {
          aue: 'raw',
          sfl: 1,
          auf: 'audio/L16;rate=16000',
          vcn: this.config.voiceName,
          tte: 'UTF8',
          speed: this.config.speed,
        },
        data: {
          status: 2,
          text: Buffer.from(text).toString('base64'),
        },
      });

      this.ws!.send(frame);
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.code !== 0) {
          handler.onError(new Error(`TTS error ${msg.code}: ${msg.message}`));
          return;
        }
        const audio = msg.data?.audio;
        if (audio) {
          handler.onAudio(Buffer.from(audio, 'base64'));
        }
        if (msg.data?.status === 2) {
          this.ws?.close();
          handler.onDone();
        }
      } catch {
        // 忽略解析失败
      }
    });

    this.ws.on('error', (err) => {
      handler.onError(new Error(err.message));
    });

    this.ws.on('close', () => {
      this.ws = null;
    });
  }

  /** 中断合成 */
  abort(): void {
    if (this.ws) {
      this.ws.close(1000, 'Aborted');
      this.ws = null;
    }
  }
}
