# Testing a plugin

## While you write it

Load its folder (**Settings › Extensions › Plugins**, **More** ›
**Load a plugin folder…**): Moxie reads it again each time a file
changes, and the plugin's page in Settings shows what it logged with
`ctx.log` and any error it threw. A plugin that throws more than ten errors
a minute is turned off.

Before installing anything, Moxie reads the plugin's code and names what
would fail or do nothing: a call whose permission the manifest leaves out,
a command or view declared but never registered, a menu condition Moxie
never sets, code in `host.js` that reaches for the page (it runs in a
hidden frame). Plugins Moxie AI writes in Create mode are checked the
same way before they reach you.

## Unit tests

Keep what decides things in plain functions with no `textus` in them - a
parser, a date rule, what a list shows - and test those with any test
runner. The official plugins do this with Vitest: a module such as
`timer.js` sets `globalThis.pomodoro`, and a test imports the file and
calls it.

## The host, without Moxie

textus-plugins' `tests/plugin-host.ts` runs a plugin's host code against a
stand-in `textus`: `loadPlugin(id, api)` gives it an in-memory folder
(`folder({ "notes/a.md": "# A" })`), settings, storage, and the same
`dates`, `templates` and folder conventions Moxie has, so a test can call
its commands and tools and read the files it wrote. Copy it for your own
plugin, or run your tests in that repository.

## In the app

Moxie's own end-to-end tests install a plugin into the app in a browser
(the app's `e2e/plugin-helpers.ts`, `e2e/plugin-text-api.spec.ts`) and
drive it like a user. Drag with real mouse moves there, and call
`swallowHtmlDrop(page)` first: the app's window takes HTML drag and drop
for files, and the helper makes the browser do the same, so a drag that
passes the test works in the app.

## On iPhone and iPad

A plugin offered on iOS (`"platforms": ["desktop", "ios"]`) should be
tried at phone width - about 390 px, touch targets of 44 px - or in the
simulator before it is published.
