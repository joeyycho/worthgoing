import type { AppTabId } from '../types/travelSearch';

interface BottomTabBarProps {
  activeTab: AppTabId;
  onChange: (tab: AppTabId) => void;
  bottomInset: number;
}

const TABS: { id: AppTabId; label: string }[] = [
  { id: 'search', label: '여행지 찾기' },
  { id: 'saved', label: '저장한 여행' },
  { id: 'mypage', label: '마이페이지' },
];

export function BottomTabBar({ activeTab, onChange, bottomInset }: BottomTabBarProps) {
  return (
    <nav
      className="bottom-tab-bar"
      aria-label="주요 메뉴"
      style={{ paddingBottom: `max(8px, ${bottomInset}px)` }}
    >
      {TABS.map((tab) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-tab${selected ? ' is-active' : ''}`}
            aria-current={selected ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            <span className="bottom-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
