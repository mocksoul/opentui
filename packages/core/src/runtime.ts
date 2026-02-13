export type RuntimeKind = "bun" | "deno"

type BunGlobal = {
  FFI?: unknown
  platform?: string
  stringWidth?: (value: string) => number
  sleep?: (ms: number) => Promise<void>
  file?: (path: string) => unknown
  serve?: (options: RuntimeServeOptions) => RuntimeServer
  stripANSI?: (value: string) => string
}

type DenoGlobal = {
  dlopen?: unknown
  env?: {
    get?: (key: string) => string | undefined
  }
  build?: {
    os?: string
    arch?: string
  }
  readFileSync?: (path: string) => Uint8Array
  serve?: (
    options: { port: number },
    handler: (request: Request) => Response | Promise<Response>,
  ) => { shutdown: () => Promise<void> }
}

export type RuntimeServeOptions = {
  port: number
  fetch: (request: Request) => Response | Promise<Response>
}

export type RuntimeServer = {
  stop: () => void
}

type ProcessGlobal = {
  env?: Record<string, string | undefined>
  platform?: string
  arch?: string
  on?: (event: string, handler: () => void) => void
}

export function getBunGlobal(): BunGlobal | undefined {
  return (globalThis as { Bun?: BunGlobal }).Bun
}

export function getDenoGlobal(): DenoGlobal | undefined {
  return (globalThis as { Deno?: DenoGlobal }).Deno
}

export function getProcessGlobal(): ProcessGlobal | undefined {
  return (globalThis as { process?: ProcessGlobal }).process
}

export function detectFfiRuntime(): RuntimeKind {
  if (getBunGlobal()?.FFI) {
    return "bun"
  }

  if (getDenoGlobal()?.dlopen) {
    return "deno"
  }

  throw new Error("Unsupported runtime. Expected Bun or Deno.")
}

export function isDenoRuntime(): boolean {
  return getDenoGlobal() !== undefined
}

export function getRuntimePlatformArch(): { platform: string; arch: string } {
  const proc = getProcessGlobal()
  if (proc?.platform && proc?.arch) {
    return {
      platform: normalizePlatform(proc.platform),
      arch: normalizeArch(proc.arch),
    }
  }

  const deno = getDenoGlobal()
  if (deno?.build?.os && deno?.build?.arch) {
    return {
      platform: normalizePlatform(deno.build.os),
      arch: normalizeArch(deno.build.arch),
    }
  }

  throw new Error("Unable to determine runtime platform and architecture.")
}

export function getProcessEnv(): Record<string, string | undefined> | undefined {
  try {
    return getProcessGlobal()?.env
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return undefined
    }

    throw error
  }
}

export function getDenoEnvGet(): ((key: string) => string | undefined) | undefined {
  return getDenoGlobal()?.env?.get
}

export function getProcessOn(): ((event: string, handler: () => void) => void) | undefined {
  return getProcessGlobal()?.on
}

export function stringWidth(value: string): number {
  const bunStringWidth = getBunGlobal()?.stringWidth
  if (bunStringWidth) {
    return bunStringWidth(value)
  }

  let width = 0
  for (const char of value) {
    width += getCharWidth(char)
  }

  return width
}

function getCharWidth(char: string): number {
  const codePoint = char.codePointAt(0)
  if (codePoint === undefined) {
    return 0
  }

  // C0/C1 control characters are zero-width.
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return 0
  }

  // Combining marks and variation selectors are zero-width.
  if (/\p{Mark}|[\uFE00-\uFE0F]/u.test(char)) {
    return 0
  }

  // Treat emoji and full-width code points as width 2.
  if (/\p{Extended_Pictographic}/u.test(char) || isFullWidthCodePoint(codePoint)) {
    return 2
  }

  return 1
}

function isFullWidthCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0x3247 && codePoint !== 0x303f) ||
      (codePoint >= 0x3250 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0xa4c6) ||
      (codePoint >= 0xa960 && codePoint <= 0xa97c) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
      (codePoint >= 0xff01 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1b000 && codePoint <= 0x1b001) ||
      (codePoint >= 0x1f200 && codePoint <= 0x1f251) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  )
}

export async function sleep(ms: number): Promise<void> {
  const bunSleep = getBunGlobal()?.sleep
  if (bunSleep) {
    await bunSleep(ms)
    return
  }

  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function file(path: string): unknown {
  const bunFile = getBunGlobal()?.file
  if (bunFile) {
    return bunFile(path)
  }

  const denoReadFileSync = getDenoGlobal()?.readFileSync
  if (denoReadFileSync) {
    const bytes = denoReadFileSync(path)
    const arrayBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(arrayBuffer).set(bytes)
    return new Blob([arrayBuffer])
  }

  throw new Error("Runtime does not support file().")
}

export function serve(options: RuntimeServeOptions): RuntimeServer {
  const bunServe = getBunGlobal()?.serve
  if (bunServe) {
    return bunServe(options)
  }

  const denoServe = getDenoGlobal()?.serve
  if (!denoServe) {
    throw new Error("Runtime does not support serve().")
  }

  const server = denoServe({ port: options.port }, options.fetch)
  return {
    stop() {
      void server.shutdown()
    },
  }
}

export function stripANSI(value: string): string {
  const bunStripAnsi = getBunGlobal()?.stripANSI
  if (bunStripAnsi) {
    return bunStripAnsi(value)
  }

  return value.replace(ANSI_PATTERN, "")
}

function normalizePlatform(platform: string): string {
  if (platform === "windows") {
    return "win32"
  }

  return platform
}

function normalizeArch(arch: string): string {
  if (arch === "x86_64") {
    return "x64"
  }

  if (arch === "aarch64") {
    return "arm64"
  }

  return arch
}

function isPermissionDeniedError(error: unknown): boolean {
  return error instanceof Error && error.name === "PermissionDenied"
}

const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])|(?:[^\u0007]*(?:\u0007|\u001B\\)))/g
