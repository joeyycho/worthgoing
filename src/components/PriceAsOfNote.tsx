import { PRICE_AS_OF_DISCLAIMER, formatCapturedAt } from '../services/tripSnapshot';

interface PriceAsOfNoteProps {
  capturedAt?: string;
}

export function PriceAsOfNote({ capturedAt }: PriceAsOfNoteProps) {
  return (
    <p className="price-as-of-note" role="note">
      {PRICE_AS_OF_DISCLAIMER}
      {capturedAt ? ` (기준: ${formatCapturedAt(capturedAt)})` : null}
    </p>
  );
}
