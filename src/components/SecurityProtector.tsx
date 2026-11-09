import React, { useEffect } from 'react';

export const SecurityProtector: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
    const clearTimer = setInterval(() => {
      console.clear();
    }, 5000);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      clearInterval(clearTimer);
    };
  }, []);

  return <>{children}</>;
};
