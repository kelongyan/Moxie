import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useFindBar } from "../state/findBar";
import { FindStatus } from "../state/findSession";

/**
 * 编辑器内查找浮层（findStyle = inline 时替代独立查找窗口）：
 * 与独立窗口共用同一套 find:request / find:status 事件协议。
 */
export function FindBar() {
  const { mode, hide } = useFindBar();
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [interpretEscapes, setInterpretEscapes] = useState(true);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef({ query, replaceText, caseSensitive, interpretEscapes, useRegex, wholeWord });
  stateRef.current = { query, replaceText, caseSensitive, interpretEscapes, useRegex, wholeWord };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendUpdate = useCallback(() => {
    const s = stateRef.current;
    void emit("find:request", {
      kind: "update",
      text: s.query,
      replaceText: s.replaceText,
      caseSensitive: s.caseSensitive,
      interpretEscapes: s.interpretEscapes,
      useRegex: s.useRegex,
      wholeWord: s.wholeWord,
    });
  }, []);

  const update = (patch: Partial<{
    query: string;
    replaceText: string;
    caseSensitive: boolean;
    interpretEscapes: boolean;
    useRegex: boolean;
    wholeWord: boolean;
  }>) => {
    if ("query" in patch) setQuery(patch.query!);
    if ("replaceText" in patch) setReplaceText(patch.replaceText!);
    if ("caseSensitive" in patch) setCaseSensitive(patch.caseSensitive!);
    if ("interpretEscapes" in patch) setInterpretEscapes(patch.interpretEscapes!);
    if ("useRegex" in patch) setUseRegex(patch.useRegex!);
    if ("wholeWord" in patch) setWholeWord(patch.wholeWord!);
    setTimeout(sendUpdate, 0);
  };

  useEffect(() => {
    sendUpdate();
    // 打开浮层即以当前状态发起一次查找
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlisten = listen<FindStatus>("find:status", (event) => {
      setStatus(event.payload.message);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const close = () => {
    void emit("find:request", { kind: "closed" });
    hide();
  };

  const send = (kind: string) => void emit("find:request", { kind });

  return (
    <div className="find-inline" role="search">
      <input
        ref={inputRef}
        className="find-inline-input"
        value={query}
        placeholder="查找…"
        onChange={(e) => update({ query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          else if (e.key === "Enter") send(e.shiftKey ? "prev" : "next");
        }}
      />
      <button className="find-inline-btn" title="上一个" onClick={() => send("prev")}>
        <ChevronUp size={14} />
      </button>
      <button className="find-inline-btn" title="下一个" onClick={() => send("next")}>
        <ChevronDown size={14} />
      </button>
      <span className="find-inline-status">{status}</span>
      <label className="check-label" title="区分大小写">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => update({ caseSensitive: e.target.checked })}
        />
        Aa
      </label>
      <label className="check-label" title="全词匹配">
        <input
          type="checkbox"
          checked={wholeWord}
          onChange={(e) => update({ wholeWord: e.target.checked })}
        />
        ab|
      </label>
      <label className="check-label" title="正则表达式">
        <input
          type="checkbox"
          checked={useRegex}
          onChange={(e) => update({ useRegex: e.target.checked })}
        />
        .*
      </label>
      {mode === "replace" && (
        <>
          <input
            className="find-inline-input"
            value={replaceText}
            placeholder="替换为…"
            onChange={(e) => update({ replaceText: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "Enter") send("replace-current");
            }}
          />
          <button className="find-inline-btn" onClick={() => send("replace-current")}>
            替换
          </button>
          <button className="find-inline-btn" onClick={() => send("replace-all")}>
            全部
          </button>
        </>
      )}
      <button className="find-inline-btn" title="关闭" onClick={close}>
        <X size={14} />
      </button>
    </div>
  );
}
