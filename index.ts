#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, isAbsolute, basename, dirname } from 'node:path'
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
    },
    tag: {
      type: 'string',
    },
    path: {
      type: 'string',
    },
    pm: {
      type: 'string',
    },
    ci: {
      type: 'boolean',
      default: Boolean(process.env['CI']),
    },
  },
})

// decide which package manager to use
const SUPPORTED_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'] as const
type PackageManager = (typeof SUPPORTED_PACKAGE_MANAGERS)[number]
const LOCKFILE_TO_PACKAGE_MANAGER: Record<string, PackageManager> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
}
// core-packages to be overridden
const RSPACK_PACKAGES = ['@rspack/core', '@rspack/cli']

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

function getPackageJson(packageJsonPath: string) {
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Cannot find package.json in ${packageJsonPath}`)
  }
  return JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
}

if (args.ci) {
  log.info('Detected you are in CI mode')
  const packageJsonPath = getPackageJsonPath()
  const targetVersion = await getTargetVersion()
  log.info(
    `Adding install-rspack ${targetVersion} overrides to ${packageJsonPath}`,
  )
  const pm = await getPackageManager(packageJsonPath)
  await addOverridesToPackageJson(pm, targetVersion, packageJsonPath)
  log.info(`Done! Don't forget to run ${pico.magenta(`${pm} install`)} later.`)
  process.exit(0)
}

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

async function getPackageManager(
  packageJsonPath: string,
): Promise<PackageManager> {
  if (
    args.pm &&
    SUPPORTED_PACKAGE_MANAGERS.includes(args.pm as PackageManager)
  ) {
    return args.pm as PackageManager
  }

  let pm: PackageManager = 'npm'

  const pmCandidates: PackageManager[] = []
  const packageJsonDirname = dirname(packageJsonPath)
  for (const [lockfile, pmName] of Object.entries(
    LOCKFILE_TO_PACKAGE_MANAGER,
  )) {
    if (existsSync(resolve(packageJsonDirname, lockfile))) {
      pmCandidates.push(pmName)
    }
  }

  if (args.ci) {
    return pmCandidates[0] ?? pm
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
  return pm
}

const packageJsonPath = getPackageJsonPath()
const pm: PackageManager = await getPackageManager(packageJsonPath)

// https://github.com/web-infra-dev/rspack/pull/8828
function toCanaryPackageName(name: string) {
  if (name === 'create-rspack') {
    return 'create-rspack-canary'
  }
  const nextName = name.replace(/^@rspack/, '@rspack-canary')
  return nextName
}

function isCanaryTag(version: string): boolean {
  return version === 'canary'
}

function isSnapshotTag(version: string): boolean {
  return isCanaryTag(version) || version === 'nightly'
}

function getOverrides(version: string): Record<string, string> {
  const isSnapshot =
    typeof version === 'string' &&
    (version.includes('-canary') || isSnapshotTag(version))

  const targetVersion = isCanaryTag(version) ? 'latest' : version
  return Object.fromEntries(
    RSPACK_PACKAGES.map((name) => {
      if (isSnapshot) {
        return [
          name,
          `npm:${toCanaryPackageName(name)}${targetVersion ? `@${targetVersion}` : ''}`,
        ]
      } else {
        return [name, `${targetVersion}`]
      }
    }),
  )
}

function isDistTag(raw: string): raw is 'latest' | 'canary' | 'nightly' {
  return ['latest', 'canary', 'nightly', 'alpha'].includes(raw)
}

// apply the overrides to the package.json
// https://github.com/npm/rfcs/blob/main/accepted/0036-overrides.md
// We recommend using exact version (won't work without version or with `@latest`)
async function getTargetVersion(): Promise<string> {
  let targetVersion: string
  if (args.tag && isDistTag(args.tag)) {
    return args.tag
  }
  const version = args.version ?? 'latest'
  if (isDistTag(version)) {
    const isSnapshotVersion = isSnapshotTag(version)
    const corePackageName = isSnapshotVersion
      ? toCanaryPackageName('@rspack/core')
      : '@rspack/core'

    const s = spinner()
    const distTag = isCanaryTag(version) ? 'latest' : version
    s.start(`Checking for the latest ${distTag} version`)
    const { stdout } = await execa(
      'npm',
      ['info', `${corePackageName}@${distTag}`, 'version', '--json'],
      { stdio: 'pipe' },
    )
    targetVersion = JSON.parse(stdout)
    s.stop(`Found ${distTag} version ${pico.yellow(targetVersion)}`)
  } else {
    targetVersion = version
  }
  return targetVersion
}

const targetVersion = await getTargetVersion()
await addOverridesToPackageJson(pm, targetVersion, packageJsonPath)

async function addOverridesToPackageJson(
  pm: string,
  targetVersion: string,
  packageJsonPath: string,
) {
  const pkg = await getPackageJson(packageJsonPath)
  if (pm === 'npm') {
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
    const overrides = getOverrides(targetVersion)

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
      ...getOverrides(targetVersion),
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
}

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
