import React from 'react';
import { ReportAnalysis } from './ReportAnalysis.tsx';
import type { LLMAnalysis } from '@shared/types.ts';
import type { Session, TurnRow } from '../types.ts';

interface Props {
  sessions: Session[];
  selectedSession: string | null;
  sessionTurns: TurnRow[];
  historyLoading: boolean;
  histReportOpen: boolean;
  histReportLoading: boolean;
  histReport: LLMAnalysis | null;
  histReportError: string;
  sceneEmoji: Record<string, string>;
  modeEmoji: Record<string, string>;
  viewSession: (id: string) => void;
  deleteSelectedSession: () => void;
  deleteSessionFromList: (e: React.MouseEvent, id: string) => void;
  setSelectedSession: (id: string | null) => void;
  setSessionTurns: (turns: TurnRow[]) => void;
  setHistReportOpen: (v: boolean) => void;
  setHistReport: (r: LLMAnalysis | null) => void;
  setView: (v: 'chat' | 'history') => void;
  toggleHistReport: () => void;
}

export function HistoryView(props: Props) {
  const goBack = () => { props.setSelectedSession(null); props.setSessionTurns([]); props.setHistReportOpen(false); props.setHistReport(null); };

  if (props.historyLoading) {
    return <div className="history-panel"><p className="placeholder" style={{ marginTop: '20%' }}>加载中...</p></div>;
  }

  if (props.selectedSession) {
    return (
      <div className="history-panel">
        <div className="history-turns">
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={goBack} className="ctrl-btn">← 返回</button>
            <button onClick={props.toggleHistReport} className="ctrl-btn" disabled={props.histReportLoading}>
              {props.histReportOpen ? '💬 对话' : '📊 学习报告'}
            </button>
            <button onClick={props.deleteSelectedSession} className="ctrl-btn" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginLeft: 'auto' }}>🗑 删除</button>
          </div>
          {props.histReportOpen ? (
            <div className="report-panel">
              {props.histReportLoading && <p className="placeholder" style={{ marginTop: '20%' }}>加载报告中...</p>}
              {props.histReportError && <p className="error-message">{props.histReportError}</p>}
              {props.histReport && <ReportAnalysis analysis={props.histReport} />}
            </div>
          ) : (<>
            {props.sessionTurns.map((t) => (
              <div key={t.id} className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}`} style={{ maxWidth: '100%' }}>
                <div className="bubble-header">
                  <span className="bubble-label">{t.role === 'user' ? 'You' : '🤖 AI'}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{t.created_at}</span>
                </div>
                <p>{t.text}</p>
              </div>
            ))}
            {props.sessionTurns.length === 0 && <p className="placeholder" style={{ marginTop: '20%' }}>该会话暂无对话记录</p>}
          </>)}
        </div>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-list">
        <div className="history-header">
          <button onClick={() => { props.setView('chat'); props.setSelectedSession(null); }} className="ctrl-btn">← 返回</button>
          <h3>对话历史</h3>
        </div>
        {props.sessions.length === 0 ? (
          <p className="placeholder" style={{ marginTop: '20%' }}>暂无对话历史，开始一次对话吧</p>
        ) : (
          props.sessions.map((s) => (
            <div key={s.session_id} className="history-item" onClick={() => props.viewSession(s.session_id)}>
              <div className="history-item-top">
                <span className="history-scene">{props.sceneEmoji[s.scene] || '❓'} {s.scene}</span>
                <span className="history-mode">{props.modeEmoji[s.mode] || '❓'} {s.mode}</span>
                {s.has_report ? <span style={{ fontSize: '0.7rem' }} title="已有学习报告">📊</span> : null}
                <span className="history-date" style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.created_at.slice(0, 16).replace('T', ' ')}</span>
                <button onClick={(e) => props.deleteSessionFromList(e, s.session_id)} className="theme-btn" style={{ fontSize: '0.75rem', width: 24, height: 24 }} title="删除">🗑</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
