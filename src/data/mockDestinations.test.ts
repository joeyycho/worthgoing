import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveHotelCityCode } from './hotelCityCodes.js';
import { MOCK_DESTINATIONS } from './mockDestinations.js';

const JAPAN_IDS = ['osaka', 'tokyo', 'fukuoka'] as const;

function byId(id: string) {
  return MOCK_DESTINATIONS.find((item) => item.id === id);
}

describe('Japan destination catalog', () => {
  it('exposes Osaka, Tokyo, and Fukuoka as queryable catalog entries', () => {
    for (const id of JAPAN_IDS) {
      const row = byId(id);
      assert.ok(row, `missing catalog id ${id}`);
      assert.equal(row!.country, '일본');
      assert.equal(row!.countryCode, 'JP');
      assert.ok(row!.city);
      assert.ok(row!.intro);
      assert.ok(row!.photoUrl.startsWith('/destinations/'));
      assert.ok(row!.attractions.length > 0);
      assert.ok(row!.food.length > 0);
      assert.ok(row!.activities.length > 0);
      assert.ok(row!.shopping.length > 0);
      assert.ok(row!.sampleItinerary.length > 0);
      assert.ok(row!.localDailyPerPerson, `missing local spend for ${id}`);
      assert.ok(row!.localDailyPerPerson!.activityKrw > 0);
      assert.ok(row!.localDailyPerPerson!.foodKrw > 0);
      assert.ok(row!.localDailyPerPerson!.shoppingKrw > 0);
      assert.equal(
        'transportKrw' in (row!.localDailyPerPerson as object),
        false,
        'transport must not be invented on catalog daily',
      );
      assert.ok(row!.priceFactor > 0);
    }
  });

  it('maps Japan airports to KIX / NRT / FUK (Tokyo primary NRT)', () => {
    assert.equal(byId('osaka')!.airportCode, 'KIX');
    assert.equal(byId('tokyo')!.airportCode, 'NRT');
    assert.equal(byId('fukuoka')!.airportCode, 'FUK');
  });

  it('keeps Osaka field structure unchanged for core identity fields', () => {
    const osaka = byId('osaka')!;
    assert.equal(osaka.city, '오사카');
    assert.equal(osaka.airportCode, 'KIX');
    assert.equal(osaka.priceFactor, 0.95);
    assert.equal(osaka.localDailyPerPerson!.activityKrw, 25_000);
    assert.equal(osaka.localDailyPerPerson!.foodKrw, 35_000);
    assert.equal(osaka.localDailyPerPerson!.shoppingKrw, 20_000);
    assert.equal(osaka.forcePriceUnknown, undefined);
  });

  it('maps hotel city codes for Japan airports (incl. HND → TYO)', () => {
    assert.equal(resolveHotelCityCode({ id: 'osaka', airportCode: 'KIX' }), 'OSA');
    assert.equal(resolveHotelCityCode({ id: 'tokyo', airportCode: 'NRT' }), 'TYO');
    assert.equal(resolveHotelCityCode({ id: 'tokyo', airportCode: 'HND' }), 'TYO');
    assert.equal(resolveHotelCityCode({ id: 'fukuoka', airportCode: 'FUK' }), 'FUK');
  });

  it('hotel query city/country follow Osaka Korean string pattern', () => {
    assert.equal(byId('osaka')!.city, '오사카');
    assert.equal(byId('tokyo')!.city, '도쿄');
    assert.equal(byId('fukuoka')!.city, '후쿠오카');
    for (const id of JAPAN_IDS) {
      assert.equal(byId(id)!.country, '일본');
    }
  });
});
