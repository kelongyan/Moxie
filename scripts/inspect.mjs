// Connects to a running Electron app via CDP and reports renderer state.
const base = 'http://127.0.0.1:9222'

async function main() {
  let targets
  for (let i = 0; i < 20; i++) {
    try {
      targets = await (await fetch(base + '/json/list')).json()
      if (targets.some((t) => t.type === 'page')) break
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const send = (() => {
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m)
        pending.delete(m.id)
      }
    })
    return (method, params) =>
      new Promise((res) => {
        const cur = ++id
        pending.set(cur, res)
        ws.send(JSON.stringify({ id: cur, method, params }))
      })
  })()
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  const expr = `JSON.stringify({
    root: document.getElementById('root')?.childElementCount,
    milkdown: !!document.querySelector('.milkdown'),
    prosemirror: document.querySelector('.ProseMirror')?.innerText?.slice(0,80),
    tabs: document.querySelectorAll('.tab').length,
    tabTitle: document.querySelector('.tab .tab-title')?.textContent,
    statusbar: !!document.querySelector('.statusbar'),
    apiBridge: typeof window.api,
    bodyClass: document.body.className
  })`
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log('RESULT', r.result?.value || JSON.stringify(r))
  ws.close()
}
main().catch((e) => {
  console.error('INSPECT_FAIL', e.message)
  process.exit(1)
})
