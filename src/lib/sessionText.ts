import type { Session } from "../../shared/types";

export const PHASE_LABEL: Record<Session, string> = { bmo: "Before open", dmh: "During hours", amc: "After close", "": "Time TBD" };

/** 0050: a session Nasdaq's calendar filled in (`hs: "n"`) is expected, not the company's word. */
/** 0086: `hs: "h"` is a projected report shown at the company's usual time, not a time anyone has announced. */
export const sessionText = (h: Session, hs?: "n" | "h") => `${PHASE_LABEL[h]}${hs === "n" && h ? " (expected)" : hs === "h" && h ? " (usual time)" : ""}`;
