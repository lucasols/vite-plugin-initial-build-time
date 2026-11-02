# @ls-stack/vite-plugin-initial-build-time

A Vite plugin that measures and reports how long the initial build takes, in both dev and build mode.

```
  ➜  Initial build time: 4.21s
```

## Install

```bash
pnpm add -D @ls-stack/vite-plugin-initial-build-time
```

Requires Vite 6, 7 or 8 and Node `^20.19.0 || >=22.12.0`. The package is ESM-only.

## Usage

```ts
// vite.config.ts
import { initialBuildTime } from '@ls-stack/vite-plugin-initial-build-time'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // ...other plugins
    initialBuildTime(),
  ],
})
```

Put it after the plugins that transform your source files, so their work is included in the measurement.

## What is measured

- **Dev (`vite`)**: Vite transforms modules on demand, so the clock starts at the first module transform, usually the first page load. The initial build is done when no module is transformed for `idleTimeout` ms. The reported time runs from the first transform to the last one before that pause. While it runs, a `building... Ns` line prints every 3 seconds. Transforms after that, such as HMR updates, are not measured.
- **Build (`vite build`)**: the time from the start of the build until the bundle is written. It is reported once per environment, and in watch mode only for the first successful build.

Output goes through Vite's logger, so it follows `logLevel` and `customLogger`.

## Options

| Option         | Type      | Default | Description                                                                                                                           |
| -------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `idleTimeout`  | `number`  | `5000`  | Time in ms without any module transform after which the initial dev build is considered finished.                                     |
| `logSlowFiles` | `boolean` | `false` | During the initial dev build, logs a module's id when no other module is transformed 500ms and 1000ms after it, to find slow modules. |

## License

MIT
