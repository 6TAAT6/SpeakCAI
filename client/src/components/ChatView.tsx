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
            <p>{t.text}</p>
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
