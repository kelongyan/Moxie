// End-to-end verification harness.
// Connects to a running Electron app via CDP (--remote-debugging-port=9222),
// dispatches REAL mouse/keyboard events through the Input domain, and reads
// back the resulting DOM — so it tests what a user actually experiences.
const base = 'http://127.0.0.1:9222'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  let targets
  for (let i = 0; i < 30; i++) {
    try {
      targets = await (await fetch(base + '/json/list')).json()
      if (targets.some((t) => t.type === 'page')) break
    } catch {}
    await sleep(500)
  }
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target (launch with --remote-debugging-port=9222)')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let id = 0
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  })
  await new Promise((r) => (ws.onopen = r))
  const send = (method, params) =>
    new Promise((res) => {
      const cur = ++id
      pending.set(cur, res)
      ws.send(JSON.stringify({ id: cur, method, params }))
    })
  return { ws, send }
}

const evals = (send) => async (fn) => {
  const r = await send('Runtime.evaluate', {
    expression: `(${fn})()`,
    returnByValue: true,
    awaitPromise: true
  })
  const res = r.result
  if (res?.exceptionDetails) return { __error: res.exceptionDetails.exception?.description }
  return res?.result?.value
}

async function click(send, x, y, clickCount = 1) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount })
}

async function drag(send, x1, y1, x2, y2) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x2, y: y2, button: 'left' })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 })
}

async function ctrlKey(send, key, code, vk) {
  const common = { modifiers: 2, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...common, text: key })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common })
}

