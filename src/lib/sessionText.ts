import type { Session } from "../../shared/types";

export const PHASE_LABEL: Record<Session, string> = { bmo: "Before open", dmh: "During hours", amc: "After close", "": "Time TBD" };

/** 0050: a session Nasdaq's calendar filled in (`hs: "n"`) is expected, not the company's word. */
export const sessionText = (h: Session, hs?: "n") => `${PHASE_LABEL[h]}${hs === "n" && h ? " (expected)" : ""}`;
