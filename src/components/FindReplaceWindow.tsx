import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { FindMode, resizeFindWindow } from "../state/findWindow";
import { FindStatus } from "../state/findSession";
import { Tooltip } from "./Tooltip";

interface FindState {
  mode: FindMode;
  query: string;
  replaceText: string;
  caseSensitive: boolean;
  interpretEscapes: boolean;
  status: string;
  hasDocument: boolean;
}

export function FindReplaceWindow() {
  const [state, setState] = useState<FindState>(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = (params.get("mode") === "replace" ? "replace" : "find") as FindMode;
    return {
      mode,
      query: "",
      replaceText: "",
      caseSensitive: false,
      interpretEscapes: true,
      status: "",
      hasDocument: true,
    };
  });
  const queryRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    queryRef.current?.focus();
  }, []);

  useEffect(() => {
    const unlistenMode = listen<FindMode>("find:set-mode", (event) => {
      setState((s) => ({ ...s, mode: event.payload }));
      void resizeFindWindow(event.payload);
    });
    const unlistenStatus = listen<FindStatus>("find:status", (event) => {
      setState((s) => ({
        ...s,
        status: event.payload.message,
        hasDocument: event.payload.hasDocument,
      }));
    });
    return () => {
      void unlistenMode.then((fn) => fn());
      void unlistenStatus.then((fn) => fn());
    };
  }, []);

  const sendUpdate = useCallback((next: Partial<FindState>) => {
    const merged = { ...stateRef.current, ...next };
    void emit("find:request", {
      kind: "update",
      text: merged.query,
      replaceText: merged.replaceText,
      caseSensitive: merged.caseSensitive,
      interpretEscapes: merged.interpretEscapes,
    });
  }, []);

  const update = (patch: Partial<FindState>) => {
    setState((s) => ({ ...s, ...patch }));
    sendUpdate(patch);
  };

  const switchMode = (mode: FindMode) => {
    if (mode === stateRef.current.mode) return;
    setState((s) => ({ ...s, mode }));
    void resizeFindWindow(mode);
    void emit("find:request", { kind: "update", ...snapshotRequest(mode) });
  };

  const snapshotRequest = (mode: FindMode) => ({
    text: stateRef.current.query,
    replaceText: stateRef.current.replaceText,
    caseSensitive: stateRef.current.caseSensitive,
    interpretEscapes: stateRef.current.interpretEscapes,
    mode,
  });

  const send = (kind: string) => {
    void emit("find:request", { kind });
  };

  const close = () => {
    void emit("find:request", { kind: "closed" });
    void getCurrentWindow().close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const disabled = !state.hasDocument;

  return (
    <div className="find-window">
      <div className="find-top">
        <div className="segmented" role="tablist">
          <button
            className={state.mode === "find" ? "active" : ""}
            onClick={() => switchMode("find")}
          >
            查找
          </button>
          <button
            className={state.mode === "replace" ? "active" : ""}
            onClick={() => switchMode("replace")}
          >
            替换
          </button>
        </div>
      </div>

      <div className="find-grid">
        <label htmlFor="find-query">查找</label>
        <input
          id="find-query"
          ref={queryRef}
          value={state.query}
          placeholder="输入要查找的内容"
          onChange={(e) => update({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send("next");
            }
          }}
        />
        {state.mode === "replace" && (
          <>
            <label htmlFor="find-replace">替换为</label>
            <input
              id="find-replace"
              value={state.replaceText}
              placeholder="输入替换内容"
              onChange={(e) => update({ replaceText: e.target.value })}
            />
          </>
        )}
      </div>

      <div className="find-options">
        <label className="check-label">
          <input
            type="checkbox"
            checked={state.interpretEscapes}
            onChange={(e) => update({ interpretEscapes: e.target.checked })}
          />
          解释转义字符
          <Tooltip label="\n 换行、\r 回车、\t 制表符、\s 空格、\\ 反斜杠">
            <span className="help-icon">
              <HelpCircle size={13} />
            </span>
          </Tooltip>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={state.caseSensitive}
            onChange={(e) => update({ caseSensitive: e.target.checked })}
          />
          区分大小写
        </label>
      </div>

      <div className="find-actions">
        <span className={"find-status" + (disabled ? " dim" : "")}>
          {state.status}
        </span>
        <span className="spacer" />
        <button className="find-button" onClick={close}>
          关闭
        </button>
        <button
          className="find-button"
          disabled={disabled || !state.query}
          onClick={() => send("prev")}
        >
          <ChevronUp size={13} />
          上一个
        </button>
        <button
          className="find-button"
          disabled={disabled || !state.query}
          onClick={() => send("next")}
        >
          <ChevronDown size={13} />
          下一个
        </button>
        {state.mode === "replace" && (
          <>
            <button
              className="find-button"
              disabled={disabled || !state.query}
              onClick={() => send("replace-current")}
            >
              替换
            </button>
            <button
              className="find-button prominent"
              disabled={disabled || !state.query}
              onClick={() => send("replace-all")}
            >
              全部替换
            </button>
          </>
        )}
      </div>
    </div>
  );
}
