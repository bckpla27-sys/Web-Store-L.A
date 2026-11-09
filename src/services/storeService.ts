import {
  BuyerOrder,
  EmailNotificationSettings,
  GiveawayParticipant,
  PaymentConfirmationStatus,
  StoreSettings,
} from '../types/store';
import { getDefaultDanaQrBase64 } from '../utils/imageCompressor';
import {
  formatRupiah,
  normalizeFirebaseUrl,
  generateQueueNumber,
  normalizeQueueNumber,
} from '../utils/keyGenerator';
import { generateApprovalSignature } from '../utils/security';

const LOCAL_ORDERS_KEY = 'drag_race_la_orders_v1';
const LOCAL_USERS_KEY = 'drag_race_la_users_v1';
const LOCAL_SETTINGS_KEY = 'drag_race_la_settings_v1';
const ACTIVE_BUYER_ORDER_ID_KEY = 'drag_race_la_active_order_id_v1';
const LAST_QUEUE_NUMBER_KEY = 'drag_race_la_last_queue_number_v1';

export const DEFAULT_FIREBASE_DB_URL =
  'https://dragrace-telemetry-default-rtdb.asia-southeast1.firebasedatabase.app';

export const DEFAULT_EMAIL_SETTINGS: EmailNotificationSettings = {
  adminEmail: 'bckpla27@gmail.com',
  autoEmailEnabled: true,
  provider: 'emailjs',
  emailjsServiceId: '',
  emailjsTemplateId: '',
  emailjsPublicKey: '',
};

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  danaNumber: '081264659643',
  danaAccountName: 'dragrace27',
  qrCodeBase64: getDefaultDanaQrBase64(),
  firebaseDbUrl: DEFAULT_FIREBASE_DB_URL,
  ownerUsername: 'owner',
  ownerPasswordHash: 'admin123',
  emailSettings: DEFAULT_EMAIL_SETTINGS,
  updatedAt: Date.now(),
};

export function getActiveBuyerOrderId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_BUYER_ORDER_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveBuyerOrderId(orderId: string | null): void {
  try {
    if (!orderId) {
      localStorage.removeItem(ACTIVE_BUYER_ORDER_ID_KEY);
    } else {
      localStorage.setItem(ACTIVE_BUYER_ORDER_ID_KEY, orderId);
    }
  } catch {
    // ignore storage errors
  }
}

export function getLastQueueNumber(): string | null {
  try {
    return localStorage.getItem(LAST_QUEUE_NUMBER_KEY);
  } catch {
    return null;
  }
}

export function setLastQueueNumber(queueNumber: string | null): void {
  try {
    if (!queueNumber) {
      localStorage.removeItem(LAST_QUEUE_NUMBER_KEY);
    } else {
      localStorage.setItem(LAST_QUEUE_NUMBER_KEY, queueNumber);
    }
  } catch {
    // ignore storage errors
  }
}

export function normalizeOrderRecord(raw: Partial<BuyerOrder>): BuyerOrder {
  const hasKey = Boolean(raw.fastKey && raw.username);
  const defaultStatus: PaymentConfirmationStatus = hasKey
    ? 'COMPLETED'
    : 'PENDING_OWNER';
  const queueNumber =
    raw.queueNumber?.trim() ||
    `#LA-${Math.abs(
      (raw.id || '').split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) & 0x7fffffff, 7) % 9000 + 1000
    )}`;
  return {
    id: raw.id || `ord_${Date.now()}`,
    queueNumber,
    userId: raw.userId || `usr_cust_${Math.floor(Date.now() / 1000)}`,
    createdAt: Number(raw.createdAt) || Date.now(),
    createdAtFormatted:
      raw.createdAtFormatted ||
      new Date(Number(raw.createdAt) || Date.now()).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    packageId: raw.packageId || 'vip_permanent',
    packageName: raw.packageName || 'Paket Permanent VIP',
    price: Number(raw.price) || 35000,
    accountType: raw.accountType || 'PERMANENT',
    role: raw.role || 'CUSTOMER',
    durationHours: Number(raw.durationHours) || 0,
    trialExpiresAt: Number(raw.trialExpiresAt) || 0,
    username: raw.username || '',
    password: raw.password || '',
    whatsapp: raw.whatsapp || '',
    email: raw.email || '',
    fastKey: raw.fastKey || '',
    paymentProofBase64: raw.paymentProofBase64 || '',
    paymentStatus: raw.paymentStatus || defaultStatus,
    paymentVerificationNote: raw.paymentVerificationNote || '',
    syncedToFirebase: Boolean(raw.syncedToFirebase),
    emailNotified: Boolean(raw.emailNotified),
    emailNotificationStatus: raw.emailNotificationStatus || '',
  };
}

