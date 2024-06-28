# install-rspack

> Install Rspack in your project, with support for canary versions.

## Usage

To install a canary version in your project, run:

```sh
npx install-rspack --version 0.7.5-canary-d614005-20240625082730
```

```json
// package.json
{
  "pnpm": {
    "overrides": {
      "@rspack/binding": "npm:@rspack/binding-canary@0.7.5-canary-d614005-20240625082730",
      "@rspack/core": "npm:@rspack/core-canary@0.7.5-canary-d614005-20240625082730",
      "@rspack/cli": "npm:@rspack/cli-canary@0.7.5-canary-d614005-20240625082730",
      "@rspack/dev-server": "npm:@rspack/dev-server-canary@0.7.5-canary-d614005-20240625082730",
      "@rspack/plugin-minify": "npm:@rspack/plugin-minify-canary@0.7.5-canary-d614005-20240625082730",
      "@rspack/plugin-preact-refresh": "npm:@rspack/plugin-preact-refresh-canary@0.7.5-canary-d614005-20240625082730",
      "@rspack/plugin-react-refresh": "npm:@rspack/plugin-react-refresh-canary@0.7.5-canary-d614005-20240625082730"
    },
    "peerDependencyRules": {
      "allowAny": ["@rspack/*"]
    }
  }
}
```

It's also possible to install a specific version:

```sh
npx install-rspack --version 0.7.5
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
npx install-rspack --version 0.7.5-canary-d614005-20240625082730 --path ./foo/app/package.json
```

### CI mode

Skip all interactive actions

```sh
CI=true npx install-rspack --version 0.7.5-canary-d614005-20240625082730
# or
CI=true npx install-rspack --version 0.7.5-canary-d614005-20240625082730 --pm pnpm --path ./foo/app/package.json
```

## Credits

Thanks to:

- [install-vue](https://github.com/sodatea/install-vue)

- [vuejs/core](https://github.com/vuejs/core/pull/7860)
