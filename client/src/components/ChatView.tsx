import React from 'react';
import type { Turn } from '../types.ts';
import { scoreWords, scoreColorClass } from '../utils/phonemes.ts';

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

/** 将文本按单词拆分为高亮片段 */
function HighlightedText({ text, phoneScores }: { text: string; phoneScores?: Array<{ phoneme: string; score: number }> }) {
  if (!phoneScores || phoneScores.length === 0) {
    return <>{text}</>;
  }

  const words = scoreWords(text, phoneScores);

  return (
    <>
      {words.map((w, i) => {
        const cls = scoreColorClass(w.score);
        if (cls) {
          return (
            <span
              key={i}
              className={`hl-word ${cls}`}
              title={w.weakPhonemes.length > 0
                ? `弱音素: ${w.weakPhonemes.map(p => `/${p}/`).join(', ')} (${w.score}分)`
                : `${w.score}分`}
            >
              {w.word}
            </span>
          );
        }
        return <span key={i}>{w.word}</span>;
      })}
    </>
  );
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
          <div className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
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
            <p>
              {t.role === 'user'
                ? <HighlightedText text={t.text} phoneScores={t.phoneScores} />
                : t.text
              }
            </p>
            {t.translation && <p className="ai-translation">{t.translation}</p>}
          </div>
          {t.score !== undefined && (
            <span className="pronounce-score" title={`准确:${t.accuracy} 流利:${t.fluency}`}>
              🎯 {t.score}分
            </span>
          )}
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
