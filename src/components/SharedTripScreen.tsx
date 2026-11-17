import { clearShareHash } from '../services/deepLink';
import type { TripSnapshot } from '../types/tripStore';
import { DestinationDetailScreen } from './DestinationDetailScreen';

interface SharedTripScreenProps {
  shareId: string;
  snapshot: TripSnapshot | null;
  onClose: () => void;
}

export function SharedTripScreen({ shareId, snapshot, onClose }: SharedTripScreenProps) {
  function handleClose() {
    clearShareHash();
    onClose();
  }

  if (!snapshot) {
    return (
      <section className="shared-screen">
        <button type="button" className="text-back" onClick={handleClose}>
          ← 닫기
        </button>
        <div className="state-panel" role="alert">
          <p className="state-title">공유 결과를 열 수 없어요</p>
          <p className="helper-text">
            공유 ID <code>{shareId}</code> 의 스냅샷을 찾지 못했어요. 링크에 포함된 데이터가 없거나,
            클라이언트 MOCK 저장소에만 있는 기록일 수 있어요. (서버 공유는 stage 5)
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="shared-screen">
      <p className="mock-banner" role="note">
        <strong>공유된 MOCK 결과</strong> · 저장·공유 시점 가격이며 실시간 검색이 아닙니다. 클라이언트
        전용 저장소 / URL 스냅샷.
      </p>
      <DestinationDetailScreen
        mode="shared"
        item={snapshot.recommendation}
        form={snapshot.form}
        capturedAt={snapshot.capturedAt}
        onBack={handleClose}
      />
    </section>
  );
}
