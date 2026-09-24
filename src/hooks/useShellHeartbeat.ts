import {useEffect} from 'react';
import {invoke} from '@tauri-apps/api/core';

// Both live WebViews must keep responding before native taskbar replacement is allowed.
export function useShellHeartbeat() {
  useEffect(() => {
    const beat = () => { void invoke('shell_heartbeat').catch(() => {}); };
    beat();
    const timer = window.setInterval(beat, 2000);
    return () => window.clearInterval(timer);
  }, []);
}
