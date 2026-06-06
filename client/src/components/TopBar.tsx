import type { Scene, CorrectionMode } from '@shared/types.ts';
import type { FontSize, Theme } from '../types.ts';

interface Props {
  openHistory: () => void;
  showFontMenu: boolean;
  setShowFontMenu: (v: boolean) => void;
  fontSize: FontSize;
  pickFontSize: (f: FontSize) => void;
  cycleTheme: () => void;
  theme: Theme;
  scene: Scene;
  correctionMode: CorrectionMode;
  updateConfig: (s: Scene, m: CorrectionMode) => void;
  statusEmoji: string;
  statusText: string;
  statusColor: string;
}

export function TopBar(props: Props) {
  return (
    <header className="top-bar">
      <span className="brand">SpeakCAI</span>
      <div className="config-selectors">
        <button onClick={props.openHistory} className="theme-btn" title="历史记录">
          📋
        </button>
        <div className="font-size-wrap">
          <button onClick={(e) => { e.stopPropagation(); props.setShowFontMenu(!props.showFontMenu); }} className="theme-btn" title={`字体: ${props.fontSize === 'sm' ? '小' : props.fontSize === 'md' ? '中' : '大'}`}>
            Aa
          </button>
          {props.showFontMenu && (
            <div className="font-size-menu">
              {(Object.entries({ sm: '小', md: '中', lg: '大' }) as [FontSize, string][]).map(([f, label]) => (
                <button key={f} onClick={() => props.pickFontSize(f)} className={`font-size-opt ${props.fontSize === f ? 'active' : ''}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={props.cycleTheme} className="theme-btn" title={`主题: ${props.theme}`}>
          {props.theme === 'auto' ? '🌓' : props.theme === 'dark' ? '🌙' : '☀️'}
        </button>
        <select value={props.scene} onChange={(e) => props.updateConfig(e.target.value as Scene, props.correctionMode)} className="mini-select">
          <option value="daily">💬 日常</option>
          <option value="interview">💼 面试</option>
          <option value="ordering">🍽️ 点餐</option>
          <option value="meeting">📊 会议</option>
          <option value="travel">✈️ 旅游</option>
          <option value="shopping">🛍️ 购物</option>
          <option value="hotel">🏨 酒店</option>
        </select>
        <select value={props.correctionMode} onChange={(e) => props.updateConfig(props.scene, e.target.value as CorrectionMode)} className="mini-select">
          <option value="immersive">🌊 沉浸</option>
          <option value="coach">🎯 教练</option>
        </select>
      </div>
      <span className="status-badge" style={{ color: props.statusColor }}>
        {props.statusEmoji} {props.statusText}
      </span>
    </header>
  );
}
