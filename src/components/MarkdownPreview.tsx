import { useEffect, useRef, useState } from "react";
import { subscribeTextChange, viewFor } from "../editor/registry";
import { useDocuments } from "../state/documents";
import { useThemeStore } from "../state/theme";
import { collectPreviewTokens, renderMarkdown } from "../preview/markdown";

function useResolvedDark(): boolean {
  const mode = useThemeStore((s) => s.mode);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return mode === "dark" || (mode === "system" && systemDark);
}

const MIN_PCT = 25;
const MAX_PCT = 75;

export function MarkdownPreview({ docId }: { docId: string }) {
  const dark = useResolvedDark();
  const [html, setHtml] = useState("");
  const [basisPct, setBasisPct] = useState(42);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const scrollRatio = useRef(0);
  const doc = useDocuments((s) => s.documents.find((d) => d.id === docId));

  useEffect(() => {
    let timer: number | null = null;

    const captureScroll = () => {
      const win = iframeRef.current?.contentWindow;
      if (!win || !win.document?.documentElement) return;
      const max = win.document.documentElement.scrollHeight - win.innerHeight;
      scrollRatio.current = max > 0 ? win.scrollY / max : 0;
    };

    const render = () => {
      const view = viewFor(docId);
      if (!view) return;
      captureScroll();
      const text = view.state.doc.toString();
      setHtml(renderMarkdown(text, collectPreviewTokens(), doc?.name ?? ""));
    };

    render();
    const unsubscribe = subscribeTextChange(docId, () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(render, 180);
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [docId, dark, doc?.name]);

  const handleLoad = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !win.document?.documentElement) return;
    const max = win.document.documentElement.scrollHeight - win.innerHeight;
    if (max > 0) {
      win.scrollTo(0, scrollRatio.current * max);
    }
  };

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const host = e.currentTarget.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const pct = 100 - ((ev.clientX - rect.left) / rect.width) * 100;
      setBasisPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      <div
        className="preview-splitter"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startDrag}
      />
      <div className="preview-pane" style={{ flexBasis: `${basisPct}%` }}>
        <iframe
          ref={iframeRef}
          className="preview-iframe"
          sandbox=""
          srcDoc={html}
          onLoad={handleLoad}
          title="Markdown 预览"
        />
      </div>
    </>
  );
}
