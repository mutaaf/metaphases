// Modal behaviour for drawers, the ticker sheet and the palette:
// focus moves in on open, Tab cycles inside, Escape closes, focus returns to the opener on close.
import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, opts: { initialFocus?: string } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
    // "self" focuses the dialog container (it needs tabIndex={-1}). Focus moves on the next frame: moving it
    // synchronously during the keystroke that opened the dialog lets that key's keypress "click" the newly
    // focused button (e.g. Enter in search → the sheet's close button).
    const first = opts.initialFocus === "self" ? el : (opts.initialFocus && el.querySelector<HTMLElement>(opts.initialFocus)) || items()[0] || el;
    const raf = requestAnimationFrame(() => { if (!el.contains(document.activeElement)) first.focus({ preventScroll: true }); });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const a = list[0], z = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === a || !el.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      // Return focus to whatever opened the dialog, if it's still on the page.
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
