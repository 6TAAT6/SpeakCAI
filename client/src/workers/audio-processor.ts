// ===== AudioWorklet Processor — 音频采集 + 降采样到 16kHz =====
// 运行在独立音频渲染线程，每 256ms 输出一帧 16kHz PCM 数据
//
// 浏览器 AudioContext 通常以系统采样率运行（如 48kHz），
// 但讯飞 ASR 要求 16kHz。此处做降采样后输出。
//
// 此文件在 AudioWorkletGlobalScope 中执行，以下全局变量由浏览器提供：
//   sampleRate, currentTime, AudioWorkletProcessor, registerProcessor

/// <reference lib="webworker" />

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

declare const sampleRate: number;
declare const currentTime: number;

interface AudioFrameMessage {
  data: Float32Array;
  sampleRate: number;
  seq: number;
}

const TARGET_RATE = 16000;
const FRAME_MS = 256;
const OUTPUT_FRAME = Math.round(TARGET_RATE * (FRAME_MS / 1000)); // 4096

class AudioCaptureProcessor extends AudioWorkletProcessor {
  private readonly ratio: number; // systemRate / 16000
  private buf: Float32Array;
  private offset = 0;
  private seq = 0;

  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    // 缓冲足够输入样本以产出一帧输出 + 余量
    const inputFrameSamples = Math.ceil(sampleRate * (FRAME_MS / 1000));
    this.buf = new Float32Array(inputFrameSamples * 2);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    for (let i = 0; i < channelData.length; i++) {
      // 混音到单声道
      let sample = channelData[i];
      for (let ch = 1; ch < input.length; ch++) {
        sample += input[ch][i];
      }
      sample /= input.length;

      this.buf[this.offset++] = sample;

      // 累积够一帧 16kHz 输出时，降采样发送
      if (this.offset >= OUTPUT_FRAME * this.ratio) {
        const out = new Float32Array(OUTPUT_FRAME);
        for (let j = 0; j < OUTPUT_FRAME; j++) {
          // 最近邻降采样（48k→16k: 每 3 个取 1 个）
          out[j] = this.buf[Math.floor(j * this.ratio)] || 0;
        }

        this.port.postMessage({
          data: out,
          sampleRate: TARGET_RATE,
          seq: this.seq++,
        } satisfies AudioFrameMessage);

        // 滑动窗口：保留剩余未消费的样本
        const consumed = Math.floor(OUTPUT_FRAME * this.ratio);
        this.buf.copyWithin(0, consumed, this.offset);
        this.offset -= consumed;
      }
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
