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

interface PhoneScore {
  phone?: string;
  phn?: string;
  phoneme?: string;
  score?: number;
  deducted_score?: number;
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
          // U+FEFF BOM 前缀 — 讯飞 ISE API 需要此标记来识别文本编码
          text: '﻿' + text,
          tte: 'utf-8',
          rstcd: 'utf8',
          ttp_skip: true,
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
          common: { app_id: this.config.appId },
          business: {
            cmd: 'auw',
            aue: 'raw',
            auf: 'audio/L16;rate=16000',
            aus,
          },
          data: {
            status: isLast ? 2 : 1,
            data: chunk.toString('base64'),
          },
        }));
      }
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.code !== 0) {
          console.error(`❌ ISE 错误码 ${msg.code}: ${msg.message || ''}`);
          handler.onError(new Error(`ISE ${msg.code}: ${msg.message || ''}`));
          return;
        }
        if (msg.data?.status !== 2) return; // status==2 才是最终结果

        const decoded = Buffer.from(msg.data.data, 'base64').toString('utf-8');

        if (decoded.startsWith('<?xml')) {
          // XML 格式 — 分数在 <read_chapter> 标签的属性里
          const getAttr = (attr: string) => {
            const m = decoded.match(new RegExp(`${attr}="([^"]*)"`));
            return m ? parseFloat(m[1]) : 0;
          };
          const scores = {
            total_score: getAttr('total_score'),
            accuracy_score: getAttr('accuracy_score'),
            fluency_score: getAttr('fluency_score'),
            integrity_score: getAttr('integrity_score'),
          };
          // 提取 phone 标签属性: <phone phoneme="..." score="..." deducted_score="..."/>
          const phones: Array<{ phone: string; score: number; deducted_score: number }> = [];
          const phoneRe = /<phone\s+([^>]*?)\s*\/?>/g;
          let m: RegExpExecArray | null;
          while ((m = phoneRe.exec(decoded)) !== null) {
            const attrs = m[1];
            const ph = (attrs.match(/phoneme="([^"]*)"/)?.[1] || attrs.match(/phn="([^"]*)"/)?.[1] || '');
            const sc = parseFloat(attrs.match(/score="([^"]*)"/)?.[1] || '0');
            const dd = parseFloat(attrs.match(/deducted_score="([^"]*)"/)?.[1] || '0');
            if (ph) phones.push({ phone: ph, score: sc, deducted_score: dd });
          }

          console.log('📊 ISE scores:', scores, 'phones:', phones.length);
          handler.onResult({
            totalScore: Math.round(scores.total_score),
            accuracyScore: Math.round(scores.accuracy_score),
            fluencyScore: Math.round(scores.fluency_score),
            integrityScore: Math.round(scores.integrity_score),
            weakPhones: extractWeakPhones(phones),
          });
        } else {
          // JSON 格式
          const inner = JSON.parse(decoded);
          const phoneScores: PhoneScore[] = Array.isArray(inner.phone_score) ? inner.phone_score : [];
          handler.onResult({
            totalScore: Math.round(inner.total_score ?? 0),
            accuracyScore: Math.round(inner.accuracy_score ?? 0),
            fluencyScore: Math.round(inner.fluency_score ?? 0),
            integrityScore: Math.round(inner.integrity_score ?? 0),
            weakPhones: extractWeakPhones(phoneScores),
          });
        }
      } catch (e) {
        console.error('❌ ISE 消息解析失败:', e);
      }
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

function extractWeakPhones(phoneScores: PhoneScore[]): string[] {
  const phones: string[] = [];
  for (const p of phoneScores) {
    const name = p.phone || p.phn || p.phoneme || '';
    if (name && ((p.deducted_score ?? 0) > 0 || (p.score ?? 100) < 70)) {
      phones.push(name);
    }
  }
  return phones;
}
