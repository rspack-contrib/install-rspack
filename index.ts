#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, isAbsolute, basename } from 'node:path'
import { cwd } from 'node:process'
import { parseArgs } from 'node:util'
import {
  intro,
  outro,
  log,
  select,
  confirm,
  spinner,
  cancel,
  isCancel,
} from '@clack/prompts'
import { execa, ExecaError } from 'execa'
import pico from 'picocolors'

// normalize the prompt answer and deal with cancel operations
async function normalizeAnswer<T>(
  maybeCancelPromise: Promise<T | symbol>,
): Promise<T> {
  const maybeCancel = await maybeCancelPromise

  if (isCancel(maybeCancel)) {
    cancel('Operation cancelled.')
    process.exit(0)
  } else {
    return maybeCancel
  }
}

const { values: args } = parseArgs({
  options: {
    version: {
      type: 'string',
      default: 'latest',
    },
    path: {
      type: 'string',
    },
  },
})

function getPackageJsonPath() {
  let root = cwd()
  let packageJsonPath = args.path

  if (typeof packageJsonPath !== 'string') {
    packageJsonPath = resolve(root, 'package.json')
  }

  if (!isAbsolute(packageJsonPath)) {
    packageJsonPath = resolve(root, packageJsonPath)
  }

  if (basename(packageJsonPath) !== 'package.json') {
    packageJsonPath = resolve(packageJsonPath, 'package.json')
  }
  return packageJsonPath
}

const packageJsonPath = getPackageJsonPath()
if (!existsSync(packageJsonPath)) {
  throw new Error('Cannot find package.json in the current directory')
}
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

intro('Installing Rspack')

try {
  const { stdout: gitStatus } = await execa('git', ['status', '--porcelain'])
  if (gitStatus.trim()) {
    log.warn(
      "There are uncommitted changes in the current repository, it's recommended to commit or stash them first.",
    )
    const shouldProceed = await normalizeAnswer(
      confirm({
        message: `Still proceed?`,
        initialValue: false,
      }),
    )

    if (!shouldProceed) {
      cancel('Operation cancelled.')
      process.exit(1)
    }
  }
} catch (e) {
  // Do nothing if git is not available, or if it's not a git repo
}

// decide which package manager to use
const SUPPORTED_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'] as const
type PackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]
const LOCKFILE_TO_PACKAGE_MANAGER: Record<string, PackageManager> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
}

let pm: PackageManager = 'npm'
const pmCandidates: PackageManager[] = []
for (const [lockfile, pmName] of Object.entries(LOCKFILE_TO_PACKAGE_MANAGER)) {
  if (existsSync(resolve(cwd(), lockfile))) {
    pmCandidates.push(pmName)
  }
}
if (pmCandidates.length === 1) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  pm = pmCandidates[0]!
} else if (pmCandidates.length > 1) {
  pm = await normalizeAnswer(
    select({
      message:
        'More than one lockfile found, please select the package manager you would like to use',
      options: pmCandidates.map((candidate) => ({
        value: candidate,
        label: candidate,
      })),
    }),
  )
} else {
  pm = await normalizeAnswer(
    select({
      message: 'Cannot infer which package manager to use, please select',
      options: SUPPORTED_PACKAGE_MANAGERS.map((candidate) => ({
        value: candidate,
        label: candidate,
      })),
    }),
  )
}

const RSPACK_PACKAGES = [
  '@rspack/binding',
  '@rspack/binding-darwin-arm64',
  '@rspack/binding-darwin-x64',
  '@rspack/binding-linux-x64-gnu',
  '@rspack/binding-win32-x64-msvc',
  'create-rspack',
  '@rspack/core',
  '@rspack/cli',
  '@rspack/dev-server',
  '@rspack/plugin-minify',
  '@rspack/plugin-preact-refresh',
  '@rspack/plugin-react-refresh',
  '@rspack/test-tools',
]
const toCanaryPackageName = (name: string) => `${name}-canary`

