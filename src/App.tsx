import { useEffect, useState, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { BuyerStorefront } from './components/BuyerStorefront';
import { OwnerDashboard } from './components/OwnerDashboard';
import { Footer } from './components/Footer';
import { BuyerOrder, GiveawayParticipant, StoreSettings } from './types/store';
import { SecurityProtector } from './components/SecurityProtector';
import {
  DEFAULT_STORE_SETTINGS,
  createAndSyncBuyerOrder,
  fetchUnifiedStoreState,
  getLocalGiveawayParticipants,
  getLocalOrders,
  getLocalSettings,
  saveLocalGiveawayParticipants,
  saveLocalOrders,
} from './services/storeService';

export default function App() {
  const [settings, setSettings] = useState<StoreSettings>(() =>
    getLocalSettings()
  );
  const [orders, setOrders] = useState<BuyerOrder[]>(() => getLocalOrders());
  const [giveawayParticipants, setGiveawayParticipants] = useState<
    GiveawayParticipant[]
  >(() => getLocalGiveawayParticipants());

  const [isOwnerUnlocked, setIsOwnerUnlocked] = useState<boolean>(false);
  const [isOwnerView, setIsOwnerView] = useState<boolean>(false);
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] =
    useState<boolean>(false);
  const [activeBuyerTab, setActiveBuyerTab] = useState<
    'buy' | 'status' | 'features' | 'giveaway'
  >('buy');

  const secretClickTimestampsRef = useRef<number[]>([]);

  const handleBrandTitleClick = useCallback(() => {
    const now = Date.now();
    // Simpan klik dalam rentang 4 detik terakhir
    const recentClicks = secretClickTimestampsRef.current.filter(
      (t) => now - t <= 4000
    );
    recentClicks.push(now);
    secretClickTimestampsRef.current = recentClicks;

    if (recentClicks.length >= 10) {
      secretClickTimestampsRef.current = [];
      setIsOwnerUnlocked(true);
      setIsOwnerView(true);
    }
  }, []);

  const syncFromCloudAndServer = useCallback(async () => {
    try {
      const unified = await fetchUnifiedStoreState();
      setSettings(unified.settings || DEFAULT_STORE_SETTINGS);
      setOrders(unified.orders || []);
    } catch {
      // Fallback already loaded from local
    }
  }, []);

  useEffect(() => {
    syncFromCloudAndServer();
    // Polling sinkronisasi real-time setiap 3 detik
    const interval = setInterval(syncFromCloudAndServer, 3000);
    return () => clearInterval(interval);
  }, [syncFromCloudAndServer]);

  const handleOrderCreatedOrUpdated = async (
    orderPayload: BuyerOrder
  ): Promise<BuyerOrder> => {
    const saved = await createAndSyncBuyerOrder(
      orderPayload,
      settings.firebaseDbUrl
    );
    setOrders((prev) => [saved, ...prev.filter((o) => o.id !== saved.id)]);
    return saved;
  };

  const handleCreateManualOrder = async (
    newOrder: BuyerOrder
  ): Promise<void> => {
    const saved = await createAndSyncBuyerOrder(
      newOrder,
      settings.firebaseDbUrl
    );
    setOrders((prev) => [saved, ...prev.filter((o) => o.id !== saved.id)]);
  };

  const handleOrdersChange = (nextOrders: BuyerOrder[]) => {
    setOrders(nextOrders);
    saveLocalOrders(nextOrders);
  };

  const handleGiveawaySubmitted = (participant: GiveawayParticipant) => {
    setGiveawayParticipants((prev) => {
      const updated = [participant, ...prev.filter((p) => p.id !== participant.id)];
      saveLocalGiveawayParticipants(updated);
      return updated;
    });
  };

  const handleGiveawayParticipantsChange = (next: GiveawayParticipant[]) => {
    setGiveawayParticipants(next);
    saveLocalGiveawayParticipants(next);
  };

  return (
    <SecurityProtector>
      <div className="min-h-screen bg-[#121212] text-[#F4F4F6] flex flex-col justify-between">
      <div>
        <Navbar
          isOwnerView={isOwnerView}
          isOwnerAuthenticated={isOwnerAuthenticated}
          isOwnerUnlocked={isOwnerUnlocked}
          activeTab={activeBuyerTab}
          onToggleOwnerView={() => setIsOwnerView((prev) => !prev)}
          onBrandTitleClick={handleBrandTitleClick}
          onSelectTab={setActiveBuyerTab}
        />

        <main>
          {isOwnerView ? (
            <OwnerDashboard
              settings={settings}
              orders={orders}
              giveawayParticipants={giveawayParticipants}
              isAuthenticated={isOwnerAuthenticated}
              onLoginSuccess={() => setIsOwnerAuthenticated(true)}
              onLogout={() => {
                setIsOwnerAuthenticated(false);
                setIsOwnerUnlocked(false);
                setIsOwnerView(false);
              }}
              onSettingsChange={(next) => setSettings(next)}
              onOrdersChange={handleOrdersChange}
              onCreateManualOrder={handleCreateManualOrder}
              onGiveawayParticipantsChange={handleGiveawayParticipantsChange}
            />
          ) : (
            <BuyerStorefront
              settings={settings}
              orders={orders}
              giveawayParticipants={giveawayParticipants}
              activeTab={activeBuyerTab}
              onSelectTab={setActiveBuyerTab}
              onOrderCreatedOrUpdated={handleOrderCreatedOrUpdated}
              onRefreshState={syncFromCloudAndServer}
              onBrandTitleClick={handleBrandTitleClick}
              onGiveawaySubmitted={handleGiveawaySubmitted}
            />
          )}
        </main>
      </div>

      <Footer />
    </div>
    </SecurityProtector>
  );
}
