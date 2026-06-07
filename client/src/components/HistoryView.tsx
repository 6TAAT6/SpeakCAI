import React from 'react';
import { ReportAnalysis } from './ReportAnalysis.tsx';
import type { LLMAnalysis } from '@shared/types.ts';
import type { Session, TurnRow } from '../types.ts';

/** SQLite datetime('now') 返回 UTC 格式 "YYYY-MM-DD HH:MM:SS"，转为用户本地时间显示 */
function formatLocalTime(utcStr: string): string {
  const iso = utcStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return utcStr;
  return d.toLocaleString();
}

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
  batchMode: boolean;
  selectedIds: Set<string>;
  viewSession: (id: string) => void;
  deleteSelectedSession: () => void;
  deleteSessionFromList: (e: React.MouseEvent, id: string) => void;
  setSelectedSession: (id: string | null) => void;
  setSessionTurns: (turns: TurnRow[]) => void;
  setHistReportOpen: (v: boolean) => void;
  setHistReport: (r: LLMAnalysis | null) => void;
  setView: (v: 'chat' | 'history') => void;
  toggleHistReport: () => void;
  toggleBatchMode: () => void;
  toggleSelectId: (id: string) => void;
  selectAllIds: (ids: string[]) => void;
  batchDelete: () => void;
}

export function HistoryView(props: Props) {
  const goBack = () => { props.setSelectedSession(null); props.setSessionTurns([]); props.setHistReportOpen(false); props.setHistReport(null); };
  const selectedHasReport = props.sessions.find(s => s.session_id === props.selectedSession)?.has_report;

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
              {props.histReportOpen ? '💬 对话' : selectedHasReport ? '📊 学习报告' : '🧠 生成报告'}
            </button>
            <button onClick={props.deleteSelectedSession} className="ctrl-btn" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginLeft: 'auto' }}>🗑 删除</button>
          </div>
          {props.histReportOpen ? (
            <div className="report-panel">
              {props.histReportLoading && <p className="placeholder" style={{ marginTop: '20%' }}>📊 小T 正在整理报告...</p>}
              {props.histReportError && <p className="error-message">{props.histReportError}</p>}
              {props.histReport && <ReportAnalysis analysis={props.histReport} />}
            </div>
          ) : (<>
            {props.sessionTurns.map((t) => (
              <div key={t.id} className={`bubble ${t.role === 'user' ? 'user-bubble' : 'ai-bubble'}`} style={{ maxWidth: '100%' }}>
                <div className="bubble-header">
                  <span className="bubble-label">{t.role === 'user' ? 'You' : '🤖 小T'}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatLocalTime(t.created_at)}</span>
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
          <button onClick={() => { props.setView('chat'); props.setSelectedSession(null); if (props.batchMode) props.toggleBatchMode(); }} className="ctrl-btn">← 返回</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={props.toggleBatchMode} className={`ctrl-btn${props.batchMode ? ' active' : ''}`}>
              {props.batchMode ? '✕ 取消' : '☑ 批量'}
            </button>
          </div>
        </div>

        {props.batchMode && props.sessions.length > 0 && (
          <div className="batch-toolbar">
            <label className="batch-select-all">
              <input type="checkbox" checked={props.selectedIds.size === props.sessions.length && props.sessions.length > 0}
                onChange={() => props.selectAllIds(props.sessions.map(s => s.session_id))} />
              全选 ({props.selectedIds.size}/{props.sessions.length})
            </label>
            <button onClick={props.batchDelete} className="ctrl-btn" disabled={props.selectedIds.size === 0}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
              🗑 删除选中 ({props.selectedIds.size})
            </button>
          </div>
        )}

        {props.sessions.length === 0 ? (
          <p className="placeholder" style={{ marginTop: '20%' }}>暂无对话历史，开始一次对话吧</p>
        ) : (
          props.sessions.map((s) => (
            <div key={s.session_id} className={`history-item${props.batchMode && props.selectedIds.has(s.session_id) ? ' batch-selected' : ''}`} onClick={() => {
              if (props.batchMode) { props.toggleSelectId(s.session_id); } else { props.viewSession(s.session_id); }
            }}>
              <div className="history-item-top">
                {props.batchMode && (
                  <input type="checkbox" checked={props.selectedIds.has(s.session_id)}
                    onChange={() => props.toggleSelectId(s.session_id)}
                    onClick={(e) => e.stopPropagation()}
                    className="batch-checkbox" />
                )}
                <span className="history-scene">{props.sceneEmoji[s.scene] || '❓'} {s.scene}</span>
                <span className="history-mode">{props.modeEmoji[s.mode] || '❓'} {s.mode}</span>
                {s.has_report ? <span style={{ fontSize: '0.7rem' }} title="已有学习报告">📊</span> : null}
                <span className="history-date" style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatLocalTime(s.created_at)}</span>
                {!props.batchMode && (
                  <button onClick={(e) => props.deleteSessionFromList(e, s.session_id)} className="theme-btn" style={{ fontSize: '0.75rem', width: 24, height: 24 }} title="删除">🗑</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
