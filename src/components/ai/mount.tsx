// The only AI code in the main bundle: tiny mount points. Panels, settings and the preview
// load on demand (React.lazy), so first paint stays lean on phones.
import { lazy, Suspense } from "react";
import type { TickerResponse } from "../../../shared/types";
import { openAiSettings, openAsk, useAiSettings, useAiUi, usingOwnKey, type AiTask } from "../../lib/ai";
import { appPath, param, useLocation } from "../../lib/router";

const AiRoot = lazy(() => import("./AiRoot"));
const AiPreview = lazy(() => import("./AiPreview"));

/** Animated moon: the loader for anything the AI is writing. */
export function MoonLoader({ size = 14 }: { size?: number }) {
  return <span className="moonload" style={{ width: size, height: size }} aria-hidden />;
}

export function AiSpark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="ai-spark">
      <path d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4z" fill="currentColor" />
      <circle cx="13" cy="12.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

const ROUTE_TASK: Record<string, { task: AiTask; label: string }> = {
  "/compass": { task: "exposure", label: "Explain my exposure" },
  "/retrace": { task: "retrace", label: "What happened this month" },
};

/** Top-bar entry: opens AI settings (provider, your own key, model). */
export function AiTopButton() {
  const s = useAiSettings();
  return (
    <button className="top-ai" onClick={openAiSettings} aria-label="AI settings" title={usingOwnKey(s) ? "AI: using your own key" : "AI: free brain"}>
      <AiSpark /> <span>AI</span>{usingOwnKey(s) && <i className="top-ai-dot" aria-hidden />}
    </button>
  );
}

/** Floating "Ask" pill (route-aware) + the lazily-loaded panels. */
export function AiLayer() {
  useLocation();
  const ui = useAiUi();
  const path = appPath();
  const sheetOpen = !!param("t");
  const r = ROUTE_TASK[path] ?? { task: "week" as AiTask, label: path === "/learn" ? "Ask a question" : "Ask about this week" };
  return (
    <>
      {!sheetOpen && !ui.ask && (
        <button className="ask-fab" onClick={() => openAsk(r.task)} aria-label={r.label}>
          <AiSpark size={15} /> <span>{r.label}</span>
        </button>
      )}
      {(ui.ask || ui.settings) && (
        <Suspense fallback={<div className="drawer-scrim"><div className="ai-loading"><MoonLoader size={22} /></div></div>}>
          <AiRoot />
        </Suspense>
      )}
    </>
  );
}

/** "What to watch" card inside the ticker sheet. */
export function AiPreviewMount({ data }: { data: TickerResponse }) {
  return (
    <Suspense fallback={null}>
      <AiPreview data={data} />
    </Suspense>
  );
}

/** One-tap entry on the calendar toolbar. */
export function AskWeekButton() {
  return (
    <button className="btn btn-box ask-week" onClick={() => openAsk("week")} title="Ask AI about the reports and macro events ahead">
      <AiSpark /> Ask AI
    </button>
  );
}