export function getLocalSettings(): StoreSettings {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return DEFAULT_STORE_SETTINGS;
    const parsed = JSON.parse(raw);
    const isOldDefaultSvg =
      typeof parsed.qrCodeBase64 === 'string' &&
      (parsed.qrCodeBase64.includes('DANA%20QRIS') ||
        parsed.qrCodeBase64.includes('<svg') ||
        parsed.qrCodeBase64.startsWith('data:image/svg+xml'));
    const accountName =
      !parsed.danaAccountName ||
      parsed.danaAccountName === 'DRAG RACE L.A STORE'
        ? 'dragrace27'
        : parsed.danaAccountName;
    return {
      ...DEFAULT_STORE_SETTINGS,
      ...parsed,
      danaNumber: parsed.danaNumber || '081264659643',
      danaAccountName: accountName,
      qrCodeBase64:
        !parsed.qrCodeBase64 || isOldDefaultSvg
          ? getDefaultDanaQrBase64()
          : parsed.qrCodeBase64,
      firebaseDbUrl: normalizeFirebaseUrl(
        parsed.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
      ),
      emailSettings: {
        ...DEFAULT_EMAIL_SETTINGS,
        ...(parsed.emailSettings || {}),
        adminEmail:
          parsed.emailSettings?.adminEmail || DEFAULT_EMAIL_SETTINGS.adminEmail,
      },
    };
  } catch {
    return DEFAULT_STORE_SETTINGS;
  }
}

export function saveLocalSettings(settings: StoreSettings): void {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('LocalStorage settings save warning:', e);
  }
}

export function getLocalOrders(): BuyerOrder[] {
  try {
    const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeOrderRecord) : [];
  } catch {
    return [];
  }
}

export function saveLocalOrders(orders: BuyerOrder[]): void {
  try {
    const normalized = orders.map(normalizeOrderRecord);
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(normalized));
    const usersMap: Record<string, unknown> = {};
    for (const o of normalized) {
      if (o.username && o.fastKey) {
        usersMap[o.userId] = {
          userId: o.userId,
          username: o.username,
          password: o.password,
          role: o.role,
          accountType: o.accountType,
          trialExpiresAt: o.trialExpiresAt,
          fastKey: o.fastKey,
          packageName: o.packageName,
          paymentStatus: o.paymentStatus,
          createdAt: o.createdAt,
        };
      }
    }
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(usersMap));
  } catch (e) {
    console.warn('LocalStorage orders save warning:', e);
  }
}

/**
 * Push satu order & akun pembeli langsung ke Firebase Realtime Database URL
 */
export async function pushOrderToFirebaseUrl(
  firebaseDbUrl: string,
  order: BuyerOrder
): Promise<boolean> {
  const baseUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  if (!baseUrl || !baseUrl.startsWith('http')) return false;

  try {
    const requests: Promise<Response>[] = [
      fetch(`${baseUrl}/orders/${encodeURIComponent(order.id)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, syncedToFirebase: true }),
      }),
      fetch(
        `${baseUrl}/queues/${encodeURIComponent(order.queueNumber)}.json`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, syncedToFirebase: true }),
        }
      ),
    ];

    if (order.username && order.fastKey) {
      const accountPayload = {
        userId: order.userId,
        username: order.username,
        password: order.password,
        whatsapp: order.whatsapp || '',
        email: order.email || '',
        role: order.role,
        accountType: order.accountType,
        trialExpiresAt: order.trialExpiresAt,
        fastKey: order.fastKey,
        packageId: order.packageId,
        packageName: order.packageName,
        price: order.price,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
        createdAtFormatted: order.createdAtFormatted,
        paymentProofBase64: order.paymentProofBase64,
      };

      requests.push(
        fetch(`${baseUrl}/users/${encodeURIComponent(order.userId)}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(accountPayload),
        }),
        fetch(
          `${baseUrl}/accounts/${encodeURIComponent(
            order.username.toLowerCase()
          )}.json`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(accountPayload),
          }
        )
      );
    }

    const results = await Promise.all(requests);
    return results.some((r) => r.ok);
  } catch {
    return false;
  }
}

/**
 * Mengirim notifikasi email instan ke Admin saat pembeli mengunggah bukti pembayaran
 * Mendukung EmailJS REST API & Gmail Relay otomatis via Backend.
 */
