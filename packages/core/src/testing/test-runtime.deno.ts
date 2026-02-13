/// <reference lib="deno.ns" />

import { AsyncLocalStorage } from "node:async_hooks"
import { basename, dirname, join } from "node:path"
import { expect, fn } from "jsr:@std/expect"
import { fromFileUrl } from "jsr:@std/path/from-file-url"

type AnyFunction = (...args: any[]) => any

type Hook = (context: Deno.TestContext) => unknown | Promise<unknown>
type TestCallback = (context: Deno.TestContext) => unknown | Promise<unknown>

type MockFunction<T extends AnyFunction = AnyFunction> = T & {
  mockClear: () => void
  mockImplementation: (nextImpl: T) => MockFunction<T>
  mockRestore: () => void
}

type CurrentTestState = {
  context: Deno.TestContext
  fullName: string
  snapshotCallCounts: Map<string, number>
}

type TestMode = {
  skip?: boolean
  only?: boolean
}

type Suite = {
  name: string
  parent: Suite | null
  skip: boolean
  only: boolean
  beforeAllHooks: Hook[]
  afterAllHooks: Hook[]
  beforeEachHooks: Hook[]
  afterEachHooks: Hook[]
  beforeAllRan: boolean
  afterAllRan: boolean
  remainingTests: number
}

type TestApi = ((...args: any[]) => void) & {
  only: (...args: any[]) => void
  skip: (...args: any[]) => void
  each: (cases: readonly unknown[]) => (name: string, callback: (...args: any[]) => unknown) => void
}

const rootSuite: Suite = createSuite("", null, false, false)
let currentSuite = rootSuite

const testStateStore = new AsyncLocalStorage<CurrentTestState>()
const snapshotCache = new Map<string, Map<string, string>>()

function createSuite(name: string, parent: Suite | null, skip: boolean, only: boolean): Suite {
  return {
    name,
    parent,
    skip,
    only,
    beforeAllHooks: [],
    afterAllHooks: [],
    beforeEachHooks: [],
    afterEachHooks: [],
    beforeAllRan: false,
    afterAllRan: false,
    remainingTests: 0,
  }
}

