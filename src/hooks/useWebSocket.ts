import { useEffect, useRef, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import { useSheetsStore } from '../store';
import { useAuthStore } from '../store';

/**
 * Build the WebSocket URL from the API base URL.
 * Converts http(s):// to ws(s):// and points to the /ws-direct endpoint
 * which does NOT use SockJS.
 */
function buildWsUrl(): string {
  const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
  const wsBase = apiBase
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');
  return wsBase + '/ws-direct';
}

/**
 * WebSocket hook for real-time dashboard updates.
 * Uses native WebSocket (not SockJS) for lowest latency.
 * Only connects when a user is authenticated.
 * Resilient to connection failures � will silently retry.
 */
/**
 * Human-readable notification titles, keyed by the event types the backend
 * actually publishes (see WebSocketEventPublisher).
 *
 * SHEET_AUTOSAVED is deliberately absent: the editor auto-saves every few
 * hundred milliseconds while someone types, and notifying on each one buried
 * the desktop app in toasts for a sheet that was still being edited.
 * Autosaves still refresh the list - they just never notify.
 */
const NOTIFY_TITLES: Record<string, string> = {
  SHEET_CREATED: 'New Sheet',
  SHEET_UPDATED: 'Sheet Updated',
  SHEET_DELETED: 'Sheet Deleted',
  RESPONSE_ADDED: 'New Response',
  STATUS_CHANGED: 'Status Changed',
};

export function useWebSocket() {
  const clientRef = useRef<Client | null>(null);
  const { fetchSheets } = useSheetsStore();
  const { user } = useAuthStore();

  // Coalesces bursts of events into a single list refresh.
  const refreshTimerRef = useRef<number | null>(null);
  // Suppresses repeats of the same notification (multi-tab, rapid re-saves).
  const lastNotifiedRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const connect = useCallback(() => {
    if (clientRef.current?.connected) return;
    if (!user) return;

    try {
      const brokerURL = buildWsUrl();
      console.log('?? Connecting WebSocket to:', brokerURL);

      const client = new Client({
        brokerURL,
        // No webSocketFactory needed � @stomp/stompjs uses native WebSocket
        // when brokerURL is provided, which is the fastest transport.
        reconnectDelay: 3000,       // Reconnect faster (was 5s)
        heartbeatIncoming: 8000,    // Detect dead connections faster (was 10s)
        heartbeatOutgoing: 8000,

        onConnect: () => {
          console.log('?? WebSocket connected (native WS)');

          client.subscribe('/topic/sheets', (message) => {
            try {
              const event = JSON.parse(message.body);
              console.log('?? Sheet event:', event.type, event.sheetId);
              // Debounced: an autosave burst is one refresh, not one per keystroke batch.
              if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
              }
              refreshTimerRef.current = window.setTimeout(() => {
                refreshTimerRef.current = null;
                fetchSheets();
              }, 800);

              // Native notification for Electron desktop app
              const typeLabel = NOTIFY_TITLES[event.type];
              if (!typeLabel) return; // autosave and unknown types stay silent

              const now = Date.now();
              const key = `${event.type}:${event.sheetId}`;
              if (lastNotifiedRef.current.key === key && now - lastNotifiedRef.current.at < 10000) {
                return;
              }
              lastNotifiedRef.current = { key, at: now };

              const electronAPI = (window as any).electronAPI;
              if (electronAPI?.sendNotification) {
                electronAPI.sendNotification(
                  typeLabel,
                  event.title || event.sheet?.title || event.sheetId || 'Action sheet activity detected'
                );
              }
            } catch (e) {
              console.warn('Failed to parse WS message', e);
            }
          });
        },

        onDisconnect: () => {
          console.log('?? WebSocket disconnected');
        },

        onStompError: (frame) => {
          console.warn('WebSocket STOMP error:', frame.headers?.message);
        },

        onWebSocketError: () => {
          // Silently handle � will auto-reconnect
        },
      });

      client.activate();
      clientRef.current = client;
    } catch (e) {
      console.warn('WebSocket connection failed, will retry:', e);
    }
  }, [fetchSheets, user]);

  const disconnect = useCallback(() => {
    try {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (clientRef.current) {
        clientRef.current.deactivate();
        clientRef.current = null;
      }
    } catch {
      // Ignore disconnect errors
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { connect, disconnect };
}
