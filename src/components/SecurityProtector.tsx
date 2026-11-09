import React, { useEffect, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';

export const SecurityProtector: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [devToolsDetected, setDevToolsDetected] = useState(false);

  useEffect(() => {
    // 1. Block right click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', handleContextMenu);

    // 2. Block shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U, Cmd+Opt+I)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toUpperCase() === 'U') ||
        (e.metaKey && e.altKey && e.key.toUpperCase() === 'I')
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // 3. Periodic console clear
    const clearInterval = setInterval(() => {
      console.clear();
    }, 2000);

    // 4. DevTools detector (Window outer vs inner dimension threshold & debugger trap)
    const checkDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      if (widthThreshold || heightThreshold) {
        setDevToolsDetected(true);
      }
    };

    const intervalId = setInterval(checkDevTools, 1000);

    // Debugger trap
    const debuggerInterval = setInterval(() => {
      const startTime = performance.now();
      debugger;
      const endTime = performance.now();
      if (endTime - startTime > 100) {
        setDevToolsDetected(true);
      }
    }, 2500);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      clearInterval(clearInterval);
      clearInterval(intervalId);
      clearInterval(debuggerInterval);
    };
  }, []);

  if (devToolsDetected) {
    return (
      <div className="fixed inset-0 z-[99999] bg-black text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-950 border border-red-800 flex items-center justify-center text-red-500 animate-pulse">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold font-display text-red-500">
          PERINGATAN KEAMANAN SISTEM
        </h1>
        <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
          Developer Tools / Inspect Element terdeteksi aktif. Akses ke <strong>DRAG RACE L.A STORE</strong> diblokir demi keamanan lisensi dan database transaksi.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-colors cursor-pointer"
        >
          Muat Ulang Halaman
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
