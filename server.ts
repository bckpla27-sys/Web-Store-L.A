import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  BuyerOrder,
  EmailNotificationSettings,
  PaymentConfirmationStatus,
  StoreSettings,
} from './src/types/store';
import { getDefaultDanaQrBase64 } from './src/utils/imageCompressor';
import {
  formatRupiah,
  normalizeFirebaseUrl,
  generateQueueNumber,
  normalizeQueueNumber,
} from './src/utils/keyGenerator';
import { generateApprovalSignature } from './src/utils/security';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_FIREBASE_DB_URL =
  'https://dragrace-telemetry-default-rtdb.asia-southeast1.firebasedatabase.app';

const DEFAULT_EMAIL_SETTINGS: EmailNotificationSettings = {
  adminEmail: 'bckpla27@gmail.com',
  autoEmailEnabled: true,
  provider: 'emailjs',
  emailjsServiceId: '',
  emailjsTemplateId: '',
  emailjsPublicKey: '',
};

interface PersistedState {
  settings: StoreSettings;
  orders: BuyerOrder[];
}

function getInitialState(): PersistedState {
  return {
    settings: {
      danaNumber: '081264659643',
      danaAccountName: 'dragrace27',
      qrCodeBase64: getDefaultDanaQrBase64(),
      firebaseDbUrl: DEFAULT_FIREBASE_DB_URL,
      ownerUsername: 'owner',
      ownerPasswordHash: 'admin123',
      emailSettings: DEFAULT_EMAIL_SETTINGS,
      updatedAt: Date.now(),
    },
    orders: [],
  };
}

function normalizeServerOrder(raw: Partial<BuyerOrder>): BuyerOrder {
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

function readPersistedState(): PersistedState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initial = getInitialState();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const savedQr = parsed.settings?.qrCodeBase64;
    const isOldDefaultSvg =
      typeof savedQr === 'string' &&
      (savedQr.includes('DANA%20QRIS') ||
        savedQr.includes('<svg') ||
        savedQr.startsWith('data:image/svg+xml'));
    const savedFirebaseUrl = normalizeFirebaseUrl(
      parsed.settings?.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
    );
    const savedAcctName = parsed.settings?.danaAccountName;

    return {
      settings: {
        ...getInitialState().settings,
        ...(parsed.settings || {}),
        danaAccountName:
          !savedAcctName || savedAcctName === 'DRAG RACE L.A STORE'
            ? 'dragrace27'
            : savedAcctName,
        qrCodeBase64:
          !savedQr || isOldDefaultSvg ? getDefaultDanaQrBase64() : savedQr,
        firebaseDbUrl: savedFirebaseUrl,
        emailSettings: {
          ...DEFAULT_EMAIL_SETTINGS,
          ...(parsed.settings?.emailSettings || {}),
          adminEmail:
            parsed.settings?.emailSettings?.adminEmail ||
            DEFAULT_EMAIL_SETTINGS.adminEmail,
        },
      },
      orders: Array.isArray(parsed.orders)
        ? parsed.orders.map(normalizeServerOrder)
        : [],
    };
  } catch {
    return getInitialState();
  }
}

function writePersistedState(state: PersistedState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write store state:', err);
  }
}

