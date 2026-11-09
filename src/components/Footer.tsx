import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer
      id="hubungi-developer"
      className="border-t border-[#2A2A32] bg-[#121212] mt-16 py-12"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-base font-bold text-white font-display tracking-tight">
            Hubungi Developer
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Layanan bantuan resmi DRAG RACE L.A STORE &amp; Drag Race Pro+ aktif 24/7.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* WhatsApp */}
          <a
            href="https://wa.me/6281272731928"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp Developer"
            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-sm font-medium text-zinc-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <svg
              className="w-4 h-4 text-[#A78BFA] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
              <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
            </svg>
            <span>WhatsApp</span>
          </a>

          {/* TikTok */}
          <a
            href="https://www.tiktok.com/@peterajalah"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok Developer"
            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-sm font-medium text-zinc-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <svg
              className="w-4 h-4 text-[#A78BFA] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
            </svg>
            <span>TikTok (@peterajalah)</span>
          </a>

          {/* Instagram */}
          <a
            href="https://www.instagram.com/ptropicial27?cplk=a2FyeXBlNWNnZ3dj&utm_source=qr"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram Developer"
            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[#1E1E24] border border-[#2E2E38] hover:border-[#7C3AED] text-sm font-medium text-zinc-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <svg
              className="w-4 h-4 text-[#A78BFA] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
            </svg>
            <span>Instagram (@ptropicial27)</span>
          </a>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 mt-8 pt-6 border-t border-[#1E1E24] flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-2">
        <span>DRAG RACE L.A STORE · Sistem Lisensi Otomatis 24/7</span>
        <span>Kompatibel 100% dengan Aplikasi Android Drag Race Pro+</span>
      </div>
    </footer>
  );
};
