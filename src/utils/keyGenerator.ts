import { FastLoginUserInput, PackageOption } from '../types/store';

export const LICENSE_PACKAGES: PackageOption[] = [
  {
    id: 'trial_3h',
    name: 'Paket Trial 3 Jam',
    subtitle: 'Akses penuh seluruh fitur Drag Race Pro+ selama 3 jam.',
    price: 5000,
    accountType: 'TRIAL',
    durationHours: 3,
    durationLabel: '3 Jam',
    features: [
      'Akses penuh Drag Race Pro+ (3 Jam)',
      'Kunci Akses Cepat KEY-T03XXXXXX',
      '⚠️ Data tidak permanent (terhapus setelah masa aktif habis)',
    ],
  },
  {
    id: 'trial_10h',
    name: 'Paket Trial 10 Jam',
    subtitle: 'Cocok untuk sesi latihan & setting rasio seharian.',
    price: 10000,
    accountType: 'TRIAL',
    durationHours: 10,
    durationLabel: '10 Jam',
    features: [
      'Akses penuh Drag Race Pro+ (10 Jam)',
      'Kunci Akses Cepat KEY-T0AXXXXXX',
      '⚠️ Data tidak permanent (terhapus setelah masa aktif habis)',
    ],
  },
  {
    id: 'trial_24h',
    name: 'Paket Trial 1 Hari (24 Jam)',
    subtitle: 'Akses 24 jam penuh untuk turnamen & riset mesin.',
    price: 15000,
    accountType: 'TRIAL',
    durationHours: 24,
    durationLabel: '24 Jam (1 Hari)',
    features: [
      'Akses penuh Drag Race Pro+ (24 Jam)',
      'Kunci Akses Cepat KEY-T0OXXXXXX',
      '⚠️ Data tidak permanent (terhapus setelah masa aktif habis)',
    ],
  },
  {
    id: 'permanent',
    name: 'Paket Permanent',
    subtitle: 'Lisensi seumur hidup dengan update & konsultasi lengkap.',
    price: 35000,
    originalPrice: 50000,
    badge: 'PROMO TERBATAS 2 BULAN INI',
    accountType: 'PERMANENT',
    durationHours: 0,
    durationLabel: 'Permanent (Selamanya)',
    features: [
      'Lisensi Permanent Seumur Hidup',
      'Free update selama 2 bulan',
      'Video tutorial eksklusif',
      'Bebas konsultasi setting rasio',
      'Kunci Akses Cepat KEY-P00XXXXXX',
    ],
  },
  {
    id: 'vip_permanent',
    name: 'Paket VIP',
    subtitle: 'Lisensi seumur hidup VIP dengan update selamanya & prioritas.',
    price: 70000,
    originalPrice: 100000,
    badge: 'PROMO HINGGA AKHIR TAHUN',
    accountType: 'PERMANENT',
    durationHours: 0,
    durationLabel: 'VIP Lifetime',
    features: [
      'Lisensi seumur hidup VIP',
      'Free update lifetime / selamanya',
      'Tutorial sampe bisa (bimbingan langsung)',
      'Bebas request fitur & pendapat',
      'Di follow sosmed owner ganteng',
      'Kunci Akses Cepat KEY-P00XXXXXX',
    ],
  },
];

/**
 * Menghasilkan Kunci Akses Cepat (<= 15 karakter) yang 100% cocok dengan aplikasi Android Drag Race Pro+
 * @param {FastLoginUserInput} user
 * @param {string} user.userId       - contoh: "usr_cust_1731050000"
 * @param {string} user.username     - contoh: "hendra"
 * @param {string} [user.password]   - default: "123456"
 * @param {string} [user.role]       - "CUSTOMER" atau "OWNER"
 * @param {string} [user.accountType]- "PERMANENT" atau "TRIAL"
 * @param {number} [user.trialExpiresAt] - timestamp ms (Date.now() + durasi), atau 0 untuk PERMANENT
 */
export function generateFastLoginToken(user: FastLoginUserInput): string {
  const role = (user.role || "CUSTOMER").toUpperCase();
  const accountType = (user.accountType || "PERMANENT").toUpperCase();
  const password = (user.password || "123456").trim();
  const username = (user.username || "").trim();
  const userId = (user.userId || `usr_${username.toLowerCase()}`).toLowerCase();

  // 1. Type Char (1 karakter: O / T / P)
  let typeChar = "P";
  if (role === "OWNER") {
    typeChar = "O";
  } else if (accountType === "TRIAL") {
    typeChar = "T";
  }

  // 2. Expiry Code (2 karakter Base36)
  let expiryCode = "00";
  if (typeChar === "T") {
    const nowMs = Date.now();
    const trialExpiresAt = Number(user.trialExpiresAt || 0);
    let remainingHours = 0;
    if (trialExpiresAt > nowMs) {
      remainingHours = Math.floor((trialExpiresAt - nowMs) / (1000 * 60 * 60));
      remainingHours = Math.max(1, Math.min(1295, remainingHours));
    }
    expiryCode = remainingHours.toString(36).toUpperCase().padStart(2, "0").slice(-2);
  }

  // 3. Clean Username Slug (1..6 karakter A-Z0-9)
  const cleanSlug =
    username
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "RACER";

  // 4. 2-Char Check Code (32-bit signed math persis Kotlin: (hashVal * 31 + code) & 0x7FFFFFFF)
  const hashSeed = `${userId}|${username.toLowerCase()}|${password}|${accountType}`;
  let hashVal = 7;
  for (let i = 0; i < hashSeed.length; i++) {
    hashVal = (Math.imul(hashVal, 31) + hashSeed.charCodeAt(i)) & 0x7fffffff;
  }
  const checkCode = (hashVal % 1296).toString(36).toUpperCase().padStart(2, "0").slice(-2);

  // Total maksimal 15 karakter
  return `KEY-${typeChar}${expiryCode}${cleanSlug}${checkCode}`.slice(0, 15);
}

/**
 * Helper untuk menghitung trialExpiresAt agar saat dimasukkan ke generateFastLoginToken
 * menghasilkan jumlah jam yang persis sesuai paket (misal 3 jam, 10 jam, 24 jam).
 */
export function computeTrialExpiresAt(durationHours: number, nowMs: number = Date.now()): number {
  if (durationHours <= 0) return 0;
  // Tambahkan 59 menit ekstra agar Math.floor((trialExpiresAt - Date.now()) / 3600000)
  // tepat menghasilkan durationHours meskipun ada selisih beberapa milidetik saat eksekusi
  return nowMs + durationHours * 60 * 60 * 1000 + 59 * 1000;
}

export function formatRupiah(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

export function normalizeFirebaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('.json')) {
    return trimmed.replace(/\/[^/]+\.json$/, '');
  }
  return trimmed;
}

/**
 * Menghasilkan Nomor Antrean Unik untuk pembeli.
 * Format persis sesuai instruksi: #LA-XXXX (contoh: #LA-4829)
 */
export function generateQueueNumber(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `#LA-${digits}`;
}

/**
 * Normalisasi input nomor antrean agar toleran jika pengguna mengetik:
 * "4829", "la-4829", "LA-4829", atau "#LA-4829"
 */
export function normalizeQueueNumber(input: string): string {
  if (!input) return '';
  const trimmed = input.trim().toUpperCase();
  const withoutHash = trimmed.replace(/^#+/, '');
  if (withoutHash.startsWith('LA-')) {
    return `#${withoutHash}`;
  }
  if (/^\d{3,6}$/.test(withoutHash)) {
    return `#LA-${withoutHash}`;
  }
  return `#${withoutHash}`;
}
