import { styleText } from 'node:util'
import type { Logger, Plugin } from 'vite'

const PROGRESS_LOG_INTERVAL_SEC = 3
const SLOW_FILE_THRESHOLDS_MS = [500, 1000]

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

export type InitialBuildTimeOptions = {
  /**
   * During the initial dev build, logs the id of a module when no other
   * module is transformed for 500ms / 1000ms after it, which helps find
   * modules that are slow to transform.
   *
   * @default false
   */
  logSlowFiles?: boolean
  /**
   * Time in ms without any module transform after which the initial dev
   * build is considered finished.
   *
   * @default 5000
   */
  idleTimeout?: number
}

/**
 * Measures and reports the initial build time of a Vite project.
 *
 * - Dev (`vite`): the time between the first module transform and the last
 *   one before transforms stop for `idleTimeout` ms.
 * - Build (`vite build`): the time from the start of the build until the
 *   bundle is written, reported once per environment (the first build only in
 *   watch mode).
 */
export function initialBuildTime({
  logSlowFiles = false,
  idleTimeout = 5000,
}: InitialBuildTimeOptions = {}): Plugin {
  let logger: Logger | undefined
  let isDev = false

  function log(message: string) {
    if (logger) {
      logger.info(message)
    } else {
      console.info(message)
    }
  }

  function logResult(durationMs: number, environmentName?: string) {
    const suffix = environmentName
      ? styleText('dim', ` (${environmentName})`)
      : ''

    log(
      `  ${styleText('green', '➜')}  ${styleText('bold', 'Initial build time:')} ${styleText('cyan', formatDuration(durationMs))}${suffix}`,
    )
  }

  /* dev state */
  let firstTransformAt: number | undefined
  let lastTransformAt = 0
  let lastProgressSecondLogged = 0
  let devInitialBuildDone = false
  let idleTimer: NodeJS.Timeout | undefined
  const slowFileTimers: NodeJS.Timeout[] = []

  function clearSlowFileTimers() {
    for (const timer of slowFileTimers) clearTimeout(timer)
    slowFileTimers.length = 0
  }

  function clearDevTimers() {
    clearTimeout(idleTimer)
    idleTimer = undefined
    clearSlowFileTimers()
  }

  function startTimer(ms: number, callback: () => void): NodeJS.Timeout {
    const timer = setTimeout(callback, ms)
    timer.unref()
    return timer
  }

  function onDevTransform(id: string) {
    const now = performance.now()
    firstTransformAt ??= now
    lastTransformAt = now

    const startedAt = firstTransformAt
    const elapsedSecond = Math.floor((now - startedAt) / 1000)

    if (
      elapsedSecond !== lastProgressSecondLogged &&
      elapsedSecond % PROGRESS_LOG_INTERVAL_SEC === 0
    ) {
      lastProgressSecondLogged = elapsedSecond
      log(styleText('dim', `  building... ${elapsedSecond}s`))
    }

    clearTimeout(idleTimer)
    idleTimer = startTimer(idleTimeout, () => {
      devInitialBuildDone = true
      clearDevTimers()
      logResult(lastTransformAt - startedAt)
    })

    if (logSlowFiles) {
      clearSlowFileTimers()

      for (const thresholdMs of SLOW_FILE_THRESHOLDS_MS) {
        slowFileTimers.push(
          startTimer(thresholdMs, () => {
            log(styleText('yellow', `  +${thresholdMs}ms ${id}`))
          }),
        )
      }
    }
  }

  /* build state */
  const buildStartedAt = new Map<string, number>()
  const reportedBuilds = new Set<string>()

  return {
    name: 'initial-build-time',

    configResolved(config) {
      logger = config.logger
      isDev = config.command === 'serve'
    },

    buildStart() {
      if (isDev) return

      const environmentName = this.environment.name

      if (!buildStartedAt.has(environmentName)) {
        buildStartedAt.set(environmentName, performance.now())
      }
    },

    transform(_code, id) {
      if (!isDev || devInitialBuildDone) return

      onDevTransform(id)
    },

    buildEnd() {
      // in dev this runs when the server is closed
      if (isDev) clearDevTimers()
    },

    closeBundle(error) {
      if (isDev) return

      const environmentName = this.environment.name

      if (error) {
        // measure the next (watch mode) build instead of a failed one
        buildStartedAt.delete(environmentName)
        return
      }
      const startedAt = buildStartedAt.get(environmentName)

      if (startedAt === undefined || reportedBuilds.has(environmentName)) {
        return
      }

      reportedBuilds.add(environmentName)

      logResult(
        performance.now() - startedAt,
        environmentName === 'client' ? undefined : environmentName,
      )
    },
  }
}
