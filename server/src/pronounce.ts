// ===== 讯飞 语音评测（流式版）ISE 客户端 =====
// 参考：https://www.xfyun.cn/doc/Ise/IseAPI.html

import WebSocket from 'ws';
import { createHmac } from 'crypto';

export interface ISEConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

export interface ISEResult {
  totalScore: number;
  accuracyScore: number;
  fluencyScore: number;
  integrityScore: number;
  weakPhones: string[];
}

export interface ISEHandler {
  onResult: (result: ISEResult) => void;
  onError: (error: Error) => void;
}

const HOST = 'ise-api.xfyun.cn';
const PATH = '/v2/open-ise';
const FRAME_SIZE = 1280; // 40ms × 16kHz × 2bytes

function authUrl(apiKey: string, apiSecret: string): string {
  const date = new Date().toUTCString();
  const reqLine = `GET ${PATH} HTTP/1.1`;
  const signOrigin = `host: ${HOST}\ndate: ${date}\n${reqLine}`;
  const sig = createHmac('sha256', apiSecret).update(signOrigin).digest('base64');
  const authOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line", signature="${sig}"`;
  const authorization = Buffer.from(authOrigin).toString('base64');
  return (
    `wss://${HOST}${PATH}?` +
    `authorization=${encodeURIComponent(authorization)}` +
    `&host=${encodeURIComponent(HOST)}` +
    `&date=${encodeURIComponent(date)}`
  );
}

export class XunfeiISE {
  private ws: WebSocket | null = null;

  constructor(private config: ISEConfig) {}

  evaluate(text: string, audio: Buffer, handler: ISEHandler): void {
    const url = authUrl(this.config.apiKey, this.config.apiSecret);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      // 阶段1 — 发送评测参数 (cmd=ssb, status=0)
      this.ws!.send(JSON.stringify({
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
      }));

      // 阶段2 — 分片发送音频 (cmd=auw)
      const totalChunks = Math.ceil(audio.length / FRAME_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = audio.subarray(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);
        const isFirst = i === 0;
        const isLast = i === totalChunks - 1;
        const aus = isFirst ? 1 : isLast ? 4 : 2;
        this.ws!.send(JSON.stringify({
          business: {
            cmd: 'auw',
            aue: 'raw',
            auf: 'audio/L16;rate=16000',
          },
          data: {
            status: isLast ? 2 : 1,
            data: chunk.toString('base64'),
            aus,
          },
        }));
      }
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.code !== 0) {
          handler.onError(new Error(`ISE ${msg.code}: ${msg.message || ''}`));
          return;
        }
        const d = msg.data;
        if (!d) return;
        handler.onResult({
          totalScore: Math.round(d.total_score ?? 0),
          accuracyScore: Math.round(d.accuracy_score ?? 0),
          fluencyScore: Math.round(d.fluency_score ?? 0),
          integrityScore: Math.round(d.integrity_score ?? 0),
          weakPhones: extractWeakPhones(d.phone_score),
        });
      } catch { /* skip */ }
    });

    this.ws.on('error', (err) => {
      console.error('❌ ISE 连接错误:', err.message);
      handler.onError(new Error(err.message));
    });
    this.ws.on('close', (code) => {
      console.log(`🔇 ISE 断开 code=${code}`);
      this.ws = null;
    });
  }

  abort(): void {
    this.ws?.close(1000, 'Aborted');
    this.ws = null;
  }
}

function extractWeakPhones(phoneScore: unknown): string[] {
  if (!Array.isArray(phoneScore)) return [];
  const phones: string[] = [];
  for (const p of phoneScore) {
    if (p?.deducted_score > 0 || p?.score < 70) {
      phones.push(p.phone || p.phn || '');
    }
  }
  return phones.filter(Boolean);
}
