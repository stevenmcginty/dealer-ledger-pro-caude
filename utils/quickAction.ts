export type QuickAction = 'add-expense' | 'add-vehicle' | 'new-invoice';
const KEY = 'pendingQuickAction';
const TTL_MS = 10 * 60 * 1000; // survives a slow login, not a next-week launch

export function captureQuickActionFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action !== 'add-expense' && action !== 'add-vehicle' && action !== 'new-invoice') return;
  sessionStorage.setItem(KEY, JSON.stringify({ action, ts: Date.now() }));
  params.delete('action'); // strip so refresh can't re-fire; keep ?mode=screenshot etc.
  const rest = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
}

export function consumeQuickAction(): QuickAction | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY); // one-shot
  try {
    const { action, ts } = JSON.parse(raw);
    return Date.now() - ts < TTL_MS ? (action as QuickAction) : null;
  } catch { return null; }
}
