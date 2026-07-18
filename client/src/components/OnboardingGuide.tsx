import { useState, useCallback } from 'react';

const ONBOARDING_KEY = 'speakcai_onboarding_done';

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === '1';
}

export function markOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_KEY, '1');
}

const STEPS = [
  {
    emoji: '👋',
    title: '欢迎来到 SpeakCAI',
    desc: '我是你的 AI 英语口语教练小T。\n我会陪你练习英语口语，实时评测发音，帮你越说越好！',
  },
  {
    emoji: '🎯',
    title: '选择练习场景',
    desc: '顶栏可以切换 7 种对话场景：日常、面试、点餐、会议、旅游、购物、酒店。\n每种场景我会扮演不同角色陪你练。',
  },
  {
    emoji: '🎓',
    title: '两种纠错模式',
    desc: '🌊 沉浸模式 — 课后统一纠正，专注流畅对话\n👨‍🏫 教练模式 — 实时纠错 + 追问重说，严师出高徒\n\n建议新手先用教练模式，适应后切换到沉浸模式。',
  },
  {
    emoji: '🎤',
    title: '准备好了吗？',
    desc: '点击底部 🎤 按钮开始对话。\n我会根据你的发音水平自动调整难度和教学方式。\n放开说，别怕犯错！',
  },
];

interface Props {
  onComplete: () => void;
}

export function OnboardingGuide({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = useCallback(() => {
    if (isLast) {
      markOnboardingDone();
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLast, onComplete]);

  const skip = useCallback(() => {
    markOnboardingDone();
    onComplete();
  }, [onComplete]);

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-emoji">{current.emoji}</div>
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-desc">
          {current.desc.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              {i < current.desc.split('\n').length - 1 && <br />}
            </span>
          ))}
        </p>

        {/* 步骤指示器 */}
        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot${i === step ? ' active' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          <button className="onboarding-btn secondary" onClick={skip}>
            跳过引导
          </button>
          <button className="onboarding-btn primary" onClick={next}>
            {isLast ? '开始练习 🚀' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
