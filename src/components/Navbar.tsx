import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

interface NavbarProps {
  isOwnerView: boolean;
  isOwnerAuthenticated: boolean;
  isOwnerUnlocked: boolean;
  activeTab: 'buy' | 'status' | 'features' | 'giveaway';
  onToggleOwnerView: () => void;
  onBrandTitleClick: () => void;
  onSelectTab: (tab: 'buy' | 'status' | 'features' | 'giveaway') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isOwnerView,
  isOwnerAuthenticated,
  isOwnerUnlocked,
  activeTab,
  onToggleOwnerView,
  onBrandTitleClick,
  onSelectTab,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#121212]/95 backdrop-blur border-b border-[#2A2A32]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Title (Single text element wordmark - Secret 10x click trigger) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onBrandTitleClick();
            if (isOwnerView) {
              onToggleOwnerView();
            }
          }}
          className="text-lg sm:text-xl font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0 select-none cursor-pointer"
        >
          DRAG RACE L.A STORE
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Navigasi Utama"
          className="hidden md:flex items-center gap-5 text-sm font-medium text-zinc-400"
        >
          <button
            type="button"
            onClick={() => {
              if (isOwnerView) onToggleOwnerView();
              onSelectTab('buy');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !isOwnerView && activeTab === 'buy'
                ? 'text-white font-semibold'
                : 'hover:text-white'
            }`}
          >
            Beli Lisensi Baru
          </button>
          <button
            type="button"
            onClick={() => {
              if (isOwnerView) onToggleOwnerView();
              onSelectTab('status');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !isOwnerView && activeTab === 'status'
                ? 'text-white font-semibold'
                : 'hover:text-white'
            }`}
          >
            Cek Status Pembelian
          </button>
          <button
            type="button"
            onClick={() => {
              if (isOwnerView) onToggleOwnerView();
              onSelectTab('features');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !isOwnerView && activeTab === 'features'
                ? 'text-white font-semibold'
                : 'hover:text-white'
            }`}
          >
            Detail Fitur APK
          </button>
          <button
            type="button"
            onClick={() => {
              if (isOwnerView) onToggleOwnerView();
              onSelectTab('giveaway');
            }}
            className={`inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !isOwnerView && activeTab === 'giveaway'
                ? 'text-[#A78BFA] font-bold'
                : 'hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />
            <span>Giveaway Akun Trial</span>
          </button>
        </nav>

        {/* Zone 3: Hanya muncul tombol Owner setelah 10x klik rahasia */}
        <div className="flex items-center gap-2.5 shrink-0">
          {(isOwnerUnlocked || isOwnerView || isOwnerAuthenticated) && (
            <button
              type="button"
              onClick={onToggleOwnerView}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isOwnerView
                  ? 'bg-[#7C3AED] text-white border-[#7C3AED] hover:bg-[#6D28D9]'
                  : 'bg-[#1E1E24] text-zinc-200 border-[#2E2E38] hover:border-[#7C3AED] hover:text-white'
              }`}
            >
              {isOwnerAuthenticated ? (
                <ShieldCheck className="w-3.5 h-3.5 text-[#A78BFA]" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-[#7C3AED]" />
              )}
              <span>{isOwnerView ? 'Kembali ke Toko' : 'Login Owner'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
