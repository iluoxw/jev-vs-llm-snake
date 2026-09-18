import { useEffect, useRef, useState } from "react";
import { PRESETS } from "../llm/prompt.ts";

interface Props {
  strategy: string;
  onChange: (strategy: string) => void;
}

/** One line of strategy text; click it to edit. */
export function StrategyBar({ strategy, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing || !input.current) return;
    input.current.focus();
    input.current.setSelectionRange(input.current.value.length, input.current.value.length);
  }, [editing]);

  return (
    <section className={`strategy ${editing ? "editing" : ""}`}>
      <div className="strategy-main">
        <span className="eyebrow">当前策略</span>
        {editing ? (
          <textarea
            ref={input}
            name="strategy"
            value={strategy}
            spellCheck={false}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) setEditing(false);
            }}
          />
        ) : (
          <button className="strategy-text" title="点击编辑" onClick={() => setEditing(true)}>
            {strategy.trim() || "还没有策略，点这里写一条。"}
            <span className="strategy-edit">编辑</span>
          </button>
        )}
      </div>
      <div className="chips">
        {Object.entries(PRESETS).map(([name, text]) => (
          <button
            key={name}
            className={`chip ${strategy === text ? "active" : ""}`}
            // Keep the textarea from blurring (and collapsing) before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(text)}
          >
            {name}
          </button>
        ))}
      </div>
    </section>
  );
}
