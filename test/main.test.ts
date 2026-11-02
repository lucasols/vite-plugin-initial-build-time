import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { build, createLogger, createServer, type Logger } from 'vite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { initialBuildTime } from '../src/main.ts'

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'initial-build-time-'))
  writeFileSync(
    join(root, 'index.html'),
    '<script type="module" src="./main.js"></script>',
  )
  writeFileSync(
    join(root, 'main.js'),
    'import { a } from "./a.js"\nconsole.log(a)',
  )
  writeFileSync(join(root, 'a.js'), 'export const a = 1')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function createCapturingLogger(): { logger: Logger; messages: string[] } {
  const messages: string[] = []
  const logger = createLogger('silent')

  logger.info = (msg) => {
    messages.push(stripVTControlCharacters(msg))
  }

  return { logger, messages }
}

const initialBuildTimeRegex = /^ {2}➜ {2}Initial build time: \d+\.\d{2}s$/

test('reports the build time once in build mode', async () => {
  const { logger, messages } = createCapturingLogger()

  await build({
    root,
    configFile: false,
    customLogger: logger,
    logLevel: 'info',
    build: { write: false },
    plugins: [initialBuildTime()],
  })

  const reports = messages.filter((msg) => msg.includes('Initial build time'))

  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatch(initialBuildTimeRegex)
})

test('reports the initial dev build time after transforms go idle', async () => {
  const { logger, messages } = createCapturingLogger()

  const server = await createServer({
    root,
    configFile: false,
    customLogger: logger,
    logLevel: 'info',
    server: { ws: false, watch: null },
    plugins: [initialBuildTime({ idleTimeout: 100 })],
  })

  try {
    await server.transformRequest('/main.js')
    await server.transformRequest('/a.js')

    expect(messages.some((msg) => msg.includes('Initial build time'))).toBe(
      false,
    )

    await new Promise((resolve) => setTimeout(resolve, 300))

    const reports = messages.filter((msg) => msg.includes('Initial build time'))
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatch(initialBuildTimeRegex)

    // later transforms (e.g. HMR) are not measured
    writeFileSync(join(root, 'b.js'), 'export const b = 2')
    await server.transformRequest('/b.js')
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(
      messages.filter((msg) => msg.includes('Initial build time')),
    ).toHaveLength(1)
  } finally {
    await server.close()
  }
})