function getOverrides(version = args.version): Record<string, string> {
  const isSnapshot = version?.includes('-canary') ?? false
  return Object.fromEntries(
    RSPACK_PACKAGES.map((name) => {
      if (isSnapshot) {
        return [
          name,
          `npm:${toCanaryPackageName(name)}${version ? `@${version}` : ''}`,
        ]
      } else {
        return [name, `${version}`]
      }
    }),
  )
}

// apply the overrides to the package.json
if (pm === 'npm') {
  // https://github.com/npm/rfcs/blob/main/accepted/0036-overrides.md
  // Must use exact version (won't work without version or with `@latest`)
  let targetVersion: string
  if (
    !args.version ||
    ['latest', 'canary', 'nightly', 'beta'].includes(args.version)
  ) {
    const corePackageName = '@rspack/core'
    const s = spinner()
    const distTag = args.version
    s.start(`Checking for the latest ${distTag} version`)
    const { stdout } = await execa(
      'npm',
      ['info', `${corePackageName}@${distTag}`, 'version', '--json'],
      { stdio: 'pipe' },
    )
    targetVersion = JSON.parse(stdout)
    s.stop(`Found ${distTag} version ${pico.yellow(targetVersion)}`)
  } else {
    targetVersion = args.version
  }

  let overrides: Record<string, string> = getOverrides(targetVersion)
  pkg.overrides = {
    ...pkg.overrides,
    ...overrides,
  }

  // NPM requires direct dependencies to be rewritten too
  for (const dependencyName of RSPACK_PACKAGES) {
    for (const dependencyType of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      if (pkg[dependencyType]?.[dependencyName]) {
        pkg[dependencyType][dependencyName] = overrides[dependencyName]
      }
    }
  }
} else if (pm === 'pnpm') {
  const overrides = getOverrides()

  pkg.pnpm ??= {}

  // https://pnpm.io/package_json#pnpmoverrides
  // pnpm & npm overrides differs slightly on their abilities: https://github.com/npm/rfcs/pull/129/files#r440478558
  // so they use different configuration fields
  pkg.pnpm.overrides = {
    ...pkg.pnpm.overrides,
    ...overrides,
  }

  // https://pnpm.io/package_json#pnpmpeerdependencyrulesallowany
  pkg.pnpm.peerDependencyRules ??= {}
  pkg.pnpm.peerDependencyRules.allowAny ??= []
  pkg.pnpm.peerDependencyRules.allowAny.push('@rspack/*')
} else if (pm === 'yarn') {
  // https://github.com/yarnpkg/rfcs/blob/master/implemented/0000-selective-versions-resolutions.md
  pkg.resolutions = {
    ...pkg.resolutions,
    ...getOverrides(),
  }
} else {
  // unreachable
}

// write pkg back
writeFileSync(
  packageJsonPath,
  JSON.stringify(pkg, undefined, 2) + '\n',
  'utf-8',
)

log.step(
  `Updated ${pico.yellow('package.json')} for ${pico.magenta(
    pm,
  )} dependency overrides`,
)

// prompt & run install
const shouldInstall = await normalizeAnswer(
  confirm({
    message: `Run ${pico.magenta(
      `${pm} install`,
    )} to install the updated dependencies?`,
    initialValue: true,
  }),
)

if (shouldInstall) {
  const s = spinner()
  s.start(`Installing via ${pm}`)
  try {
    await execa(pm, ['install'], { stdio: 'pipe' })
    s.stop(`Installed via ${pm}`)
  } catch (e) {
    s.stop(pico.red('Installation failed'))
    log.error((e as ExecaError).stderr || (e as ExecaError).message)
    process.exit(1)
  }
  outro(`Done!`)
} else {
  outro(`Done! Don't forget to run ${pico.magenta(`${pm} install`)} later.`)
}
