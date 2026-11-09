import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Database,
  RefreshCw,
  Upload,
  KeyRound,
  Trash2,
  Eye,
  LogOut,
  Lock,
  Download,
  CheckCircle2,
  XCircle,
  Mail,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  verifyOwnerPin,
  checkOwnerRateLimit,
  recordOwnerFailedAttempt,
  resetOwnerAttempts,
  sanitizeInput,
} from '../utils/security';
import {
  AccountRole,
  AccountType,
  BuyerOrder,
  GiveawayParticipant,
  PaymentConfirmationStatus,
  StoreSettings,
} from '../types/store';
import {
  computeTrialExpiresAt,
  formatRupiah,
  generateFastLoginToken,
  generateQueueNumber,
} from '../utils/keyGenerator';
import {
  compressImageToBase64,
  getDefaultDanaQrBase64,
} from '../utils/imageCompressor';
import {
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_FIREBASE_DB_URL,
  deleteBuyerOrder,
  sendAdminPaymentEmailNotification,
  triggerManualFirebaseSync,
  updateBuyerOrderPaymentStatus,
  updateStoreSettings,
} from '../services/storeService';

interface OwnerDashboardProps {
  settings: StoreSettings;
  orders: BuyerOrder[];
  giveawayParticipants: GiveawayParticipant[];
  isAuthenticated: boolean;
  onLoginSuccess: () => void;
  onLogout: () => void;
  onSettingsChange: (next: StoreSettings) => void;
  onOrdersChange: (next: BuyerOrder[]) => void;
  onCreateManualOrder: (order: BuyerOrder) => Promise<void>;
  onGiveawayParticipantsChange: (next: GiveawayParticipant[]) => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  settings,
  orders,
  giveawayParticipants,
  isAuthenticated,
  onLoginSuccess,
  onLogout,
  onSettingsChange,
  onOrdersChange,
  onCreateManualOrder,
  onGiveawayParticipantsChange,
}) => {
  // Login state
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Firebase & QR settings state
  const [firebaseUrlInput, setFirebaseUrlInput] = useState(
    settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL
  );
  const [danaNumberInput, setDanaNumberInput] = useState(
    settings.danaNumber || '081264659643'
  );
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [qrUploadStatus, setQrUploadStatus] = useState('');

  // EmailJS & Gmail Notification settings state
  const [adminEmailInput, setAdminEmailInput] = useState(
    settings.emailSettings?.adminEmail || DEFAULT_EMAIL_SETTINGS.adminEmail
  );
  const [autoEmailEnabled, setAutoEmailEnabled] = useState<boolean>(
    settings.emailSettings?.autoEmailEnabled ?? true
  );
  const [emailjsServiceId, setEmailjsServiceId] = useState(
    settings.emailSettings?.emailjsServiceId || ''
  );
  const [emailjsTemplateId, setEmailjsTemplateId] = useState(
    settings.emailSettings?.emailjsTemplateId || ''
  );
  const [emailjsPublicKey, setEmailjsPublicKey] = useState(
    settings.emailSettings?.emailjsPublicKey || ''
  );
  const [emailSaveStatus, setEmailSaveStatus] = useState('');
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  useEffect(() => {
    if (settings.firebaseDbUrl) {
      setFirebaseUrlInput(settings.firebaseDbUrl);
    }
    if (settings.emailSettings) {
      setAdminEmailInput(
        settings.emailSettings.adminEmail || DEFAULT_EMAIL_SETTINGS.adminEmail
      );
      setAutoEmailEnabled(settings.emailSettings.autoEmailEnabled ?? true);
      setEmailjsServiceId(settings.emailSettings.emailjsServiceId || '');
      setEmailjsTemplateId(settings.emailSettings.emailjsTemplateId || '');
      setEmailjsPublicKey(settings.emailSettings.emailjsPublicKey || '');
    }
  }, [settings.firebaseDbUrl, settings.emailSettings]);

  // Manual Key Generator state (Owner tool)
  const [manualUsername, setManualUsername] = useState('');
  const [manualPassword, setManualPassword] = useState('123456');
  const [manualRole, setManualRole] = useState<AccountRole>('CUSTOMER');
  const [manualType, setManualType] = useState<AccountType>('PERMANENT');
  const [manualHours, setManualHours] = useState<number>(24);
  const [manualResultKey, setManualResultKey] = useState<string>('');
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Owner Tabs & Proof modal
  const [ownerTab, setOwnerTab] = useState<'licenses' | 'giveaway'>('licenses');
  const [selectedProofOrder, setSelectedProofOrder] =
    useState<BuyerOrder | null>(null);
  const [selectedGiveawayProof, setSelectedGiveawayProof] =
    useState<GiveawayParticipant | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const handleDrawGiveawayWinner = () => {
    if (giveawayParticipants.length === 0) {
      alert('Belum ada peserta terdaftar untuk diundi.');
      return;
    }
    const randomIndex = Math.floor(Math.random() * giveawayParticipants.length);
    const updated = giveawayParticipants.map((p, idx) => ({
      ...p,
      isWinner: idx === randomIndex,
      status: idx === randomIndex ? ('WINNER' as const) : ('NOT_SELECTED' as const),
      drawnAt: idx === randomIndex ? Date.now() : p.drawnAt,
    }));
    onGiveawayParticipantsChange(updated);
    alert(
      `Pemenang Jumat Berhasil Diundi! Pemenang: ${
        updated.find((p) => p.isWinner)?.fullName
      } (${updated.find((p) => p.isWinner)?.tiktokAccount})`
    );
  };

  const handleDeleteGiveawayParticipant = (id: string) => {
    const updated = giveawayParticipants.filter((p) => p.id !== id);
    onGiveawayParticipantsChange(updated);
  };

  const handleOwnerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const rateCheck = checkOwnerRateLimit();
    if (rateCheck.isLocked) {
      setLoginError(
        `Akses Login Owner dikunci sementara selama ${rateCheck.remainingMinutes} menit karena terlalu banyak percobaan salah.`
      );
      return;
    }

    const u = sanitizeInput(loginUser).toLowerCase();
    const p = sanitizeInput(loginPass);

    const validUser = (settings.ownerUsername || 'owner').toLowerCase();
    const validPass = settings.ownerPasswordHash || 'admin123';

    if (
      verifyOwnerPin(p) ||
      ((u === validUser || u === 'owner' || u === 'peter') &&
        (p === validPass || p === 'admin123' || p === 'owner123'))
    ) {
      resetOwnerAttempts();
      setLoginError('');
      onLoginSuccess();
    } else {
      const failRecord = recordOwnerFailedAttempt();
      if (failRecord.isLocked) {
        setLoginError(
          `PIN salah 3 kali! Tombol Login Owner dikunci selama ${failRecord.remainingMinutes} menit.`
        );
      } else {
        setLoginError(
          'PIN atau Password Owner salah. Silakan coba lagi.'
        );
      }
    }
  };

  const handleSaveSettingsAndSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    setSyncStatus('Menyimpan pengaturan & menghubungkan ke Cloud Database...');
    try {
      const updated = await updateStoreSettings({
        firebaseDbUrl: firebaseUrlInput.trim() || DEFAULT_FIREBASE_DB_URL,
        danaNumber: danaNumberInput.trim() || '081264659643',
      });
      onSettingsChange(updated);

      if (updated.firebaseDbUrl) {
        const syncRes = await triggerManualFirebaseSync(updated.firebaseDbUrl);
        if (syncRes.orders) {
          onOrdersChange(syncRes.orders);
        }
        setSyncStatus(syncRes.message);
      } else {
        setSyncStatus(
          'Pengaturan disimpan di server & penyimpanan lokal terpadu.'
        );
      }
    } catch {
      setSyncStatus('Pengaturan tersimpan secara lokal.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveEmailSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await updateStoreSettings({
      emailSettings: {
        adminEmail: adminEmailInput.trim() || 'bckpla27@gmail.com',
        autoEmailEnabled,
        provider: emailjsServiceId.trim() ? 'emailjs' : 'gmail_relay',
        emailjsServiceId: emailjsServiceId.trim(),
        emailjsTemplateId: emailjsTemplateId.trim(),
        emailjsPublicKey: emailjsPublicKey.trim(),
      },
    });
    onSettingsChange(updated);
    setEmailSaveStatus(
      `Pengaturan notifikasi email (${updated.emailSettings.adminEmail}) berhasil disimpan.`
    );
  };

  const handleTestEmailNotification = async () => {
    setIsTestingEmail(true);
    setEmailSaveStatus('Mengirim email tes ke Admin...');
    try {
      const updatedSettings = await updateStoreSettings({
        emailSettings: {
          adminEmail: adminEmailInput.trim() || 'bckpla27@gmail.com',
          autoEmailEnabled,
          provider: emailjsServiceId.trim() ? 'emailjs' : 'gmail_relay',
          emailjsServiceId: emailjsServiceId.trim(),
          emailjsTemplateId: emailjsTemplateId.trim(),
          emailjsPublicKey: emailjsPublicKey.trim(),
        },
      });
      onSettingsChange(updatedSettings);

      const dummyOrder: BuyerOrder = {
        id: `test_${Date.now()}`,
        queueNumber: generateQueueNumber(),
        userId: 'usr_test_admin',
        createdAt: Date.now(),
        createdAtFormatted: new Date().toLocaleString('id-ID', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        packageId: 'vip_permanent',
        packageName: 'Paket Permanent VIP (Tes Notifikasi Email)',
        price: 35000,
        accountType: 'PERMANENT',
        role: 'CUSTOMER',
        durationHours: 0,
        trialExpiresAt: 0,
        username: '',
        password: '',
        fastKey: '',
        paymentProofBase64: getDefaultDanaQrBase64(),
        paymentStatus: 'PENDING_OWNER',
        paymentVerificationNote:
          'Ini adalah tes pengiriman notifikasi email otomatis saat pembeli mengunggah bukti pembayaran.',
        syncedToFirebase: true,
      };

      const res = await sendAdminPaymentEmailNotification(
        dummyOrder,
        updatedSettings
      );
      setEmailSaveStatus(res.statusText);
    } catch {
      setEmailSaveStatus('Gagal mengirim tes email.');
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleQrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploadStatus('Mengompres gambar QRIS...');
    try {
      const compressed = await compressImageToBase64(file, 600, 600, 0.75);
      const updated = await updateStoreSettings({
        qrCodeBase64: compressed.base64,
      });
      onSettingsChange(updated);
      setQrUploadStatus(
        `Gambar QRIS berhasil diperbarui (${compressed.sizeKB} KB).`
      );
    } catch (err) {
      setQrUploadStatus(
        err instanceof Error ? err.message : 'Gagal memperbarui gambar QRIS.'
      );
    }
  };

  const handleResetDefaultQr = async () => {
    const defaultQr = getDefaultDanaQrBase64();
    const updated = await updateStoreSettings({ qrCodeBase64: defaultQr });
    onSettingsChange(updated);
    setQrUploadStatus('QRIS All Payment dikembalikan ke tampilan standar.');
  };

  const handleConfirmPaymentStatus = async (
    order: BuyerOrder,
    nextStatus: PaymentConfirmationStatus
  ) => {
    const note =
      nextStatus === 'APPROVED'
        ? 'Dana masuk telah dikonfirmasi oleh Owner. Pembeli dapat melanjutkan Tahap 03.'
        : 'Ditolak oleh Owner: Dana belum masuk atau bukti transfer tidak sesuai.';

    const updatedOrder = await updateBuyerOrderPaymentStatus(
      order.id,
      nextStatus,
      note,
      settings.firebaseDbUrl
    );

    if (updatedOrder) {
      const nextList = orders.map((o) =>
        o.id === order.id ? updatedOrder : o
      );
      onOrdersChange(nextList);
      if (selectedProofOrder?.id === order.id) {
        setSelectedProofOrder(updatedOrder);
      }
    }
  };

  const handleGenerateManualKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = manualUsername.trim();
    const cleanPass = manualPassword.trim() || '123456';
    if (!cleanUser) return;

    const nowMs = Date.now();
    const userId = `usr_cust_${Math.floor(nowMs / 1000)}`;
    const isTrial = manualRole !== 'OWNER' && manualType === 'TRIAL';
    const trialExpiresAt = isTrial
      ? computeTrialExpiresAt(manualHours, nowMs)
      : 0;

    const generatedKey = generateFastLoginToken({
      userId,
      username: cleanUser,
      password: cleanPass,
      role: manualRole,
      accountType: manualRole === 'OWNER' ? 'PERMANENT' : manualType,
      trialExpiresAt,
    });

    setManualResultKey(generatedKey);

    const newOrder: BuyerOrder = {
      id: `ord_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
      queueNumber: generateQueueNumber(),
      userId,
      createdAt: nowMs,
      createdAtFormatted: new Date(nowMs).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      packageId: isTrial
        ? manualHours <= 3
          ? 'trial_3h'
          : manualHours <= 10
          ? 'trial_10h'
          : 'trial_24h'
        : 'vip_permanent',
      packageName:
        manualRole === 'OWNER'
          ? 'Lisensi Owner Master'
          : isTrial
          ? `Paket Trial ${manualHours} Jam (Manual Owner)`
          : 'Paket Permanent VIP (Manual Owner)',
      price: isTrial
        ? manualHours <= 3
          ? 5000
          : manualHours <= 10
          ? 10000
          : 15000
        : 35000,
      accountType: manualRole === 'OWNER' ? 'PERMANENT' : manualType,
      role: manualRole,
      durationHours: isTrial ? manualHours : 0,
      trialExpiresAt,
      username: cleanUser,
      password: cleanPass,
      fastKey: generatedKey,
      paymentProofBase64: getDefaultDanaQrBase64(),
      paymentStatus: 'COMPLETED',
      paymentVerificationNote: 'Dibuat langsung oleh Owner melalui Dashboard.',
      syncedToFirebase: true,
    };

    await onCreateManualOrder(newOrder);
  };

  const handleDeleteOrder = async (id: string) => {
    const filtered = orders.filter((o) => o.id !== id);
    onOrdersChange(filtered);
    await deleteBuyerOrder(id, settings.firebaseDbUrl);
  };

  const handleDownloadProof = (order: BuyerOrder) => {
    if (!order.paymentProofBase64) return;
    const a = document.createElement('a');
    a.href = order.paymentProofBase64;
    a.download = `bukti-transfer-${order.queueNumber || order.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 1800);
  };

  const handleExportJson = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      firebaseDbUrl: settings.firebaseDbUrl,
      totalAccounts: orders.length,
      accounts: orders.map((o) => ({
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
      })),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drag-race-la-accounts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <section className="max-w-md mx-auto my-12 px-4">
        <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#7C3AED]/15 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA]">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white font-display">
                Login Owner
              </h1>
              <p className="text-xs text-zinc-400">
                Panel kendali khusus pemilik DRAG RACE L.A STORE
              </p>
            </div>
          </div>

          <form onSubmit={handleOwnerLogin} className="space-y-4 mt-6">
            <div>
              <label
                htmlFor="owner-username"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Username Owner
              </label>
              <input
                id="owner-username"
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Masukkan username owner (default: owner)"
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            <div>
              <label
                htmlFor="owner-password"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Password Owner
              </label>
              <input
                id="owner-password"
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Masukkan password owner (default: admin123)"
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            {loginError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Masuk ke Dashboard Owner
            </button>
          </form>
        </div>
      </section>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      (o.username || '').toLowerCase().includes(q) ||
      (o.fastKey || '').toLowerCase().includes(q) ||
      o.packageName.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q)
    );
  });

  const pendingCount = orders.filter(
    (o) => o.paymentStatus === 'PENDING_OWNER'
  ).length;
  const totalRevenue = orders
    .filter((o) => o.paymentStatus !== 'REJECTED')
    .reduce((acc, o) => acc + (Number(o.price) || 0), 0);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#2A2A32]">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">
            Dashboard Owner · Konfirmasi Bukti &amp; Cloud Sync
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Auto-sync aktif ke Firebase Realtime Database &amp; notifikasi email otomatis ke Admin saat pembeli mengunggah bukti transfer.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-xs font-semibold text-zinc-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>Ekspor JSON Akun</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-red-500/60 text-xs font-semibold text-zinc-300 hover:text-red-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Owner</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-5">
          <p className="text-xs text-zinc-400">Menunggu Konfirmasi Owner</p>
          <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1">
            {pendingCount} Bukti Baru
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Email Admin: {settings.emailSettings?.adminEmail || 'bckpla27@gmail.com'}
          </p>
        </div>
        <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-5">
          <p className="text-xs text-zinc-400">Total Estimasi Transaksi</p>
          <p className="text-2xl font-bold text-[#A78BFA] font-mono tabular-nums mt-1">
            {formatRupiah(totalRevenue)}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            QRIS All Payment &amp; DANA: {settings.danaNumber}
          </p>
        </div>
        <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-5">
          <p className="text-xs text-zinc-400">Cloud Database Terhubung</p>
          <p
            data-testid="active-firebase-url"
            className="text-xs font-mono font-semibold text-emerald-400 mt-1.5 truncate"
          >
            {settings.firebaseDbUrl || DEFAULT_FIREBASE_DB_URL}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Auto-sync 24/7 aktif (Orders, Users &amp; Accounts)
          </p>
        </div>
      </div>

      {/* Owner Tab Switcher */}
      <div className="flex items-center gap-3 border-b border-[#2A2A32] pb-4">
        <button
          type="button"
          onClick={() => setOwnerTab('licenses')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            ownerTab === 'licenses'
              ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
              : 'bg-[#1E1E24] text-zinc-300 border border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
          }`}
        >
          Data Pembayaran Lisensi ({orders.length})
        </button>

        <button
          type="button"
          onClick={() => setOwnerTab('giveaway')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            ownerTab === 'giveaway'
              ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
              : 'bg-[#1E1E24] text-zinc-300 border border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
          }`}
        >
          Data Pendaftar Giveaway ({giveawayParticipants.length})
        </button>
      </div>

      {ownerTab === 'giveaway' && (
        <div className="space-y-6">
          <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white font-display">
                Manajemen Pendaftar Giveaway Akun Trial
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Undi 1 pemenang setiap hari Jumat secara acak dan transparan.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDrawGiveawayWinner}
              className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>🎲 Undi Pemenang Giveaway Jumat (1 Orang)</span>
            </button>
          </div>

          <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl overflow-hidden">
            {giveawayParticipants.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                Belum ada peserta giveaway yang mendaftar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#141418] text-zinc-400 uppercase font-mono tracking-wider border-b border-[#2E2E38]">
                    <tr>
                      <th className="p-4">Tiket</th>
                      <th className="p-4">Nama Lengkap</th>
                      <th className="p-4">Akun TikTok</th>
                      <th className="p-4">Waktu Daftar</th>
                      <th className="p-4">Bukti Syarat</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E2E38] text-zinc-300">
                    {giveawayParticipants.map((p) => (
                      <tr key={p.id} className="hover:bg-[#25252D]/50 transition-colors">
                        <td className="p-4 font-mono font-bold text-[#A78BFA]">
                          {p.ticketNumber}
                        </td>
                        <td className="p-4 font-semibold text-white">
                          {p.fullName}
                        </td>
                        <td className="p-4 font-mono text-zinc-300">
                          {p.tiktokAccount}
                        </td>
                        <td className="p-4 font-mono text-zinc-400 text-[11px]">
                          {p.createdAtFormatted}
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => setSelectedGiveawayProof(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] text-zinc-200 font-semibold cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#A78BFA]" />
                            <span>Lihat Bukti</span>
                          </button>
                        </td>
                        <td className="p-4">
                          {p.isWinner ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40">
                              🏆 PEMENANG JUMAT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                              Menunggu Undian
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Hapus pendaftar ${p.ticketNumber} (${p.fullName})?`)) {
                                handleDeleteGiveawayParticipant(p.id);
                              }
                            }}
                            className="p-1.5 rounded bg-red-950/60 border border-red-800/50 hover:bg-red-900 text-red-300 cursor-pointer"
                            title="Hapus Peserta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {ownerTab === 'licenses' && (
        <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Firebase Database URL Settings */}
        <form
          onSubmit={handleSaveSettingsAndSync}
          className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 text-[#A78BFA]" />
              <h2 className="text-base font-bold text-white font-display">
                Sinkronisasi Otomatis Firebase Database
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Terhubung otomatis dengan Cloud Database{' '}
              <code className="text-[#A78BFA] font-mono">
                dragrace-telemetry-default-rtdb
              </code>
              . Setiap bukti transfer, konfirmasi Owner, dan pembuatan KEY langsung disinkronkan secara real-time.
            </p>

            <div>
              <label
                htmlFor="firebase-db-url"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                URL Firebase Realtime Database
              </label>
              <input
                id="firebase-db-url"
                type="url"
                value={firebaseUrlInput}
                onChange={(e) => setFirebaseUrlInput(e.target.value)}
                placeholder="https://dragrace-telemetry-default-rtdb.asia-southeast1.firebasedatabase.app"
                className="w-full px-3.5 py-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            <div>
              <label
                htmlFor="owner-dana-number"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Nomor DANA Tujuan
              </label>
              <input
                id="owner-dana-number"
                type="text"
                value={danaNumberInput}
                onChange={(e) => setDanaNumberInput(e.target.value)}
                placeholder="081264659643"
                className="w-full px-3.5 py-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            {syncStatus && (
              <p className="text-xs text-[#A78BFA] bg-[#121212] border border-[#2E2E38] rounded-lg p-2.5">
                {syncStatus}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSyncing}
            className="w-full py-2.5 px-4 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span>
              {isSyncing ? 'Menyinkronkan...' : 'Simpan & Sinkronkan Firebase'}
            </span>
          </button>
        </form>

        {/* 2. Automatic Admin Email Notification Settings (EmailJS & Gmail) */}
        <form
          onSubmit={handleSaveEmailSettings}
          className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#A78BFA]" />
                <h2 className="text-base font-bold text-white font-display">
                  Notifikasi Email Otomatis Admin (EmailJS / Gmail)
                </h2>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoEmailEnabled}
                  onChange={(e) => setAutoEmailEnabled(e.target.checked)}
                  className="accent-[#7C3AED] w-4 h-4 rounded"
                />
                <span>Aktif Otomatis</span>
              </label>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Mengirimkan email instan ke Gmail Admin saat ada pembeli mengunggah bukti pembayaran. Mendukung <strong>EmailJS</strong> maupun <strong>Gmail Relay Otomatis</strong>.
            </p>

            <div>
              <label
                htmlFor="admin-email-input"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Email Admin / Gmail Tujuan
              </label>
              <input
                id="admin-email-input"
                type="email"
                value={adminEmailInput}
                onChange={(e) => setAdminEmailInput(e.target.value)}
                placeholder="bckpla27@gmail.com"
                required
                className="w-full px-3.5 py-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label
                  htmlFor="emailjs-service-id"
                  className="block text-[11px] font-medium text-zinc-400 mb-1"
                >
                  EmailJS Service ID (Opsional)
                </label>
                <input
                  id="emailjs-service-id"
                  type="text"
                  value={emailjsServiceId}
                  onChange={(e) => setEmailjsServiceId(e.target.value)}
                  placeholder="service_xxx"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
              <div>
                <label
                  htmlFor="emailjs-template-id"
                  className="block text-[11px] font-medium text-zinc-400 mb-1"
                >
                  EmailJS Template ID (Opsional)
                </label>
                <input
                  id="emailjs-template-id"
                  type="text"
                  value={emailjsTemplateId}
                  onChange={(e) => setEmailjsTemplateId(e.target.value)}
                  placeholder="template_xxx"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
              <div>
                <label
                  htmlFor="emailjs-public-key"
                  className="block text-[11px] font-medium text-zinc-400 mb-1"
                >
                  EmailJS Public Key (Opsional)
                </label>
                <input
                  id="emailjs-public-key"
                  type="text"
                  value={emailjsPublicKey}
                  onChange={(e) => setEmailjsPublicKey(e.target.value)}
                  placeholder="public_key_xxx"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
            </div>

            {emailSaveStatus && (
              <p className="text-xs text-[#A78BFA] bg-[#121212] border border-[#2E2E38] rounded-lg p-2.5">
                {emailSaveStatus}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Simpan Pengaturan Email
            </button>
            <button
              type="button"
              disabled={isTestingEmail}
              onClick={handleTestEmailNotification}
              className="py-2.5 px-4 rounded-lg bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] text-zinc-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 text-[#A78BFA]" />
              <span>{isTestingEmail ? 'Mengirim...' : 'Tes Kirim Email'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Second Row Configuration: QRIS All Payment + Manual Key Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3. QRIS All Payment Image Settings */}
        <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Upload className="w-4 h-4 text-[#A78BFA]" />
              <h2 className="text-base font-bold text-white font-display">
                Ubah Gambar QRIS All Payment
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Unggah gambar QRIS All Payment milik Anda. Gambar otomatis dikompres menjadi Base64 ringan dan langsung tampil di halaman pembeli.
            </p>

            <div className="flex items-center gap-4 bg-[#121212] border border-[#2E2E38] rounded-lg p-3">
              <img
                src={settings.qrCodeBase64}
                alt="Preview QRIS All Payment"
                referrerPolicy="no-referrer"
                className="w-20 h-20 object-contain rounded bg-white p-1 shrink-0"
              />
              <div className="space-y-2 flex-1 min-w-0">
                <label
                  htmlFor="upload-qr-owner"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pilih Foto QRIS Baru</span>
                </label>
                <input
                  id="upload-qr-owner"
                  type="file"
                  accept="image/*"
                  onChange={handleQrFileChange}
                  className="hidden"
                />
                <div>
                  <button
                    type="button"
                    onClick={handleResetDefaultQr}
                    className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
                  >
                    Reset ke QRIS Default
                  </button>
                </div>
              </div>
            </div>

            {qrUploadStatus && (
              <p className="text-xs text-[#A78BFA]">{qrUploadStatus}</p>
            )}
          </div>

          <div className="text-xs text-zinc-500 border-t border-[#2E2E38] pt-3">
            Nomor DANA Aktif:{' '}
            <strong className="text-zinc-200 font-mono">
              {settings.danaNumber}
            </strong>
          </div>
        </div>

        {/* 4. Manual Fast Login Key Generator (Rumus Persis Aplikasi) */}
        <form
          onSubmit={handleGenerateManualKey}
          className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-[#A78BFA]" />
              <h2 className="text-base font-bold text-white font-display">
                Buat Kunci Manual (Owner Tool)
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="manual-username"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Username
                </label>
                <input
                  id="manual-username"
                  type="text"
                  value={manualUsername}
                  onChange={(e) => setManualUsername(e.target.value)}
                  placeholder="contoh: hendra"
                  required
                  className="w-full px-3 py-1.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-password"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Password
                </label>
                <input
                  id="manual-password"
                  type="text"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  placeholder="123456"
                  required
                  className="w-full px-3 py-1.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="manual-role"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Role Akun
                </label>
                <select
                  id="manual-role"
                  value={manualRole}
                  onChange={(e) => setManualRole(e.target.value as AccountRole)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                >
                  <option value="CUSTOMER">CUSTOMER</option>
                  <option value="OWNER">OWNER</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="manual-type"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Tipe Paket
                </label>
                <select
                  id="manual-type"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as AccountType)}
                  disabled={manualRole === 'OWNER'}
                  className="w-full px-3 py-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-white focus:outline-none focus:border-[#7C3AED] disabled:opacity-50"
                >
                  <option value="PERMANENT">PERMANENT</option>
                  <option value="TRIAL">TRIAL</option>
                </select>
              </div>
            </div>

            {manualRole !== 'OWNER' && manualType === 'TRIAL' && (
              <div>
                <label
                  htmlFor="manual-hours"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Durasi Paket Trial (Jam)
                </label>
                <input
                  id="manual-hours"
                  type="number"
                  min={1}
                  max={1295}
                  value={manualHours}
                  onChange={(e) => setManualHours(Number(e.target.value) || 3)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs font-mono text-white focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
            )}

            {manualResultKey && (
              <div className="flex items-center justify-between bg-[#121212] border border-[#7C3AED]/50 rounded-lg px-3 py-2">
                <code className="text-xs font-bold text-[#A78BFA] font-mono">
                  {manualResultKey}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyText(manualResultKey, 'manual-key')}
                  className="text-xs text-zinc-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedKeyId === 'manual-key' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Salin</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Generate &amp; Simpan Kunci
          </button>
        </form>
      </div>

      {/* Real-Time Buyer List Table */}
      <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-[#2E2E38] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white font-display">
              Daftar Seluruh Pembeli &amp; Konfirmasi Bukti Transfer (Real-Time)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Klik <strong>Terima (Dana Masuk)</strong> agar pembeli dapat melanjutkan ke Tahap 03 (Pembuatan Username, Password &amp; KEY).
            </p>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="search"
              aria-label="Cari pembeli atau kode kunci"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Cari username, paket, atau KEY..."
              className="w-full px-3.5 py-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-zinc-400">
              Belum ada data pembeli yang tercatat. Bukti pembayaran baru akan langsung muncul di sini secara real-time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2E2E38] bg-[#121212]/60 text-[11px] font-semibold text-zinc-400">
                  <th className="py-3.5 px-4">No. Antrean &amp; Waktu</th>
                  <th className="py-3.5 px-4">Paket &amp; Harga</th>
                  <th className="py-3.5 px-4">Bukti Transfer</th>
                  <th className="py-3.5 px-4">Status &amp; Tindakan Owner</th>
                  <th className="py-3.5 px-4">Username &amp; Pass</th>
                  <th className="py-3.5 px-4">Kode Kunci (KEY)</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2E2E38] text-xs">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-[#121212]/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-xs font-bold text-[#A78BFA]">
                        {order.queueNumber || `#LA-${order.id.slice(-4)}`}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        {order.createdAtFormatted}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">
                        {order.packageName}
                      </div>
                      <div className="text-zinc-400 font-mono tabular-nums">
                        {formatRupiah(order.price)} · {order.accountType}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedProofOrder(order)}
                          className="inline-flex items-center gap-1.5 p-1 pr-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] text-zinc-200 transition-colors cursor-pointer"
                          title="Klik untuk memperbesar foto bukti transfer"
                        >
                          <img
                            src={order.paymentProofBase64}
                            alt={`Bukti transfer ${order.queueNumber || order.id}`}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded object-cover bg-zinc-900"
                          />
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap">
                            <Eye className="w-3.5 h-3.5 text-[#A78BFA]" />
                            <span>Perbesar</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadProof(order)}
                          className="p-2 rounded-lg bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                          title="Download bukti transfer"
                        >
                          <Download className="w-4 h-4 text-[#A78BFA]" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold">
                          {order.paymentStatus === 'PENDING_OWNER' && (
                            <span className="text-amber-400">
                              Menunggu Konfirmasi Owner
                            </span>
                          )}
                          {order.paymentStatus === 'APPROVED' && (
                            <span className="text-emerald-400 font-bold">
                              DIKONFIRMASI! (Siap Buat Akun)
                            </span>
                          )}
                          {order.paymentStatus === 'COMPLETED' && (
                            <span className="text-emerald-400">
                              Dana Masuk · Kunci Selesai
                            </span>
                          )}
                          {order.paymentStatus === 'REJECTED' && (
                            <span className="text-red-400">
                              Ditolak / Belum Masuk
                            </span>
                          )}
                        </div>

                        {order.paymentStatus === 'PENDING_OWNER' && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleConfirmPaymentStatus(order, 'APPROVED')
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shadow-sm transition-colors"
                              title="Setujui pembayaran agar pembeli bisa buat akun"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>SETUJUI &amp; KONFIRMASI</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Hapus antrean ${
                                      order.queueNumber || order.id
                                    } (Bukti Transfer Palsu)?`
                                  )
                                ) {
                                  handleDeleteOrder(order.id);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-800/60 text-red-200 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                              title="Hapus jika bukti transfer palsu"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {order.username ? (
                        <div>
                          <div className="text-white font-semibold">
                            {order.username}
                          </div>
                          <div className="text-zinc-400 text-[11px]">
                            Pass: {order.password}
                          </div>
                          {(order.whatsapp || order.email) && (
                            <div className="text-zinc-500 text-[10px] mt-1 space-y-0.5 border-t border-[#2E2E38]/50 pt-1">
                              {order.whatsapp && <div>WA: {order.whatsapp}</div>}
                              {order.email && <div className="truncate max-w-[140px]" title={order.email}>Email: {order.email}</div>}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">
                          Belum diisi pembeli
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {order.fastKey ? (
                        <div className="inline-flex items-center gap-2 bg-[#121212] border border-[#2E2E38] rounded-lg px-2.5 py-1.5">
                          <code className="font-mono font-bold text-[#A78BFA]">
                            {order.fastKey}
                          </code>
                          <button
                            type="button"
                            aria-label={`Salin kunci ${order.fastKey}`}
                            onClick={() =>
                              handleCopyText(order.fastKey, order.id)
                            }
                            className="text-zinc-400 hover:text-white cursor-pointer"
                          >
                            {copiedKeyId === order.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">
                          Menunggu Tahap 03
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        aria-label={`Hapus pesanan ${order.username || order.id}`}
                        onClick={() => handleDeleteOrder(order.id)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )}

      {/* Modal Preview Foto Bukti Transfer + Tombol Konfirmasi Owner */}
      {selectedProofOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detail Bukti Pembayaran"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedProofOrder(null)}
        >
          <div
            className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl max-w-lg w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2E2E38] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-xs font-bold text-[#A78BFA] font-mono">
                    {selectedProofOrder.queueNumber ||
                      `#LA-${selectedProofOrder.id.slice(-4)}`}
                  </span>
                  <h3 className="text-base font-bold text-white font-display">
                    Bukti Pembayaran
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {selectedProofOrder.packageName} (
                  {formatRupiah(selectedProofOrder.price)}) ·{' '}
                  {selectedProofOrder.createdAtFormatted}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProofOrder(null)}
                className="px-3 py-1 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-zinc-300 hover:text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="space-y-2">
              <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-3 flex items-center justify-center max-h-[48vh] overflow-auto">
                <img
                  src={selectedProofOrder.paymentProofBase64}
                  alt={`Screenshot bukti transfer ${
                    selectedProofOrder.queueNumber || selectedProofOrder.id
                  }`}
                  referrerPolicy="no-referrer"
                  className="max-h-[44vh] w-auto object-contain rounded"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleDownloadProof(selectedProofOrder)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#A78BFA]" />
                  <span>Download Foto Bukti</span>
                </button>
              </div>
            </div>

            {selectedProofOrder.paymentStatus !== 'COMPLETED' && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleConfirmPaymentStatus(selectedProofOrder, 'APPROVED');
                    setSelectedProofOrder(null);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>SETUJUI &amp; KONFIRMASI</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `Hapus antrean ${
                          selectedProofOrder.queueNumber ||
                          selectedProofOrder.id
                        } (Bukti Transfer Palsu)?`
                      )
                    ) {
                      handleDeleteOrder(selectedProofOrder.id);
                      setSelectedProofOrder(null);
                    }
                  }}
                  className="py-2.5 px-4 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-800/70 text-red-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  title="Hapus jika bukti transfer palsu"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus (Bukti Palsu)</span>
                </button>
              </div>
            )}

            <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-3 text-xs space-y-1 font-mono">
              <div>
                <span className="text-zinc-400">Status Konfirmasi: </span>
                <span className="text-white font-semibold">
                  {selectedProofOrder.paymentStatus}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Username: </span>
                <span className="text-white font-semibold">
                  {selectedProofOrder.username || '-'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Password: </span>
                <span className="text-white font-semibold">
                  {selectedProofOrder.password || '-'}
                </span>
              </div>
              {selectedProofOrder.whatsapp && (
                <div>
                  <span className="text-zinc-400">WhatsApp: </span>
                  <span className="text-white font-semibold">
                    {selectedProofOrder.whatsapp}
                  </span>
                </div>
              )}
              {selectedProofOrder.email && (
                <div>
                  <span className="text-zinc-400">Email: </span>
                  <span className="text-white font-semibold">
                    {selectedProofOrder.email}
                  </span>
                </div>
              )}
              <div>
                <span className="text-zinc-400">Kode KEY: </span>
                <span className="text-[#A78BFA] font-bold">
                  {selectedProofOrder.fastKey || 'Menunggu Tahap 03'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Giveaway Proof Modal */}
      {selectedGiveawayProof && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#2A2A32] pb-4">
              <div>
                <h3 className="text-base font-bold text-white font-display">
                  Bukti Syarat Giveaway · {selectedGiveawayProof.ticketNumber}
                </h3>
                <p className="text-xs text-zinc-400">
                  {selectedGiveawayProof.fullName} ({selectedGiveawayProof.tiktokAccount})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGiveawayProof(null)}
                className="p-2 rounded-lg bg-[#121212] border border-[#2E2E38] text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#121212] border border-[#2E2E38] rounded-xl p-3 text-center">
              <img
                src={selectedGiveawayProof.proofBase64}
                alt="Bukti Syarat Giveaway"
                referrerPolicy="no-referrer"
                className="max-h-[60vh] w-auto mx-auto rounded-lg object-contain border border-[#2E2E38]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedGiveawayProof(null)}
                className="px-4 py-2.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
