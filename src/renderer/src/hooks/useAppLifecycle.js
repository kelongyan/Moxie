// App lifecycle: debounced session persistence + close-time flush, plus the
// startup update check, global toast listener, and first-run marker.
// Extracted verbatim in behavior from App.jsx (phase-2, US-4).
//
// `flushSession` is returned because the window-close guard (still in App)
// calls it synchronously before quitting, so a keystroke inside the per-tab
// debounce window isn't lost. `update`/`toast`/`dismissUpdate`/`setToast` feed
// the UpdateToast and transient-toast JSX.
//
// Settings/theme apply-effects stay in App (co-located with the theme action
// callbacks passed to StatusBar); this hook is pure lifecycle.
//
// Options:
//   session/settings/tabs/activePath/workspace/appearanceMode/themePalette/customTheme/lang/recents/sidebarOpen/
//   sidebarMode    — read by the persistence effect to build the snapshot
//   openPaths      — startup restore + OS file launch path opening
//   tabsRef        — live tabs mirror (flush reads it)
//   setHome/setActiveId/setWorkspace/setSidebarMode/setSidebarOpen — startup view
import { useCallback, useEffect, useRef, useState } from 'react'
import { baseName, genId, isHeavyDoc, LS, isNewerVersion } from '../paths.js'
import { HM_TOAST_EVENT } from '../ui.js'

const ONBOARDED_KEY = 'moxie.onboarded.v1'
const UPDATE_DISMISS_KEY = 'moxie.update.dismissed'

