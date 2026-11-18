import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveHotelCityCode } from './cityCodes.js';

describe('resolveHotelCityCode Japan maps', () => {
  it('maps Osaka / Tokyo / Fukuoka airport and destination keys', () => {
    assert.equal(resolveHotelCityCode({ airportCode: 'KIX' }), 'OSA');
    assert.equal(resolveHotelCityCode({ destinationId: 'osaka' }), 'OSA');
    assert.equal(resolveHotelCityCode({ airportCode: 'NRT' }), 'TYO');
    assert.equal(resolveHotelCityCode({ airportCode: 'HND' }), 'TYO');
    assert.equal(resolveHotelCityCode({ destinationId: 'tokyo' }), 'TYO');
    assert.equal(resolveHotelCityCode({ airportCode: 'FUK' }), 'FUK');
    assert.equal(resolveHotelCityCode({ destinationId: 'fukuoka' }), 'FUK');
  });

  it('prefers explicit cityCode when valid', () => {
    assert.equal(resolveHotelCityCode({ cityCode: 'TYO', airportCode: 'NRT' }), 'TYO');
  });
});
