// ===== AudioWorklet Processor — 音频采集工作线程 =====
// 运行在独立音频渲染线程，每 256ms 将累积的 PCM 数据发送回主线程
//
// 此文件在 AudioWorkletGlobalScope 中执行，以下全局变量由浏览器提供：
//   sampleRate, currentTime, AudioWorkletProcessor, registerProcessor

/// <reference lib="webworker" />

// AudioWorkletGlobalScope 专属全局类型（标准 TS lib 尚未收录）
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

class AudioCaptureProcessor extends AudioWorkletProcessor {
  private accumulated: Float32Array;
  private offset = 0;
  private seq = 0;
  private readonly frameSize: number;

  constructor() {
    super();
    // 256ms 对应的采样点数 (如 16kHz → 4096, 48kHz → 12288)
    this.frameSize = Math.round(sampleRate * 0.256);
    this.accumulated = new Float32Array(this.frameSize);
  }

  process(inputs: Float32Array[][]): boolean {
    const channelData = inputs[0]?.[0];
    if (!channelData) return true;

    for (let i = 0; i < channelData.length; i++) {
      this.accumulated[this.offset++] = channelData[i];

      if (this.offset >= this.frameSize) {
        // 复制一份发送（避免后续写入覆盖）
        const frame = new Float32Array(this.accumulated);
        this.port.postMessage({
          data: frame,
          sampleRate,
          seq: this.seq++,
        } satisfies AudioFrameMessage);
        this.offset = 0;
      }
    }

    return true; // 保持处理器存活
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
