import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Check,
  Copy,
  Upload,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  Ticket,
  FileCheck2,
  ExternalLink,
  MessageCircle,
  Gift,
  Send,
  Database,
  Timer,
  History,
  Video,
  LineChart,
  Settings as SettingsIcon,
  User,
  Eye,
  Play,
  Pause,
  RotateCcw,
  X,
  Gauge,
  Maximize2,
  Activity,
  Layers,
  Download,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';
import {
  BuyerOrder,
  GiveawayParticipant,
  PackageOption,
  StoreSettings,
} from '../types/store';
import {
  LICENSE_PACKAGES,
  computeTrialExpiresAt,
  formatRupiah,
  generateFastLoginToken,
  generateQueueNumber,
  normalizeQueueNumber,
} from '../utils/keyGenerator';
import { compressImageToBase64 } from '../utils/imageCompressor';
import {
  getActiveBuyerOrderId,
  generateGiveawayTicketNumber,
  getLastQueueNumber,
  sendAdminPaymentEmailNotification,
  setActiveBuyerOrderId,
  setLastQueueNumber,
} from '../services/storeService';

interface BuyerStorefrontProps {
  settings: StoreSettings;
  orders: BuyerOrder[];
  giveawayParticipants: GiveawayParticipant[];
  activeTab: 'download' | 'buy' | 'status' | 'features' | 'giveaway';
  onSelectTab: (
    tab: 'download' | 'buy' | 'status' | 'features' | 'giveaway'
  ) => void;
  onOrderCreatedOrUpdated: (order: BuyerOrder) => Promise<BuyerOrder>;
  onRefreshState: () => Promise<void>;
  onBrandTitleClick: () => void;
  onGiveawaySubmitted: (participant: GiveawayParticipant) => void;
}

