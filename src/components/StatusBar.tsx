import { Check, Gauge, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ENCODING_LABELS, StoredEncodingId } from "../models/encoding";
import { EditorDocument, useDocuments } from "../state/documents";
import { featureEnabled, FeatureKey } from "../state/performance";
import { usePreferences } from "../state/preferences";
import { openSettingsWindow } from "../state/settingsWindow";
import { openCodecWindow } from "../state/codecWindow";
import { gotoLineAction } from "../state/actions";

interface StatusBarProps {
  activeDoc: EditorDocument | null;
}

function encodingLabel(id: string): string {
  return ENCODING_LABELS[id as StoredEncodingId] ?? id.toUpperCase();
}

const OVERRIDE_ITEMS: { key: FeatureKey; label: string }[] = [
  { key: "wordWrap", label: "自动换行" },
  { key: "preview", label: "即时渲染" },
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
        <Gauge size={12} />
        大文件模式
      </button>
      {open && (
        <div className="bigfile-popover">
          {OVERRIDE_ITEMS.map((item) => {
            const on = featureEnabled(item.key, doc.perfTier, doc.featureOverrides);
            return (
              <button key={item.key} onClick={() => toggle(item.key)}>
                <span className="check">{on && <Check size={12} />}</span>
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
  const sidebarPinned = usePreferences((s) => s.sidebarPinned);
  const sidebarWidth = usePreferences((s) => s.sidebarWidth ?? 240);

  return (
    <footer className="status-bar">
      {/* 1. 左侧区域：与侧边栏对齐，容纳偏好设置入口（保存态/字数已上移顶栏） */}
      <div
        className={"status-sidebar-slot" + (sidebarPinned ? " is-pinned" : " is-collapsed")}
        style={sidebarPinned ? { width: `${sidebarWidth}px` } : undefined}
      >
        <button
          className="status-slot-btn"
          onClick={() => void openSettingsWindow()}
          title="打开偏好设置"
        >
          <Settings size={12} />
          {sidebarPinned && <span className="btn-text">设置</span>}
        </button>
      </div>

      {/* 2. 右侧区域：与主编辑区对齐，容纳消息与编辑器工具状态 */}
      <div className="status-editor-slot">
        <div className="status-left">
          {activeDoc && activeDoc.perfTier !== "standard" && (
            <LargeFileMenu doc={activeDoc} />
          )}

          {statusMessage && (
            <span
              className={
                "status-message" + (statusMessage.kind === "error" ? " error" : "")
              }
            >
              {statusMessage.text}
            </span>
          )}
        </div>

        <div className="spacer" />

        {activeDoc && (
          <div className="status-right">
            <button
              className="status-item status-action-item"
              onClick={() => void gotoLineAction()}
              title="跳转到行 (Ctrl+L)"
            >
              行 {activeDoc.cursorLine} · 列 {activeDoc.cursorColumn}
            </button>
            <span className="status-divider">·</span>
            <button
              className="status-item status-action-item"
              onClick={() => void openCodecWindow()}
              title="编码转换与查看"
            >
              {encodingLabel(activeDoc.encoding)}
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}
