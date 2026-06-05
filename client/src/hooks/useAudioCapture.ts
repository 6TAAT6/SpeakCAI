// ===== useAudioCapture — 麦克风录音 Hook =====
// 管理 AudioContext 生命周期、加载 AudioWorklet、将 PCM 帧回调给调用方

import { useRef, useState, useCallback, useEffect } from 'react';

interface AudioFrame {
  /** Int16 PCM 数据 */
  data: Int16Array;
  /** 音频采样率 (Hz) */
  sampleRate: number;
  /** 帧序号，单调递增 */
  seq: number;
}

interface UseAudioCaptureOptions {
  /** 每 256ms 触发一次，携带 Int16 PCM 音频帧 */
  onAudioFrame: (frame: AudioFrame) => void;
}

interface UseAudioCaptureReturn {
  /** 开始录音（需用户手势触发以满足浏览器自动播放策略） */
  start: () => Promise<void>;
  /** 停止录音 */
  stop: () => void;
  /** 是否正在录音 */
  isRecording: boolean;
  /** 最近一次错误信息，无错误时为 null */
  error: string | null;
}

/** Float32 [-1.0, 1.0] → Int16 [-32768, 32767] */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

export function useAudioCapture({ onAudioFrame }: UseAudioCaptureOptions): UseAudioCaptureReturn {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const moduleLoadedRef = useRef(false);
  const startingRef = useRef(false); // 防重入：start() 执行中标记
  const onAudioFrameRef = useRef(onAudioFrame);
  onAudioFrameRef.current = onAudioFrame;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 断开所有音频节点、释放麦克风、暂停 AudioContext */
  const teardown = useCallback(() => {
    // 断开 worklet 消息监听
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    // 断开音源节点
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    // 释放麦克风
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // 暂停上下文（不 close，保留已加载的 worklet 模块以便下次复用）
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.suspend();
    }
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    // 防重入：双击录音按钮时忽略第二次调用
    if (startingRef.current || isRecording) return;
    startingRef.current = true;
    setError(null);

    try {
      // ---- 1. 创建/恢复 AudioContext ----
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const audioCtx = audioCtxRef.current;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // ---- 2. 加载 AudioWorklet 模块（整个 AudioContext 生命周期仅一次）----
      if (!moduleLoadedRef.current) {
        // Vite 会在构建时解析此 URL，生成正确的产物路径
        const processorUrl = new URL('../workers/audio-processor.ts', import.meta.url);
        await audioCtx.audioWorklet.addModule(processorUrl.href);
        moduleLoadedRef.current = true;
      }

      // ---- 3. 获取麦克风 ----
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // ---- 4. 创建音频管道：麦克风 → SourceNode → WorkletNode（仅采集，不播放）----
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const workletNode = new AudioWorkletNode(audioCtx, 'audio-capture-processor');
      workletNodeRef.current = workletNode;

      // ---- 5. 接收 AudioWorklet 的帧消息，转换后回调 ----
      workletNode.port.onmessage = (
        event: MessageEvent<{ data: Float32Array; sampleRate: number; seq: number }>,
      ) => {
        const { data, sampleRate, seq } = event.data;
        const int16 = float32ToInt16(data);
        onAudioFrameRef.current({ data: int16, sampleRate, seq });
      };

      source.connect(workletNode);
      setIsRecording(true);
      startingRef.current = false;
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风'
          : `音频采集失败: ${err instanceof Error ? err.message : String(err)}`;
      setError(message);
      teardown();
      startingRef.current = false;
    }
  }, [teardown, isRecording]);

  const stop = useCallback(() => {
    teardown();
  }, [teardown]);

  // 组件卸载时彻底清理
  useEffect(() => {
    return () => {
      teardown();
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      moduleLoadedRef.current = false;
    };
  }, [teardown]);

  return { start, stop, isRecording, error };
}