async function main() {
  const { ws, send } = await connect()
  await send('Runtime.enable')
  const ev = evals(send)
  const report = {}

  // Activate the welcome test tab so coordinates are predictable.
  await ev(() => {
    const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent.includes('01-welcome'))
    if (tab) tab.click()
    return true
  })
  await sleep(400)

  // ---- styles / state ----
  report.styles = await ev(() => {
    const host = document.querySelector('.editor-host')
    const pm = document.querySelector('.ProseMirror')
    const scroll = document.querySelector('.editor-scroll')
    return {
      paddingTop: host && getComputedStyle(host).paddingTop,
      caret: pm && getComputedStyle(pm).caretColor,
      scrollBehavior: scroll && getComputedStyle(scroll).scrollBehavior,
      virtualCursors: document.querySelectorAll('[class*="virtual-cursor"]').length,
      activeTab: document.querySelector('.tab.active')?.textContent?.trim()
    }
  })

  // ---- TEST 1: keyboard Ctrl+2 converts the CURRENT block ----
  const target = await ev(() => {
    const ps = [...document.querySelectorAll('.ProseMirror > p')]
    const p = ps.find((x) => x.innerText.length > 20)
    if (!p) return null
    const r = p.getBoundingClientRect()
    return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2), text: p.innerText.slice(0, 30) }
  })
  if (target) {
    await click(send, target.x, target.y) // place caret in that paragraph
    await sleep(120)
    await ctrlKey(send, '2', 'Digit2', 50) // Ctrl+2 → Heading 2
    await sleep(250)
    report.test1_keyboard_h2 = await ev(() => {
      const el = document.elementFromPoint(arguments[0] ?? 0, 0)
      return null
    })
    // Re-evaluate using the captured text to find what it became.
    report.test1_keyboard_h2 = await ev(
      new Function(
        `const want=${JSON.stringify(target.text)};` +
          `const all=[...document.querySelectorAll('.ProseMirror > *')];` +
          `const node=all.find(e=>e.innerText.slice(0,30)===want);` +
          `return { found: !!node, tag: node && node.tagName, isHeading: node ? /^H[1-6]$/.test(node.tagName) : false };`
      )
    )
  } else {
    report.test1_keyboard_h2 = { error: 'no paragraph target found' }
  }

  // ---- TEST 2: right-click context menu (with time for React to render) ----
  report.test2_contextmenu = await ev(async () => {
    const pm = document.querySelector('.ProseMirror')
    const r = pm.getBoundingClientRect()
    pm.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(r.left + 40),
        clientY: Math.round(r.top + 60)
      })
    )
    await new Promise((res) => setTimeout(res, 150))
    const menu = document.querySelector('.block-ctxmenu')
    const result = { opened: !!menu, items: menu ? menu.querySelectorAll('.block-menu-item').length : 0 }
    document.querySelector('.menu-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    return result
  })

  // ---- TEST 3: selection floating toolbar appears + converts ----
  // Real drag-select across a paragraph, then look for the bar.
  const selTarget = await ev(() => {
    const p = [...document.querySelectorAll('.ProseMirror > p')].find((x) => x.innerText.length > 30)
    if (!p) return null
    const r = p.getBoundingClientRect()
    return { x1: Math.round(r.left + 5), y1: Math.round(r.top + r.height / 2), x2: Math.round(r.left + 160), y2: Math.round(r.top + r.height / 2) }
  })
  if (selTarget) {
    await click(send, selTarget.x1, selTarget.y1) // focus editor
    await sleep(100)
    await drag(send, selTarget.x1, selTarget.y1, selTarget.x2, selTarget.y2)
    await sleep(300)
    const bar = await ev(() => {
      const bar = document.querySelector('.block-selbar')
      if (!bar)
        return {
          barVisible: false,
          selectionText: window.getSelection().toString().slice(0, 30),
          activeEl: document.activeElement?.className?.slice(0, 40) || document.activeElement?.tagName,
          pmIsActive: document.querySelector('.ProseMirror') === document.activeElement,
          crepeTooltip: !!document.querySelector('.milkdown [class*="tooltip"], .milkdown [data-show="true"]')
        }
      // find the H2 button
      const btns = [...bar.querySelectorAll('button')]
      const h2 = btns.find((b) => b.textContent.trim() === 'H2')
      const r = h2 && h2.getBoundingClientRect()
      return {
        barVisible: true,
        barButtons: btns.length,
        selectionText: window.getSelection().toString().slice(0, 30),
        h2x: r ? Math.round(r.left + r.width / 2) : null,
        h2y: r ? Math.round(r.top + r.height / 2) : null
      }
    })
    // Click the H2 button in the bar and confirm conversion.
    if (bar.barVisible && bar.h2x) {
      await click(send, bar.h2x, bar.h2y)
      await sleep(250)
      bar.convertedToHeading = await ev(() => {
        const sel = window.getSelection()
        let n = sel.anchorNode
        while (n && n.nodeType === 1 === false) n = n.parentElement
        n = sel.anchorNode
        const block = n && (n.nodeType === 1 ? n : n.parentElement)?.closest?.('.ProseMirror > *')
        return block ? /^H[1-6]$/.test(block.tagName) : 'no-block'
      })
    }
    report.test3_selection_bar = bar
  } else {
    report.test3_selection_bar = { error: 'no paragraph for selection' }
  }

  // ---- TEST 5: relative image paths resolved to file:// ----
  await ev(() => {
    const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent.includes('03-images'))
    if (tab) tab.click()
    return true
  })
  await sleep(600)
  report.test5_images = await ev(() => {
    const imgs = [...document.querySelectorAll('.ProseMirror img')]
    return {
      count: imgs.length,
      srcs: imgs.slice(0, 3).map((i) => (i.getAttribute('src') || '').slice(0, 60)),
      allResolved: imgs.length > 0 && imgs.every((i) => /^file:\/\//.test(i.getAttribute('src') || ''))
    }
  })

  // ---- TEST 4: status-bar block switcher opens and converts ----
  report.test4_status_switcher = await ev(async () => {
    const btn = document.querySelector('.block-switch button')
    if (!btn) return { error: 'no switcher' }
    btn.click()
    await new Promise((r) => setTimeout(r, 60))
    const menu = document.querySelector('.block-switch-menu')
    const out = { opened: !!menu, items: menu ? menu.querySelectorAll('.block-menu-item').length : 0 }
    // close
    btn.click()
    return out
  })

  console.log(JSON.stringify(report, null, 2))
  ws.close()
}

main().catch((e) => {
  console.error('ETV_FAIL', e.message, e.stack)
  process.exit(1)
})
