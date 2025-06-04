# install-rspack

> Install Rspack in your project, with support for canary versions.

## Usage

To install a canary version in your project, run:

```sh
npx install-rspack --version 1.3.13-canary-e56725ae-20250529070819
```

```json
// package.json
{
  "pnpm": {
    "overrides": {
      "@rspack/core": "npm:@rspack-canary/core@1.3.13-canary-e56725ae-20250529070819",
      "@rspack/cli": "npm:@rspack-canary/cli@1.3.13-canary-e56725ae-20250529070819"
    },
    "peerDependencyRules": {
      "allowAny": ["@rspack/*"]
    }
  }
}
```

It's also possible to install a specific version:

```sh
npx install-rspack --version 1.3.13
```

Use npm tag:

```sh
npx install-rspack  # default `npx install-rspack --version latest`
npx install-rspack --version canary
npx install-rspack --version nightly
npx install-rspack --version beta
```

Specify the path of a package.json

```sh
npx install-rspack --version 1.3.13-canary-e56725ae-20250529070819 --path ./foo/app/package.json
```

### CI mode

Skip all interactive actions

```sh
CI=true npx install-rspack --version 1.3.13-canary-e56725ae-20250529070819
# or
CI=true npx install-rspack --version 1.3.13-canary-e56725ae-20250529070819 --pm pnpm --path ./foo/app/package.json
```

## Credits

Thanks to:

- [install-vue](https://github.com/sodatea/install-vue)

- [vuejs/core](https://github.com/vuejs/core/pull/7860)
