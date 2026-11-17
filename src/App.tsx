import { useState, type CSSProperties } from 'react';
import { BottomTabBar } from './components/BottomTabBar';
import { PlaceholderTab } from './components/PlaceholderTab';
import { SearchFlow } from './components/SearchFlow';
import { useSafeAreaInsets } from './hooks/useSafeAreaInsets';
import type { AppTabId } from './types/travelSearch';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>('search');
  const insets = useSafeAreaInsets();

  return (
    <div
      className="app-shell"
      style={
        {
          '--safe-top': `${insets.top}px`,
          '--safe-right': `${insets.right}px`,
          '--safe-bottom': `${insets.bottom}px`,
          '--safe-left': `${insets.left}px`,
        } as CSSProperties
      }
    >
      <main className="app-main" id="main-content">
        {activeTab === 'search' ? <SearchFlow /> : null}
        {activeTab === 'saved' ? (
          <PlaceholderTab
            title="저장한 여행"
            description="마음에 드는 여행지를 모아 두는 공간이에요."
          />
        ) : null}
        {activeTab === 'mypage' ? (
          <PlaceholderTab title="마이페이지" description="계정과 설정은 이후 단계에서 준비돼요." />
        ) : null}
      </main>

      <BottomTabBar activeTab={activeTab} onChange={setActiveTab} bottomInset={insets.bottom} />
    </div>
  );
}
