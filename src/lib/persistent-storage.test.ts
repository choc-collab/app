import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatBytes, getStorageStatus, requestPersistentStorage } from "./persistent-storage";

// --- Helpers ---------------------------------------------------------------

type StorageManagerStub = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<StorageEstimate>;
};

function installNavigatorStorage(storage: StorageManagerStub | undefined) {
  // vitest uses the node environment; navigator is not present by default.
  // We attach it to globalThis so the SUT picks it up via `typeof navigator`.
  if (storage === undefined) {
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    return;
  }
  Object.defineProperty(globalThis, "navigator", {
    value: { storage },
    configurable: true,
    writable: true,
  });
}

const originalNavigator = (globalThis as { navigator?: unknown }).navigator;

afterEach(() => {
  if (originalNavigator === undefined) {
    delete (globalThis as { navigator?: unknown }).navigator;
  } else {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  }
});

// --- requestPersistentStorage ---------------------------------------------

describe("requestPersistentStorage", () => {
  it("returns false when navigator is unavailable (SSR)", async () => {
    installNavigatorStorage(undefined);
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("returns false when the storage API is unsupported", async () => {
    installNavigatorStorage({});
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("short-circuits to true if storage is already persisted", async () => {
    const persist = vi.fn().mockResolvedValue(false);
    installNavigatorStorage({
      persist,
      persisted: vi.fn().mockResolvedValue(true),
    });

    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("calls persist() when not already persisted and returns its result", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    installNavigatorStorage({
      persist,
      persisted: vi.fn().mockResolvedValue(false),
    });

    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("returns false when persist() resolves false (browser denied)", async () => {
    installNavigatorStorage({
      persist: vi.fn().mockResolvedValue(false),
      persisted: vi.fn().mockResolvedValue(false),
    });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("swallows errors from persist() and returns false", async () => {
    installNavigatorStorage({
      persist: vi.fn().mockRejectedValue(new Error("boom")),
      persisted: vi.fn().mockResolvedValue(false),
    });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("still calls persist() when persisted() is missing", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    installNavigatorStorage({ persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });
});

// --- getStorageStatus ------------------------------------------------------

describe("getStorageStatus", () => {
  it("returns an all-empty status when navigator is unavailable", async () => {
    installNavigatorStorage(undefined);
    expect(await getStorageStatus()).toEqual({
      supported: false,
      persisted: false,
      usageBytes: null,
      quotaBytes: null,
    });
  });

  it("reports supported:false when persist() is not exposed", async () => {
    installNavigatorStorage({
      estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 100 }),
    });
    const s = await getStorageStatus();
    expect(s.supported).toBe(false);
    expect(s.usageBytes).toBe(10);
    expect(s.quotaBytes).toBe(100);
  });

  it("reports persisted + usage/quota when everything is available", async () => {
    installNavigatorStorage({
      persist: vi.fn().mockResolvedValue(true),
      persisted: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 5_000_000, quota: 50_000_000 }),
    });
    expect(await getStorageStatus()).toEqual({
      supported: true,
      persisted: true,
      usageBytes: 5_000_000,
      quotaBytes: 50_000_000,
    });
  });

  it("tolerates estimate() without usage/quota fields", async () => {
    installNavigatorStorage({
      persist: vi.fn().mockResolvedValue(true),
      persisted: vi.fn().mockResolvedValue(false),
      estimate: vi.fn().mockResolvedValue({}),
    });
    expect(await getStorageStatus()).toEqual({
      supported: true,
      persisted: false,
      usageBytes: null,
      quotaBytes: null,
    });
  });

  it("swallows errors from persisted() and estimate()", async () => {
    installNavigatorStorage({
      persist: vi.fn().mockResolvedValue(true),
      persisted: vi.fn().mockRejectedValue(new Error("no")),
      estimate: vi.fn().mockRejectedValue(new Error("no")),
    });
    expect(await getStorageStatus()).toEqual({
      supported: true,
      persisted: false,
      usageBytes: null,
      quotaBytes: null,
    });
  });
});

// --- formatBytes -----------------------------------------------------------

describe("formatBytes", () => {
  it("returns an em-dash placeholder for null/negative/non-finite inputs", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
  });

  it("formats bytes/KB/MB/GB boundaries with sensible precision", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024)).toBe("10 KB"); // >=10 drops decimal
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5.0 GB");
  });
});
