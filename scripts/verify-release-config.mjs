import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const version = '1.5.0'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8')
const androidGradle = readFileSync('android/app/build.gradle', 'utf8')
const iosProject = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
const gitignore = readFileSync('.gitignore', 'utf8')
const readme = readFileSync('README.md', 'utf8')

assert.equal(packageJson.version, version, 'package.json should be v1.5.0')
assert.equal(packageLock.version, version, 'package-lock root should be v1.5.0')
assert.equal(packageLock.packages[''].version, version, 'package-lock package entry should be v1.5.0')
assert(readme.includes('Moxie Setup 1.5.0.exe'), 'README installer example should mention v1.5.0')

for (const target of ['nsis', 'portable', 'zip']) {
  assert(packageJson.build.win.target.includes(target), `Windows target should include ${target}`)
}
for (const target of ['AppImage', 'deb', 'tar.gz']) {
  assert(packageJson.build.linux.target.includes(target), `Linux target should include ${target}`)
}
assert(packageJson.build.mac.target.some((item) => item.target === 'dmg'), 'macOS target should include dmg')
assert(packageJson.build.mac.target.some((item) => item.target === 'zip'), 'macOS target should include zip')

for (const token of [
  'platform: win',
  'platform: mac',
  'platform: linux',
  'Build Android debug APK',
  'Build Android release APK and AAB',
  'Upload Android assets'
]) {
  assert(releaseWorkflow.includes(token), `release workflow should include ${token}`)
}

assert(androidGradle.includes('versionCode 5'), 'Android versionCode should be 5')
assert(androidGradle.includes('versionName "1.5.0"'), 'Android versionName should be v1.5.0')
assert.equal((iosProject.match(/CURRENT_PROJECT_VERSION = 5;/g) || []).length, 2, 'iOS build version should be 5 in Debug and Release')
assert.equal((iosProject.match(/MARKETING_VERSION = 1\.5\.0;/g) || []).length, 2, 'iOS marketing version should be v1.5.0 in Debug and Release')

assert(gitignore.includes('RULE.md'), 'RULE.md should stay local-only')
assert(gitignore.includes('output/'), 'output/ should stay local-only')

console.log('release config ok')