export function useAppLifecycle({
  session,
  settings,
  tabs,
  activePath,
  workspace,
  appearanceMode,
  themePalette,
  customTheme,
  lang,
  recents,
  sidebarOpen,
  sidebarMode,
  openPaths,
  tabsRef,
  setHome,
  setActiveId,
  setTabs,
  setWorkspace,
  setSidebarMode,
  setSidebarOpen
}) {
  const [update, setUpdate] = useState(null)
  // Transient bottom-center toast (e.g. "Copied"), fired via a `hm:toast` event.
  const [toast, setToast] = useState(null)
  // Latest session snapshot, kept in a ref so the close/flush path can persist it
  // synchronously without waiting on the debounced write.
  const sessionRef = useRef(null)
  // Write the latest snapshot now (close / pagehide / debounce all funnel here,
  // so the persisted shape lives in exactly one place).
  const flushSession = useCallback(() => {
    if (!sessionRef.current) return
    try {
      // Patch unsaved-scratch content from the live mirror so a close-time write
      // captures edits still inside a tab's debounce window. (commitAllLive, run
      // before this on the close path, already synced tabsRef.current.)
      const untitled = settings.restoreTabsOnStartup
        ? tabsRef.current
            .filter((t) => t.kind !== 'settings' && !t.path && t.content !== t.savedContent && (t.content || '').trim())
            .map((t) => ({ title: t.title, content: t.content }))
        : []
      localStorage.setItem(LS, JSON.stringify({ ...sessionRef.current, untitled }))
    } catch {
      /* quota / serialization failure — skip this snapshot */
    }
  }, [tabsRef, settings.restoreTabsOnStartup])

  // Startup coordinator. Direct launches land on Home by default. With Startup
  // Restore enabled, saved document tabs come back; any file passed by the OS is
  // opened last so it wins the active tab.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const initial = window.api.initialOpenRequest
        ? await window.api.initialOpenRequest()
        : { files: [], folder: null }
      if (cancelled) return

      const startupFiles = Array.isArray(initial?.files) ? initial.files.filter(Boolean) : []
      const startupFolder = initial?.folder || null

      if (startupFolder) {
        setWorkspace({ rootPath: startupFolder, rootName: baseName(startupFolder) })
        setSidebarMode('files')
        setSidebarOpen(true)
      }

      if (settings.restoreTabsOnStartup) {
        const restorePaths = (session.openPaths || []).filter(Boolean)
        if (restorePaths.length) await openPaths(restorePaths, true)
        if (cancelled) return

        const untitled = (session.untitled || []).filter((u) => u && (u.content || '').trim())
        if (untitled.length) {
          const created = untitled.map((u) => ({
            id: genId(),
            kind: 'doc',
            path: null,
            title: u.title || 'Untitled',
            content: u.content,
            savedContent: '',
            mtimeMs: null,
            reloadNonce: 0,
            heavy: isHeavyDoc(u.content)
          }))
          tabsRef.current = [...tabsRef.current, ...created]
          setTabs((prev) => [...prev, ...created])
          if (!restorePaths.length && !startupFiles.length) setActiveId(created[0].id)
          setHome(false)
        }

        if (session.activePath && !startupFiles.length) {
          const norm = session.activePath.replace(/\\/g, '/')
          const restored = tabsRef.current.find((t) => (t.path || '').replace(/\\/g, '/') === norm)
          if (restored) {
            setActiveId(restored.id)
            setHome(false)
          }
        }
      } else {
        setHome(true)
      }

      if (startupFiles.length) {
        await openPaths(startupFiles, true)
      } else if (!settings.restoreTabsOnStartup || !tabsRef.current.length) {
        setHome(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --------------------------- persistence -------------------------
  useEffect(() => {
    const data = {
      workspace,
      appearanceMode,
      themePalette,
      customTheme,
      lang,
      recents,
      sidebarOpen,
      sidebarMode,
      openPaths: settings.restoreTabsOnStartup ? tabs.map((t) => t.path).filter(Boolean) : [],
      // Persist unsaved scratch/new tabs (no path, with edited content) so they
      // survive a restart — closing the app no longer silently loses them. Only
      // dirty tabs are stored, so the untouched welcome doc / empty new tabs
      // don't keep coming back. Saved files are reopened from disk instead.
      untitled: settings.restoreTabsOnStartup
        ? tabs
            .filter((t) => t.kind !== 'settings' && !t.path && t.content !== t.savedContent && (t.content || '').trim())
            .map((t) => ({ title: t.title, content: t.content }))
        : [],
      activePath: settings.restoreTabsOnStartup ? activePath : null
    }
    sessionRef.current = data
    // Debounce the write: this effect runs on every keystroke (tabs/content
    // change), and JSON.stringify-ing the whole session — including the full
    // text of large unsaved scratch docs — plus a synchronous localStorage write
    // on every keypress is enough to make typing in big documents stutter. Wait
    // for a brief pause, then write once. The close path flushes the last edit.
    const id = setTimeout(flushSession, 400)
    return () => clearTimeout(id)
  }, [
    workspace,
    appearanceMode,
    themePalette,
    customTheme,
    lang,
    recents,
    sidebarOpen,
    sidebarMode,
    tabs,
    activePath,
    settings.restoreTabsOnStartup,
    flushSession
  ])

  // Flush the pending session snapshot immediately when the window is closing,
  // so the debounce above never drops the user's last few keystrokes.
  useEffect(() => {
    window.addEventListener('pagehide', flushSession)
    window.addEventListener('beforeunload', flushSession)
    return () => {
      window.removeEventListener('pagehide', flushSession)
      window.removeEventListener('beforeunload', flushSession)
    }
  }, [flushSession])

  // ------------------------- update check (notify-only) ------------
  useEffect(() => {
    let alive = true
    window.api.checkUpdate?.().then((r) => {
      if (!alive || !r?.ok || !r.latest) return
      const dismissed = localStorage.getItem(UPDATE_DISMISS_KEY)
      if (isNewerVersion(r.latest, r.current) && r.latest !== dismissed) {
        setUpdate({ latest: r.latest, current: r.current, url: r.url, notes: r.notes, name: r.name })
      }
    }).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Lightweight transient toast (copy feedback, etc.). Any component can fire one
  // via `fireToast(msg)` from ui.js.
  useEffect(() => {
    let timer = null
    const onToast = (e) => {
      const d = e?.detail
      const msg = typeof d === 'string' ? d : d?.msg
      const sticky = typeof d === 'object' && !!d?.sticky
      const duration = typeof d === 'object' ? d?.duration : undefined
      if (!msg) return
      setToast({ msg, key: Date.now() + Math.random(), sticky })
      clearTimeout(timer)
      // duration wins; otherwise sticky stays until ✕, plain toasts hide quickly.
      const ms = duration || (sticky ? 0 : 1600)
      if (ms) timer = setTimeout(() => setToast(null), ms)
    }
    window.addEventListener(HM_TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(HM_TOAST_EVENT, onToast)
      clearTimeout(timer)
    }
  }, [])

  const dismissUpdate = useCallback(() => {
    setUpdate((u) => {
      if (u) localStorage.setItem(UPDATE_DISMISS_KEY, u.latest)
      return null
    })
  }, [])

  // ------------------------- startup marker ------------------
  useEffect(() => {
    if (localStorage.getItem(ONBOARDED_KEY)) return
    localStorage.setItem(ONBOARDED_KEY, '1')
    setHome(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { update, dismissUpdate, toast, setToast, flushSession }
}
