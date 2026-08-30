import { Check, Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LANGUAGE_LABELS } from "../models/language";
import { ENCODING_LABELS, StoredEncodingId } from "../models/encoding";
import { subscribeTextChange, viewFor } from "../editor/registry";
import { EditorDocument, useDocuments } from "../state/documents";
import {
  countWords,
  featureEnabled,
  FeatureKey,
  WordCountHandle,
} from "../state/performance";

interface StatusBarProps {
  activeDoc: EditorDocument | null;
}

function encodingLabel(id: string): string {
  return ENCODING_LABELS[id as StoredEncodingId] ?? id.toUpperCase();
}

function useWordCount(doc: EditorDocument | null): string {
  const [display, setDisplay] = useState("");
  const handleRef = useRef<WordCountHandle | null>(null);

  const enabled =
    !!doc && featureEnabled("wordCount", doc.perfTier, doc.featureOverrides);

  useEffect(() => {
    if (!doc) {
      setDisplay("");
      return;
    }
    if (!enabled) {
      setDisplay("字数统计已暂停");
      return;
    }

    let timer: number | null = null;
    const run = () => {
      handleRef.current?.cancel();
      const view = viewFor(doc.id);
      if (!view) return;
      const text = view.state.doc.toString();
      if (text.length <= 100_000) {
        const handle = countWords(text);
        handleRef.current = handle;
        void handle.promise.then((n) => {
          if (n !== null) setDisplay(`字数:${n}`);
        });
      } else {
        setDisplay("统计中…");
        const handle = countWords(text);
        handleRef.current = handle;
        void handle.promise.then((n) => {
          if (n !== null) setDisplay(`字数:${n}`);
        });
      }
    };

    run();
    const unsubscribe = subscribeTextChange(doc.id, () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(run, 400);
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
      handleRef.current?.cancel();
    };
  }, [doc?.id, enabled]);

  return display;
}

const OVERRIDE_ITEMS: { key: FeatureKey; label: string; markdownOnly?: boolean }[] = [
  { key: "wordWrap", label: "自动换行" },
  { key: "preview", label: "Markdown 预览", markdownOnly: true },
  { key: "highlight", label: "语法高亮" },
  { key: "fold", label: "代码折叠" },
  { key: "wordCount", label: "实时字数统计" },
];

function LargeFileMenu({ doc }: { doc: EditorDocument }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (key: FeatureKey) => {
    const current = featureEnabled(key, doc.perfTier, doc.featureOverrides);
    useDocuments.getState().patchDocument(doc.id, {
      featureOverrides: { ...doc.featureOverrides, [key]: !current },
    });
  };

  return (
    <div className="bigfile-menu" ref={ref}>
      <button
        className="bigfile-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="大文件模式选项"
      >
        <Gauge size={13} />
        大文件模式
      </button>
      {open && (
        <div className="bigfile-popover">
          {OVERRIDE_ITEMS.filter(
            (item) => !item.markdownOnly || doc.language === "markdown"
          ).map((item) => {
            const on = featureEnabled(item.key, doc.perfTier, doc.featureOverrides);
            return (
              <button key={item.key} onClick={() => toggle(item.key)}>
                <span className="check">{on && <Check size={13} strokeWidth={2.5} />}</span>
                {item.label}
              </button>
            );
          })}
          <div className="bigfile-note">这些设置仅对当前标签有效</div>
        </div>
      )}
    </div>
  );
}

export function StatusBar({ activeDoc }: StatusBarProps) {
  const statusMessage = useDocuments((s) => s.statusMessage);
  const wordCount = useWordCount(activeDoc);

  return (
    <footer className="status-bar">
      {activeDoc &&
        (activeDoc.ioState === "saving" ? (
          <span className="save-state saving">↻ 保存中…</span>
        ) : activeDoc.isDirty ? (
          <span className="save-state dirty">
            <span className="dot" />
            未保存
          </span>
        ) : (
          <span className="save-state saved">✓ 已保存</span>
        ))}
      {activeDoc && activeDoc.perfTier !== "standard" && (
        <LargeFileMenu doc={activeDoc} />
      )}
      <span
        className={
          "status-message" + (statusMessage?.kind === "error" ? " error" : "")
        }
      >
        {statusMessage?.text ?? ""}
      </span>
      <span className="spacer" />
      {activeDoc && (
        <>
          <span className="status-item">{encodingLabel(activeDoc.encoding)}</span>
          <span className="status-item">{LANGUAGE_LABELS[activeDoc.language]}</span>
          {wordCount && <span className="status-item">{wordCount}</span>}
          <span className="status-item">
            行 {activeDoc.cursorLine},列 {activeDoc.cursorColumn}
          </span>
        </>
      )}
    </footer>
  );
}
