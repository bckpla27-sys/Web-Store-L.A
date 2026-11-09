import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateFastLoginToken,
  computeTrialExpiresAt,
  LICENSE_PACKAGES,
  formatRupiah,
  normalizeFirebaseUrl,
  generateQueueNumber,
  normalizeQueueNumber,
} from './keyGenerator';

test('generateFastLoginToken produces deterministic <= 15 char key for PERMANENT customer', () => {
  const token = generateFastLoginToken({
    userId: 'usr_hendra',
    username: 'hendra',
    password: '123456',
    role: 'CUSTOMER',
    accountType: 'PERMANENT',
    trialExpiresAt: 0,
  });

  assert.equal(token.startsWith('KEY-P00HENDRA'), true);
  assert.equal(token.length <= 15, true);
  assert.equal(token.length, 15);
});

test('generateFastLoginToken encodes exact Base36 hours for 3h, 10h, and 24h TRIAL packages', () => {
  const now = Date.now();

  const key3h = generateFastLoginToken({
    userId: 'usr_racer1',
    username: 'racer1',
    password: 'abc',
    role: 'CUSTOMER',
    accountType: 'TRIAL',
    trialExpiresAt: computeTrialExpiresAt(3, now),
  });
  assert.equal(key3h.slice(0, 7), 'KEY-T03');

  const key10h = generateFastLoginToken({
    userId: 'usr_racer1',
    username: 'racer1',
    password: 'abc',
    role: 'CUSTOMER',
    accountType: 'TRIAL',
    trialExpiresAt: computeTrialExpiresAt(10, now),
  });
  // 10 in base36 is '0A'
  assert.equal(key10h.slice(0, 7), 'KEY-T0A');

  const key24h = generateFastLoginToken({
    userId: 'usr_racer1',
    username: 'racer1',
    password: 'abc',
    role: 'CUSTOMER',
    accountType: 'TRIAL',
    trialExpiresAt: computeTrialExpiresAt(24, now),
  });
  // 24 in base36 is '0O'
  assert.equal(key24h.slice(0, 7), 'KEY-T0O');
});

test('generateFastLoginToken handles OWNER role and special characters in username', () => {
  const ownerKey = generateFastLoginToken({
    username: 'peter_27!',
    password: 'secret',
    role: 'OWNER',
    accountType: 'PERMANENT',
  });
  assert.equal(ownerKey.startsWith('KEY-O00PETER2'), true);
  assert.equal(ownerKey.length <= 15, true);
});

test('LICENSE_PACKAGES matches required prices and promo badge', () => {
  assert.equal(LICENSE_PACKAGES.length, 5);
  assert.equal(LICENSE_PACKAGES[0].price, 5000);
  assert.equal(LICENSE_PACKAGES[1].price, 10000);
  assert.equal(LICENSE_PACKAGES[2].price, 15000);
  assert.equal(LICENSE_PACKAGES[3].price, 35000);
  assert.equal(LICENSE_PACKAGES[3].originalPrice, 50000);
  assert.equal(LICENSE_PACKAGES[3].badge, 'PROMO TERBATAS 2 BULAN INI');
  assert.equal(LICENSE_PACKAGES[4].price, 70000);
  assert.equal(LICENSE_PACKAGES[4].originalPrice, 100000);
  assert.equal(LICENSE_PACKAGES[4].badge, 'PROMO HINGGA AKHIR TAHUN');
});

test('formatRupiah and normalizeFirebaseUrl format strings cleanly', () => {
  assert.equal(formatRupiah(35000), 'Rp 35.000');
  assert.equal(
    normalizeFirebaseUrl('https://drag-race-la-default-rtdb.firebaseio.com/'),
    'https://drag-race-la-default-rtdb.firebaseio.com'
  );
});

test('generateQueueNumber produces valid #LA-XXXX format', () => {
  const queue = generateQueueNumber();
  assert.match(queue, /^#LA-\d{4}$/);
});

test('normalizeQueueNumber handles multiple user inputs properly', () => {
  assert.equal(normalizeQueueNumber('4829'), '#LA-4829');
  assert.equal(normalizeQueueNumber('la-4829'), '#LA-4829');
  assert.equal(normalizeQueueNumber('LA-4829'), '#LA-4829');
  assert.equal(normalizeQueueNumber('#LA-4829'), '#LA-4829');
});
