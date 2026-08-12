import React from 'react';
import type { Turn } from '../types.ts';
import { Icon } from './Icon.tsx';

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
  if (score >= 80) return 'score-good'; // 绿
  if (score >= 60) return 'score-ok'; // 黄
  return 'score-poor'; // 红
}

export function ChatView(props: Props) {
  return (
    <>
      {!props.hasConv && !props.isRecording && !props.captureError && (
        <div className="welcome-hero">
          <div className="sound-stage" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="welcome-kicker">SPEAKING SESSION · READY</span>
          <h2 className="welcome-title">今天，想练哪一种表达？</h2>
          <p className="welcome-copy">
            按下录音，用英语说出第一句话。小T 会听懂、回应，并把每一次进步留在这条语音轨道上。
          </p>
          {!props.wsReady && <p className="welcome-hint">正在建立连接...</p>}
        </div>
      )}
      {props.captureError && <p className="error-message">{props.captureError}</p>}

      {props.turns.map((t, i) => (
        <div key={i} className="turn-group">
          <div
            className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}${t.score !== undefined ? ` ${scoreLevel(t.score!)}` : ''}`}
          >
            <span className="bubble-label">
              {t.role === 'user' ? 'YOU · 你的表达' : 'COACH · 小T'}
            </span>
            {t.audio && props.onReplayTurn && (
              <button
                className={`replay-btn${props.replayIndex === i ? ' playing' : ''}`}
                onClick={() => props.onReplayTurn!(t.audio!, i)}
                aria-label={
                  props.replayIndex === i && !props.replayPaused ? '暂停语音' : '重播语音'
                }
              >
                <Icon
                  name={
                    props.replayIndex === i ? (props.replayPaused ? 'play' : 'pause') : 'volume'
                  }
                  size={16}
                />
              </button>
            )}
            {t.role === 'user' && props.onPlayTTS && t.text && (
              <button
                className="replay-btn tts-play-btn"
                onClick={() => props.onPlayTTS!(t.text)}
                aria-label="播放标准发音对比"
              >
                <Icon name="headphones" size={16} />
              </button>
            )}
            <p>{t.text}</p>
            {t.score !== undefined && (
              <div className="pronounce-bar">
                <span
                  className={`pronounce-score ${scoreLevel(t.score)}`}
                  title={`准确:${t.accuracy} 流利:${t.fluency} 完整:${t.integrity}`}
                >
                  SCORE {t.score}
                </span>
                {(t.weakPhones || []).length > 0 && (
                  <span className="pronounce-weak-tags">
                    {t.weakPhones!.map((p, j) => (
                      <span key={j} className="weak-phone-tag">
                        /{p}/
                      </span>
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
              <div className="correction-header">
                <Icon name="spark" size={14} /> 发音笔记
              </div>
              <p>{t.tips}</p>
              {t.tryAgain && <div className="try-again">TRY AGAIN · {t.tryAgain}</div>}
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
              <span className="bubble-label">COACH · 小T</span>
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
