/// <reference types="vite/client" />

interface Window {
  blackMambaDesktop?: {
    platform: string;
    readNotionCatalog: () => Promise<{ ok: true; songs: Array<{ notionPageId: string; notionUrl: string | null; title: string; sunoId: string | null; isrc: string | null; soundcloudUrl: string | null; lifecycle: string | null; audioMaster: boolean; artworkSquare: boolean; lyrics: boolean; metadata: boolean; nextAction: string; notes: string }> } | { ok: false; error: string }>;
    setCompactMode: (compact: boolean) => Promise<void>;
    revealLocalAudio: (file: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    extractVideoMp3: () => Promise<{
      ok: boolean;
      canceled?: boolean;
      confidence?: string;
      evidence?: string[];
      warnings?: string[];
      fallbackReason?: string | null;
      file?: string;
    }>;
    onTransport: (callback: (action: 'toggle' | 'previous' | 'next' | 'stop') => void) => () => void;
    onUpdateStatus: (callback: (status: { status: string; detail: string | number | null }) => void) => () => void;
  };
}
