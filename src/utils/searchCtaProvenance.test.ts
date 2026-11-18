import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SEARCH_FORM_CTA_HELPER,
  SEARCH_FORM_CTA_LABEL,
  SEARCH_LOADING_HELPER,
  SEARCH_LOADING_TITLE,
  SEARCH_RESULT_PROVENANCE_LABEL,
  SEARCH_RESULTS_PARTIAL_MOCK_BANNER,
  findBannedPreSearchPhrase,
  formatSearchQuoteProvenanceChip,
  formatSearchQuoteProvenanceParen,
  quoteIsMockProvenance,
  recommendationsIncludeMockPrice,
} from './priceProvenance.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('GAL-32 search CTA / provenance (cases 1–9)', () => {
  it('1. pre-search CTA has no MOCK claim', () => {
    assert.equal(SEARCH_FORM_CTA_LABEL, '여행지 추천받기');
    assert.equal(findBannedPreSearchPhrase(SEARCH_FORM_CTA_LABEL, SEARCH_FORM_CTA_HELPER), null);
    assert.ok(!SEARCH_FORM_CTA_LABEL.includes('MOCK'));
    assert.ok(!SEARCH_FORM_CTA_HELPER.includes('MOCK'));

    const formSrc = readSrc('src/components/TravelSearchScreen.tsx');
    assert.match(formSrc, /SEARCH_FORM_CTA_LABEL/);
    assert.ok(!formSrc.includes('MOCK 예시'));
    assert.ok(!formSrc.includes('MOCK 검색'));
    assert.ok(!formSrc.includes('조건으로 여행지 찾기'));
  });

  it('2. pre-search copy does not promise LIVE', () => {
    assert.equal(findBannedPreSearchPhrase(SEARCH_FORM_CTA_LABEL, SEARCH_FORM_CTA_HELPER), null);
    assert.ok(!SEARCH_FORM_CTA_HELPER.includes('실시간'));
    assert.equal(
      findBannedPreSearchPhrase(SEARCH_LOADING_TITLE, SEARCH_LOADING_HELPER),
      null,
    );
    assert.ok(!SEARCH_LOADING_HELPER.includes('실시간'));
    assert.ok(!SEARCH_LOADING_HELPER.includes('LIVE'));
  });

  it('3. live post-search labels', () => {
    const quote = { isMock: false, priceMode: 'live' };
    assert.equal(SEARCH_RESULT_PROVENANCE_LABEL.live, '실시간 검색 결과');
    assert.equal(formatSearchQuoteProvenanceChip(quote, 'flight'), '항공 실시간 검색 결과');
    assert.equal(formatSearchQuoteProvenanceChip(quote, 'stay'), '숙소 실시간 검색 결과');
    assert.equal(formatSearchQuoteProvenanceParen(quote), '(실시간 검색 결과)');
  });

  it('4. indicative post-search labels', () => {
    const quote = { isMock: false, priceMode: 'indicative' };
    assert.equal(SEARCH_RESULT_PROVENANCE_LABEL.indicative, '예상 가격');
    assert.equal(formatSearchQuoteProvenanceChip(quote, 'flight'), '항공 예상 가격');
    assert.equal(formatSearchQuoteProvenanceParen(quote), '(예상 가격)');
  });

  it('5. mock post-search labels (never presented as live)', () => {
    const quote = { isMock: true, priceMode: 'mock' };
    assert.equal(SEARCH_RESULT_PROVENANCE_LABEL.mock, '예시 가격');
    assert.equal(formatSearchQuoteProvenanceChip(quote, 'flight'), '항공 예시 가격');
    assert.equal(formatSearchQuoteProvenanceParen(quote), '(예시 가격)');
    assert.ok(quoteIsMockProvenance(quote));
    assert.ok(!formatSearchQuoteProvenanceChip(quote, 'flight').includes('실시간'));
  });

  it('6. mixed flight/stay provenance stays separate', () => {
    const flight = { isMock: false, priceMode: 'live' };
    const lodging = { isMock: true, priceMode: 'mock' };
    assert.equal(formatSearchQuoteProvenanceChip(flight, 'flight'), '항공 실시간 검색 결과');
    assert.equal(formatSearchQuoteProvenanceChip(lodging, 'stay'), '숙소 예시 가격');
    assert.equal(recommendationsIncludeMockPrice([{ flight, lodging }]), true);
    assert.equal(SEARCH_RESULTS_PARTIAL_MOCK_BANNER, '일부 가격은 예시 데이터입니다.');
  });

  it('7. missing provenance → 가격 출처 확인 불가', () => {
    assert.equal(SEARCH_RESULT_PROVENANCE_LABEL.unknown, '가격 출처 확인 불가');
    assert.equal(formatSearchQuoteProvenanceChip({}, 'flight'), '항공 가격 출처 확인 불가');
    assert.equal(formatSearchQuoteProvenanceParen({}), '(가격 출처 확인 불가)');
    assert.equal(recommendationsIncludeMockPrice([{ flight: {}, lodging: {} }]), false);
  });

  it('8. Mock fallback paths are kept (UI-only change)', () => {
    const recommend = readSrc('src/services/recommendDestinations.ts');
    assert.match(recommend, /MockFlightProvider/);
    assert.match(recommend, /MockAccommodationProvider/);
    assert.match(recommend, /Flight API unavailable; using MockFlightProvider/);
    assert.match(recommend, /Accommodation API unavailable; using MockAccommodationProvider/);

    const flightService = readSrc('server/src/flights/service.ts');
    assert.match(flightService, /SerpApi flight search failed; using MOCK/);
    assert.match(flightService, /searchMockFlights/);

    const stayService = readSrc('server/src/accommodations/service.ts');
    assert.match(stayService, /SerpApi hotel search failed; using MOCK/);
  });

  it('9. fallback-fail / search error path still surfaces without LIVE claim', () => {
    const flow = readSrc('src/components/SearchFlow.tsx');
    assert.match(flow, /setError/);
    assert.match(flow, /err\.message/);

    const list = readSrc('src/components/RecommendationListScreen.tsx');
    assert.match(list, /추천을 불러오지 못했어요/);
    assert.match(list, /onRetry/);
    assert.ok(!list.includes('실시간 검색 중'));
    assert.match(list, /SEARCH_LOADING_HELPER/);
    assert.match(list, /SEARCH_RESULTS_PARTIAL_MOCK_BANNER/);

    // Card / detail reuse GAL-38 classifier helpers — no duplicate classifiers.
    const card = readSrc('src/components/DestinationCard.tsx');
    assert.match(card, /formatSearchQuoteProvenanceChip/);
    assert.match(card, /classifyQuoteProvenance/);
    assert.ok(!card.includes('항공 예시\n') && !card.includes("'항공 예시'"));

    const detail = readSrc('src/components/DestinationDetailScreen.tsx');
    assert.match(detail, /formatSearchQuoteProvenanceParen/);
    assert.match(detail, /quoteIsMockProvenance/);
  });
});