export const BuyerStorefront: React.FC<BuyerStorefrontProps> = ({
  settings,
  orders,
  giveawayParticipants,
  activeTab,
  onSelectTab,
  onOrderCreatedOrUpdated,
  onRefreshState,
  onBrandTitleClick,
  onGiveawaySubmitted,
}) => {
  // 1. Order & Queue Tracking state
  const [activeOrderId, setActiveOrderIdState] = useState<string | null>(() =>
    getActiveBuyerOrderId()
  );
  const [lastQueueNum, setLastQueueNumState] = useState<string | null>(() =>
    getLastQueueNumber()
  );

  // Active order object from orders list or fallback
  const activeOrder = orders.find((o) => o.id === activeOrderId) || null;

  // Selected License Package (Default: Paket Permanent VIP promo)
  const [selectedPackage, setSelectedPackage] = useState<PackageOption>(
    LICENSE_PACKAGES[3]
  );

  // 2. Upload state
  const [danaCopied, setDanaCopied] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewBase64, setPreviewBase64] = useState<string>('');
  const [proofSizeKB, setProofSizeKB] = useState<number>(0);
  const [isSubmittingProof, setIsSubmittingProof] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [newlyCreatedTicket, setNewlyCreatedTicket] =
    useState<BuyerOrder | null>(null);
  const [queueCopied, setQueueCopied] = useState<boolean>(false);

  // 3. Giveaway state
  const [gwFullName, setGwFullName] = useState<string>('');
  const [gwTiktokAccount, setGwTiktokAccount] = useState<string>('');
  const [gwSelectedFile, setGwSelectedFile] = useState<File | null>(null);
  const [gwPreviewBase64, setGwPreviewBase64] = useState<string>('');
  const [gwIsSubmitting, setGwIsSubmitting] = useState<boolean>(false);
  const [gwError, setGwError] = useState<string>('');
  const [newlyCreatedGwTicket, setNewlyCreatedGwTicket] =
    useState<GiveawayParticipant | null>(null);
  const [gwTicketCopied, setGwTicketCopied] = useState<boolean>(false);

  const handleGwFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGwError('');
    setGwSelectedFile(file);
    try {
      const compressed = await compressImageToBase64(file, 720, 720, 0.65);
      setGwPreviewBase64(compressed.base64);
    } catch {
      setGwError('Gagal memproses file gambar bukti giveaway.');
    }
  };

  const handleGiveawaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gwPreviewBase64) {
      setGwError('Silakan unggah foto bukti follow & like.');
      return;
    }
    const cleanName = gwFullName.trim();
    const cleanTiktok = gwTiktokAccount.trim();
    if (!cleanName || !cleanTiktok) {
      setGwError('Nama lengkap dan akun TikTok wajib diisi.');
      return;
    }

    setGwError('');
    setGwIsSubmitting(true);
    try {
      const nowMs = Date.now();
      const ticketNumber = generateGiveawayTicketNumber();
      const participant: GiveawayParticipant = {
        id: `gw_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
        ticketNumber,
        fullName: cleanName,
        tiktokAccount: cleanTiktok.startsWith('@') ? cleanTiktok : `@${cleanTiktok}`,
        proofBase64: gwPreviewBase64,
        createdAt: nowMs,
        createdAtFormatted: new Date(nowMs).toLocaleString('id-ID', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        status: 'WAITING_DRAW',
        isWinner: false,
      };

      onGiveawaySubmitted(participant);
      setNewlyCreatedGwTicket(participant);
    } catch (err) {
      setGwError(
        err instanceof Error ? err.message : 'Gagal mengirim pendaftaran giveaway.'
      );
    } finally {
      setGwIsSubmitting(false);
    }
  };

  // 3. Search / Status Check tab state
  const [searchQueueInput, setSearchQueueInput] = useState<string>(() => {
    return getLastQueueNumber() || '';
  });
  const [searchedOrder, setSearchedOrder] = useState<BuyerOrder | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(false);

  // 4. Account & Fast Key Generation state
  const [regUsername, setRegUsername] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regWhatsapp, setRegWhatsapp] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regError, setRegError] = useState<string>('');
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);
  const [keyCopied, setKeyCopied] = useState<boolean>(false);
  const [allDetailsCopied, setAllDetailsCopied] = useState<boolean>(false);

  // 5. Detail Fitur APK state & lightbox modal
  const [selectedFeatureFilter, setSelectedFeatureFilter] = useState<
    'all' | 'timer' | 'histori' | 'video' | 'grafik' | 'setting' | 'profile'
  >('all');
  const [enlargedMedia, setEnlargedMedia] = useState<{
    src: string;
    title: string;
    type?: 'image' | 'video';
  } | null>(null);
  const [activeGrafikTab, setActiveGrafikTab] = useState<number>(0);
  const [activeSettingTab, setActiveSettingTab] = useState<number>(0);
  const [activeTimerTab, setActiveTimerTab] = useState<number>(0);
  const telemetryVideoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);


  // Sync searchedOrder when global orders state updates
  useEffect(() => {
    if (searchedOrder) {
      const updated = orders.find((o) => o.id === searchedOrder.id);
      if (updated) {
        setSearchedOrder(updated);
      } else {
        // If the order was being tracked but is now gone from the global list,
        // it means it was deleted by the Owner. We should clear the search.
        setSearchedOrder(null);
        setHasSearched(false);
      }
    }
  }, [orders, searchedOrder]);

  // Copy DANA Number
  const handleCopyDana = () => {
    navigator.clipboard.writeText(settings.danaNumber || '081264659643');
    setDanaCopied(true);
    setTimeout(() => setDanaCopied(false), 2000);
  };

  // Copy Queue Number
  const handleCopyQueue = (queueNumber: string) => {
    navigator.clipboard.writeText(queueNumber);
    setQueueCopied(true);
    setTimeout(() => setQueueCopied(false), 2000);
  };

  // Handle file select
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setSelectedFile(file);

    try {
      const compressed = await compressImageToBase64(file, 720, 720, 0.65);
      setPreviewBase64(compressed.base64);
      setProofSizeKB(compressed.sizeKB);
    } catch {
      setUploadError('Gagal memproses file gambar. Pastikan format JPG, PNG, atau WEBP.');
    }
  };

  // Submit Payment Proof to generate Queue Number #LA-XXXX
  const handleSubmitPaymentProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewBase64) {
      setUploadError(
        'Silakan pilih file foto bukti transfer terlebih dahulu.'
      );
      return;
    }

    setUploadError('');
    setIsSubmittingProof(true);

    try {
      const nowMs = Date.now();
      const queueNumber = generateQueueNumber();
      const orderId = `ord_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
      const userId = `usr_cust_${Math.floor(nowMs / 1000)}`;

      const initialPendingOrder: BuyerOrder = {
        id: orderId,
        queueNumber,
        userId,
        createdAt: nowMs,
        createdAtFormatted: new Date(nowMs).toLocaleString('id-ID', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        price: selectedPackage.price,
        accountType: selectedPackage.accountType,
        role: 'CUSTOMER',
        durationHours: selectedPackage.durationHours,
        trialExpiresAt: 0,
        username: '',
        password: '',
        fastKey: '',
        paymentProofBase64: previewBase64,
        paymentStatus: 'PENDING_OWNER',
        paymentVerificationNote: `Bukti transfer (${proofSizeKB} KB) untuk antrean ${queueNumber} menunggu persetujuan Owner.`,
        syncedToFirebase: true,
        emailNotified: false,
        emailNotificationStatus:
          'Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.',
      };

      // Kirim email notifikasi instan ke Admin
      const emailResult = await sendAdminPaymentEmailNotification(
        initialPendingOrder,
        settings
      );

      const finalPendingOrder: BuyerOrder = {
        ...initialPendingOrder,
        emailNotified: emailResult.sent,
        emailNotificationStatus: emailResult.statusText,
      };

      // Simpan ke database & server
      const saved = await onOrderCreatedOrUpdated(finalPendingOrder);
      setActiveBuyerOrderId(saved.id);
      setActiveOrderIdState(saved.id);
      setLastQueueNumber(saved.queueNumber);
      setLastQueueNumState(saved.queueNumber);
      setNewlyCreatedTicket(saved);
      setSearchedOrder(saved);
      setSearchQueueInput(saved.queueNumber);
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Terjadi kendala saat mengirim bukti pembayaran. Silakan coba lagi.'
      );
    } finally {
      setIsSubmittingProof(false);
    }
  };

  // Search by Queue Number
  const handleSearchQueue = (targetQueue?: string) => {
    const query = targetQueue || searchQueueInput;
    const normalized = normalizeQueueNumber(query);
    if (!normalized) return;

    setHasSearched(true);
    const found = orders.find(
      (o) =>
        normalizeQueueNumber(o.queueNumber || '') === normalized ||
        o.queueNumber === query.trim() ||
        o.id === query.trim()
    );

    if (found) {
      setSearchedOrder(found);
      setLastQueueNumber(found.queueNumber);
      setLastQueueNumState(found.queueNumber);
    } else {
      setSearchedOrder(null);
    }
  };

  // Manual refresh status
  const handleRefreshStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      await onRefreshState();
      if (searchedOrder) {
        const normalized = normalizeQueueNumber(searchedOrder.queueNumber || '');
        const updated = orders.find(
          (o) => normalizeQueueNumber(o.queueNumber || '') === normalized
        );
        if (updated) {
          setSearchedOrder(updated);
        }
      }
    } finally {
      setTimeout(() => setIsRefreshingStatus(false), 500);
    }
  };

  // Generate Fast Key for APPROVED Order
  const handleGenerateAccountAndKey = async (
    e: React.FormEvent,
    targetOrder: BuyerOrder
  ) => {
    e.preventDefault();
    setRegError('');

    const cleanUsername = regUsername.trim();
    const cleanPassword = regPassword.trim() || '123456';

    if (!cleanUsername) {
      setRegError('Username tidak boleh kosong.');
      return;
    }
    if (cleanUsername.length < 3) {
      setRegError('Username minimal 3 karakter.');
      return;
    }

    const isPermanent = targetOrder.packageId === 'permanent' || targetOrder.packageId === 'vip_permanent';
    if (isPermanent) {
      if (!regWhatsapp.trim()) {
        setRegError('Nomor WhatsApp wajib diisi untuk paket Permanent.');
        return;
      }
      if (!regEmail.trim()) {
        setRegError('Alamat Email wajib diisi untuk paket Permanent.');
        return;
      }
    }

    setIsGeneratingKey(true);
    try {
      const nowMs = Date.now();
      const userId =
        targetOrder.userId || `usr_cust_${Math.floor(nowMs / 1000)}`;
      const targetPackage =
        LICENSE_PACKAGES.find((p) => p.id === targetOrder.packageId) ||
        LICENSE_PACKAGES[3];

      const trialExpiresAt =
        targetOrder.accountType === 'TRIAL'
          ? computeTrialExpiresAt(targetOrder.durationHours || targetPackage.durationHours, nowMs)
          : 0;

      // Gunakan PERSIS rumus generator kunci dari aplikasi Drag Race Pro+
      const fastKey = generateFastLoginToken({
        userId,
        username: cleanUsername,
        password: cleanPassword,
        role: 'CUSTOMER',
        accountType: targetOrder.accountType,
        trialExpiresAt,
      });

      const completedOrder: BuyerOrder = {
        ...targetOrder,
        username: cleanUsername,
        password: cleanPassword,
        whatsapp: regWhatsapp.trim(),
        email: regEmail.trim(),
        fastKey,
        paymentStatus: 'COMPLETED',
        paymentVerificationNote:
          'Pembayaran dikonfirmasi Owner & Kunci Akses Cepat berhasil dibuat.',
      };

      const saved = await onOrderCreatedOrUpdated(completedOrder);
      setSearchedOrder(saved);
      if (newlyCreatedTicket?.id === saved.id) {
        setNewlyCreatedTicket(saved);
      }
    } catch (err) {
      setRegError(
        err instanceof Error ? err.message : 'Gagal membuat kunci lisensi.'
      );
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Copy Fast Key
  const handleCopyFastKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  // Copy All Account Details
  const handleCopyAllAccountDetails = (order: BuyerOrder) => {
    const summary = [
      `=== DRAG RACE L.A STORE ===`,
      `Nomor Antrean: ${order.queueNumber}`,
      `Paket: ${order.packageName}`,
      `Username: ${order.username}`,
      `Password: ${order.password}`,
      `Kunci Cepat: ${order.fastKey}`,
      `Waktu Aktif: ${order.createdAtFormatted}`,
    ].join('\n');
    navigator.clipboard.writeText(summary);
    setAllDetailsCopied(true);
    setTimeout(() => setAllDetailsCopied(false), 2000);
  };


  return (
    <div
      id="top"
      className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10"
    >
      {/* Hero Banner Minimalis */}
      <section className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-10">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-semibold tracking-wider text-[#A78BFA] uppercase">
            Layanan Lisensi Resmi 24/7 · Tanpa Perlu Login Pembeli
          </p>
          <h1
            onClick={onBrandTitleClick}
            data-testid="hero-brand-title"
            className="text-3xl sm:text-5xl font-bold text-white font-display tracking-tight select-none cursor-pointer"
            style={{ textWrap: 'balance' }}
          >
            DRAG RACE L.A STORE
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl">
            Pilih paket lisensi resmi Drag Race Pro+, bayar via QRIS All Payment atau DANA, unggah bukti pembayaran.
          </p>

          {/* Tab Navigation Switcher Ringkas (Menu Sesuai Urutan dengan Download APK di Atas Beli Lisensi) */}
          <div className="pt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectTab('download')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'download'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
                  : 'bg-[#121212] text-zinc-300 border border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
              }`}
            >
              <Download className="w-4 h-4 text-[#A78BFA]" />
              <span>Download APK</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('buy')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'buy'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
                  : 'bg-[#121212] text-zinc-300 border border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
              }`}
            >
              <ShoppingBag className="w-4 h-4 text-[#A78BFA]" />
              <span>Beli Lisensi Baru</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('status')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'status'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
                  : 'bg-[#121212] text-zinc-300 border border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
              }`}
            >
              <Ticket className="w-4 h-4 text-[#A78BFA]" />
              <span>Cek Status Pembelian (No Antrean)</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('features')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'features'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
                  : 'bg-[#121212] text-zinc-300 border border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#A78BFA]" />
              <span>Detail Fitur APK</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('giveaway')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'giveaway'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
                  : 'bg-[#121212] text-zinc-300 border border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
              }`}
            >
              <Gift className="w-4 h-4 text-[#A78BFA]" />
              <span>Giveaway Akun Trial</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================= TAB 0: DOWNLOAD APK (MENU DOWNLOAD APLIKASI) ================= */}
      {activeTab === 'download' && (
        <section className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-10 space-y-8 animate-fade-in">
          {/* Header Download */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E38] pb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider mb-1 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    RILIS RESMI TERBARU · {settings.apkRelease?.version || 'v2.7.0'}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                  Download DRAG RACE L.A APK
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  Aplikasi telemetri balap digital &amp; drag meter presisi tinggi untuk perangkat Android.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectTab('buy')}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-all shadow-lg shadow-[#7C3AED]/20 cursor-pointer"
              >
                Beli Lisensi Sekarang
              </button>
            </div>
          </div>

          {/* Kartu Unduh Utama */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card 1: Direct Server Download */}
            <div className="lg:col-span-2 bg-[#121212] border border-[#2E2E38] rounded-xl p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-5 h-5 text-[#A78BFA]" />
                    <span className="font-bold text-white text-sm">
                      Installer Resmi Android (.APK)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 bg-[#1E1E24] px-2.5 py-1 rounded border border-[#2E2E38]">
                    Ukuran: {settings.apkRelease?.fileSize || '48.6 MB'}
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  Unduh langsung file APK installer versi rilis resmi{' '}
                  <strong className="text-white">
                    {settings.apkRelease?.fileName || 'DragRaceLA_v2.7_Release.apk'}
                  </strong>{' '}
                  dari server DRAG RACE L.A STORE. Bebas malware, tanpa iklan, dan kompatibel dengan sensor GPS bawaan ponsel. Link unduhan selalu otomatis diperbarui ke versi rilis paling baru.
                </p>

                {/* Catatan Pembaruan (Changelog) jika diisi Owner */}
                {settings.apkRelease?.changelog && (
                  <div className="bg-[#18181E] border border-[#2E2E38] rounded-lg p-3 text-xs text-zinc-300 space-y-1">
                    <span className="text-[#A78BFA] font-bold text-[11px] block flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Catatan Update ({settings.apkRelease.version}):</span>
                    </span>
                    <p className="text-zinc-400 leading-relaxed text-[11px]">
                      {settings.apkRelease.changelog}
                    </p>
                  </div>
                )}

                {/* Spesifikasi Ringkas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-[11px] font-mono">
                  <div className="bg-[#18181E] p-2.5 rounded-lg border border-[#2E2E38]">
                    <span className="text-zinc-500 block text-[10px]">Versi APK</span>
                    <span className="text-zinc-200 font-bold">
                      {settings.apkRelease?.version || 'v2.7.0'} Pro
                    </span>
                  </div>
                  <div className="bg-[#18181E] p-2.5 rounded-lg border border-[#2E2E38]">
                    <span className="text-zinc-500 block text-[10px]">Min. OS</span>
                    <span className="text-zinc-200 font-bold">Android 8.0+</span>
                  </div>
                  <div className="bg-[#18181E] p-2.5 rounded-lg border border-[#2E2E38]">
                    <span className="text-zinc-500 block text-[10px]">Arsitektur</span>
                    <span className="text-zinc-200 font-bold">ARM64 / v7a</span>
                  </div>
                  <div className="bg-[#18181E] p-2.5 rounded-lg border border-[#2E2E38]">
                    <span className="text-zinc-500 block text-[10px]">Keamanan</span>
                    <span className="text-emerald-400 font-bold">Terverifikasi</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-[#2E2E38]">
                <a
                  href={
                    settings.apkRelease?.downloadUrl ||
                    '/downloads/DragRaceLA_latest.apk'
                  }
                  download={
                    settings.apkRelease?.fileName || 'DragRaceLA_latest.apk'
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer group text-center"
                >
                  <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  <span>
                    Download APK {settings.apkRelease?.version || 'Terbaru'} Langsung (Server Utama)
                  </span>
                </a>
              </div>
            </div>

            {/* Card 2: Panduan Instalasi 3 Langkah */}
            <div className="bg-[#121212] border border-[#2E2E38] rounded-xl p-6 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-[#A78BFA]" />
                  <span>Panduan Instalasi APK</span>
                </h3>
                <ol className="space-y-3 text-xs text-zinc-300 leading-relaxed list-decimal list-inside">
                  <li className="pl-1">
                    <strong className="text-white">Unduh APK</strong>: Klik tombol unduh di sebelah kiri dan tunggu hingga berkas selesai tersimpan.
                  </li>
                  <li className="pl-1">
                    <strong className="text-white">Izinkan Instalasi</strong>: Buka notifikasi unduhan. Jika sistem meminta izin, pilih <em>Setelan</em> lalu centang <em>"Izinkan dari sumber ini"</em>.
                  </li>
                  <li className="pl-1">
                    <strong className="text-white">Buka &amp; Login Kunci Cepat</strong>: Buka aplikasi, lalu masukkan Username &amp; Kunci Cepat lisensi Anda dari menu Cek Status.
                  </li>
                </ol>
              </div>

              <div className="bg-[#1A1A22] border border-[#2E2E38] rounded-lg p-3 text-[11px] text-zinc-400 space-y-1 mt-4">
                <span className="text-[#A78BFA] font-bold block">💡 Butuh Kunci Lisensi?</span>
                <span>
                  Beli paket 3 Jam, 10 Jam, 24 Jam, Permanent, atau Permanent VIP di menu <strong>Beli Lisensi Baru</strong> untuk mendapatkan akses login resmi tanpa kedaluwarsa.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= TAB 1: BELI LISENSI BARU ================= */}
      {activeTab === 'buy' && (
        <div className="space-y-12">
          {/* STEP 1: Pilihan Paket Lisensi dan Gimmick Diskon */}
          <section id="paket-lisensi" className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                  01. Pilih Paket Lisensi
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  Klik salah satu paket di bawah ini untuk langsung melanjutkan pembayaran tanpa login.
                </p>
              </div>
              <div className="text-xs text-zinc-400 font-mono">
                Paket Terpilih:{' '}
                <strong className="text-white">{selectedPackage.name}</strong> (
                {formatRupiah(selectedPackage.price)})
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {LICENSE_PACKAGES.map((pkg) => {
                const isSelected = selectedPackage.id === pkg.id;
                const isPromo = Boolean(pkg.badge);

                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPackage(pkg)}
                    className={`relative text-left p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#1E1E24] border-[#7C3AED] ring-1 ring-[#7C3AED] shadow-md shadow-[#7C3AED]/10'
                        : 'bg-[#1E1E24] border-[#2E2E38] hover:border-[#7C3AED]/50'
                    }`}
                  >
                    <div>
                      {isPromo && (
                        <div className="inline-block px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-[#7C3AED] text-white mb-3">
                          {pkg.badge}
                        </div>
                      )}
                      {!isPromo && (
                        <div className="text-[11px] font-medium text-zinc-400 mb-2">
                          Lisensi Instan · {pkg.durationLabel}
                        </div>
                      )}

                      <h3 className="text-base font-bold text-white font-display">
                        {pkg.name}
                      </h3>

                      <div className="mt-3 mb-2 flex items-baseline gap-2 font-mono">
                        {pkg.originalPrice && (
                          <span className="text-xs text-zinc-400 line-through">
                            {formatRupiah(pkg.originalPrice)}
                          </span>
                        )}
                        <span className="text-xl font-bold text-white">
                          {formatRupiah(pkg.price)}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed mb-4">
                        {pkg.subtitle}
                      </p>

                      <ul className="space-y-1.5 text-[11px] text-zinc-400 border-t border-[#2E2E38] pt-3 mb-4">
                        {pkg.features.map((feat, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-[#7C3AED]">•</span>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold text-center transition-colors ${
                        isSelected
                          ? 'bg-[#7C3AED] text-white'
                          : 'bg-[#121212] text-zinc-300 border border-[#2E2E38]'
                      }`}
                    >
                      {isSelected ? 'Paket Dipilih' : 'Pilih Paket Ini'}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* STEP 2: Pembayaran DANA (081264659643 a/n dragrace27) & Unggah Bukti */}
          <section id="pembayaran-dana" className="space-y-6">
            <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white font-display">
                  02. Pembayaran &amp; Unggah Bukti Transfer
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  Transfer sesuai nominal paket ke nomor DANA atau scan QRIS All Payment di bawah ini, lalu unggah foto bukti pembayaran dan tekan tombol kirim untuk mendapatkan Nomor Antrean Unik.
                </p>
              </div>

              {/* Rincian Pembayaran */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400">Paket yang Dibeli</span>
                    <div className="text-sm font-bold text-white font-display">
                      {selectedPackage.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-400">Total Transfer</span>
                    <div className="text-lg font-bold text-[#A78BFA] font-mono">
                      {formatRupiah(selectedPackage.price)}
                    </div>
                  </div>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400">Nomor DANA Tujuan</span>
                    <div className="text-base font-bold text-white font-mono tracking-wide">
                      {settings.danaNumber || '081264659643'}
                    </div>
                    <div
                      data-testid="dana-account-name"
                      className="text-xs font-semibold text-[#A78BFA]"
                    >
                      a/n {settings.danaAccountName || 'dragrace27'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyDana}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
                  >
                    {danaCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Nomor DANA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Catatan QRIS (Tampilkan di atas gambar QRIS nya) */}
              <div className="bg-[#121212] border border-[#7C3AED]/50 rounded-lg p-3.5 text-xs text-zinc-200 leading-relaxed shadow-sm">
                <strong>Catatan QRIS:</strong> Menggunakan pembayaran melalui QRIS terkena pajak sebesar <strong className="text-[#A78BFA]">“Rp2.000”</strong> contoh pembelian paket trial 3jam yang awalnya Rp5.000 menjadi Rp7.000.
              </div>

              {/* QRIS All Payment Display */}
              <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 flex flex-col sm:flex-row items-center gap-5">
                <img
                  src={settings.qrCodeBase64}
                  alt="QRIS All Payment DRAG RACE L.A STORE"
                  referrerPolicy="no-referrer"
                  className="w-36 h-36 rounded-lg bg-white p-2 shrink-0 object-contain shadow-sm"
                />
                <div className="space-y-2 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-xs font-bold text-[#A78BFA]">
                    <Sparkles className="w-3 h-3" />
                    <span>Scan QRIS All Payment</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed max-w-xl">
                    Mendukung pembayaran melalui <strong>QRIS All Payment</strong> (DANA, GoPay, OVO, ShopeePay, LinkAja, BCA, Mandiri, BRI, &amp; Mobile Banking lainnya) atau transfer langsung ke DANA <strong>{settings.danaNumber || '081264659643'}</strong> a/n <strong>{settings.danaAccountName || 'dragrace27'}</strong>.
                  </p>
                </div>
              </div>

              {/* Form Unggah Foto Bukti & Tombol Kirim */}
              <form onSubmit={handleSubmitPaymentProof} className="space-y-4">
                <label
                  htmlFor="payment-proof-upload"
                  className="block text-xs font-semibold text-zinc-200"
                >
                  Unggah Foto Bukti Pembayaran (Wajib)
                </label>

                <div className="border border-dashed border-[#2E2E38] hover:border-[#7C3AED] rounded-xl p-5 bg-[#121212] text-center transition-colors">
                  {previewBase64 ? (
                    <div className="space-y-3 flex flex-col items-center">
                      <img
                        src={previewBase64}
                        alt="Pratinjau Bukti Transfer"
                        referrerPolicy="no-referrer"
                        className="max-h-48 w-auto rounded-lg object-contain border border-[#2E2E38] bg-black/50"
                      />
                      <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Foto siap dikirim ({proofSizeKB} KB)</span>
                      </div>
                      <label
                        htmlFor="payment-proof-upload"
                        className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
                      >
                        Ganti Foto Bukti Pembayaran
                      </label>
                    </div>
                  ) : (
                    <label
                      htmlFor="payment-proof-upload"
                      className="cursor-pointer flex flex-col items-center justify-center space-y-2 py-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#1E1E24] border border-[#2E2E38] flex items-center justify-center text-[#A78BFA]">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-semibold text-white">
                        Klik untuk Memilih Foto Bukti Transfer
                      </div>
                      <p className="text-xs text-zinc-400">
                        Format PNG, JPG, atau WEBP. Notifikasi Pembayaran Sudah Terkirim Ke Admin, Tunggu Konfirmasi.
                      </p>
                    </label>
                  )}

                  <input
                    id="payment-proof-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {uploadError && (
                  <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                    {uploadError}
                  </p>
                )}

                {/* Tombol Kirim Bukti Pembayaran untuk Dikonfirmasi */}
                <button
                  type="submit"
                  disabled={!previewBase64 || isSubmittingProof}
                  className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    !previewBase64 || isSubmittingProof
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-[#2E2E38]'
                      : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg shadow-[#7C3AED]/25'
                  }`}
                >
                  {isSubmittingProof ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sedang Mengirim Bukti &amp; Membuat Nomor Antrean...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      <span>Kirim Bukti Pembayaran untuk Dikonfirmasi</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

          {/* STEP 3 / LAYAR KONFIRMASI BERSIH: Pembuatan Nomor Antrean Unik (Nomor Tiket) */}
          {newlyCreatedTicket && (
            <section
              id="konfirmasi-antrean"
              data-testid="screen-queue-confirmed"
              className="bg-[#1E1E24] border border-[#7C3AED]/60 rounded-xl p-6 sm:p-10 space-y-6 shadow-xl shadow-[#7C3AED]/10 animate-fade-in"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-display">
                    Bukti Pembayaran Berhasil Dikirim!
                  </h3>
                  <p className="text-xs text-zinc-300">
                    Sistem telah mencatat pesanan Anda ke Cloud Database secara otomatis.
                  </p>
                </div>
              </div>

              {/* Kotak Nomor Antrean Unik */}
              <div className="bg-[#121212] border border-[#2E2E38] rounded-xl p-6 text-center space-y-3">
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                  Nomor Antrean Anda
                </p>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#A78BFA] font-mono tracking-wider">
                  {newlyCreatedTicket.queueNumber}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => handleCopyQueue(newlyCreatedTicket.queueNumber)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
                  >
                    {queueCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Nomor Antrean Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Nomor Antrean</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-400">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    <span>Status: MENUNGGU KONFIRMASI OWNER</span>
                  </span>
                </div>
              </div>

              {/* Peringatan Penting Simpan / Catat Kode Antrean */}
              <div className="bg-amber-950/50 border border-amber-600/70 rounded-xl p-4 text-xs text-amber-200 leading-relaxed space-y-1.5 shadow-md">
                <p className="font-bold text-amber-300 uppercase tracking-wide">
                  ⚠️ PERINGATAN PENTING:
                </p>
                <p>
                  Harap salin atau catat nomor antrean Anda (<strong className="font-mono text-white">{newlyCreatedTicket.queueNumber}</strong>). Jika Anda menutup atau me-refresh web ini, Anda memerlukan nomor antrean tersebut untuk mengecek status pesanan di menu <strong>Cek Status Pembelian</strong>.
                </p>
              </div>

              {/* Instruksi Pengguna */}
              <div className="bg-[#141418] border border-[#2E2E38] rounded-lg p-4 text-xs text-zinc-300 leading-relaxed space-y-2">
                <p className="font-semibold text-white">
                  Instruksi Pembeli:
                </p>
                <p>
                  Simpan atau catat nomor antrean Anda:{' '}
                  <strong className="text-[#A78BFA] font-mono">
                    {newlyCreatedTicket.queueNumber}
                  </strong>
                  . Anda bisa mengecek status konfirmasi di menu <strong>Cek Status Pembelian</strong> pada web ini kapan saja. Begitu Owner menekan tombol konfirmasi, form pembuatan akun dan Kunci Cepat Anda akan langsung terbuka.
                </p>
              </div>

              {/* Tombol Aksi Cepat */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQueueInput(newlyCreatedTicket.queueNumber);
                    handleSearchQueue(newlyCreatedTicket.queueNumber);
                    onSelectTab('status');
                  }}
                  className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/20 cursor-pointer"
                >
                  <span>Cek Status Pembelian Sekarang</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewlyCreatedTicket(null);
                    setPreviewBase64('');
                    setSelectedFile(null);
                  }}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-[#121212] border border-[#2E2E38] text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
                >
                  Beli Lisensi Lainnya
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ================= TAB 2: CEK STATUS PEMBELIAN (PUBLIC TRACKING) ================= */}
      {activeTab === 'status' && (
        <section id="cek-status" className="space-y-8 animate-fade-in">
          <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                Cek Status Pembelian (Public Tracking)
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                Masukkan Nomor Antrean Anda (Contoh: <strong>#LA-4829</strong>) untuk melihat status persetujuan Owner dan mengambil Kunci Akses Cepat (KEY).
              </p>
            </div>

            {/* Input Pencarian Nomor Antrean */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchQueue();
              }}
              className="flex flex-col sm:flex-row items-stretch gap-3"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQueueInput}
                  onChange={(e) => setSearchQueueInput(e.target.value)}
                  placeholder="Masukkan Nomor Antrean (Contoh: #LA-4829)"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#121212] border border-[#2E2E38] text-sm text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#7C3AED]"
                />
              </div>

              <button
                type="submit"
                className="py-3 px-6 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                Cek Status
              </button>
            </form>

            {/* Shortcut Nomor Antrean Terakhir Tersimpan */}
            {lastQueueNum && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>Nomor Antrean Anda:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQueueInput(lastQueueNum);
                    handleSearchQueue(lastQueueNum);
                  }}
                  className="font-mono font-bold text-[#A78BFA] hover:underline cursor-pointer bg-[#121212] px-2 py-0.5 rounded border border-[#2E2E38]"
                >
                  {lastQueueNum}
                </button>
                <span>(Klik untuk cek instan)</span>
              </div>
            )}
          </div>

          {/* HASIL PENGECEKAN STATUS */}
          {hasSearched && (
            <div>
              {!searchedOrder ? (
                /* Kondisi: Tidak Ditemukan */
                <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mx-auto">
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Nomor Antrean Tidak Ditemukan
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                      Pastikan Anda memasukkan nomor antrean yang sesuai (Contoh: <strong>#LA-4829</strong>). Jika baru saja mentransfer dan belum mengunggah bukti, silakan kembali ke menu Beli Lisensi.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onSelectTab('buy')}
                      className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold cursor-pointer"
                    >
                      Beli Lisensi &amp; Dapatkan Nomor Antrean
                    </button>
                  </div>
                </div>
              ) : (
                /* Kondisi: Data Ditemukan */
                <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
                  {/* Header Detail Antrean */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E38] pb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-xs font-bold text-[#A78BFA] font-mono">
                          {searchedOrder.queueNumber}
                        </span>
                        <h3 className="text-lg font-bold text-white font-display">
                          {searchedOrder.packageName}
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 font-mono">
                        Nominal: {formatRupiah(searchedOrder.price)} · Waktu: {searchedOrder.createdAtFormatted}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRefreshStatus}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] text-xs font-semibold text-zinc-200 transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          isRefreshingStatus ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Perbarui Status</span>
                    </button>
                  </div>

                  {/* KONDISI 1: Owner BELUM Menekan Tombol Konfirmasi (PENDING_OWNER) */}
                  {searchedOrder.paymentStatus === 'PENDING_OWNER' && (
                    <div className="bg-[#141418] border border-amber-500/30 rounded-xl p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <Clock className="w-5 h-5 animate-spin" />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                            Status Saat Ini
                          </span>
                          <h4 className="text-base font-bold text-white">
                            Sedang dipersetujui Owner, mohon tunggu sebentar...
                          </h4>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Bukti transfer Anda untuk nomor antrean{' '}
                        <strong className="text-[#A78BFA] font-mono">
                          {searchedOrder.queueNumber}
                        </strong>{' '}
                        sudah masuk ke Cloud Database &amp; notifikasi email Admin. Owner sedang memverifikasi dana masuk. Halaman ini akan otomatis memperbarui tampilan begitu Owner menekan tombol konfirmasi.
                      </p>

                      <div className="pt-2 flex flex-wrap items-center gap-3">
                        <a
                          href={`https://wa.me/6281272731928?text=${encodeURIComponent(
                            `Halo Owner DRAG RACE L.A STORE, mohon konfirmasi antrean saya ${searchedOrder.queueNumber} untuk ${searchedOrder.packageName} (${formatRupiah(searchedOrder.price)}).`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Hubungi Owner via WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* KONDISI 2: Owner SUDAH Mengkonfirmasi (APPROVED) -> Tampilkan Form Pembuatan Akun & Kunci */}
                  {searchedOrder.paymentStatus === 'APPROVED' && (
                    <div className="bg-[#141418] border border-emerald-500/40 rounded-xl p-6 sm:p-8 space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                            Status: DIKONFIRMASI!
                          </div>
                          <h4 className="text-lg font-bold text-white font-display">
                            Pembayaran Anda Telah Disetujui Owner
                          </h4>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Silakan buat Username dan Password Anda di bawah ini untuk menghasilkan Kunci Akses Cepat (
                        <code className="text-[#A78BFA] font-mono">
                          KEY-XXXXXXXXXXX
                        </code>
                        ).
                      </p>

                      <form
                        onSubmit={(e) =>
                          handleGenerateAccountAndKey(e, searchedOrder)
                        }
                        className="space-y-4 max-w-lg"
                      >
                        <div>
                          <label
                            htmlFor="reg-username"
                            className="block text-xs font-medium text-zinc-300 mb-1.5"
                          >
                            Buat Username / Nama
                          </label>
                          <input
                            id="reg-username"
                            type="text"
                            value={regUsername}
                            onChange={(e) => setRegUsername(e.target.value)}
                            placeholder="Contoh: hendra27"
                            required
                            className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="reg-password"
                            className="block text-xs font-medium text-zinc-300 mb-1.5"
                          >
                            Buat Password
                          </label>
                          <input
                            id="reg-password"
                            type="text"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Contoh: 123456"
                            required
                            className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
                          />
                        </div>

                        {(searchedOrder.packageId === 'permanent' || searchedOrder.packageId === 'vip_permanent') && (
                          <>
                            <div>
                              <label
                                htmlFor="reg-whatsapp"
                                className="block text-xs font-medium text-zinc-300 mb-1.5"
                              >
                                Nomor WhatsApp Pembeli
                              </label>
                              <input
                                id="reg-whatsapp"
                                type="tel"
                                value={regWhatsapp}
                                onChange={(e) => setRegWhatsapp(e.target.value)}
                                placeholder="Contoh: 0812XXXXXXXX"
                                required
                                className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor="reg-email"
                                className="block text-xs font-medium text-zinc-300 mb-1.5"
                              >
                                Alamat Email Pembeli
                              </label>
                              <input
                                id="reg-email"
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                placeholder="Contoh: pembeli@email.com"
                                required
                                className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
                              />
                            </div>
                          </>
                        )}

                        {regError && (
                          <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                            {regError}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={isGeneratingKey}
                          className="w-full py-3 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#7C3AED]/20"
                        >
                          {isGeneratingKey ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Sedang Menghasilkan Kunci...</span>
                            </>
                          ) : (
                            <>
                              <KeyRound className="w-4 h-4" />
                              <span>
                                Generate &amp; Tampilkan Kunci Cepat (KEY-XXXXXXXXXXX)
                              </span>
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* KONDISI 3: Kunci Sudah Selesai Dibuat (COMPLETED) */}
                  {searchedOrder.paymentStatus === 'COMPLETED' && searchedOrder.fastKey && (
                    <div className="bg-[#141418] border border-[#7C3AED]/50 rounded-xl p-6 sm:p-8 space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                          <KeyRound className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                            Status: KUNCI AKTIF &amp; SIAP DIGUNAKAN
                          </div>
                          <h4 className="text-lg font-bold text-white font-display">
                            Kunci Akses Cepat Drag Race Pro+
                          </h4>
                        </div>
                      </div>

                      {/* Tampilan Kunci Cepat Besar */}
                      <div className="bg-[#121212] border border-[#2E2E38] rounded-xl p-5 text-center space-y-2">
                        <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                          Kode Kunci Anda
                        </span>
                        <div className="text-2xl sm:text-3xl font-extrabold text-[#A78BFA] font-mono tracking-widest select-all">
                          {searchedOrder.fastKey}
                        </div>
                        <div className="pt-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleCopyFastKey(searchedOrder.fastKey)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            {keyCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-white" />
                                <span>Kunci Berhasil Disalin!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Salin Kunci Cepat</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Rincian Akun & Salin Lengkap */}
                      <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                        <div>
                          <span className="text-zinc-500 block">Username:</span>
                          <span className="text-white font-bold">{searchedOrder.username}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Password:</span>
                          <span className="text-white font-bold">{searchedOrder.password}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Tipe Akun:</span>
                          <span className="text-emerald-400 font-bold">{searchedOrder.accountType}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => handleCopyAllAccountDetails(searchedOrder)}
                          className="px-4 py-2.5 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-xs font-semibold text-zinc-200 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          {allDetailsCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Semua Data Disalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin Semua Rincian Akun</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* KONDISI 4: Ditolak Owner (REJECTED) */}
                  {searchedOrder.paymentStatus === 'REJECTED' && (
                    <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-6 space-y-4">
                      <h4 className="text-base font-bold text-red-300">
                        Status: Bukti Pembayaran Ditolak / Dana Belum Masuk
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Owner belum dapat memvalidasi dana untuk nomor antrean {searchedOrder.queueNumber}. Pastikan Anda mentransfer nominal yang tepat ke DANA {settings.danaNumber} a/n {settings.danaAccountName}.
                      </p>
                      <a
                        href={`https://wa.me/6281272731928?text=${encodeURIComponent(
                          `Halo Developer DRAG RACE L.A STORE, bukti pembayaran antrean saya ${searchedOrder.queueNumber} ditolak. Mohon bantuannya.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-900/80 hover:bg-red-800 text-white text-xs font-semibold"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Hubungi Developer via WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ================= TAB 3: DETAIL FITUR APK ================= */}
      {activeTab === 'features' && (
        <section className="space-y-8 animate-fade-in">
          {/* Header Banner */}
          <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-10 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-xs font-bold text-[#A78BFA] uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Katalog Fitur Resmi Drag Race L.A Pro+</span>
                </div>
                <h2 className="text-xl sm:text-3xl font-bold text-white font-display">
                  Detail Fitur Unggulan APK Drag Race L.A
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                  Semua instrumen telemetri, timer presisi sensor 200Hz, HUD video overlay, grafik komparasi dinamo, hingga kalibrasi alat ukur dikembangkan khusus untuk mekanik dan pembalap profesional.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-zinc-300">
                  Total <strong className="text-[#A78BFA]">6 Fitur Utama</strong>
                </span>
              </div>
            </div>

            {/* Quick Filter Navigation Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none pt-2 border-t border-[#2E2E38]">
              {[
                { id: 'all', label: 'Semua Fitur (6)', icon: Layers },
                { id: 'timer', label: '1. Fitur Timer', icon: Timer },
                { id: 'histori', label: '2. Fitur Histori', icon: History },
                { id: 'video', label: '3. Fitur Video', icon: Video },
                { id: 'grafik', label: '4. Fitur Grafik', icon: LineChart },
                { id: 'setting', label: '5. Fitur Setting', icon: SettingsIcon },
                { id: 'profile', label: '6. Fitur Profile', icon: User },
              ].map((tab) => {
                const IconComponent = tab.icon;
                const isActive = selectedFeatureFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedFeatureFilter(tab.id as typeof selectedFeatureFilter)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 border border-[#7C3AED]'
                        : 'bg-[#121212] text-zinc-400 hover:text-white border border-[#2E2E38] hover:border-[#7C3AED]/50'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ================= 1. FITUR TIMER ================= */}
          {(selectedFeatureFilter === 'all' || selectedFeatureFilter === 'timer') && (
            <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2E2E38] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                    <Timer className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA] text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                      FITUR 1 · TELEMETRI LANGSUNG
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white font-display">
                      Fitur Timer (Live Telemetry, Speedometer &amp; Timeslip)
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-emerald-400 font-semibold">
                    RaceBox 1:1 Fusion
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-zinc-300">
                    1 ft rollout: ON
                  </span>
                </div>
              </div>

              {/* Deskripsi Singkat Jelas Detail */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
                <div className="space-y-2 bg-[#121212] border border-[#2E2E38] rounded-lg p-4">
                  <p className="font-bold text-white text-sm flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-[#A78BFA]" />
                    <span>Live Cockpit Speedometer &amp; G-Meter</span>
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    Menampilkan speedometer analog dan digital presisi tinggi (kph), G-Force radar meter 2.0g, pembacaan elevasi kemiringan jalan (Slope 0.0%), serta timer digital real-time dengan akurasi mikrodetik.
                  </p>
                </div>

                <div className="space-y-2 bg-[#121212] border border-[#2E2E38] rounded-lg p-4">
                  <p className="font-bold text-white text-sm flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-emerald-400" />
                    <span>Deteksi Split Checkpoint &amp; Timeslip Otomatis</span>
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    Mencatat checkpoint split otomatis di 60 ft (18.288m), 100m, 150m, 201m (1/8 mile), dan 402m (1/4 mile). Lembar Timeslip langsung menyajikan Total ET, Top Speed, Reaction Time (R/T), Peak G, dan Slope Corrected ET.
                  </p>
                </div>
              </div>

              {/* Galeri Gambar Fitur Timer */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Pratinjau Antarmuka Fitur Timer:</span>
                  <span className="text-[11px] text-zinc-500">Klik gambar untuk memperbesar</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() =>
                      setEnlargedMedia({
                        src: '/assets/aistudio/gambar_fitur_timer_1_9380829b',
                        title: 'Fitur Timer 1 · Live Speedometer Cockpit, Split Telemetry, Sensor GPS Standby',
                      })
                    }
                    className="group relative bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] rounded-xl overflow-hidden cursor-pointer transition-all p-3"
                  >
                    <img
                      src="/assets/aistudio/gambar_fitur_timer_1_9380829b"
                      alt="Fitur Timer Drag Race Pro+ 1"
                      className="w-full h-80 object-contain rounded-lg bg-black/40 group-hover:scale-[1.02] transition-transform duration-300"
                    />
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-200">Live Cockpit Speedometer &amp; Telemetri</span>
                      <span className="inline-flex items-center gap-1 text-[#A78BFA] text-[11px]">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Perbesar</span>
                      </span>
                    </div>
                  </div>

                  <div
                    onClick={() =>
                      setEnlargedMedia({
                        src: '/assets/aistudio/gambar_fitur_timer_2_f693b2c0',
                        title: 'Fitur Timer 2 · Hasil Drag Race Timeslip (Total ET, Top Speed, Split Waktu)',
                      })
                    }
                    className="group relative bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] rounded-xl overflow-hidden cursor-pointer transition-all p-3"
                  >
                    <img
                      src="/assets/aistudio/gambar_fitur_timer_2_f693b2c0"
                      alt="Fitur Timer Drag Race Pro+ 2"
                      className="w-full h-80 object-contain rounded-lg bg-black/40 group-hover:scale-[1.02] transition-transform duration-300"
                    />
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-200">Hasil Akhir Drag Race - Timeslip</span>
                      <span className="inline-flex items-center gap-1 text-[#A78BFA] text-[11px]">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Perbesar</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= 2. FITUR HISTORI ================= */}
          {(selectedFeatureFilter === 'all' || selectedFeatureFilter === 'histori') && (
            <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2E2E38] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA] text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                      FITUR 2 · DATABASE RUN &amp; LOG
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white font-display">
                      Fitur Histori (Log Balap Presisi &amp; Ekspor CSV)
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-amber-400 font-semibold">
                    Rekor ET &amp; Top Speed
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-zinc-300">
                    Ekspor CSV
                  </span>
                </div>
              </div>

              {/* Deskripsi Singkat Jelas Detail */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-300">
                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Penyimpanan Otomatis 100%</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Tiap pengetesan otomatis direkam tanpa takut hilang. Menghimpun Elapsed Time, Trap Speed, 18m/60ft, 100m, 201m, G-Peak, dan Slope.
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Papan Rekor Terbaik (PB)</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Widget pemantau Rekor ET tercepat (contoh: 8,593s), Top Speed tertinggi (173,9 kph), serta rekor peluncuran terbaik 18m (2,327s).
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Filter &amp; Integrasi Cepat</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Pilah data balap berdasarkan 402m, 201m, 100m, atau sprint 0-100 kph, serta tombol aksi Time Slip, Bagikan, Video HUD, dan Grafik.
                  </p>
                </div>
              </div>

              {/* Pratinjau Fitur Histori */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Pratinjau Antarmuka Fitur Histori:</span>
                  <span className="text-[11px] text-zinc-500">Klik gambar untuk memperbesar</span>
                </div>
                <div
                  onClick={() =>
                    setEnlargedMedia({
                      src: '/assets/aistudio/gambar_fitur_histori_ae3a8fab',
                      title: 'Fitur Histori · Riwayat Pengujian Presisi Lengkap, Rekor ET, Top Speed, dan Kartu Run Balap',
                    })
                  }
                  className="group relative bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] rounded-xl overflow-hidden cursor-pointer transition-all p-3 max-w-lg mx-auto"
                >
                  <img
                    src="/assets/aistudio/gambar_fitur_histori_ae3a8fab"
                    alt="Fitur Histori Drag Race Pro+"
                    className="w-full h-96 object-contain rounded-lg bg-black/40 group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">Daftar Run Balap &amp; Analisis Time Slip</span>
                    <span className="inline-flex items-center gap-1 text-[#A78BFA] text-[11px]">
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Perbesar</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= 3. FITUR VIDEO ================= */}
          {(selectedFeatureFilter === 'all' || selectedFeatureFilter === 'video') && (
            <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2E2E38] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA] text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                      FITUR 3 · REAL-TIME HUD VIDEO OVERLAY
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white font-display">
                      Fitur Video (Overlay Telemetri Balap &amp; Lampu Start 3-2-1-GO!)
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-[#A78BFA] font-semibold">
                    Overlay Video 402m / 201m
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-emerald-400">
                    Ekspor Video Siap Medsos
                  </span>
                </div>
              </div>

              {/* Deskripsi Singkat Jelas Detail */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
                <div className="space-y-2 bg-[#121212] border border-[#2E2E38] rounded-lg p-4">
                  <p className="font-bold text-white text-sm flex items-center gap-2">
                    <Play className="w-4 h-4 text-[#A78BFA]" />
                    <span>Lampu Start Dinamis 3-2-1-GO!</span>
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    Animasi countdown lampu start hijau yang muncul langsung di tengah rekaman video dan tersinkronisasi presisi saat kendaraan mulai bergerak.
                  </p>
                </div>

                <div className="space-y-2 bg-[#121212] border border-[#2E2E38] rounded-lg p-4">
                  <p className="font-bold text-white text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>HUD Telemetri Mengambang &amp; Ekspor</span>
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    Menampilkan speedometer kph, G-Force radar, dan waktu checkpoint (100m, 200m, 300m, 402m) langsung di atas video. Hasil video dapat langsung diekspor untuk TikTok, Reels, dan YouTube Shorts.
                  </p>
                </div>
              </div>

              {/* Video Player Asli APK */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">
                    Pemutar Video Fitur Video HUD Overlay APK:
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Rekaman Asli H.264 (Siap Putar)</span>
                  </span>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-xl p-4 max-w-sm sm:max-w-md mx-auto space-y-3">
                  <div className="relative aspect-[9/19] rounded-lg overflow-hidden bg-black flex items-center justify-center border border-[#2E2E38] group">
                    <video
                      ref={telemetryVideoRef}
                      controls
                      playsInline
                      preload="auto"
                      onPlay={() => setIsVideoPlaying(true)}
                      onPause={() => setIsVideoPlaying(false)}
                      onEnded={() => setIsVideoPlaying(false)}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => {
                        if (telemetryVideoRef.current) {
                          if (telemetryVideoRef.current.paused) {
                            telemetryVideoRef.current.play().catch(() => {});
                          } else {
                            telemetryVideoRef.current.pause();
                          }
                        }
                      }}
                    >
                      <source
                        src="/assets/aistudio/video_fitur_video_809bcad5.mp4"
                        type="video/mp4"
                      />
                      <source src="/api/video/telemetri" type="video/mp4" />
                      <source
                        src="/assets/aistudio/video_fitur_video_809bcad5"
                        type="video/mp4"
                      />
                      Browser Anda tidak mendukung tag video HTML5 MP4.
                    </video>

                    {/* Play Button Overlay saat Pause */}
                    {!isVideoPlaying && (
                      <button
                        type="button"
                        onClick={() => {
                          telemetryVideoRef.current?.play().catch(() => {});
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors cursor-pointer group"
                        title="Klik untuk Memutar Video"
                      >
                        <div className="w-16 h-16 rounded-full bg-[#7C3AED]/90 hover:bg-[#7C3AED] text-white flex items-center justify-center shadow-2xl pl-1 transform group-hover:scale-110 transition-transform">
                          <Play className="w-7 h-7 fill-white" />
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Tombol Kontrol Cepat Pemutar Video */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#2E2E38]/80 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (telemetryVideoRef.current) {
                            if (telemetryVideoRef.current.paused) {
                              telemetryVideoRef.current.play().catch(() => {});
                            } else {
                              telemetryVideoRef.current.pause();
                            }
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E1E24] hover:bg-[#2E2E38] border border-[#2E2E38] text-zinc-200 font-semibold transition-colors cursor-pointer"
                      >
                        {isVideoPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5 text-amber-400" />
                            <span>Jeda</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                            <span>Putar Video</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (telemetryVideoRef.current) {
                            telemetryVideoRef.current.currentTime = 0;
                            telemetryVideoRef.current.play().catch(() => {});
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1E1E24] hover:bg-[#2E2E38] border border-[#2E2E38] text-zinc-300 transition-colors cursor-pointer"
                        title="Ulangi dari awal"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Ulangi</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setEnlargedMedia({
                          src: '/assets/aistudio/video_fitur_video_809bcad5.mp4',
                          title: 'Video Telemetri HUD Overlay APK (Asli)',
                          type: 'video',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 border border-[#7C3AED]/40 text-[#A78BFA] font-semibold transition-colors cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Layar Penuh</span>
                    </button>
                  </div>

                  <p className="text-center text-[11px] text-zinc-400 mt-1 font-mono">
                    Tampilan Video HUD Overlay dengan Countdown 3-2-1-GO!, Speedometer, G-Force &amp; Checkpoint Waktu
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= 4. FITUR GRAFIK ================= */}
          {(selectedFeatureFilter === 'all' || selectedFeatureFilter === 'grafik') && (
            <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2E2E38] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                    <LineChart className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA] text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                      FITUR 4 · ANALISIS KURVA MULTI-SEKTOR
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white font-display">
                      Fitur Grafik (Telemetry &amp; Dyno Analyzer 200Hz)
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-[#A78BFA] font-semibold">
                    Sampling 200Hz
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-emerald-400">
                    Komparasi Pass A vs Pass B
                  </span>
                </div>
              </div>

              {/* Deskripsi Singkat Jelas Detail */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-300">
                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">6 Mode Kurva Grafis</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Menganalisis Kecepatan vs Waktu, Kecepatan vs Jarak, G-Force 6-DOF, Delta Waktu, Kurva Tenaga Roda (Wheel HP), serta Elevasi &amp; Slope kontur lintasan.
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Titik Inspeksi Interaktif</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Kursor inspeksi kuning yang bisa digeser untuk membaca kecepatan (kph), G-force, dan Wheel HP secara detail di detik dan meter mana saja.
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Analisis Split Sektor A vs B</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Tabel komparasi langsung: 0-18m 60ft Launch, 18-100m, 100-201m, sprint 0-100 kph, hingga perkiraan Wheel Horsepower puncak.
                  </p>
                </div>
              </div>

              {/* Navigasi Sub-Tab Gambar Grafik */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Pilih Tampilan Kurva Grafik Telemetri:</span>
                  <span className="text-[11px] text-zinc-500">7 Tampilan Lengkap</span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {[
                    '1. Speed vs Waktu',
                    '2. Speed vs Jarak',
                    '3. G-Force 6-DOF',
                    '4. Delta Waktu A/B',
                    '5. Kurva Wheel HP',
                    '6. Elevasi & Slope',
                    '7. Tabel Split Sektor',
                  ].map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setActiveGrafikTab(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        activeGrafikTab === idx
                          ? 'bg-[#7C3AED] text-white border border-[#7C3AED]'
                          : 'bg-[#121212] text-zinc-400 hover:text-white border border-[#2E2E38]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Container Gambar Grafik Terpilih */}
                {(() => {
                  const grafikImages = [
                    {
                      src: '/assets/aistudio/gambar_fitur_grafik_1_0e79643d',
                      title: 'Fitur Grafik 1 · Analisis Kecepatan vs Waktu (kph / s) dengan Titik Inspeksi',
                      desc: 'Menampilkan kurva akselerasi kelajuan terhadap waktu secara presisi untuk memantau waktu respons oper gigi.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_grafik_2_8a26aaa5',
                      title: 'Fitur Grafik 2 · Analisis Kecepatan vs Jarak (kph / m)',
                      desc: 'Menganalisis pencapaian kecepatan puncak (kph) di setiap meter lintasan dari garis start hingga finish 201m/402m.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_grafik_3_617079f5',
                      title: 'Fitur Grafik 3 · Analisis G-Force 6-DOF (G / s)',
                      desc: 'Mendeteksi gaya gravitasi longitudinal untuk membaca traksi ban saat start launch dan sentakan perpindahan gear.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_grafik_4_872157a8',
                      title: 'Fitur Grafik 4 · Analisis Delta Waktu A vs B (Selisih Detik)',
                      desc: 'Komparasi langsung antara Run A dan Run B untuk mengetahui di sektor mana kendaraan unggul atau tertinggal.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_grafik_5_13930e03',
                      title: 'Fitur Grafik 5 · Kurva Wheel HP / Dyno Estimator (HP / s)',
                      desc: 'Kalkulasi tenaga roda instan (Wheel Horsepower) untuk melihat efisiensi tenaga mesin dan mendeteksi selip kopling.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_grafik_6_86675b35',
                      title: 'Fitur Grafik 6 · Analisis Elevasi & Slope Lintasan (Meter / m)',
                      desc: 'Membaca kemiringan jalan pengujian secara otomatis untuk memastikan hasil pengetesan memenuhi standar sertifikasi.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_grafik_7_d2a8b150',
                      title: 'Fitur Grafik 7 · Tabel Lengkap Split Interval Sektor (Pass A vs Pass B)',
                      desc: 'Rincian data numerik per sektor: Launch 60ft, 100m, 201m, sprint 0-100 kph, trap speed, dan peak horsepower.',
                    },
                  ];
                  const currentGrafik = grafikImages[activeGrafikTab] || grafikImages[0];

                  return (
                    <div
                      onClick={() =>
                        setEnlargedMedia({
                          src: currentGrafik.src,
                          title: currentGrafik.title,
                        })
                      }
                      className="group bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] rounded-xl p-4 cursor-pointer transition-all max-w-lg mx-auto"
                    >
                      <img
                        src={currentGrafik.src}
                        alt={currentGrafik.title}
                        className="w-full h-96 object-contain rounded-lg bg-black/40 group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white">{currentGrafik.title}</span>
                          <span className="inline-flex items-center gap-1 text-[#A78BFA] text-[11px] shrink-0 ml-2">
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Perbesar</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">{currentGrafik.desc}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ================= 5. FITUR SETTING ================= */}
          {(selectedFeatureFilter === 'all' || selectedFeatureFilter === 'setting') && (
            <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2E2E38] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                    <SettingsIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA] text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                      FITUR 5 · PENGATURAN &amp; KALIBRASI
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white font-display">
                      Fitur Setting (Kalibrasi Waktu, Bahasa, Suara &amp; Target Jarak)
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-zinc-300">
                    Preset RaceBox &amp; Qstarz
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-emerald-400">
                    Keep-Awake Aktif
                  </span>
                </div>
              </div>

              {/* Deskripsi Singkat Jelas Detail */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-300">
                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Kalibrasi Offset Presisi</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Offset global dan offset checkpoint khusus (18m, 100m, 201m, 203m, 402m) untuk menyinkronkan waktu dengan alat ukur resmi.
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Bahasa &amp; Zona Waktu Otomatis</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Dukungan 5 bahasa (Indonesia, English, Melayu, Thai, Vietnam) dan sinkronisasi zona waktu (WIB, WITA, WIT) berbasis GPS.
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Sound Effects &amp; Kokpit Mode</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Audio revving mesin balap, radar split, mode kokpit landscape untuk setang motor, serta fitur layar HP selalu hidup (keep-awake).
                  </p>
                </div>
              </div>

              {/* Navigasi Sub-Tab Gambar Setting */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Pilih Menu Pengaturan &amp; Konfigurasi:</span>
                  <span className="text-[11px] text-zinc-500">4 Menu Pengaturan</span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {[
                    '1. Kalibrasi Waktu & Offset Checkpoint',
                    '2. Bahasa & Zona Waktu',
                    '3. Efek Suara Balap & Orientasi Layar',
                    '4. Target Jarak & Layar Selalu Hidup',
                  ].map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setActiveSettingTab(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        activeSettingTab === idx
                          ? 'bg-[#7C3AED] text-white border border-[#7C3AED]'
                          : 'bg-[#121212] text-zinc-400 hover:text-white border border-[#2E2E38]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Container Gambar Setting Terpilih */}
                {(() => {
                  const settingImages = [
                    {
                      src: '/assets/aistudio/gambar_fitur_setting_1_c502d761',
                      title: 'Fitur Setting 1 · Kalibrasi Waktu Drag Race & Offset Checkpoint',
                      desc: 'Konfigurasi offset per checkpoint (18m, 100m, 201m, 203m, 402m) dengan preset RaceBox Spec dan Qstarz Spec.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_setting_2_4e57cdb0',
                      title: 'Fitur Setting 2 · Pilihan Bahasa Aplikasi & Zona Waktu (WIB / WITA / WIT)',
                      desc: 'Dukungan multi-bahasa internasional serta penyesuaian zona waktu Indonesia otomatis via sensor lokasi/GPS.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_setting_3_910f33f5',
                      title: 'Fitur Setting 3 · Efek Suara Balap (Sound Effects) & Mode Orientasi Layar',
                      desc: 'Kontrol volume suara revving mesin balap, suara radar split, serta orientasi layar tegak portrait atau kokpit landscape.',
                    },
                    {
                      src: '/assets/aistudio/gambar_fitur_setting_4_2a193493',
                      title: 'Fitur Setting 4 · Target Jarak Checkpoint & Layar HP Selalu Hidup',
                      desc: 'Penetapan target finish utama (201m, 402m, atau kustom) serta toggle Keep-Awake agar layar ponsel tidak mati di lintasan.',
                    },
                  ];
                  const currentSetting = settingImages[activeSettingTab] || settingImages[0];

                  return (
                    <div
                      onClick={() =>
                        setEnlargedMedia({
                          src: currentSetting.src,
                          title: currentSetting.title,
                        })
                      }
                      className="group bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] rounded-xl p-4 cursor-pointer transition-all max-w-lg mx-auto"
                    >
                      <img
                        src={currentSetting.src}
                        alt={currentSetting.title}
                        className="w-full h-96 object-contain rounded-lg bg-black/40 group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white">{currentSetting.title}</span>
                          <span className="inline-flex items-center gap-1 text-[#A78BFA] text-[11px] shrink-0 ml-2">
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Perbesar</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">{currentSetting.desc}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ================= 6. FITUR PROFILE ================= */}
          {(selectedFeatureFilter === 'all' || selectedFeatureFilter === 'profile') && (
            <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2E2E38] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA] shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA] text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                      FITUR 6 · IDENTITAS RACER &amp; GARASI
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white font-display">
                      Fitur Profile (Identitas Pembalap, Rekor PB &amp; Garasi Kendaraan)
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono font-bold">
                    PERMANENT PRO
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#121212] border border-[#2E2E38] text-[11px] font-mono text-zinc-300">
                    Garasi Digital
                  </span>
                </div>
              </div>

              {/* Deskripsi Singkat Jelas Detail */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-300">
                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Identitas &amp; Tim Balap</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Kartu profil resmi pembalap dengan status lisensi, nama tim, avatar kustom, serta foto kendaraan aktif dari kamera/galeri ponsel.
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Personal Best (PB) Showcase</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Mencatat capaian terbaik pribadi untuk 402m (9.845s), 201m (6.340s), dan sprint 0-100 kph (2.480s / 1.52 G).
                  </p>
                </div>

                <div className="bg-[#121212] border border-[#2E2E38] rounded-lg p-4 space-y-1.5">
                  <p className="font-bold text-white text-sm">Garasi Spesifikasi Mesin</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Fitur manajemen garasi untuk menyimpan berbagai motor/mobil balap beserta data rasio gigi transmisi dan dyno mesin masing-masing.
                  </p>
                </div>
              </div>

              {/* Pratinjau Fitur Profile */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Pratinjau Antarmuka Fitur Profile:</span>
                  <span className="text-[11px] text-zinc-500">Klik gambar untuk memperbesar</span>
                </div>
                <div
                  onClick={() =>
                    setEnlargedMedia({
                      src: '/assets/aistudio/gambar_fitur_profile_b1c321fd',
                      title: 'Fitur Profile · Identitas Pembalap, Foto Kendaraan Aktif, Personal Best PB & Garasi Balap',
                    })
                  }
                  className="group relative bg-[#121212] border border-[#2E2E38] hover:border-[#7C3AED] rounded-xl overflow-hidden cursor-pointer transition-all p-3 max-w-lg mx-auto"
                >
                  <img
                    src="/assets/aistudio/gambar_fitur_profile_b1c321fd"
                    alt="Fitur Profile Drag Race Pro+"
                    className="w-full h-96 object-contain rounded-lg bg-black/40 group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">Profil Pembalap &amp; Garasi Spesifikasi</span>
                    <span className="inline-flex items-center gap-1 text-[#A78BFA] text-[11px]">
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Perbesar</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================= TAB 4: GIVEAWAY AKUN TRIAL (JADWAL TIAP HARI JUMAT) ================= */}
      {activeTab === 'giveaway' && (
        <section className="space-y-8 animate-fade-in">
          <div className="bg-[#1E1E24] border border-[#2E2E38] rounded-xl p-6 sm:p-10 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-block px-2.5 py-1 rounded bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-xs font-bold text-[#A78BFA] uppercase tracking-wider mb-2">
                  🎉 Event Rutin Setiap Hari Jumat
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                  Giveaway Akun Trial Drag Race L.A
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  Menangkan akun trial gratis setiap minggu. Pemenang diundi secara transparan oleh owner setiap hari Jumat!
                </p>
              </div>
            </div>

            {/* Banner Pemenang Giveaway Minggu Ini */}
            {(() => {
              const currentWinner = giveawayParticipants.find((p) => p.isWinner);
              if (!currentWinner) return null;
              return (
                <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400 animate-bounce" />
                    <h3 className="text-base font-bold text-emerald-300">
                      🏆 PEMENANG GIVEAWAY JUMAT INI!
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono bg-[#121212] p-4 rounded-lg border border-emerald-500/30">
                    <div>
                      <span className="text-zinc-500 block">Nama Pemenang:</span>
                      <strong className="text-white text-sm">{currentWinner.fullName}</strong>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Akun TikTok:</span>
                      <strong className="text-[#A78BFA] text-sm">{currentWinner.tiktokAccount}</strong>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Nomor Tiket:</span>
                      <strong className="text-emerald-400 text-sm">{currentWinner.ticketNumber}</strong>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-300">
                    Selamat kepada pemenang! Silakan hubungi owner via WhatsApp untuk klaim akun trial Anda.
                  </p>
                </div>
              );
            })()}

            {/* Syarat & Ketentuan Giveaway */}
            <div className="bg-[#141418] border border-[#2E2E38] rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Syarat &amp; Ketentuan Wajib Mengikuti Giveaway:
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-xs text-zinc-300 leading-relaxed">
                <li>
                  Wajib Follow Instagram Owner: <strong className="text-[#A78BFA]">@ptropicial27</strong>
                </li>
                <li>
                  Wajib Follow TikTok Owner: <strong className="text-[#A78BFA]">@peterajalah</strong>
                </li>
                <li>
                  Wajib Like video giveaway dan video-video drag race lainnya di akun TikTok owner.
                </li>
                <li>
                  Unggah bukti foto seluruh syarat tersebut ke form di bawah ini, serta masukkan nama akun TikTok pendaftar Anda.
                </li>
              </ol>

              <div className="bg-amber-950/50 border border-amber-600/70 rounded-lg p-3 text-xs text-amber-200 font-semibold">
                ⚠️ PERINGATAN PENTING: Jika ketahuan unfollow / unlike, akan di-blacklist dan akun hangus detik itu juga!
              </div>
            </div>

            {/* Form Pendaftaran Giveaway */}
            <form onSubmit={handleGiveawaySubmit} className="space-y-5 pt-2">
              <h3 className="text-base font-bold text-white font-display">
                Form Pendaftaran Peserta Giveaway
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="gw-fullname" className="block text-xs font-semibold text-zinc-200">
                    Nama Lengkap / Panggilan (Wajib)
                  </label>
                  <input
                    id="gw-fullname"
                    type="text"
                    value={gwFullName}
                    onChange={(e) => setGwFullName(e.target.value)}
                    placeholder="Contoh: Hendra L.A"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="gw-tiktok" className="block text-xs font-semibold text-zinc-200">
                    Nama Akun TikTok (Wajib)
                  </label>
                  <input
                    id="gw-tiktok"
                    type="text"
                    value={gwTiktokAccount}
                    onChange={(e) => setGwTiktokAccount(e.target.value)}
                    placeholder="Contoh: @peterajalah"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#121212] border border-[#2E2E38] text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="gw-file-upload" className="block text-xs font-semibold text-zinc-200">
                  Unggah Foto Bukti Syarat (Follow IG, TikTok &amp; Like Video)
                </label>
                <div className="border border-dashed border-[#2E2E38] hover:border-[#7C3AED] rounded-xl p-5 bg-[#121212] text-center transition-colors">
                  {gwPreviewBase64 ? (
                    <div className="space-y-3 flex flex-col items-center">
                      <img
                        src={gwPreviewBase64}
                        alt="Bukti Giveaway"
                        referrerPolicy="no-referrer"
                        className="max-h-48 w-auto rounded-lg object-contain border border-[#2E2E38] bg-black/50"
                      />
                      <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Foto bukti siap dikirim</span>
                      </div>
                      <label htmlFor="gw-file-upload" className="text-xs text-zinc-400 hover:text-white underline cursor-pointer">
                        Ganti Foto Bukti
                      </label>
                    </div>
                  ) : (
                    <label htmlFor="gw-file-upload" className="cursor-pointer flex flex-col items-center justify-center space-y-2 py-4">
                      <div className="w-12 h-12 rounded-full bg-[#1E1E24] border border-[#2E2E38] flex items-center justify-center text-[#A78BFA]">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-semibold text-white">
                        Klik untuk Memilih Foto Bukti Syarat
                      </div>
                      <p className="text-xs text-zinc-400">
                        Format PNG, JPG, atau WEBP. Pastikan terlihat jelas.
                      </p>
                    </label>
                  )}
                  <input
                    id="gw-file-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleGwFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {gwError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                  {gwError}
                </p>
              )}

              <button
                type="submit"
                disabled={!gwPreviewBase64 || gwIsSubmitting}
                className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !gwPreviewBase64 || gwIsSubmitting
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-[#2E2E38]'
                    : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg shadow-[#7C3AED]/25'
                }`}
              >
                {gwIsSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mengirim Pendaftaran Giveaway...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Kirim Pendaftaran Giveaway</span>
                  </>
                )}
              </button>
            </form>

            {/* Hasil Tiket Giveaway */}
            {newlyCreatedGwTicket && (
              <div className="bg-[#121212] border border-[#7C3AED] rounded-xl p-6 text-center space-y-4 animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Pendaftaran Giveaway Berhasil Dikirim!
                  </h3>
                  <p className="text-xs text-zinc-300 mt-1">
                    Nomor Tiket Undian Anda:
                  </p>
                  <div className="text-3xl font-extrabold text-[#A78BFA] font-mono tracking-wider mt-2">
                    {newlyCreatedGwTicket.ticketNumber}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(newlyCreatedGwTicket.ticketNumber);
                      setGwTicketCopied(true);
                      setTimeout(() => setGwTicketCopied(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
                  >
                    {gwTicketCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Nomor Tiket Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Nomor Tiket</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-400">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    <span>Status: Menunggu Pengundian Jumat</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Lightbox Modal untuk Preview Media (Pratinjau Telemetri & Video Fitur APK) */}
      {enlargedMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setEnlargedMedia(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-w-5xl w-full bg-[#18181E] border border-[#2E2E38] rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col items-center max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-[#2E2E38]/80">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED] animate-pulse" />
                <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                  {enlargedMedia.title}
                </h3>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA] border border-[#7C3AED]/40">
                  {enlargedMedia.type === 'video' ? 'Video Player' : 'Visual Telemetri HD'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEnlargedMedia(null)}
                className="p-1.5 rounded-lg bg-[#2E2E38]/60 hover:bg-[#2E2E38] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Tutup (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Content */}
            <div className="w-full flex-1 min-h-0 flex items-center justify-center overflow-auto rounded-xl bg-[#0F0F13] p-1 border border-[#2E2E38]/50">
              {enlargedMedia.type === 'video' ? (
                <video
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[72vh] max-w-full rounded-lg shadow-inner object-contain bg-black"
                >
                  <source src={enlargedMedia.src} type="video/mp4" />
                  <source src="/api/video/telemetri" type="video/mp4" />
                  <source
                    src="/assets/aistudio/video_fitur_video_809bcad5.mp4"
                    type="video/mp4"
                  />
                  Browser Anda tidak mendukung tag video HTML5.
                </video>
              ) : (
                <img
                  src={enlargedMedia.src}
                  alt={enlargedMedia.title}
                  className="max-h-[72vh] max-w-full rounded-lg shadow-inner object-contain select-none"
                />
              )}
            </div>

            {/* Modal Footer */}
            <div className="w-full flex items-center justify-between pt-3 mt-2 text-xs text-zinc-300">
              <span className="text-[11px] text-zinc-300">
                DRAG RACE L.A APK • Tampilan resolusi asli aplikasi
              </span>
              <button
                type="button"
                onClick={() => setEnlargedMedia(null)}
                className="px-3.5 py-1.5 rounded-lg bg-[#1E1E24] hover:bg-[#2E2E38] text-zinc-200 text-xs font-semibold transition-colors cursor-pointer border border-[#2E2E38]"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