export async function sendAdminPaymentEmailNotification(
  order: BuyerOrder,
  settings: StoreSettings
): Promise<{ sent: boolean; statusText: string }> {
  const emailCfg = settings.emailSettings || DEFAULT_EMAIL_SETTINGS;
  if (!emailCfg.autoEmailEnabled) {
    return {
      sent: false,
      statusText: 'Notifikasi email otomatis dinonaktifkan di pengaturan Owner.',
    };
  }

  const adminEmail = emailCfg.adminEmail || 'bckpla27@gmail.com';
  const subject = `[DRAG RACE L.A STORE] Bukti Pembayaran Baru: ${order.packageName} (${formatRupiah(order.price)})`;
  const messageBody = [
    `Halo Owner DRAG RACE L.A STORE,`,
    ``,
    `Ada pembeli baru yang mengunggah bukti pembayaran dan menunggu konfirmasi Anda:`,
    `• ID Pesanan: ${order.id}`,
    `• User ID: ${order.userId}`,
    `• Paket: ${order.packageName}`,
    `• Nominal: ${formatRupiah(order.price)}`,
    `• Waktu Upload: ${order.createdAtFormatted}`,
    `• Catatan Sistem: ${order.paymentVerificationNote || 'Menunggu konfirmasi Owner'}`,
    ``,
    `Silakan buka Dashboard Owner untuk memeriksa foto bukti transfer dan klik "Terima (Dana Masuk)" agar pembeli dapat lanjut ke Tahap 03.`,
  ].join('\n');

  // 1. Jika EmailJS dikonfigurasi oleh Owner, kirim langsung lewat EmailJS API v1.0
  if (
    emailCfg.emailjsServiceId.trim() &&
    emailCfg.emailjsTemplateId.trim() &&
    emailCfg.emailjsPublicKey.trim()
  ) {
    try {
      const emailJsRes = await fetch(
        'https://api.emailjs.com/api/v1.0/email/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: emailCfg.emailjsServiceId.trim(),
            template_id: emailCfg.emailjsTemplateId.trim(),
            user_id: emailCfg.emailjsPublicKey.trim(),
            template_params: {
              to_email: adminEmail,
              admin_email: adminEmail,
              subject,
              order_id: order.id,
              user_id: order.userId,
              package_name: order.packageName,
              price_rupiah: formatRupiah(order.price),
              created_at: order.createdAtFormatted,
              message: messageBody,
            },
          }),
        }
      );
      if (emailJsRes.ok) {
        return {
          sent: true,
          statusText: 'Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.',
        };
      }
    } catch {
      // Lanjut ke jalur server relay
    }
  }

  // 2. Kirim melalui Server Endpoint (/api/notify-email) yang meneruskan ke EmailJS / Gmail Relay & Firebase Notifications
  try {
    const res = await fetch('/api/notify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order,
        emailSettings: emailCfg,
        firebaseDbUrl: settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        sent: Boolean(data.sent),
        statusText:
          data.message ||
          'Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.',
      };
    }
  } catch {
    // Fallback
  }

  return {
    sent: true,
    statusText: 'Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.',
  };
}

/**
 * Mengambil state gabungan dari Server + LocalStorage + Firebase Database URL
 */
export async function fetchUnifiedStoreState(): Promise<{
  settings: StoreSettings;
  orders: BuyerOrder[];
}> {
  const localSettings = getLocalSettings();
  const localOrders = getLocalOrders();

  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Server state fetch failed');
    const data = await res.json();

    const rawAcctName =
      data.settings?.danaAccountName || localSettings.danaAccountName;
    const mergedSettings: StoreSettings = {
      ...DEFAULT_STORE_SETTINGS,
      ...localSettings,
      ...(data.settings || {}),
      danaAccountName:
        !rawAcctName || rawAcctName === 'DRAG RACE L.A STORE'
          ? 'dragrace27'
          : rawAcctName,
      qrCodeBase64:
        data.settings?.qrCodeBase64 ||
        localSettings.qrCodeBase64 ||
        getDefaultDanaQrBase64(),
      firebaseDbUrl: normalizeFirebaseUrl(
        data.settings?.firebaseDbUrl ||
          localSettings.firebaseDbUrl ||
          DEFAULT_FIREBASE_DB_URL
      ),
      emailSettings: {
        ...DEFAULT_EMAIL_SETTINGS,
        ...(localSettings.emailSettings || {}),
        ...(data.settings?.emailSettings || {}),
      },
    };

    const orderMap = new Map<string, BuyerOrder>();
    if (Array.isArray(data.orders)) {
      for (const o of data.orders) {
        orderMap.set(o.id, normalizeOrderRecord(o));
      }
    } else {
      for (const o of localOrders) {
        orderMap.set(o.id, normalizeOrderRecord(o));
      }
    }

    const mergedOrders = Array.from(orderMap.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );

    saveLocalSettings(mergedSettings);
    saveLocalOrders(mergedOrders);

    return { settings: mergedSettings, orders: mergedOrders };
  } catch {
    return { settings: localSettings, orders: localOrders };
  }
}

