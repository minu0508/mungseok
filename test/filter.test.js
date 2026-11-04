import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedName } from '../realtime/src/filter.js';

test('blocks profanity, including spaced, digit-padded and full-width variants', () => {
  for (const n of ['시발', '씨 발', '시1발', 'ㅅ.ㅂ', '병-신', '개새끼야', 'ＦＵＣＫ', 'f.u.c.k', '존나멍때림', 'ㅈㄴ'])
    assert.equal(isBlockedName(n), true, n);
});

test('blocks ads, links and contact numbers', () => {
  for (const n of ['카톡 abc123', '토토사이트', 'bit.ly/x', 'www.a', 'abc.com', '010-1234-5678', '@mungseok', '텔레 hi', '오픈채팅방'])
    assert.equal(isBlockedName(n), true, n);
});

test('allows ordinary names', () => {
  for (const n of ['민우', '한강러', '퇴근함', '오늘도멍', 'yuna', '새벽3시', '김철수', '고양이', '반포 사는 사람', 'Sunny', '익명'])
    assert.equal(isBlockedName(n), false, n);
});
