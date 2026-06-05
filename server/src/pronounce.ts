// ===== 讯飞 语音评测（流式版）ISE 客户端 =====
// 接收 PCM 音频 + 参考文本，返回多维度发音评分
// 参考：https://www.xfyun.cn/doc/voiceservice/ise/API.html

import WebSocket from 'ws';
import { createHmac } from 'crypto';

export interface ISEConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

export interface ISEResult {
  totalScore: number;      // 总分 0-100
  accuracyScore: number;   // 准确度
  fluencyScore: number;    // 流畅度
  integrityScore: number;  // 完整度
  weakPhones: string[];    // 薄弱音素
}

export interface ISEHandler {
  onResult: (result: ISEResult) => void;
  onError: (error: Error) => void;
}

const ISE_HOST = 'ise-api.xfyun.cn';
const ISE_PATH = '/v2/open-ise';

function buildAuthUrl(apiKey: string, apiSecret: string): string {
  const date = new Date().toUTCString();
  const requestLine = `GET ${ISE_PATH} HTTP/1.1`;
  const signOrigin = `host: ${ISE_HOST}\ndate: ${date}\n${requestLine}`;
  const signature = createHmac('sha256', apiSecret).update(signOrigin).digest('base64');
  const authOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authOrigin).toString('base64');
  return (
    `wss://${ISE_HOST}${ISE_PATH}?` +
    `authorization=${encodeURIComponent(authorization)}` +
    `&host=${encodeURIComponent(ISE_HOST)}` +
    `&date=${encodeURIComponent(date)}`
  );
}

export class XunfeiISE {
  private ws: WebSocket | null = null;

  constructor(private config: ISEConfig) {}

  /** 评测：发送文本 + PCM 音频，回调返回评分 */
  evaluate(
    text: string,
    audio: Buffer,
    handler: ISEHandler,
  ): void {
    const url = buildAuthUrl(this.config.apiKey, this.config.apiSecret);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      // 第一步：发送评测参数
      const paramFrame = JSON.stringify({
        common: { app_id: this.config.appId },
        business: {
          sub: 'ise',
          ent: 'en_vip',
          category: 'read_sentence',
          cmd: 'ssb',
          text: '﻿' + text,
          aue: 'raw',
          auf: 'audio/L16;rate=16000',
          rst: 'entirety',
          ise_unite: '1',
          extra_ability: 'multi_dimension',
        },
        data: { status: 0 },
      });
      this.ws!.send(paramFrame);

      // 第二步：发送音频数据
      // 一次发送全部（short audio），aus=4 表示最后一帧
      const audioFrame = JSON.stringify({
        business: {
          cmd: 'auw',
          aue: 'raw',
          auf: 'audio/L16;rate=16000',
        },
        data: {
          status: 1,
          data: audio.toString('base64'),
          aus: 4,
        },
      });
      this.ws!.send(audioFrame);

      // 通知评测结束
      this.ws!.send(JSON.stringify({
        business: { cmd: 'auw', aue: 'raw', auf: 'audio/L16;rate=16000' },
        data: { status: 2 },
      }));
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.code !== 0) {
          handler.onError(new Error(`ISE error ${msg.code}: ${msg.message || ''}`));
          return;
        }
        const data = msg.data;
        if (!data) return;

        // 提取评分维度
        const total = data?.total_score ?? 0;
        const accuracy = data?.accuracy_score ?? 0;
        const fluency = data?.fluency_score ?? 0;
        const integrity = data?.integrity_score ?? 0;

        // 提取薄弱音素
        const phones: string[] = [];
        const phoneList = data?.phone_score;
        if (Array.isArray(phoneList)) {
          for (const p of phoneList) {
            if (p?.deducted_score > 0 || (p?.score !== undefined && p?.score < 70)) {
              phones.push(p.phone || p.phn || '');
            }
          }
        }

        handler.onResult({
          totalScore: Math.round(total),
          accuracyScore: Math.round(accuracy),
          fluencyScore: Math.round(fluency),
          integrityScore: Math.round(integrity),
          weakPhones: phones.filter(Boolean),
        });
      } catch {
        // skip unparseable frames
      }
    });

    this.ws.on('error', (err) => {
      handler.onError(new Error(err.message));
    });

    this.ws.on('close', () => {
      this.ws = null;
    });
  }

  abort(): void {
    if (this.ws) {
      this.ws.close(1000, 'Aborted');
      this.ws = null;
    }
  }
}
