import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { BottomTabBar } from './components/BottomTabBar';
import { PlaceholderTab } from './components/PlaceholderTab';
import { SavedTripsScreen } from './components/SavedTripsScreen';
import { SearchFlow } from './components/SearchFlow';
import { SharedTripScreen } from './components/SharedTripScreen';
import { useSafeAreaInsets } from './hooks/useSafeAreaInsets';
import { resolveDeepLinkTarget } from './services/deepLink';
import type { AppTabId } from './types/travelSearch';
import type { TripSnapshot } from './types/tripStore';
import './App.css';

interface OpenShare {
  shareId: string;
  snapshot: TripSnapshot | null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>('search');
  const [openShare, setOpenShare] = useState<OpenShare | null>(null);
  const insets = useSafeAreaInsets();

  const ingestDeepLink = useCallback(async () => {
    const target = await resolveDeepLinkTarget();
    if (target?.kind === 'share') {
      setOpenShare({ shareId: target.shareId, snapshot: target.snapshot });
    }
  }, []);

  useEffect(() => {
    void ingestDeepLink();

    const onHashChange = () => {
      void ingestDeepLink();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [ingestDeepLink]);

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
        {openShare ? (
          <SharedTripScreen
            shareId={openShare.shareId}
            snapshot={openShare.snapshot}
            onClose={() => setOpenShare(null)}
          />
        ) : null}

        {!openShare && activeTab === 'search' ? <SearchFlow /> : null}
        {!openShare && activeTab === 'saved' ? <SavedTripsScreen /> : null}
        {!openShare && activeTab === 'mypage' ? (
          <PlaceholderTab title="마이페이지" description="계정과 설정은 이후 단계에서 준비돼요." />
        ) : null}
      </main>

      {!openShare ? (
        <BottomTabBar activeTab={activeTab} onChange={setActiveTab} bottomInset={insets.bottom} />
      ) : null}
    </div>
  );
}
