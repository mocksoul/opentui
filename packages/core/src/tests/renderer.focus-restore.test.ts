import { test, expect, beforeEach, afterEach, describe } from "bun:test"
import { Buffer } from "node:buffer"
import { createTestRenderer, type TestRenderer, type MockInput, type MockMouse } from "../testing/test-renderer"
import { Renderable } from "../Renderable"

class TestRenderable extends Renderable {
  constructor(renderer: TestRenderer, options: any) {
    super(renderer, options)
  }
}

let renderer: TestRenderer
let mockInput: MockInput
let mockMouse: MockMouse
let renderOnce: () => Promise<void>

// Track calls to restoreTerminalModes via spy
let restoreTerminalModesCalls: number
let originalRestoreTerminalModes: any

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 15))
  ;({ renderer, mockInput, mockMouse, renderOnce } = await createTestRenderer({
    useMouse: true,
  }))

  // Mock capability functions to avoid interfering with test terminal
  // @ts-expect-error - mocking for test
  renderer.lib.processCapabilityResponse = () => {}
  // @ts-expect-error - mocking for test
  renderer.lib.getTerminalCapabilities = () => ({ unicode: "unicode" })

  // Spy on restoreTerminalModes
  restoreTerminalModesCalls = 0
  // @ts-expect-error - accessing for spy
  originalRestoreTerminalModes = renderer.lib.restoreTerminalModes
  // @ts-expect-error - mocking for test
  renderer.lib.restoreTerminalModes = (...args: any[]) => {
    restoreTerminalModesCalls++
    originalRestoreTerminalModes.call(renderer.lib, ...args)
  }
})

afterEach(() => {
  // @ts-expect-error - restore mock
  renderer.lib.restoreTerminalModes = originalRestoreTerminalModes
  renderer.destroy()
})

describe("focus restore - terminal mode re-enable on focus-in", () => {
  test("restoreTerminalModes is called on focus-in event", async () => {
    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(restoreTerminalModesCalls).toBe(1)
  })

  test("restoreTerminalModes is NOT called on blur event", async () => {
    renderer.stdin.emit("data", Buffer.from("\x1b[O"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(restoreTerminalModesCalls).toBe(0)
  })

  test("restoreTerminalModes is called before focus event is emitted", async () => {
    const callOrder: string[] = []

    // Override spy to track ordering
    // @ts-expect-error - mocking for test
    renderer.lib.restoreTerminalModes = (...args: any[]) => {
      callOrder.push("restoreTerminalModes")
      originalRestoreTerminalModes.call(renderer.lib, ...args)
    }

    renderer.on("focus", () => {
      callOrder.push("focus-event")
    })

    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(callOrder).toEqual(["restoreTerminalModes", "focus-event"])
  })

  test("multiple focus-in events each trigger restoreTerminalModes", async () => {
    // Simulate: focus lost -> focus gained -> focus lost -> focus gained
    renderer.stdin.emit("data", Buffer.from("\x1b[O"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    renderer.stdin.emit("data", Buffer.from("\x1b[O"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(restoreTerminalModesCalls).toBe(2)
  })

  test("focus-in emits focus event on the renderer", async () => {
    const events: string[] = []

    renderer.on("focus", () => {
      events.push("focus")
    })

    renderer.on("blur", () => {
      events.push("blur")
    })

    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    renderer.stdin.emit("data", Buffer.from("\x1b[O"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(events).toEqual(["focus", "blur"])
  })

  test("focus events do not trigger keypress events", async () => {
    const keypresses: any[] = []

    renderer.keyInput.on("keypress", (event) => {
      keypresses.push(event)
    })

    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))
    renderer.stdin.emit("data", Buffer.from("\x1b[O"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(keypresses).toHaveLength(0)
  })

  test("mouse events work after focus restore cycle", async () => {
    renderer.start()

    const target = new TestRenderable(renderer, {
      position: "absolute",
      left: 0,
      top: 0,
      width: renderer.width,
      height: renderer.height,
    })
    renderer.root.add(target)
    await renderOnce()

    let mouseEventCount = 0
    target.onMouse = () => {
      mouseEventCount++
    }

    // Verify mouse works initially
    await mockMouse.click(5, 5)
    expect(mouseEventCount).toBeGreaterThan(0)

    const countBefore = mouseEventCount

    // Simulate focus loss and regain
    renderer.stdin.emit("data", Buffer.from("\x1b[O"))
    await new Promise((resolve) => setTimeout(resolve, 15))
    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    // Verify restoreTerminalModes was called
    expect(restoreTerminalModesCalls).toBe(1)

    // Verify mouse still works after focus restore
    await mockMouse.click(5, 5)
    expect(mouseEventCount).toBeGreaterThan(countBefore)

    renderer.root.remove(target.id)
  })

  test("keyboard input works after focus restore cycle", async () => {
    renderer.start()

    let keyEventCount = 0
    const onKeypress = () => {
      keyEventCount++
    }
    renderer.keyInput.on("keypress", onKeypress)

    // Verify keyboard works initially
    mockInput.pressKey("a")
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(keyEventCount).toBeGreaterThan(0)

    const countBefore = keyEventCount

    // Simulate focus loss and regain
    renderer.stdin.emit("data", Buffer.from("\x1b[O"))
    await new Promise((resolve) => setTimeout(resolve, 15))
    renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    await new Promise((resolve) => setTimeout(resolve, 15))

    // Verify keyboard still works after focus restore
    mockInput.pressKey("b")
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(keyEventCount).toBeGreaterThan(countBefore)

    renderer.keyInput.off("keypress", onKeypress)
  })

  test("rapid focus toggle does not cause issues", async () => {
    // Simulate rapid alt-tab back and forth
    for (let i = 0; i < 10; i++) {
      renderer.stdin.emit("data", Buffer.from("\x1b[O"))
      renderer.stdin.emit("data", Buffer.from("\x1b[I"))
    }
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(restoreTerminalModesCalls).toBe(10)
  })
})
