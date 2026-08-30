import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const OPERATIONS: { id: string; label: string }[] = [
  { id: "smart-decode", label: "智能解码" },
  { id: "url-encode", label: "URL 组件编码" },
  { id: "url-decode", label: "URL 组件解码" },
  { id: "url-form-decode", label: "URL 表单解码" },
  { id: "base64-encode", label: "Base64 编码" },
  { id: "base64-decode", label: "Base64 解码" },
  { id: "base64url-encode", label: "Base64 URL 安全编码" },
  { id: "base64url-decode", label: "Base64 URL 安全解码" },
  { id: "html-encode", label: "HTML 实体编码" },
  { id: "html-decode", label: "HTML 实体解码" },
  { id: "unicode-escape", label: "Unicode 转义" },
  { id: "unicode-unescape", label: "Unicode 反转义" },
];

export function CodecWindow() {
  const [operation, setOperation] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("op") ?? "smart-decode";
  });
  const [input, setInput] = useState("");
  const [hasSelection, setHasSelection] = useState(false);
  const [result, setResult] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "error">("info");
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [receivedInput, setReceivedInput] = useState(false);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const unlistenInput = listen<{ text: string; hasSelection: boolean }>(
      "codec:input",
      (event) => {
        setInput(event.payload.text);
        setHasSelection(event.payload.hasSelection);
        setReceivedInput(true);
      }
    );
    const unlistenOp = listen<string>("codec:set-op", (event) => {
      setOperation(event.payload);
      void emit("codec:get-input");
    });
    void emit("codec:get-input");
    return () => {
      void unlistenInput.then((fn) => fn());
      void unlistenOp.then((fn) => fn());
    };
  }, []);

  const run = useCallback(
    async (op: string, confirmed: boolean) => {
      setMessage("");
      setPendingConfirm(false);
      try {
        const output = await invoke<string>("codec_op", {
          operation: op,
          text: inputRef.current,
          confirmed,
        });
        setResult(output);
      } catch (error) {
        const text = String(error);
        if (text.startsWith("confirm:")) {
          setMessage(text.slice(8));
          setMessageKind("info");
          setPendingConfirm(true);
        } else {
          setMessage(text);
          setMessageKind("error");
          setResult("");
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!receivedInput) return;
    void run(operation, false);
  }, [operation, input, receivedInput, run]);

  const replaceSelection = async () => {
    await emit("codec:replace", { text: result });
    setMessage(hasSelection ? "已替换选区" : "已替换全文");
    setMessageKind("info");
  };

  const copyResult = async () => {
    await navigator.clipboard.writeText(result);
    setMessage("已复制到剪贴板");
    setMessageKind("info");
  };

  const close = () => {
    void getCurrentWindow().close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="codec-window">
      <div className="codec-ops">
        {OPERATIONS.map((op) => (
          <button
            key={op.id}
            className={op.id === operation ? "active" : ""}
            onClick={() => setOperation(op.id)}
          >
            {op.label}
          </button>
        ))}
      </div>
      <div className="codec-main">
        <div className="codec-pane">
          <div className="codec-pane-title">输入(选区或全文)</div>
          <textarea
            className="codec-text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="codec-pane">
          <div className="codec-pane-title">结果</div>
          <textarea
            className="codec-text"
            value={result}
            readOnly
            spellCheck={false}
          />
        </div>
      </div>
      <div className="codec-actions">
        <span
          className={
            "codec-message" +
            (messageKind === "error" ? " error" : "") +
            (message ? "" : " dim")
          }
        >
          {message || " "}
        </span>
        <span className="spacer" />
        {pendingConfirm && (
          <button className="find-button" onClick={() => run(operation, true)}>
            仍然继续
          </button>
        )}
        <button
          className="find-button"
          disabled={!result}
          onClick={() => void replaceSelection()}
        >
          {hasSelection ? "替换选区" : "替换全文"}
        </button>
        <button
          className="find-button"
          disabled={!result}
          onClick={() => void copyResult()}
        >
          复制结果
        </button>
        <button className="find-button" onClick={close}>
          关闭
        </button>
      </div>
    </div>
  );
}
