"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listDrafts,
  syncAll,
  discardDraft,
  getLastSyncAt,
  purgeStaleDrafts,
  getStorageEstimate,
  type DraftKind,
} from "../../../lib/apiary/offlineQueue";
import { recordColonyEventSyncAction, recordInspectionSyncAction } from "../../actions/apiary";
import type { RecordInspectionInput } from "../../../lib/apiary/inspections";
import type { RecordColonyEventInput } from "../../../lib/apiary/colonyEvents";

// Other components (InspectionForm, ColonyEventQuickEntry) dispatch this
// after queueDraft() so this indicator refreshes and attempts a sync
// without prop-drilling or a context provider — a small window event is
// the whole mechanism, matching how little state actually needs to move.
export const APIARY_DRAFTS_CHANGED_EVENT = "nn-apiary-drafts-changed";

async function syncer(kind: DraftKind, payload: unknown) {
  if (kind === "inspection") return recordInspectionSyncAction(payload as RecordInspectionInput);
  return recordColonyEventSyncAction(payload as RecordColonyEventInput);
}

/**
 * A0's own spec (25_OFFLINE_OPTIONS_ANALYSIS.md §4): "a persistent offline
 * indicator; a 'sync now' control" — mounted at the apiary section layout
 * level (app/apiaries/layout.tsx) so it's visible across every apiary
 * page, not just the one with a form open.
 *
 * Deliberately no service worker, no background-sync API (Option B):
 * syncing happens (a) once on mount/reconnect, best-effort, and (b) on an
 * explicit tap — never silently retried forever in the background.
 */
export function OfflineSyncIndicator() {
  const t = useTranslations("Apiary");
  const [pendingCount, setPendingCount] = useState(0);
  const [erroredCount, setErroredCount] = useState(0);
  // Lazy initializer, not an effect — navigator.onLine is readable
  // synchronously on the client at mount, so there's no external system to
  // "subscribe to" for the very first value, only for later changes
  // (handled by the online/offline listeners below). Checked via `window`,
  // not `navigator` — Node 21+ ships a partial global `navigator` (no
  // `.onLine`) for web-platform-API compatibility, so `typeof navigator
  // !== "undefined"` is true during SSR too and silently evaluates to
  // `isOnline = undefined` there, a real hydration-mismatch bug caught by
  // live verification (SSR renders the "offline" state, the browser
  // renders null). `window` has no such Node polyfill.
  const [isOnline, setIsOnline] = useState(() => (typeof window !== "undefined" ? navigator.onLine : true));
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  // A5.5 §2 (visible, honest state), §3 (storage quota), §4 (stale-draft
  // purge — a narrow, documented exception to OFFLINE_FIELD_CAPABILITY.md
  // §3's general "no expiry" rule; see the A5.5 ADR draft in README.md).
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const purgeResult = await purgeStaleDrafts();
    const drafts = await listDrafts();
    setPendingCount(drafts.filter((d) => d.status === "pending").length);
    setErroredCount(drafts.filter((d) => d.status === "error").length);
    setLastSyncAt(getLastSyncAt());
    if (purgeResult.purged > 0) setPurgeNotice(t("draftsPurgedNotice", { count: purgeResult.purged }));
    const estimate = await getStorageEstimate();
    setStorageWarning(estimate.usageRatio != null && estimate.usageRatio > 0.8);
  }, [t]);

  const runSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncAll(syncer);
      await refresh();
      if (result.synced > 0 || result.errored > 0) {
        setLastMessage(t("syncResult", { synced: result.synced, errored: result.errored }));
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refresh, t]);

  useEffect(() => {
    // IndexedDB has no subscription/event API to "listen" to instead —
    // an imperative read-then-setState on mount is the correct shape
    // here, not the fetch-on-mount anti-pattern this rule otherwise
    // guards against (there is no external system to subscribe to for
    // the initial value; the online/offline/drafts-changed listeners
    // below are that subscription for every value after this one).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const handleOnline = () => {
      setIsOnline(true);
      void runSync();
    };
    const handleOffline = () => setIsOnline(false);
    const handleDraftsChanged = () => {
      void refresh();
      if (navigator.onLine) void runSync();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(APIARY_DRAFTS_CHANGED_EVENT, handleDraftsChanged);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(APIARY_DRAFTS_CHANGED_EVENT, handleDraftsChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runSync/refresh are stable via useCallback's own deps
  }, []);

  const hasContent = pendingCount > 0 || erroredCount > 0 || !isOnline || storageWarning || purgeNotice;
  if (!hasContent) return null;

  return (
    <div className="nn-section" style={{ padding: "0.5rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
      <span className="nn-badge" style={{ background: isOnline ? undefined : "var(--nn-color-warning, #b45309)" }}>
        {isOnline ? t("statusOnline") : t("statusOffline")}
      </span>
      {pendingCount > 0 ? <span className="nn-muted">{t("pendingCount", { count: pendingCount })}</span> : null}
      {erroredCount > 0 ? <span className="nn-muted">{t("erroredCount", { count: erroredCount })}</span> : null}
      <span className="nn-muted">{lastSyncAt ? t("lastSyncLabel", { time: new Date(lastSyncAt).toLocaleString() }) : t("neverSyncedLabel")}</span>
      {pendingCount > 0 || erroredCount > 0 ? (
        <button type="button" className="nn-button" onClick={() => void runSync()} disabled={isSyncing || !isOnline}>
          {isSyncing ? t("syncingButton") : t("syncNowButton")}
        </button>
      ) : null}
      {erroredCount > 0 ? (
        <button
          type="button"
          className="nn-button-quiet"
          onClick={async () => {
            const drafts = await listDrafts();
            for (const d of drafts.filter((d) => d.status === "error")) await discardDraft(d.id);
            await refresh();
          }}
        >
          {t("discardErroredButton")}
        </button>
      ) : null}
      {lastMessage ? <span className="nn-muted">{lastMessage}</span> : null}
      {storageWarning ? (
        <span className="nn-badge" style={{ background: "var(--nn-color-warning, #b45309)" }}>
          {t("storageWarning")}
        </span>
      ) : null}
      {purgeNotice ? <span className="nn-muted">{purgeNotice}</span> : null}
    </div>
  );
}
