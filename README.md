# install-vue

> Install Vue in your project, with support for pre-release versions.

## Usage

To install a canary version of Vue in your project, run:

```sh
npx install-vue@canary
```

You can replace `canary` with other pre-release version tags, such as `alpha`, `beta`, or `rc`.

It's also possible to install a specific pre-release version so that you can test for some specific bugs:

```sh
npx install-vue@canary --version 3.20230911.0
```

Or

```sh
npx install-vue@beta --version 3.3.0-beta.1
```

As Vue.js currently adopts a feature branch approach for minor releases[^1], you can also install a canary version for the next minor release:

```sh
npx install-vue@canary-minor
```

[^1]: That is, while we continue fixing bugs in the `main` branch, we are also working on new features in the `minor` branch. The `minor` branch will eventually be merged into the `main` branch when the next minor release is ready.
