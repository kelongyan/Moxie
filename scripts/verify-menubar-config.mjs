import assert from 'node:assert/strict'
import { MENU_BAR, flattenMenuItems } from '../src/renderer/src/components/shell/menuConfig.js'

const topIds = MENU_BAR.map((item) => item.id)
assert.deepEqual(topIds, ['file', 'edit', 'paragraph', 'format', 'view', 'theme', 'help'])

const allItems = flattenMenuItems(MENU_BAR)
const commandItems = allItems.filter((item) => item.command)
const placeholderItems = allItems.filter((item) => item.status === 'placeholder')
assert(commandItems.length >= 18, 'expected existing commands to be represented')
assert(placeholderItems.length >= 20, 'expected future commands to be visible as placeholders')

const file = MENU_BAR.find((item) => item.id === 'file')
const exportMenu = file.items.find((item) => item.id === 'export')
assert(exportMenu?.children?.some((item) => item.id === 'export-pdf'), 'export menu should include PDF')
assert(exportMenu?.children?.some((item) => item.status === 'placeholder'), 'export menu should include placeholder formats')

const imageMenu = allItems.find((item) => item.id === 'format-image-more')
assert(imageMenu?.children?.length >= 3, 'format image submenu should expose future image actions')

const theme = MENU_BAR.find((item) => item.id === 'theme')
assert(theme.items.some((item) => item.dynamic === 'appearance-modes'), 'theme menu should have dynamic appearance modes')
assert(theme.items.some((item) => item.dynamic === 'theme-palettes'), 'theme menu should have dynamic theme palettes')
assert(theme.items.some((item) => item.dynamic === 'custom-themes'), 'theme menu should have dynamic custom themes')

console.log('menubar config ok')