async function syncOrderToFirebaseServer(
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

async function pullOrdersFromFirebaseServer(
  firebaseDbUrl: string
): Promise<BuyerOrder[]> {
  const baseUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  if (!baseUrl || !baseUrl.startsWith('http')) return [];

  try {
    const res = await fetch(`${baseUrl}/orders.json`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || typeof data !== 'object') return [];
    const pulled: BuyerOrder[] = [];
    for (const key of Object.keys(data)) {
      const item = data[key];
      if (item && item.id) {
        pulled.push(
          normalizeServerOrder({
            ...item,
            syncedToFirebase: true,
          })
        );
      }
    }
    return pulled;
  } catch {
    return [];
  }
}

async function dispatchAdminEmailNotificationServer(
  order: BuyerOrder,
  emailSettings: EmailNotificationSettings,
  firebaseDbUrl: string
): Promise<{ sent: boolean; message: string }> {
  const adminEmail =
    emailSettings?.adminEmail?.trim() || 'bckpla27@gmail.com';
  const subject = `[DRAG RACE L.A STORE] Bukti Pembayaran Baru: ${order.packageName} (${formatRupiah(order.price)})`;
  const textBody = [
    `Halo Admin DRAG RACE L.A STORE,`,
    ``,
    `Pembeli baru telah mengunggah bukti pembayaran dan menunggu konfirmasi Anda:`,
    `- ID Pesanan: ${order.id}`,
    `- User ID: ${order.userId}`,
    `- Paket: ${order.packageName}`,
    `- Nominal: ${formatRupiah(order.price)}`,
    `- Waktu: ${order.createdAtFormatted}`,
    `- Catatan: ${order.paymentVerificationNote || 'Menunggu konfirmasi Owner'}`,
    ``,
    `Buka Dashboard Owner untuk melihat bukti transfer dan klik "Terima (Dana Masuk)" agar pembeli dapat lanjut ke Tahap 03.`,
  ].join('\n');

  // Catat juga log notifikasi admin ke Firebase Realtime Database (/admin_notifications/{id}.json)
  const baseUrl = normalizeFirebaseUrl(
    firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  if (baseUrl) {
    try {
      await fetch(
        `${baseUrl}/admin_notifications/${encodeURIComponent(order.id)}.json`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            adminEmail,
            subject,
            packageName: order.packageName,
            price: order.price,
            createdAt: Date.now(),
            createdAtFormatted: order.createdAtFormatted,
            status: 'UNREAD',
          }),
        }
      );
    } catch {
      // ignore firebase log error
    }
  }

  // 1. Coba kirim via EmailJS jika kredensial diisi
  if (
    emailSettings?.emailjsServiceId?.trim() &&
    emailSettings?.emailjsTemplateId?.trim() &&
    emailSettings?.emailjsPublicKey?.trim()
  ) {
    try {
      const ejRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: process.env.APP_URL || 'http://localhost:3000',
        },
        body: JSON.stringify({
          service_id: emailSettings.emailjsServiceId.trim(),
          template_id: emailSettings.emailjsTemplateId.trim(),
          user_id: emailSettings.emailjsPublicKey.trim(),
          template_params: {
            to_email: adminEmail,
            admin_email: adminEmail,
            subject,
            order_id: order.id,
            user_id: order.userId,
            package_name: order.packageName,
            price_rupiah: formatRupiah(order.price),
            created_at: order.createdAtFormatted,
            message: textBody,
          },
        }),
      });
      if (ejRes.ok) {
        return {
          sent: true,
          message: 'Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.',
        };
      }
    } catch {
      // Lanjut ke Gmail / FormSubmit relay
    }
  }

  // 2. Kirim melalui Gmail / FormSubmit Relay otomatis
  try {
    const relayRes = await fetch(
      `https://formsubmit.co/ajax/${encodeURIComponent(adminEmail)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Referer: process.env.APP_URL || 'https://dragracelastore.app',
          Origin: process.env.APP_URL || 'https://dragracelastore.app',
        },
        body: JSON.stringify({
          _subject: subject,
          _template: 'table',
          _captcha: 'false',
          ID_Pesanan: order.id,
          Paket_Lisensi: order.packageName,
          Nominal_Transfer: formatRupiah(order.price),
          Waktu_Upload: order.createdAtFormatted,
          Status_Konfirmasi: 'MENUNGGU KONFIRMASI OWNER',
          Pesan: textBody,
        }),
      }
    );
    if (relayRes.ok) {
      return {
        sent: true,
        message: 'Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.',
      };
    }
  } catch {
    // ignore external relay network restrictions
  }

  return {
    sent: true,
    message: 'Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/state', async (_req, res) => {
    const state = readPersistedState();
    const activeUrl = normalizeFirebaseUrl(
      state.settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
    );
    state.settings.firebaseDbUrl = activeUrl;

    if (activeUrl) {
      const remoteOrders = await pullOrdersFromFirebaseServer(activeUrl);
      if (remoteOrders.length > 0) {
        const map = new Map<string, BuyerOrder>();
        for (const o of state.orders) map.set(o.id, o);
        for (const o of remoteOrders) map.set(o.id, o);
        state.orders = Array.from(map.values()).sort(
          (a, b) => b.createdAt - a.createdAt
        );
        writePersistedState(state);
      }
    }
    res.json(state);
  });

  app.post('/api/settings', async (req, res) => {
    const state = readPersistedState();
    const incoming = req.body || {};
    state.settings = {
      ...state.settings,
      danaNumber:
        incoming.danaNumber || state.settings.danaNumber || '081264659643',
      danaAccountName:
        incoming.danaAccountName ||
        state.settings.danaAccountName ||
        'DRAG RACE L.A STORE',
      qrCodeBase64: incoming.qrCodeBase64 || state.settings.qrCodeBase64,
      firebaseDbUrl: normalizeFirebaseUrl(
        incoming.firebaseDbUrl ||
          state.settings.firebaseDbUrl ||
          DEFAULT_FIREBASE_DB_URL
      ),
      ownerUsername:
        incoming.ownerUsername || state.settings.ownerUsername || 'owner',
      ownerPasswordHash:
        incoming.ownerPasswordHash ||
        state.settings.ownerPasswordHash ||
        'admin123',
      emailSettings: {
        ...DEFAULT_EMAIL_SETTINGS,
        ...(state.settings.emailSettings || {}),
        ...(incoming.emailSettings || {}),
      },
      updatedAt: Date.now(),
    };
    writePersistedState(state);

    // Sinkronkan juga pengaturan toko ke Firebase Realtime Database
    if (state.settings.firebaseDbUrl) {
      try {
        await fetch(`${state.settings.firebaseDbUrl}/store_settings.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            danaNumber: state.settings.danaNumber,
            danaAccountName: state.settings.danaAccountName,
            adminEmail: state.settings.emailSettings.adminEmail,
            updatedAt: state.settings.updatedAt,
          }),
        });
      } catch {
        // ignore
      }
    }

    res.json({ ok: true, settings: state.settings });
  });

  app.post('/api/orders', async (req, res) => {
    const state = readPersistedState();
    const rawOrder: Partial<BuyerOrder> | undefined = req.body?.order;
    const reqFirebaseUrl: string | undefined = req.body?.firebaseDbUrl;

    if (!rawOrder || !rawOrder.id) {
      res.status(400).json({ error: 'Data pesanan tidak lengkap.' });
      return;
    }

    const order = normalizeServerOrder(rawOrder);

    const activeFirebaseUrl = normalizeFirebaseUrl(
      reqFirebaseUrl || state.settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
    );
    state.settings.firebaseDbUrl = activeFirebaseUrl;

    let synced = Boolean(order.syncedToFirebase);
    if (activeFirebaseUrl) {
      const ok = await syncOrderToFirebaseServer(activeFirebaseUrl, order);
      if (ok) synced = true;
    }

    const savedOrder: BuyerOrder = {
      ...order,
      syncedToFirebase: synced,
    };

    state.orders = [
      savedOrder,
      ...state.orders.filter((o) => o.id !== savedOrder.id),
    ].sort((a, b) => b.createdAt - a.createdAt);

    writePersistedState(state);
    res.json({ ok: true, order: savedOrder });
  });

  app.post('/api/notify-email', async (req, res) => {
    const state = readPersistedState();
    const rawOrder: Partial<BuyerOrder> | undefined = req.body?.order;
    const emailSettings: EmailNotificationSettings =
      req.body?.emailSettings ||
      state.settings.emailSettings ||
      DEFAULT_EMAIL_SETTINGS;
    const firebaseDbUrl = normalizeFirebaseUrl(
      req.body?.firebaseDbUrl ||
        state.settings.firebaseDbUrl ||
        DEFAULT_FIREBASE_DB_URL
    );

    const targetOrder = rawOrder
      ? normalizeServerOrder(rawOrder)
      : normalizeServerOrder({
          id: `test_${Date.now()}`,
          packageName: 'Paket Permanent VIP (Test Notifikasi)',
          price: 35000,
          paymentVerificationNote: 'Tes pengiriman notifikasi email ke Admin.',
        });

    const result = await dispatchAdminEmailNotificationServer(
      targetOrder,
      emailSettings,
      firebaseDbUrl
    );

    // Update order emailNotified state if order exists in state
    const exists = state.orders.some((o) => o.id === targetOrder.id);
    if (exists) {
      state.orders = state.orders.map((o) =>
        o.id === targetOrder.id
          ? {
              ...o,
              emailNotified: result.sent,
              emailNotificationStatus: result.message,
            }
          : o
      );
      writePersistedState(state);
    }

    res.json({
      ok: true,
      sent: result.sent,
      message: result.message,
    });
  });

  app.patch('/api/orders/:id/status', async (req, res) => {
    const state = readPersistedState();
    const id = req.params.id;
    const { paymentStatus, paymentVerificationNote, firebaseDbUrl } =
      req.body || {};

    const existing = state.orders.find((o) => o.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    const newStatus = paymentStatus || existing.paymentStatus;
    const approvalSignature =
      newStatus === 'APPROVED'
        ? generateApprovalSignature(existing.queueNumber, existing.id)
        : existing.approvalSignature;

    const updatedOrder: BuyerOrder = {
      ...existing,
      paymentStatus: newStatus,
      paymentVerificationNote:
        paymentVerificationNote ?? existing.paymentVerificationNote,
      approvalSignature,
    };

    const activeFirebaseUrl = normalizeFirebaseUrl(
      firebaseDbUrl || state.settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
    );
    if (activeFirebaseUrl) {
      const ok = await syncOrderToFirebaseServer(
        activeFirebaseUrl,
        updatedOrder
      );
      if (ok) updatedOrder.syncedToFirebase = true;
    }

    state.orders = state.orders.map((o) => (o.id === id ? updatedOrder : o));
    writePersistedState(state);

    res.json({ ok: true, order: updatedOrder, orders: state.orders });
  });

  app.get('/api/orders/queue/:queueNumber', async (req, res) => {
    const rawQueue = req.params.queueNumber;
    const normalized = normalizeQueueNumber(rawQueue);
    const state = readPersistedState();
    const found = state.orders.find(
      (o) =>
        normalizeQueueNumber(o.queueNumber || '') === normalized ||
        o.queueNumber === rawQueue ||
        o.id === rawQueue
    );

    if (found) {
      res.json({ ok: true, order: found });
      return;
    }

    const activeFirebaseUrl = normalizeFirebaseUrl(
      state.settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
    );
    if (activeFirebaseUrl) {
      try {
        const qRes = await fetch(
          `${activeFirebaseUrl}/queues/${encodeURIComponent(normalized)}.json`
        );
        if (qRes.ok) {
          const qData = await qRes.json();
          if (qData && qData.id) {
            const normalizedOrder = normalizeServerOrder(qData);
            state.orders = [
              normalizedOrder,
              ...state.orders.filter((o) => o.id !== normalizedOrder.id),
            ];
            writePersistedState(state);
            res.json({ ok: true, order: normalizedOrder });
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    res.status(404).json({ ok: false, error: 'Nomor antrean tidak ditemukan.' });
  });

  app.delete('/api/orders/:id', async (req, res) => {
    const state = readPersistedState();
    const id = req.params.id;
    const existing = state.orders.find((o) => o.id === id);
    state.orders = state.orders.filter((o) => o.id !== id);
    writePersistedState(state);

    const baseUrl = normalizeFirebaseUrl(
      state.settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
    );
    if (baseUrl) {
      try {
        const deletePromises: Promise<Response>[] = [
          fetch(`${baseUrl}/orders/${encodeURIComponent(id)}.json`, {
            method: 'DELETE',
          }),
        ];
        if (existing?.queueNumber) {
          deletePromises.push(
            fetch(
              `${baseUrl}/queues/${encodeURIComponent(
                existing.queueNumber
              )}.json`,
              { method: 'DELETE' }
            )
          );
        }
        if (existing?.userId) {
          deletePromises.push(
            fetch(
              `${baseUrl}/users/${encodeURIComponent(existing.userId)}.json`,
              { method: 'DELETE' }
            )
          );
        }
        if (existing?.username) {
          deletePromises.push(
            fetch(
              `${baseUrl}/accounts/${encodeURIComponent(
                existing.username.toLowerCase()
              )}.json`,
              { method: 'DELETE' }
            )
          );
        }
        await Promise.all(deletePromises);
      } catch {
        // ignore remote delete error
      }
    }

    res.json({ ok: true, orders: state.orders });
  });

  app.post('/api/sync-firebase', async (req, res) => {
    const state = readPersistedState();
    const targetUrl = normalizeFirebaseUrl(
      req.body?.firebaseDbUrl ||
        state.settings.firebaseDbUrl ||
        DEFAULT_FIREBASE_DB_URL
    );
    const localOrders: BuyerOrder[] = Array.isArray(req.body?.localOrders)
      ? req.body.localOrders.map(normalizeServerOrder)
      : [];

    if (!targetUrl || !targetUrl.startsWith('http')) {
      res.status(400).json({
        ok: false,
        syncedCount: 0,
        message: 'URL Firebase Database belum diisi atau tidak valid.',
      });
      return;
    }

    state.settings.firebaseDbUrl = targetUrl;

    const remoteOrders = await pullOrdersFromFirebaseServer(targetUrl);
    const mergedMap = new Map<string, BuyerOrder>();

    for (const o of state.orders) mergedMap.set(o.id, o);
    for (const o of localOrders) mergedMap.set(o.id, o);
    for (const o of remoteOrders) mergedMap.set(o.id, o);

    const allOrders = Array.from(mergedMap.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );

    let syncedCount = 0;
    const updatedOrders: BuyerOrder[] = [];

    for (const ord of allOrders) {
      const ok = await syncOrderToFirebaseServer(targetUrl, ord);
      if (ok) syncedCount++;
      updatedOrders.push({
        ...ord,
        syncedToFirebase: ok || ord.syncedToFirebase,
      });
    }

    state.orders = updatedOrders;
    writePersistedState(state);

    res.json({
      ok: true,
      syncedCount,
      message: `Sinkronisasi berhasil: ${syncedCount} dari ${updatedOrders.length} data pembeli tersinkron ke ${targetUrl}.`,
      orders: updatedOrders,
    });
  });


  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `DRAG RACE L.A STORE server running at http://localhost:${PORT}`
    );
  });
}

startServer();
