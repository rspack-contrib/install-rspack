#!/usr/bin/env node

import fs from 'node:fs'

import { $ } from 'execa'
import { intro, outro, select, spinner, cancel, isCancel } from '@clack/prompts'
import pico from 'picocolors'
import { inc } from 'semver'

const currentVersion = JSON.parse(
  fs.readFileSync('./package.json', 'utf-8'),
).version

intro(`Releasing ${pico.underline(pico.yellow('install-rspack'))}`)

const newVersion = await select({
  message: 'What kind of release?',
  options: ['patch', 'minor', 'major'].map((releaseType) => {
    const afterIncrement = inc(currentVersion, releaseType)
    return {
      value: afterIncrement,
      label: releaseType,
      hint: `v${currentVersion} -> v${afterIncrement}`,
    }
  }),
})

if (isCancel(newVersion)) {
  cancel('Operation cancelled.')
  process.exit(0)
}

const s = spinner()
s.start(`Publishing v${newVersion}`)

await $`pnpm run build`
await $`pnpm publish --tag latest --no-git-checks`
await $`git restore -- .`

s.stop(`Published v${newVersion}`)

await $`git push origin main --follow-tags`
outro('Done! Please check the release on GitHub.')
