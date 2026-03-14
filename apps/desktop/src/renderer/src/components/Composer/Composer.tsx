import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { KeyboardHint } from "../shared/KeyboardHint";
import "./Composer.css";

interface ComposerProps {
  onSend: (content: string) => Promise<void>;
  disabled: boolean;
  placeholder?: string;
  adapterLabel?: string | null;
  sessionTitle?: string | null;
  modelSuggestions?: string[];
  onSwitchModel?: (model: string) => void;
}

export function Composer({ onSend, disabled, placeholder, adapterLabel, sessionTitle, modelSuggestions, onSwitchModel }: ComposerProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled && ref.current) {
      ref.current.focus();
    }
  }, [disabled]);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    if (ref.current) {
      ref.current.style.height = "auto";
    }
    await onSend(trimmed);
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, []);

  return (
    <div className="composer">
      {adapterLabel && !disabled && (
        <div className="composer-agent-info">
          <span className="composer-agent-label">{adapterLabel}</span>
          {(() => {
            const parts = sessionTitle?.split(" \u00b7 ") ?? [];
            const model = parts.length > 1 ? parts[1] : null;
            const displayModel = model || "default";
            const hasOptions = modelSuggestions && modelSuggestions.length > 0 && onSwitchModel;
            return hasOptions ? (
              <div className="composer-model-picker">
                <span className="composer-model-label composer-model-clickable">
                  {displayModel} <span className="composer-model-arrow">{"\u25BE"}</span>
                </span>
                <div className="composer-model-menu">
                  {modelSuggestions.map((m) => (
                    <button
                      key={m}
                      className={`composer-model-option${m === model ? " composer-model-option-active" : ""}`}
                      onClick={() => onSwitchModel(m)}
                      title={`New thread with ${m}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <span className="composer-model-label">{displayModel}</span>
            );
          })()}
        </div>
      )}
      <div className="composer-inner">
        <textarea
          ref={ref}
          data-testid="turn-input"
          className="composer-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Send a message..."}
          disabled={disabled}
          rows={1}
        />
        <button
          data-testid="send-turn-btn"
          className="composer-send"
          onClick={() => void handleSend()}
          disabled={disabled || !value.trim()}
          title="Send (Enter)"
        >
          <KeyboardHint keys="Enter" />
        </button>
      </div>
    </div>
  );
}
