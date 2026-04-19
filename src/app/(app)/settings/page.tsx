"use client";

import { useRef, useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { exportBackup, importBackup, clearAllData } from "@/lib/backup";
import { useMarketRegion, setMarketRegion, useFacilityMayContain, setFacilityMayContain, useCurrency, setCurrency, useDefaultFillMode, setDefaultFillMode } from "@/lib/hooks";
import { getAllergensByRegion, allergenLabel, CURRENCIES, getCurrencySymbol, MARKET_LABEL_RULES, type CurrencyCode, type MarketRegion, type FillMode } from "@/types";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { loadDemoData, isDemoDataLoaded } from "@/lib/seed-demo";
import { isCloudConfigured } from "@/lib/db";
import { Download, Upload, AlertTriangle, CheckCircle, ChevronDown, FlaskConical, Video, Printer, Pencil, Trash2, FileSpreadsheet } from "lucide-react";
import { CSVImport } from "@/components/csv-import";
import { ingredientImportConfig, getExistingIngredientKeys } from "@/lib/csv-import-ingredients";
import type { Ingredient } from "@/types";

type ImportState = "idle" | "confirm" | "importing" | "done" | "error";
type Tab = "backup" | "import" | "market" | "printing" | "demo";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("backup");
  const [marketDirty, setMarketDirty] = useState(false);
  const marketRegion = useMarketRegion();
  const currency = useCurrency();
  const facilityMayContain = useFacilityMayContain();
  const defaultFillMode = useDefaultFillMode();

  const anyDirty = marketDirty;

  // Guard page-level navigation (side nav links, browser close/refresh)
  useNavigationGuard(anyDirty);

  function switchTab(tab: Tab) {
    if (tab === activeTab) return;
    if (anyDirty) {
      if (!window.confirm("You have unsaved changes. Leave without saving?")) return;
      setMarketDirty(false);
    }
    setActiveTab(tab);
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await exportBackup();
    } finally {
      setExporting(false);
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setImportState("confirm");
    setErrorMessage("");
    e.target.value = "";
  }

  async function handleConfirmImport() {
    if (!selectedFile) return;
    setImportState("importing");
    try {
      await importBackup(selectedFile);
      setImportState("done");
      setSelectedFile(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Import failed.");
      setImportState("error");
    }
  }

  function handleCancelImport() {
    setSelectedFile(null);
    setImportState("idle");
    setErrorMessage("");
  }

  return (
    <div>
      <PageHeader title="Settings" description="Backup, restore, and preferences" />

      {/* Tab strip */}
      <div className="flex border-b border-border px-4 mb-6">
        <button
          onClick={() => switchTab("backup")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "backup" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Backup & Restore
        </button>
        <button
          onClick={() => switchTab("import")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "import" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Import
        </button>
        <button
          onClick={() => switchTab("market")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "market" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Target Market
        </button>
        <button
          onClick={() => switchTab("printing")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "printing" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Printing
        </button>
        <button
          onClick={() => switchTab("demo")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "demo" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Demo Mode
        </button>
      </div>

      <div className="px-4 pb-8">
        {activeTab === "backup" ? (
          <BackupTab
            fileInputRef={fileInputRef}
            exporting={exporting}
            importState={importState}
            errorMessage={errorMessage}
            selectedFile={selectedFile}
            onExport={handleExport}
            onFileSelected={handleFileSelected}
            onConfirmImport={handleConfirmImport}
            onCancelImport={handleCancelImport}
          />
        ) : activeTab === "import" ? (
          <ImportTab />
        ) : activeTab === "market" ? (
          <PreferencesTab marketRegion={marketRegion} onRegionChange={setMarketRegion} currency={currency} onCurrencyChange={setCurrency} facilityMayContain={facilityMayContain} onMayContainChange={setFacilityMayContain} defaultFillMode={defaultFillMode} onFillModeChange={setDefaultFillMode} onDirtyChange={setMarketDirty} />
        ) : activeTab === "printing" ? (
          <LabelPrinterSection />
        ) : activeTab === "demo" ? (
          <DemoTab />
        ) : null}
      </div>
    </div>
  );
}

function BackupTab({
  fileInputRef,
  exporting,
  importState,
  errorMessage,
  selectedFile,
  onExport,
  onFileSelected,
  onConfirmImport,
  onCancelImport,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  importState: ImportState;
  errorMessage: string;
  selectedFile: File | null;
  onExport: () => void;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmImport: () => void;
  onCancelImport: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Backup & Restore</h2>
        {!isCloudConfigured ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
            <p>
              <strong>You&apos;re using local-only mode.</strong> All data lives in this browser
              and isn&apos;t synced anywhere.
            </p>
            <p>
              Export regularly — especially on iOS Safari, which may clear storage after a few
              weeks of inactivity. Installing to the Home Screen reduces (but doesn&apos;t
              eliminate) that risk.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Your data syncs across devices when signed in. Export a backup regularly as an extra
            safety net.
          </p>
        )}

        {/* Export */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-start gap-3">
            <Download className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Export backup</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Downloads a <code>.json</code> file containing all your ingredients, products,
                fillings, moulds, and production plans.
              </p>
            </div>
          </div>
          <button
            onClick={onExport}
            disabled={exporting}
            className="w-full rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export backup"}
          </button>
        </div>

        {/* Import */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-start gap-3">
            <Upload className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Restore from backup</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Replaces <strong>all</strong> current data with the contents of a backup file.
                This cannot be undone.
              </p>
            </div>
          </div>

          {importState === "idle" || importState === "error" ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-full border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Choose backup file…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onFileSelected}
              />
              {importState === "error" && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{errorMessage}</p>
                </div>
              )}
            </>
          ) : importState === "confirm" ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-md bg-status-warn-bg border border-status-warn-edge px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
                <p className="text-xs text-status-warn">
                  This will <strong>replace all your data</strong> with the contents of{" "}
                  <span className="font-medium">{selectedFile?.name}</span>. Are you sure?
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onConfirmImport}
                  className="flex-1 rounded-full bg-destructive text-destructive-foreground py-2 text-sm font-medium"
                >
                  Yes, replace all data
                </button>
                <button
                  onClick={onCancelImport}
                  className="rounded-full border border-border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : importState === "importing" ? (
            <div className="py-2 text-center text-sm text-muted-foreground">Importing…</div>
          ) : importState === "done" ? (
            <div className="flex items-center gap-2 rounded-md bg-status-ok-bg border border-status-ok-edge px-3 py-2">
              <CheckCircle className="w-4 h-4 text-status-ok shrink-0" />
              <p className="text-xs text-status-ok">
                Restore complete. Reload the page to see your data.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* About */}
      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-primary">About</h2>
        <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-1">
          <p className="text-sm font-medium">Choc-collab{isCloudConfigured ? "" : " — local only"}</p>
          {isCloudConfigured ? (
            <>
              <p className="text-xs text-muted-foreground">Chocolatier toolkit, synced via Dexie Cloud.</p>
              <p className="text-xs text-muted-foreground">Your data is securely synced across all your devices.</p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Chocolatier toolkit, running locally in your browser.</p>
              <p className="text-xs text-muted-foreground">Your data lives in this device&apos;s storage only — use Export to keep a backup.</p>
              <p className="text-xs text-muted-foreground">Tip: install as a PWA (via your browser&apos;s &ldquo;Install app&rdquo; or &ldquo;Add to Home Screen&rdquo;) to use offline like a native app.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function DemoTab() {
  return (
    <div className="space-y-6">
      <DemoModeSection />
      <DemoDataSection />
      <ClearAllDataSection />
    </div>
  );
}

function LabelPrinterSection() {
  const [enabled, setEnabled] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("niimbot-printer-enabled") === "true"
  );

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem("niimbot-printer-enabled", next ? "true" : "false");
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">Label Printer</h2>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Printer className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Label printing</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shows a "Save labels" button on completed production batches. Generates one PNG
              traceability label per product type and opens the share sheet — save to Photos,
              AirDrop, or open in the Niimbot app to print.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={toggle}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
      </div>
    </section>
  );
}

function DemoModeSection() {
  const [enabled, setEnabled] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("demo-mode") === "true"
  );

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem("demo-mode", next ? "true" : "false");
    window.dispatchEvent(new CustomEvent("demo-mode-changed"));
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">Demo Mode</h2>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Video className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Touch indicators</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shows a ripple wherever you tap — useful when screen-recording for social media.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={toggle}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      </div>
    </section>
  );
}

function DemoDataSection() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "already" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleLoad() {
    setState("loading");
    try {
      const alreadyLoaded = await isDemoDataLoaded();
      if (alreadyLoaded) {
        setState("already");
        return;
      }
      const result = await loadDemoData();
      if (result.success) {
        setState("done");
        setMessage(result.message);
      } else {
        setState("already");
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Failed to load demo data.");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">Demo Data</h2>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <FlaskConical className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Load cost calculation demo</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adds 3 products (Milk Chocolate Ganache, Salted Caramel, Hazelnut Praline)
              with full ingredient data, a cost history showing the switch from{" "}
              <strong>Callebaut → Felchlin</strong> premium couverture in February 2026,
              5 production batches (including one in progress today), and in-stock products
              ready to explore in the Stock tab.
              Existing data is not affected.
            </p>
          </div>
        </div>

        {state === "idle" && (
          <button
            onClick={handleLoad}
            className="w-full rounded-full border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Load demo data
          </button>
        )}
        {state === "loading" && (
          <div className="py-2 text-center text-sm text-muted-foreground">Loading…</div>
        )}
        {state === "done" && (
          <div className="flex items-start gap-2 rounded-md bg-status-ok-bg border border-status-ok-edge px-3 py-2">
            <CheckCircle className="w-4 h-4 text-status-ok shrink-0 mt-0.5" />
            <p className="text-xs text-status-ok">{message}</p>
          </div>
        )}
        {state === "already" && (
          <div className="flex items-start gap-2 rounded-md bg-status-warn-bg border border-status-warn-edge px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
            <p className="text-xs text-status-warn">Demo data is already loaded.</p>
          </div>
        )}
        {state === "error" && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{message}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ClearAllDataSection() {
  const [state, setState] = useState<"idle" | "confirm" | "clearing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleClear() {
    setState("clearing");
    try {
      await clearAllData();
      setState("done");
      setMessage("All data has been deleted. The app is ready for a fresh start.");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Failed to clear data.");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-destructive">Delete All Data</h2>
      <div className="rounded-lg border border-destructive/30 bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Trash2 className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Start from scratch</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently deletes all products, fillings, ingredients, moulds, production plans,
              collections, experiments, and every other record in the app.
              This cannot be undone — export a backup first if you want to keep anything.
            </p>
          </div>
        </div>

        {state === "idle" && (
          <button
            onClick={() => setState("confirm")}
            className="w-full rounded-full border border-destructive/30 text-destructive py-2 text-sm font-medium hover:bg-destructive/5 transition-colors"
          >
            Delete all data
          </button>
        )}
        {state === "confirm" && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 space-y-3">
            <p className="text-sm text-destructive font-medium">
              Are you sure? This will permanently delete everything.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleClear}
                className="flex-1 rounded-full bg-destructive text-white py-2 text-sm font-medium"
              >
                Yes, delete everything
              </button>
              <button
                onClick={() => setState("idle")}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {state === "clearing" && (
          <div className="py-2 text-center text-sm text-muted-foreground">Deleting…</div>
        )}
        {state === "done" && (
          <div className="flex items-start gap-2 rounded-md bg-status-ok-bg border border-status-ok-edge px-3 py-2">
            <CheckCircle className="w-4 h-4 text-status-ok shrink-0 mt-0.5" />
            <p className="text-xs text-status-ok">{message}</p>
          </div>
        )}
        {state === "error" && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{message}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PreferencesTab({
  marketRegion,
  onRegionChange,
  currency,
  onCurrencyChange,
  facilityMayContain,
  onMayContainChange,
  defaultFillMode,
  onFillModeChange,
  onDirtyChange,
}: {
  marketRegion: MarketRegion;
  onRegionChange: (r: MarketRegion) => void;
  currency: CurrencyCode;
  onCurrencyChange: (c: CurrencyCode) => void;
  facilityMayContain: string[];
  onMayContainChange: (allergens: string[]) => void;
  defaultFillMode: FillMode;
  onFillModeChange: (mode: FillMode) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

  // Draft state — only committed on Save
  const [draftCurrency, setDraftCurrency] = useState(currency);
  const [draftRegion, setDraftRegion] = useState(marketRegion);
  const [draftMayContain, setDraftMayContain] = useState(facilityMayContain);
  const [draftFillMode, setDraftFillMode] = useState(defaultFillMode);

  // Track dirty state — notify parent whenever it changes
  const isDirty = editing && (
    draftCurrency !== currency ||
    draftRegion !== marketRegion ||
    JSON.stringify(draftMayContain) !== JSON.stringify(facilityMayContain) ||
    draftFillMode !== defaultFillMode
  );
  useEffect(() => { onDirtyChange(isDirty); }, [isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditing() {
    setDraftCurrency(currency);
    setDraftRegion(marketRegion);
    setDraftMayContain(facilityMayContain);
    setDraftFillMode(defaultFillMode);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
  }

  function handleSave() {
    if (draftCurrency !== currency) onCurrencyChange(draftCurrency);
    if (draftRegion !== marketRegion) onRegionChange(draftRegion);
    if (JSON.stringify(draftMayContain) !== JSON.stringify(facilityMayContain)) onMayContainChange(draftMayContain);
    if (draftFillMode !== defaultFillMode) onFillModeChange(draftFillMode);
    setEditing(false);
  }

  function toggleDraftMayContain(id: string) {
    setDraftMayContain(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  }

  useEffect(() => {
    if (!editing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active values — draft when editing, committed when reading
  const activeCurrency = editing ? draftCurrency : currency;
  const activeRegion = editing ? draftRegion : marketRegion;
  const activeMayContain = editing ? draftMayContain : facilityMayContain;
  const activeFillMode = editing ? draftFillMode : defaultFillMode;
  const activeAllergens = getAllergensByRegion(activeRegion);
  const rules = MARKET_LABEL_RULES[activeRegion];
  const currencyInfo = CURRENCIES.find(c => c.code === activeCurrency);

  // ---- Read-only view ----
  if (!editing) {
    return (
      <div className="space-y-6">
        {/* Header with edit button */}
        <div className="flex items-center justify-between">
          <div />
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>

        {/* Key-value card */}
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-muted-foreground">Currency</span>
            <span className="text-sm font-medium">{currencyInfo?.label ?? activeCurrency}</span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-muted-foreground">Target market</span>
            <span className="text-sm font-medium">{rules.label}</span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-muted-foreground">Allergens tracked</span>
            <span className="text-sm font-medium">{activeAllergens.length}</span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-muted-foreground">Default fill mode</span>
            <span className="text-sm font-medium">{activeFillMode === "grams" ? "By grams" : "By percentage"}</span>
          </div>
        </div>

        {/* May Contain summary */}
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground mb-1.5">Facility &ldquo;may contain&rdquo; advisories</p>
          {activeMayContain.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {activeMayContain.map(id => (
                <span key={id} className="rounded-full bg-status-warn-bg text-status-warn border border-status-warn-edge px-2 py-0.5 text-xs font-medium">
                  {allergenLabel(id)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60">None set</p>
          )}
        </div>
      </div>
    );
  }

  // ---- Edit mode ----
  return (
    <div className="space-y-6">
      {/* Currency */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Currency</h2>
        <p className="text-xs text-muted-foreground">
          All prices, costs, and margins throughout the app are displayed in this currency.
          Changing currency does not convert existing values — it only changes the symbol shown.
        </p>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <label className="block text-sm font-medium">Display currency</label>
          <select
            value={draftCurrency}
            onChange={(e) => setDraftCurrency(e.target.value as CurrencyCode)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Market & Allergens */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Market &amp; Allergen Compliance</h2>
        <p className="text-xs text-muted-foreground">
          Controls which allergen checklist appears when editing ingredients.
          You are responsible for understanding and complying with your region&rsquo;s labelling regulations.
        </p>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <label className="block text-sm font-medium">Target market</label>
          <select
            value={draftRegion}
            onChange={(e) => setDraftRegion(e.target.value as MarketRegion)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {(Object.entries(MARKET_LABEL_RULES) as [MarketRegion, typeof MARKET_LABEL_RULES["EU"]][]).map(([code, r]) => (
              <option key={code} value={code}>{r.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {activeAllergens.length} allergens for this market
          </p>
        </div>
      </section>

      {/* Default fill mode */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Default Fill Mode</h2>
        <p className="text-xs text-muted-foreground">
          Controls how filling amounts are entered by default when assigning fillings to products.
          Individual products can still override this.
        </p>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <label className="block text-sm font-medium">Default fill mode</label>
          <select
            value={draftFillMode}
            onChange={(e) => setDraftFillMode(e.target.value as FillMode)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="percentage">By percentage</option>
            <option value="grams">By grams</option>
          </select>
        </div>
      </section>

      {/* May Contain */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Facility &ldquo;May Contain&rdquo; Advisories</h2>
        <p className="text-xs text-muted-foreground">
          Cross-contamination risk from shared equipment or production environment. This applies to your
          entire facility — not to individual products.
        </p>
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          {activeAllergens.filter(a => !a.group).map((a) => (
            <label key={a.id} className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={draftMayContain.includes(a.id)}
                onChange={() => toggleDraftMayContain(a.id)}
                className="shrink-0 accent-[var(--color-primary)]"
              />
              <span className={`text-sm ${draftMayContain.includes(a.id) ? "font-semibold" : ""}`}>
                {a.label}
              </span>
              {a.hint && <span className="text-xs text-muted-foreground">{a.hint}</span>}
            </label>
          ))}
          {activeAllergens.filter(a => a.group === "nuts").length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Tree nuts</p>
              <div className="grid grid-cols-2 gap-x-4">
                {activeAllergens.filter(a => a.group === "nuts").map((a) => (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={draftMayContain.includes(a.id)}
                      onChange={() => toggleDraftMayContain(a.id)}
                      className="shrink-0 accent-[var(--color-primary)]"
                    />
                    <span className={`text-sm ${draftMayContain.includes(a.id) ? "font-semibold" : ""}`}>
                      {allergenLabel(a.id)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium"
        >
          Save
        </button>
        <button
          onClick={handleCancel}
          className="rounded-full border border-border px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const INGREDIENT_PREVIEW_COLUMNS: { key: string; label: string; accessor: (data: Omit<Ingredient, "id">) => string }[] = [
  { key: "name", label: "Name", accessor: (d) => d.name },
  { key: "category", label: "Category", accessor: (d) => d.category ?? "" },
  { key: "manufacturer", label: "Manufacturer", accessor: (d) => d.manufacturer },
];

function ImportTab() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Import Data</h2>
        <p className="text-xs text-muted-foreground">
          Bulk-import records from a CSV file. Download the template, fill it in using a
          spreadsheet, then upload it here. Duplicates are detected by name + manufacturer
          — if both match an existing record, the row is skipped. Import only adds new
          records; it never updates or replaces existing data.
        </p>
      </section>

      {/* Ingredients */}
      <section className="rounded-lg border border-border bg-card p-4">
        <CSVImport
          config={ingredientImportConfig}
          getExistingKeys={getExistingIngredientKeys}
          previewColumns={INGREDIENT_PREVIEW_COLUMNS}
          description="Import ingredients with composition, allergens, nutrition, and pricing data."
        />
      </section>
    </div>
  );
}