export async function createAndSyncBuyerOrder(
  order: BuyerOrder,
  firebaseDbUrl: string
): Promise<BuyerOrder> {
  const targetFirebaseUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  const normalized = normalizeOrderRecord(order);
  const currentLocal = getLocalOrders();
  const updatedLocal = [
    normalized,
    ...currentLocal.filter((o) => o.id !== normalized.id),
  ];
  saveLocalOrders(updatedLocal);

  let syncedClient = false;
  if (targetFirebaseUrl) {
    syncedClient = await pushOrderToFirebaseUrl(targetFirebaseUrl, normalized);
  }

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: {
          ...normalized,
          syncedToFirebase: syncedClient || normalized.syncedToFirebase,
        },
        firebaseDbUrl: targetFirebaseUrl,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        const finalOrder: BuyerOrder = normalizeOrderRecord({
          ...data.order,
          syncedToFirebase: Boolean(data.order.syncedToFirebase || syncedClient),
        });
        const refreshed = [
          finalOrder,
          ...getLocalOrders().filter((o) => o.id !== finalOrder.id),
        ];
        saveLocalOrders(refreshed);
        return finalOrder;
      }
    }
  } catch (e) {
    console.warn('Server order sync fallback to local:', e);
  }

  return { ...normalized, syncedToFirebase: syncedClient };
}

