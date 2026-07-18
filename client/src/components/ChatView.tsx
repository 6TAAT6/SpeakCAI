import React from 'react';
import type { Turn } from '../types.ts';

interface Props {
  turns: Turn[];
  partialText: string;
  aiCurrent: string;
  aiStreaming: boolean;
  hasConv: boolean;
  isRecording: boolean;
  wsReady: boolean;
  captureError: string | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onReplayTurn?: (audio: string, index: number) => void;
  replayIndex?: number | null;
  replayPaused?: boolean;
  onPlayTTS?: (text: string) => void;
}

/** 根据总分返回整句着色等级 */
function scoreLevel(score: number): string {
  if (score >= 80) return 'score-good';    // 绿
  if (score >= 60) return 'score-ok';     // 黄
  return 'score-poor';                     // 红
}

export function ChatView(props: Props) {
  return (
    <>
      {!props.hasConv && !props.isRecording && !props.captureError && (
        <div className="welcome-hero">
          <div className="welcome-avatar">(¯▿¯)</div>
          <h2 className="welcome-title">Hi! 我是小T</h2>
          {!props.wsReady && <p className="welcome-hint">正在建立连接...</p>}
        </div>
      )}
      {props.captureError && <p className="error-message">{props.captureError}</p>}

      {props.turns.map((t, i) => (
        <div key={i} className="turn-group">
          <div className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}${t.score !== undefined ? ` ${scoreLevel(t.score!)}` : ''}`}>
            <span className="bubble-label">{t.role === 'user' ? 'YOU' : '🤖 小T'}</span>
            {t.audio && props.onReplayTurn && (
              <button
                className={`replay-btn${props.replayIndex === i ? ' playing' : ''}`}
                onClick={() => props.onReplayTurn!(t.audio!, i)}
                title={props.replayIndex === i && !props.replayPaused ? '暂停' : '重播语音'}
              >
                {props.replayIndex === i ? (props.replayPaused ? '▶' : '⏸') : '🔊'}
              </button>
            )}
            {t.role === 'user' && props.onPlayTTS && t.text && (
              <button
                className="replay-btn tts-play-btn"
                onClick={() => props.onPlayTTS!(t.text)}
                title="播放标准发音对比"
              >
                🎧
              </button>
            )}
            <p>{t.text}</p>
            {t.score !== undefined && (
              <div className="pronounce-bar">
                <span className={`pronounce-score ${scoreLevel(t.score)}`} title={`准确:${t.accuracy} 流利:${t.fluency} 完整:${t.integrity}`}>
                  🎯 {t.score}分
                </span>
                {(t.weakPhones || []).length > 0 && (
                  <span className="pronounce-weak-tags">
                    {t.weakPhones!.map((p, j) => (
                      <span key={j} className="weak-phone-tag">/{p}/</span>
                    ))}
                    <span className="weak-phone-hint">需加强</span>
                  </span>
                )}
              </div>
            )}
            {t.translation && <p className="ai-translation">{t.translation}</p>}
          </div>
          {t.tips && (
            <div className="correction-card">
              <div className="correction-header">💡 Tips</div>
              <p>{t.tips}</p>
              {t.tryAgain && <div className="try-again">🔁 {t.tryAgain}</div>}
            </div>
          )}
        </div>
      ))}

      {props.partialText && (
        <div className="turn-group">
          <div className="bubble user-bubble partial">
            <span className="bubble-label">YOU</span>
            <p>{props.partialText}</p>
          </div>
        </div>
      )}

      {(props.aiCurrent || props.aiStreaming) && (
        <div className="turn-group">
          <div className="bubble ai-bubble">
            <div className="bubble-header">
              <span className="bubble-label">🤖 小T</span>
              {props.aiStreaming && <span className="streaming-dot" />}
            </div>
            <p>{props.aiCurrent || '...'}</p>
          </div>
        </div>
      )}

      <div ref={props.chatEndRef} />
    </>
  );
}
