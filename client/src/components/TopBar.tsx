import { useState, useEffect } from 'react';
import type { Scene, CorrectionMode } from '@shared/types.ts';
import type { FontSize, Theme } from '../types.ts';
import { Icon } from './Icon.tsx';

const themeLabels: Record<Theme, string> = { auto: '自动', dark: '深色', light: '浅色' };
const fontSizeLabels: Record<FontSize, string> = { sm: '小', md: '中', lg: '大' };

const scenes: { key: Scene; code: string; label: string }[] = [
  { key: 'daily', code: 'DAY', label: '日常' },
  { key: 'interview', code: 'JOB', label: '面试' },
  { key: 'ordering', code: 'EAT', label: '点餐' },
  { key: 'meeting', code: 'MTG', label: '会议' },
  { key: 'travel', code: 'TRP', label: '旅游' },
  { key: 'shopping', code: 'BUY', label: '购物' },
  { key: 'hotel', code: 'HTL', label: '酒店' },
];

const modes: { key: CorrectionMode; code: string; label: string }[] = [
  { key: 'coach', code: 'COACH', label: '教练' },
  { key: 'immersive', code: 'FLOW', label: '沉浸' },
];

interface Props {
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  fontSize: FontSize;
  pickFontSize: (f: FontSize) => void;
  theme: Theme;
  pickTheme: (t: Theme) => void;
  scene: Scene;
  correctionMode: CorrectionMode;
  updateConfig: (s: Scene, m: CorrectionMode) => void;
  statusEmoji: string;
  statusText: string;
  statusColor: string;
}

export function TopBar(props: Props) {
  const [showSceneMenu, setShowSceneMenu] = useState(false);

  const currentScene = scenes.find((s) => s.key === props.scene);
  const currentMode = modes.find((m) => m.key === props.correctionMode);

  // 点击外部关闭场景面板
  useEffect(() => {
    if (!showSceneMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.scene-wrap')) setShowSceneMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showSceneMenu]);

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>
            Speak<span>CAI</span>
          </span>
        </span>
      </div>

      <div className="top-bar-center">
        <div className="config-selectors">
          <div className="scene-wrap">
            <button
              aria-expanded={showSceneMenu}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setShowSceneMenu(!showSceneMenu);
              }}
              className="scene-trigger"
            >
              <span className="selector-code">{currentScene?.code}</span>
              {currentScene?.label}
              <span className="selector-divider" />
              {currentMode?.label}
              <Icon name="chevron" size={16} />
            </button>
            {showSceneMenu && (
              <div className="scene-panel">
                <span className="scene-section-label">场景</span>
                <div className="scene-section">
                  {scenes.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => props.updateConfig(s.key, props.correctionMode)}
                      className={`scene-opt ${props.scene === s.key ? 'active' : ''}`}
                    >
                      <span className="option-code">{s.code}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="scene-divider" />
                <span className="scene-section-label">模式</span>
                <div className="scene-section">
                  {modes.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => props.updateConfig(props.scene, m.key)}
                      className={`scene-opt ${props.correctionMode === m.key ? 'active' : ''}`}
                    >
                      <span className="option-code">{m.code}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="top-bar-right">
        <div className="settings-wrap">
          <button
            aria-label="打开显示设置"
            aria-expanded={props.showSettings}
            onClick={(e) => {
              e.stopPropagation();
              props.setShowSettings(!props.showSettings);
            }}
            className="settings-btn"
          >
            <Icon name="settings" /> <span>设置</span>
          </button>
          {props.showSettings && (
            <div className="settings-panel">
              <div className="settings-section">
                <span className="settings-label">字体大小</span>
                <div className="settings-options">
                  {(Object.entries(fontSizeLabels) as [FontSize, string][]).map(([f, label]) => (
                    <button
                      key={f}
                      onClick={() => props.pickFontSize(f)}
                      className={`settings-opt ${props.fontSize === f ? 'active' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-section">
                <span className="settings-label">主题模式</span>
                <div className="settings-options">
                  {(Object.keys(themeLabels) as Theme[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => props.pickTheme(t)}
                      className={`settings-opt ${props.theme === t ? 'active' : ''}`}
                    >
                      {themeLabels[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <span
          className="status-badge"
          style={{ color: props.statusColor }}
          title={props.statusText}
          aria-label={props.statusText}
        >
          <span className="status-dot" />
        </span>
      </div>
    </header>
  );
}
