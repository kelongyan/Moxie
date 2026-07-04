import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const checks = []
const legacyBrand = 'horse' + 'md'
const legacyProduct = 'Horse' + 'MD'
const legacySessionBrand = 'mini' + 'md'
const legacy = {
  settingsKey: `${legacyBrand}.settings.v1`,
  sessionKey: `${legacySessionBrand}.session.v1`,
  onboardedKey: `${legacyBrand}.onboarded.v1`,
  updateDismissKey: `${legacyBrand}.update.dismissed`,
  appId: `com.${legacyBrand}.app`,
  hook: `window.__${legacyBrand}`,
  logPrefix: `[${legacyBrand}]`,
  packageDecl: `package com.${legacyBrand}.app;`,
  keystore: `${legacyBrand}.keystore`,
  product: legacyProduct
}

const read = (path) => readFile(path, 'utf8')
const add = (name, pass, detail = '') => checks.push({ name, pass, detail })

async function expectFile(path, { includes = [], excludes = [] }) {
  const text = await read(path)
  for (const value of includes) {
    add(`${path} includes ${value}`, text.includes(value), `missing ${value}`)
  }
  for (const value of excludes) {
    add(`${path} excludes ${value}`, !text.includes(value), `found ${value}`)
  }
  return text
}

const packageJson = JSON.parse(await read('package.json'))
add(
  'package.json build.appId is com.moxie.app',
  packageJson.build?.appId === 'com.moxie.app',
  `actual ${packageJson.build?.appId}`
)
add(
  'package.json author is kelongyan',
  packageJson.author === 'kelongyan',
  `actual ${packageJson.author}`
)

const capacitorConfig = JSON.parse(await read('capacitor.config.json'))
add(
  'capacitor.config.json appId is com.moxie.app',
  capacitorConfig.appId === 'com.moxie.app',
  `actual ${capacitorConfig.appId}`
)

await expectFile('src/renderer/src/settings.js', {
  includes: ['moxie.settings.v1'],
  excludes: [legacy.settingsKey]
})

await expectFile('src/renderer/src/paths.js', {
  includes: ['moxie.session.v1'],
  excludes: [legacy.sessionKey]
})

await expectFile('src/renderer/src/hooks/useAppLifecycle.js', {
  includes: ['moxie.onboarded.v1', 'moxie.update.dismissed'],
  excludes: [legacy.onboardedKey, legacy.updateDismissKey]
})

await expectFile('src/renderer/src/components/Editor.jsx', {
  includes: ['window.__moxie'],
  excludes: [legacy.hook]
})

await expectFile('scripts/test-substitution.mjs', {
  includes: ['window.__moxie'],
  excludes: [legacy.hook]
})

await expectFile('src/renderer/src/components/editor-codeblock-eager.js', {
  includes: ['[moxie]'],
  excludes: [legacy.logPrefix]
})

await expectFile('src/renderer/src/platform/capacitor-api.js', {
  includes: ["const LIB = 'Moxie'"],
  excludes: [legacy.product]
})

await expectFile('android/app/build.gradle', {
  includes: ['com.moxie.app'],
  excludes: [legacy.appId]
})

await expectFile('android/app/src/main/res/values/strings.xml', {
  includes: ['com.moxie.app'],
  excludes: [legacy.appId]
})

await expectFile('android/key.properties.example', {
  includes: ['moxie.keystore', '-alias moxie', 'keyAlias=moxie'],
  excludes: [legacy.keystore, `-alias ${legacyBrand}`, `keyAlias=${legacyBrand}`]
})

await expectFile('ios/App/App.xcodeproj/project.pbxproj', {
  includes: ['com.moxie.app'],
  excludes: [legacy.appId]
})

const androidActivity = 'android/app/src/main/java/com/moxie/app/MainActivity.java'
add(`${androidActivity} exists`, existsSync(androidActivity))
if (existsSync(androidActivity)) {
  await expectFile(androidActivity, {
    includes: ['package com.moxie.app;'],
    excludes: [legacy.packageDecl]
  })
}

const failed = checks.filter((check) => !check.pass)
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.pass ? '' : ` (${check.detail})`}`)
}

if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} branding checks failed`)
  process.exit(1)
}

console.log(`\n${checks.length}/${checks.length} branding checks passed`)
