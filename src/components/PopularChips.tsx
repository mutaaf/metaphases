import { actions, useStore } from "../lib/store";
import { Icon } from "./bits";

export const POPULAR = ["AAPL", "NVDA", "MSFT", "AMZN", "META", "GOOGL", "TSLA", "NFLX"];

/** One-tap starter chips: star a popular company without searching. */
export function PopularChips({ label = "Popular:" }: { label?: string }) {
  const { watch } = useStore();
  return (
    <div className="chip-row" aria-label="Popular companies">
      <span className="eyebrow">{label}</span>
      {POPULAR.map((s) => {
        const on = watch.some((w) => w.s === s);
        return (
          <button key={s} className={`chip chip-star ${on ? "on" : ""}`} aria-pressed={on} onClick={() => actions.toggleWatch(s)}>
            <Icon name="star" size={11} /> {s}
          </button>
        );
      })}
    </div>
  );
}