function normalizeNamePart(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function getSuiteChain(suite: Suite): Suite[] {
  const chain: Suite[] = []
  let cursor: Suite | null = suite
  while (cursor) {
    chain.push(cursor)
    cursor = cursor.parent
  }
  chain.reverse()
  return chain
}

function getFullTestName(suiteChain: Suite[], testName: string): string {
  const parts = suiteChain
    .map((suite) => suite.name)
    .filter((value) => value.length > 0)
    .concat(normalizeNamePart(testName))

  return parts.join(" ").trim()
}

function registerDescribe(name: string, callback: () => void, mode: TestMode): void {
  const suiteName = normalizeNamePart(name)
  const suite = createSuite(
    suiteName,
    currentSuite,
    currentSuite.skip || mode.skip === true,
    currentSuite.only || mode.only === true,
  )

  const previous = currentSuite
  currentSuite = suite
  try {
    callback()
  } finally {
    currentSuite = previous
  }
}

function parseTestArgs(args: any[]): { name: string; callback: TestCallback; mode: TestMode } {
  if (typeof args[0] !== "string") {
    throw new TypeError("test/it expects a string name as the first argument")
  }

  const name = args[0]

  if (typeof args[1] === "function") {
    return { name, callback: args[1] as TestCallback, mode: {} }
  }

  if (args[1] && typeof args[1] === "object" && typeof args[2] === "function") {
    const options = args[1] as { ignore?: boolean; skip?: boolean; only?: boolean }
    return {
      name,
      callback: args[2] as TestCallback,
      mode: {
        skip: options.ignore === true || options.skip === true,
        only: options.only === true,
      },
    }
  }

  throw new TypeError("Unsupported test signature")
}

function registerTestCase(name: string, callback: TestCallback, mode: TestMode): void {
  const suiteChain = getSuiteChain(currentSuite)
  const fullName = getFullTestName(suiteChain, name)

  const ignore = currentSuite.skip || mode.skip === true
  const only = !ignore && (currentSuite.only || mode.only === true)

  if (!ignore) {
    for (const suite of suiteChain) {
      suite.remainingTests += 1
    }
  }

  Deno.test({
    name: fullName,
    ignore,
    only,
    sanitizeOps: false,
    sanitizeResources: false,
    sanitizeExit: false,
    fn: async (context) => {
      await runRegisteredTest(context, fullName, suiteChain, callback)
    },
  })
}

async function runRegisteredTest(
  context: Deno.TestContext,
  fullName: string,
  suiteChain: Suite[],
  callback: TestCallback,
): Promise<void> {
  let firstError: unknown = null
  let beforeEachCompleted = false

  try {
    await runBeforeAllHooks(suiteChain, context)
    await runBeforeEachHooks(suiteChain, context)
    beforeEachCompleted = true

    await testStateStore.run(
      {
        context,
        fullName,
        snapshotCallCounts: new Map(),
      },
      async () => {
        await callback(context)
      },
    )
  } catch (error) {
    firstError = error
  } finally {
    if (beforeEachCompleted) {
      try {
        await runAfterEachHooks(suiteChain, context)
      } catch (error) {
        if (firstError === null) {
          firstError = error
        }
      }
    }

    for (const suite of suiteChain) {
      if (suite.remainingTests > 0) {
        suite.remainingTests -= 1
      }
    }

    try {
      await runAfterAllHooks(suiteChain, context)
    } catch (error) {
      if (firstError === null) {
        firstError = error
      }
    }
  }

  if (firstError !== null) {
    throw firstError
  }
}

async function runBeforeAllHooks(suiteChain: Suite[], context: Deno.TestContext): Promise<void> {
  for (const suite of suiteChain) {
    if (suite.beforeAllRan) {
      continue
    }

    suite.beforeAllRan = true
    for (const hook of suite.beforeAllHooks) {
      await hook(context)
    }
  }
}

async function runBeforeEachHooks(suiteChain: Suite[], context: Deno.TestContext): Promise<void> {
  for (const suite of suiteChain) {
    for (const hook of suite.beforeEachHooks) {
      await hook(context)
    }
  }
}

async function runAfterEachHooks(suiteChain: Suite[], context: Deno.TestContext): Promise<void> {
  for (let i = suiteChain.length - 1; i >= 0; i -= 1) {
    const suite = suiteChain[i]
    for (const hook of suite.afterEachHooks) {
      await hook(context)
    }
  }
}

async function runAfterAllHooks(suiteChain: Suite[], context: Deno.TestContext): Promise<void> {
  for (let i = suiteChain.length - 1; i >= 0; i -= 1) {
    const suite = suiteChain[i]
    if (suite.afterAllRan || !suite.beforeAllRan || suite.remainingTests !== 0) {
      continue
    }

    suite.afterAllRan = true
    for (const hook of suite.afterAllHooks) {
      await hook(context)
    }
  }
}

function formatEachName(template: string, values: unknown[], index: number): string {
  let valueIndex = 0
  const replaced = template.replace(/%[sdifjo]/g, () => {
    const value = values[valueIndex++]
    return formatValue(value)
  })

  if (replaced !== template) {
    return replaced
  }

  return `${template} (${values.map(formatValue).join(", ")}) [${index + 1}]`
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function createTestApi(baseMode: TestMode): TestApi {
  const registerFromArgs = (...args: any[]): void => {
    const parsed = parseTestArgs(args)
    registerTestCase(parsed.name, parsed.callback, {
      skip: baseMode.skip === true || parsed.mode.skip === true,
      only: baseMode.only === true || parsed.mode.only === true,
    })
  }

  const wrapped = ((...args: any[]): void => {
    registerFromArgs(...args)
  }) as TestApi

  wrapped.only = (...args: any[]): void => {
    const parsed = parseTestArgs(args)
    registerTestCase(parsed.name, parsed.callback, {
      skip: baseMode.skip === true || parsed.mode.skip === true,
      only: true,
    })
  }

  wrapped.skip = (...args: any[]): void => {
    const parsed = parseTestArgs(args)
    registerTestCase(parsed.name, parsed.callback, {
      skip: true,
      only: baseMode.only === true || parsed.mode.only === true,
    })
  }

  wrapped.each = (cases: readonly unknown[]) => {
    return (name: string, callback: (...args: any[]) => unknown): void => {
      cases.forEach((entry, index) => {
        const args = Array.isArray(entry) ? entry : [entry]
        registerFromArgs(formatEachName(name, args, index), () => callback(...args))
      })
    }
  }

  return wrapped
}

export const describe = ((name: string, callback: () => void): void => {
  registerDescribe(name, callback, {})
}) as ((name: string, callback: () => void) => void) & {
  only: (name: string, callback: () => void) => void
  skip: (name: string, callback: () => void) => void
}

describe.only = (name: string, callback: () => void): void => {
  registerDescribe(name, callback, { only: true })
}

describe.skip = (name: string, callback: () => void): void => {
  registerDescribe(name, callback, { skip: true })
}

export const test = createTestApi({})
export const it = createTestApi({})

export function beforeAll(hook: Hook): void {
  currentSuite.beforeAllHooks.push(hook)
}

export function afterAll(hook: Hook): void {
  currentSuite.afterAllHooks.push(hook)
}

export function beforeEach(hook: Hook): void {
  currentSuite.beforeEachHooks.push(hook)
}

export function afterEach(hook: Hook): void {
  currentSuite.afterEachHooks.push(hook)
}

function resolveCurrentTestFilePath(origin: string): string {
  try {
    return fromFileUrl(origin)
  } catch {
    return origin
  }
}

function normalizeTemplateLiteralContent(value: string): string {
  let out = value.replace(/\r\n/g, "\n")
  if (out.startsWith("\n")) {
    out = out.slice(1)
  }
  if (out.endsWith("\n")) {
    out = out.slice(0, -1)
  }
  return out
}

function evaluateTemplateLiteral(value: string): string {
  const escaped = value.replace(/`/g, "\\`").replace(/\$\{/g, "\\${")
  return new Function(`return \`${escaped}\``)() as string
}

function normalizeInlineSnapshot(value: string): string {
  const lines = normalizeTemplateLiteralContent(value).split("\n")
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
  const indent =
    nonEmptyLines.length === 0 ? 0 : Math.min(...nonEmptyLines.map((line) => line.match(/^\s*/)?.[0].length ?? 0))

  return lines.map((line) => line.slice(Math.min(indent, line.length))).join("\n")
}

function serializeSnapshotValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function serializeInlineSnapshotValue(value: unknown): string {
  if (typeof value === "string") {
    if (value.includes("\n")) {
      return `"${value}"\n`
    }

    return `"${value}"`
  }

  return serializeSnapshotValue(value)
}

function getSnapshotEntriesForFile(testFilePath: string): Map<string, string> {
  const snapshotPath = join(dirname(testFilePath), "__snapshots__", `${basename(testFilePath)}.snap`)

  const cached = snapshotCache.get(snapshotPath)
  if (cached) {
    return cached
  }

  let fileContent = ""
  try {
    fileContent = Deno.readTextFileSync(snapshotPath)
  } catch {
    const empty = new Map<string, string>()
    snapshotCache.set(snapshotPath, empty)
    return empty
  }

  const snapshots = new Map<string, string>()
  const pattern = /exports\[`([\s\S]*?)`\]\s*=\s*`([\s\S]*?)`;/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(fileContent)) !== null) {
    const key = match[1]?.replace(/\\`/g, "`")
    const rawValue = match[2]
    if (key !== undefined && rawValue !== undefined) {
      snapshots.set(key, normalizeTemplateLiteralContent(evaluateTemplateLiteral(rawValue)))
    }
  }

  snapshotCache.set(snapshotPath, snapshots)
  return snapshots
}

function getCurrentSnapshotKey(hint?: string): { key: string; testFilePath: string } {
  const state = testStateStore.getStore()
  if (!state) {
    throw new Error("toMatchSnapshot can only be used inside a test callback.")
  }

  let keyBase = state.fullName
  if (hint && hint.length > 0) {
    keyBase = `${keyBase}: ${hint}`
  }

  const nextCount = (state.snapshotCallCounts.get(keyBase) ?? 0) + 1
  state.snapshotCallCounts.set(keyBase, nextCount)

  return {
    key: `${keyBase} ${nextCount}`,
    testFilePath: resolveCurrentTestFilePath(state.context.origin),
  }
}

function buildMismatchMessage(kind: string, expected: string, received: string): string {
  return `${kind} mismatch\nExpected:\n${expected}\n\nReceived:\n${received}`
}

expect.extend({
  toMatchInlineSnapshot(context: any, inlineSnapshot: unknown) {
    if (typeof inlineSnapshot !== "string") {
      return {
        pass: false,
        message: () => "toMatchInlineSnapshot expects a snapshot string argument.",
      }
    }

    const received = serializeInlineSnapshotValue(context.value)
    const expected = normalizeInlineSnapshot(inlineSnapshot)
    const pass = received === expected

    return {
      pass,
      message: () => buildMismatchMessage("Inline snapshot", expected, received),
    }
  },

  toMatchSnapshot(context: any, hint?: unknown) {
    const snapshotHint = typeof hint === "string" ? hint : undefined
    const received = serializeSnapshotValue(context.value)

    let key: string
    let testFilePath: string
    try {
      const current = getCurrentSnapshotKey(snapshotHint)
      key = current.key
      testFilePath = current.testFilePath
    } catch (error) {
      return {
        pass: false,
        message: () => (error instanceof Error ? error.message : "Unable to resolve snapshot context."),
      }
    }

    const snapshots = getSnapshotEntriesForFile(testFilePath)
    const expected = snapshots.get(key)

    if (expected === undefined) {
      return {
        pass: false,
        message: () => `Missing Bun snapshot entry: ${key}`,
      }
    }

    const pass = received === expected
    return {
      pass,
      message: () => buildMismatchMessage(`Snapshot (${key})`, expected, received),
    }
  },
})

function getMockCallsSymbol(value: Function): symbol | undefined {
  return Object.getOwnPropertySymbols(value).find((symbol) => symbol.toString() === "Symbol(@MOCK)")
}

function clearMockCalls(value: Function): void {
  const symbol = getMockCallsSymbol(value)
  if (!symbol) {
    return
  }

  const metadata = (value as any)[symbol] as { calls?: unknown[] } | undefined
  if (metadata?.calls && Array.isArray(metadata.calls)) {
    metadata.calls.length = 0
  }
}

function createMockFunction<T extends AnyFunction>(implementation: T, onRestore?: () => void): MockFunction<T> {
  let currentImplementation: AnyFunction = implementation

  const mocked = fn(function (this: unknown, ...args: unknown[]) {
    return currentImplementation.apply(this, args)
  }) as unknown as MockFunction<T>

  mocked.mockClear = () => {
    clearMockCalls(mocked)
  }

  mocked.mockImplementation = (nextImpl: T) => {
    currentImplementation = nextImpl
    return mocked
  }

  mocked.mockRestore = () => {
    onRestore?.()
  }

  return mocked
}

export function mock<T extends AnyFunction>(implementation?: T): MockFunction<T> {
  const fallback = ((..._args: unknown[]) => undefined) as unknown as T
  return createMockFunction(implementation ?? fallback)
}

export function spyOn<T extends object, K extends keyof T>(target: T, methodName: K): MockFunction<AnyFunction> {
  const original = target[methodName]
  if (typeof original !== "function") {
    throw new TypeError(`Cannot spyOn non-function property: ${String(methodName)}`)
  }

  const originalFn = original as unknown as AnyFunction
  const spy = createMockFunction(function (this: unknown, ...args: unknown[]) {
    return originalFn.apply(target, args)
  })

  ;(target as Record<PropertyKey, unknown>)[methodName as PropertyKey] = spy as unknown as T[K]
  spy.mockRestore = () => {
    ;(target as Record<PropertyKey, unknown>)[methodName as PropertyKey] = original
  }

  return spy
}

export { expect }