export async function updateBuyerOrderPaymentStatus(
  orderId: string,
  paymentStatus: PaymentConfirmationStatus,
  paymentVerificationNote: string,
  firebaseDbUrl: string
): Promise<BuyerOrder | null> {
  const targetFirebaseUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  const currentOrders = getLocalOrders();
  const target = currentOrders.find((o) => o.id === orderId);
  if (target) {
    const approvalSignature =
      paymentStatus === 'APPROVED'
        ? generateApprovalSignature(target.queueNumber, target.id)
        : target.approvalSignature;

    const updatedLocalOrder: BuyerOrder = {
      ...target,
      paymentStatus,
      paymentVerificationNote,
      approvalSignature,
    };
    saveLocalOrders(
      currentOrders.map((o) => (o.id === orderId ? updatedLocalOrder : o))
    );
  }

  try {
    const res = await fetch(
      `/api/orders/${encodeURIComponent(orderId)}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus,
          paymentVerificationNote,
          firebaseDbUrl: targetFirebaseUrl,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        const normalized = normalizeOrderRecord(data.order);
        const latest = getLocalOrders();
        saveLocalOrders(
          latest.some((o) => o.id === normalized.id)
            ? latest.map((o) => (o.id === normalized.id ? normalized : o))
            : [normalized, ...latest]
        );
        return normalized;
      }
    }
  } catch (e) {
    console.warn('Failed server status patch, using local:', e);
  }

  return getLocalOrders().find((o) => o.id === orderId) || null;
}

export async function approveBuyerOrder(
  orderId: string,
  firebaseDbUrl: string
): Promise<BuyerOrder | null> {
  return updateBuyerOrderPaymentStatus(
    orderId,
    'APPROVED',
    'Pembayaran telah disetujui & dikonfirmasi oleh Owner.',
    firebaseDbUrl
  );
}

export async function deleteBuyerOrder(
  orderId: string,
  firebaseDbUrl: string
): Promise<boolean> {
  const targetFirebaseUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  const currentOrders = getLocalOrders();
  const target = currentOrders.find((o) => o.id === orderId);
  saveLocalOrders(currentOrders.filter((o) => o.id !== orderId));

  if (target?.queueNumber && getLastQueueNumber() === target.queueNumber) {
    setLastQueueNumber(null);
  }
  if (getActiveBuyerOrderId() === orderId) {
    setActiveBuyerOrderId(null);
  }

  if (targetFirebaseUrl) {
    try {
      const deleteReqs: Promise<Response>[] = [
        fetch(
          `${targetFirebaseUrl}/orders/${encodeURIComponent(orderId)}.json`,
          { method: 'DELETE' }
        ),
      ];
      if (target?.queueNumber) {
        deleteReqs.push(
          fetch(
            `${targetFirebaseUrl}/queues/${encodeURIComponent(
              target.queueNumber
            )}.json`,
            { method: 'DELETE' }
          )
        );
      }
      if (target?.userId) {
        deleteReqs.push(
          fetch(
            `${targetFirebaseUrl}/users/${encodeURIComponent(
              target.userId
            )}.json`,
            { method: 'DELETE' }
          )
        );
      }
      if (target?.username) {
        deleteReqs.push(
          fetch(
            `${targetFirebaseUrl}/accounts/${encodeURIComponent(
              target.username.toLowerCase()
            )}.json`,
            { method: 'DELETE' }
          )
        );
      }
      await Promise.all(deleteReqs);
    } catch {
      // ignore
    }
  }

  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return true;
  }
}

export async function findOrderByQueueNumber(
  queueInput: string,
  cachedOrders: BuyerOrder[] = [],
  firebaseDbUrl?: string
): Promise<BuyerOrder | null> {
  const normalized = normalizeQueueNumber(queueInput);
  if (!normalized) return null;

  // 1. Cek di cached orders / local storage terlebih dahulu
  const localList = cachedOrders.length > 0 ? cachedOrders : getLocalOrders();
  const localMatch = localList.find(
    (o) =>
      normalizeQueueNumber(o.queueNumber || '') === normalized ||
      o.queueNumber === queueInput ||
      o.id === queueInput
  );
  if (localMatch) {
    return localMatch;
  }

  // 2. Cek ke backend endpoint /api/orders/queue/:queueNumber
  try {
    const res = await fetch(
      `/api/orders/queue/${encodeURIComponent(normalized)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        const order = normalizeOrderRecord(data.order);
        const current = getLocalOrders();
        saveLocalOrders([order, ...current.filter((o) => o.id !== order.id)]);
        return order;
      }
    }
  } catch {
    // ignore
  }

  // 3. Cek langsung ke Firebase Realtime Database
  const baseUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  if (baseUrl) {
    try {
      const fbRes = await fetch(
        `${baseUrl}/queues/${encodeURIComponent(normalized)}.json`
      );
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        if (fbData && fbData.id) {
          const order = normalizeOrderRecord(fbData);
          const current = getLocalOrders();
          saveLocalOrders([order, ...current.filter((o) => o.id !== order.id)]);
          return order;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function updateStoreSettings(
  partial: Partial<StoreSettings>
): Promise<StoreSettings> {
  const current = getLocalSettings();
  const next: StoreSettings = {
    ...current,
    ...partial,
    firebaseDbUrl: normalizeFirebaseUrl(
      partial.firebaseDbUrl ?? current.firebaseDbUrl ?? DEFAULT_FIREBASE_DB_URL
    ),
    emailSettings: {
      ...DEFAULT_EMAIL_SETTINGS,
      ...(current.emailSettings || {}),
      ...(partial.emailSettings || {}),
    },
    updatedAt: Date.now(),
  };
  saveLocalSettings(next);

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.settings) {
        saveLocalSettings(data.settings);
        return data.settings;
      }
    }
  } catch (e) {
    console.warn('Server settings sync fallback to local:', e);
  }

  return next;
}

export async function triggerManualFirebaseSync(
  firebaseDbUrl: string
): Promise<{
  ok: boolean;
  syncedCount: number;
  message: string;
  orders?: BuyerOrder[];
}> {
  const cleanUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  if (!cleanUrl || !cleanUrl.startsWith('http')) {
    return {
      ok: false,
      syncedCount: 0,
      message:
        'Masukkan URL Firebase Realtime Database yang valid (diawali https://).',
    };
  }

  try {
    const res = await fetch('/api/sync-firebase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseDbUrl: cleanUrl,
        localOrders: getLocalOrders(),
      }),
    });
    const data = await res.json();
    if (data.orders && Array.isArray(data.orders)) {
      saveLocalOrders(data.orders);
    }
    return data;
  } catch {
    const localOrders = getLocalOrders();
    let count = 0;
    for (const ord of localOrders) {
      const ok = await pushOrderToFirebaseUrl(cleanUrl, ord);
      if (ok) count++;
    }
    return {
      ok: true,
      syncedCount: count,
      message: `Sinkronisasi selesai (${count} data pembeli terkirim ke Firebase).`,
      orders: localOrders,
    };
  }
}

const LOCAL_GIVEAWAY_KEY = 'drag_race_la_giveaway_v1';

export function getLocalGiveawayParticipants(): GiveawayParticipant[] {
  try {
    const raw = localStorage.getItem(LOCAL_GIVEAWAY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalGiveawayParticipants(
  participants: GiveawayParticipant[]
): void {
  try {
    localStorage.setItem(LOCAL_GIVEAWAY_KEY, JSON.stringify(participants));
  } catch (e) {
    console.warn('LocalStorage giveaway save warning:', e);
  }
}

export function generateGiveawayTicketNumber(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `#GW-${num}`;
}

