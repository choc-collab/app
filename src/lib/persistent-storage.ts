export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

// Ask the browser to mark this origin's storage as "persistent" so IndexedDB
// isn't silently evicted under storage pressure. Safe to call repeatedly — the
// browser caches the decision. Returns true if storage is persistent after the
// call, false if unsupported or the browser denied the request.
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const empty: StorageStatus = {
    supported: false,
    persisted: false,
    usageBytes: null,
    quotaBytes: null,
  };
  if (typeof navigator === "undefined" || !navigator.storage) return empty;

  const supported = Boolean(navigator.storage.persist);
  let persisted = false;
  if (navigator.storage.persisted) {
    try {
      persisted = await navigator.storage.persisted();
    } catch {
      persisted = false;
    }
  }

  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  if (navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      usageBytes = typeof est.usage === "number" ? est.usage : null;
      quotaBytes = typeof est.quota === "number" ? est.quota : null;
    } catch {
      // ignore — estimate is best-effort
    }
  }

  return { supported, persisted, usageBytes, quotaBytes };
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || !isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}
