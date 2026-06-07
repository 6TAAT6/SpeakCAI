/**
 * 安全的二进制 ↔ base64 转换工具
 *
 * 不可用 String.fromCharCode(...largeArray) 做 spread，V8 函数参数上限约
 * 65534 个，16kHz 16bit PCM 音频超过 ~2 秒就会触发 RangeError 导致白屏。
 * 本模块使用分片 + apply 的方式处理任意大小的二进制数据。
 */

/** 单次拼接安全上限，远低于 V8 参数限制 */
const CHUNK = 8192;

/**
 * Uint8Array → base64 字符串
 * 适用场景：合并 TTS 音频块后缓存到 React state 供重播使用
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * base64 字符串 → Uint8Array
 * 适用场景：解码服务端发来的单个 TTS chunk / 重播缓存的完整音频
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
