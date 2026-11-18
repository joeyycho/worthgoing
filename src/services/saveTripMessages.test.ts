import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SAVE_FAIL,
  SAVE_SUCCESS_CLOUD,
  SAVE_SUCCESS_LOCAL,
  SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL,
  saveSuccessMessage,
} from './saveTripMessages.js';

describe('saveSuccessMessage', () => {
  it('cloud success copy', () => {
    assert.equal(saveSuccessMessage('cloud'), SAVE_SUCCESS_CLOUD);
    assert.equal(SAVE_SUCCESS_CLOUD, '여행을 저장했어요.');
  });

  it('local-after-cloud-fail copy', () => {
    assert.equal(saveSuccessMessage('local_after_cloud_fail'), SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL);
    assert.equal(
      SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL,
      '이 기기에 여행을 저장했어요. 클라우드 동기화는 완료되지 않았어요.',
    );
  });

  it('intentional local (no cloud attempt) is distinct from sync-fail', () => {
    assert.equal(saveSuccessMessage('local'), SAVE_SUCCESS_LOCAL);
    assert.notEqual(SAVE_SUCCESS_LOCAL, SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL);
  });

  it('fail copy constant', () => {
    assert.equal(SAVE_FAIL, '저장하지 못했어요. 다시 시도해 주세요.');
  });
});
