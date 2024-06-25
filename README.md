# install-rspack

> Install Rspack in your project, with support for canary versions.

## Usage

To install a canary version in your project, run:

```sh
npx install-rspack --version 0.7.5-canary-d614005-20240625082730
```

It's also possible to install a specific version:

```sh
npx install-rspack@canary --version 0.7.5
```

Use npm tag:

```sh
npx install-rspack@canary --version latest
npx install-rspack@canary --version canary
npx install-rspack@canary --version nightly
npx install-rspack@canary --version beta
```

```sh
npx install-rspack@canary --version 0.7.5-canary-d614005-20240625082730 --path ./foo/app/package.json
```

## Credits

Thanks to:

- [install-vue](https://github.com/sodatea/install-vue)

- [vuejs/core](https://github.com/vuejs/core/pull/7860)
