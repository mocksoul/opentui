#!/usr/bin/env bun

import { type KeyEvent } from "../lib/KeyHandler"
import { RGBA } from "../lib/RGBA"
import { type ThemeMode } from "../types"
import { createCliRenderer, type CliRenderer } from "../renderer"
import { BoxRenderable } from "../renderables/Box"
import { TextRenderable } from "../renderables/Text"
import { TextareaRenderable } from "../renderables/Textarea"
import { SelectRenderable, SelectRenderableEvents, type SelectOption } from "../renderables/Select"
import { FrameBufferRenderable } from "../renderables/FrameBuffer"
import { ASCIIFontRenderable } from "../renderables/ASCIIFont"
import { measureText } from "../lib/ascii.font"
import { isDenoRuntime } from "../runtime"
import { setupCommonDemoKeys } from "./lib/standalone-keys"

interface Example {
  name: string
  description: string
  modulePath: string
  is3d?: boolean
}

interface ExampleModule {
  run?: (renderer: CliRenderer) => void
  destroy?: (renderer: CliRenderer) => void
}

interface ExampleTheme {
  titleColor: RGBA
  borderColor: string
  focusedBorderColor: string
  inputTextColor: string
  inputFocusedTextColor: string
  inputPlaceholderColor: string
  inputCursorColor: string
  selectSelectedBackgroundColor: string
  selectTextColor: string
  selectSelectedTextColor: string
  selectDescriptionColor: string
  selectSelectedDescriptionColor: string
  instructionsColor: string
  notImplementedColor: string
}

const DEFAULT_THEME_MODE: ThemeMode = "dark"

const MENU_THEMES: Record<ThemeMode, ExampleTheme> = {
  dark: {
    titleColor: RGBA.fromInts(240, 248, 255, 255),
    borderColor: "#475569",
    focusedBorderColor: "#60A5FA",
    inputTextColor: "#E2E8F0",
    inputFocusedTextColor: "#F8FAFC",
    inputPlaceholderColor: "#94A3B8",
    inputCursorColor: "#60A5FA",
    selectSelectedBackgroundColor: "#1E3A5F",
    selectTextColor: "#E2E8F0",
    selectSelectedTextColor: "#38BDF8",
    selectDescriptionColor: "#64748B",
    selectSelectedDescriptionColor: "#94A3B8",
    instructionsColor: "#94A3B8",
    notImplementedColor: "#FACC15",
  },
  light: {
    titleColor: RGBA.fromInts(15, 23, 42, 255),
    borderColor: "#CBD5E1",
    focusedBorderColor: "#2563EB",
    inputTextColor: "#0F172A",
    inputFocusedTextColor: "#0B1221",
    inputPlaceholderColor: "#64748B",
    inputCursorColor: "#2563EB",
    selectSelectedBackgroundColor: "#DBEAFE",
    selectTextColor: "#0F172A",
    selectSelectedTextColor: "#1D4ED8",
    selectDescriptionColor: "#475569",
    selectSelectedDescriptionColor: "#1E40AF",
    instructionsColor: "#475569",
    notImplementedColor: "#B45309",
  },
}

const isDeno = isDenoRuntime()

const examples: Example[] = [
  {
    name: "Golden Star Demo",
    description: "3D golden star with particle effects and animated text celebrating 5000 stars",
    modulePath: "./golden-star-demo",
    is3d: true,
  },
  {
    name: "Mouse Interaction Demo",
    description: "Interactive mouse trails and clickable cells demonstration",
    modulePath: "./mouse-interaction-demo",
  },
  {
    name: "Text Selection Demo",
    description: "Text selection across multiple renderables with mouse drag",
    modulePath: "./text-selection-demo",
  },
  {
    name: "Text Truncation Demo",
    description: "Middle truncation with ellipsis - toggle with 'T' key and resize to test responsive behavior",
    modulePath: "./text-truncation-demo",
  },
  {
    name: "ASCII Font Selection Demo",
    description: "Text selection with ASCII fonts - precise character-level selection across different font types",
    modulePath: "./ascii-font-selection-demo",
  },
  { name: "Text Wrap Demo", description: "Text wrapping example", modulePath: "./text-wrap" },
  {
    name: "Console Demo",
    description: "Interactive console logging with clickable buttons for different log levels",
    modulePath: "./console-demo",
  },
  {
    name: "Styled Text Demo",
    description: "Template literals with styled text, colors, and formatting",
    modulePath: "./styled-text-demo",
  },
  {
    name: "Link Demo",
    description: "Hyperlink support with OSC 8 - clickable links and link inheritance in styled text",
    modulePath: "./link-demo",
  },
  {
    name: "Extmarks Demo",
    description: "Virtual extmarks - text ranges that cursor jumps over, like inline tags and links",
    modulePath: "./extmarks-demo",
  },
  {
    name: "Opacity Demo",
    description: "Box opacity and transparency effects with animated opacity transitions",
    modulePath: "./opacity-example",
  },
  {
    name: "TextNode Demo",
    description: "TextNode API for building complex styled text structures",
    modulePath: "./text-node-demo",
  },
  {
    name: "HAST Syntax Highlighting Demo",
    description: "Convert HAST trees to syntax-highlighted text with efficient chunk generation",
    modulePath: "./hast-syntax-highlighting-demo",
  },
  {
    name: "Code Demo",
    description:
      "Code viewer with line numbers, diff highlights, and diagnostics using CodeRenderable + LineNumberRenderable",
    modulePath: "./code-demo",
  },
  {
    name: "Diff Demo",
    description: "Unified and split diff views with syntax highlighting and multiple themes",
    modulePath: "./diff-demo",
  },
  {
    name: "Markdown Demo",
    description: "Markdown rendering with table alignment, syntax highlighting, and theme switching",
    modulePath: "./markdown-demo",
  },
  {
    name: "Live State Management Demo",
    description: "Test automatic renderer lifecycle management with live renderables",
    modulePath: "./live-state-demo",
  },
  {
    name: "Layout System Demo",
    description: "Flex layout system with multiple configurations",
    modulePath: "./simple-layout-example",
  },
  {
    name: "Input & Select Layout Demo",
    description: "Interactive layout with input and select elements",
    modulePath: "./input-select-layout-demo",
  },
  { name: "ASCII Font Demo", description: "ASCII font rendering with various colors and text", modulePath: "./fonts" },
  { name: "OpenTUI Demo", description: "Multi-tab demo with various features", modulePath: "./opentui-demo" },
  {
    name: "Nested Z-Index Demo",
    description: "Demonstrates z-index behavior with nested render objects",
    modulePath: "./nested-zindex-demo",
  },
  {
    name: "Relative Positioning Demo",
    description: "Shows how child positions are relative to their parent containers",
    modulePath: "./relative-positioning-demo",
  },
  {
    name: "Transparency Demo",
    description: "Alpha blending and transparency effects demonstration",
    modulePath: "./transparency-demo",
  },
  {
    name: "Draggable ThreeRenderable",
    description: "Draggable WebGPU cube with live animation",
    modulePath: "./draggable-three-demo",
    is3d: true,
  },
  {
    name: "Static Sprite",
    description: "Static sprite rendering demo",
    modulePath: "./static-sprite-demo",
    is3d: true,
  },
  {
    name: "Sprite Animation",
    description: "Animated sprite sequences",
    modulePath: "./sprite-animation-demo",
    is3d: true,
  },
  {
    name: "Sprite Particles",
    description: "Particle system with sprites",
    modulePath: "./sprite-particle-generator-demo",
    is3d: true,
  },
  { name: "Framebuffer Demo", description: "Framebuffer rendering techniques", modulePath: "./framebuffer-demo" },
  {
    name: "Texture Loading",
    description: "Loading and displaying textures",
    modulePath: "./texture-loading-demo",
    is3d: true,
  },
  { name: "ScrollBox Demo", description: "Scrollable container with customization", modulePath: "./scroll-example" },
  {
    name: "Sticky Scroll Demo",
    description: "ScrollBox with sticky scroll behavior - maintains position at borders when content changes",
    modulePath: "./sticky-scroll-example",
  },
  {
    name: "Scrollbox Mouse Test",
    description: "Test scrollbox mouse hit detection with hover and click events",
    modulePath: "./scrollbox-mouse-test",
  },
  {
    name: "Scrollbox Overlay Hit Test",
    description: "Test scrollbox hit detection with overlays and dialogs",
    modulePath: "./scrollbox-overlay-hit-test",
  },
  { name: "Shader Cube", description: "3D cube with custom shaders", modulePath: "./shader-cube-demo", is3d: true },
  {
    name: "Fractal Shader",
    description: "Fractal rendering with shaders",
    modulePath: "./fractal-shader-demo",
    is3d: true,
  },
  { name: "Phong Lighting", description: "Phong lighting model demo", modulePath: "./lights-phong-demo", is3d: true },
  {
    name: "Physics Planck",
    description: "2D physics with Planck.js",
    modulePath: "./physx-planck-2d-demo",
    is3d: true,
  },
  { name: "Physics Rapier", description: "2D physics with Rapier", modulePath: "./physx-rapier-2d-demo", is3d: true },
  { name: "Timeline Example", description: "Animation timeline system", modulePath: "./timeline-example" },
  { name: "Tab Select", description: "Tab selection demo", modulePath: "./tab-select-demo" },
  {
    name: "Select Demo",
    description: "Interactive SelectElement demo with customizable options",
    modulePath: "./select-demo",
  },
  {
    name: "Input Demo",
    description: "Interactive InputElement demo with validation and multiple fields",
    modulePath: "./input-demo",
  },
  {
    name: "Terminal Palette Demo",
    description: "Terminal color palette detection and visualization - fetch and display all 256 terminal colors",
    modulePath: "./terminal",
  },
  {
    name: "Terminal Title Demo",
    description: "Set and cycle terminal window titles using OSC escape sequences",
    modulePath: "./terminal-title",
  },
  {
    name: "Editor Demo",
    description: "Interactive text editor with TextareaRenderable - supports full editing capabilities",
    modulePath: "./editor-demo",
  },
  {
    name: "Slider Demo",
    description: "Interactive slider components with various orientations and configurations",
    modulePath: "./slider-demo",
  },
  {
    name: "VNode Composition Demo",
    description: "Declarative Box(Box(Box(children))) composition",
    modulePath: "./vnode-composition-demo",
  },
  {
    name: "Full Unicode Demo",
    description: "Draggable boxes and background filled with complex graphemes",
    modulePath: "./full-unicode-demo",
  },
  {
    name: "Split Mode Demo (Experimental)",
    description: "Renderer confined to bottom area with normal terminal output above",
    modulePath: "./split-mode-demo",
  },
  {
    name: "Keypress Debug Tool",
    description: "Debug tool to inspect keypress events, raw input, and terminal capabilities",
    modulePath: "./keypress-debug-demo",
  },
  {
    name: "Grayscale Buffer",
    description: "Grayscale buffer rendering with 1x vs 2x supersampled intensity",
    modulePath: "./grayscale-buffer-demo",
  },
  {
    name: "Focus Restore Demo",
    description: "Test focus restore - alt-tab away and back to verify mouse tracking resumes",
    modulePath: "./focus-restore-demo",
  },
]

class ExampleSelector {
  private renderer: CliRenderer
  private currentExample: Example | null = null
  private currentExampleModule: ExampleModule | null = null
  private inMenu = true
  private themeMode: ThemeMode = DEFAULT_THEME_MODE

  private menuContainer: BoxRenderable | null = null
  private title: ASCIIFontRenderable | null = null
  private filterBox: BoxRenderable | null = null
  private filterInput: TextareaRenderable | null = null
  private instructions: TextRenderable | null = null
  private selectElement: SelectRenderable | null = null
  private selectBox: BoxRenderable | null = null
  private notImplementedText: TextRenderable | null = null
  private allExamples: Example[] = isDeno ? examples.filter((e) => !e.is3d) : examples

  constructor(renderer: CliRenderer) {
    this.renderer = renderer
    this.themeMode = this.renderer.themeMode ?? DEFAULT_THEME_MODE
    this.createLayout()
    this.setupKeyboardHandling()

    this.renderer.on("theme_mode", (mode: ThemeMode) => {
      this.applyTheme(mode)
      console.log(`Theme mode changed to ${mode}, applied new theme to menu`)
    })

    this.applyTheme(this.renderer.themeMode)

    this.renderer.on("resize", (width: number, height: number) => {
      this.handleResize(width, height)
    })
  }

  private createLayout(): void {
    const width = this.renderer.terminalWidth
    const theme = MENU_THEMES[this.themeMode]

    // Menu container with column layout
    this.menuContainer = new BoxRenderable(renderer, {
      id: "example-menu-container",
      flexDirection: "column",
      width: "100%",
      height: "100%",
    })
    this.renderer.root.add(this.menuContainer)

    // Title
    const titleText = "OPENTUI EXAMPLES"
    const titleFont = "tiny"
    const { width: titleWidth } = measureText({ text: titleText, font: titleFont })
    const centerX = Math.floor(width / 2) - Math.floor(titleWidth / 2)

    this.title = new ASCIIFontRenderable(renderer, {
      id: "example-index-title",
      left: centerX,
      margin: 1,
      text: titleText,
      font: titleFont,
      color: theme.titleColor,
      backgroundColor: "transparent",
    })
    this.menuContainer.add(this.title)

    // Filter box with border (grows with content)
    this.filterBox = new BoxRenderable(renderer, {
      id: "example-index-filter-box",
      marginLeft: 1,
      marginRight: 1,
      flexShrink: 0,
      backgroundColor: "transparent",
      border: true,
      borderStyle: "single",
      borderColor: theme.borderColor,
    })
    this.menuContainer.add(this.filterBox)

    // Filter input inside the box (transparent bg so box bg shows through)
    this.filterInput = new TextareaRenderable(renderer, {
      id: "example-index-filter-input",
      width: "100%",
      height: 1,
      placeholder: "Filter examples by title...",
      placeholderColor: theme.inputPlaceholderColor,
      backgroundColor: "transparent",
      focusedBackgroundColor: "transparent",
      textColor: theme.inputTextColor,
      focusedTextColor: theme.inputFocusedTextColor,
      wrapMode: "none",
      showCursor: true,
      cursorColor: theme.inputCursorColor,
      onContentChange: () => {
        this.filterExamples()
      },
    })
    this.filterBox.add(this.filterInput)
    this.filterInput.focus()

    // Select box (grows to fill remaining space)
    this.selectBox = new BoxRenderable(renderer, {
      id: "example-selector-box",
      marginLeft: 1,
      marginRight: 1,
      marginBottom: 1,
      flexGrow: 1,
      borderStyle: "single",
      borderColor: theme.borderColor,
      focusedBorderColor: theme.focusedBorderColor,
      title: "Examples",
      titleAlignment: "center",
      backgroundColor: "transparent",
      shouldFill: true,
      border: true,
    })
    this.menuContainer.add(this.selectBox)

    // Select element
    const selectOptions: SelectOption[] = this.allExamples.map((example) => ({
      name: example.name,
      description: example.description,
      value: example,
    }))

    this.selectElement = new SelectRenderable(renderer, {
      id: "example-selector",
      height: "100%",
      options: selectOptions,
      backgroundColor: "transparent",
      focusedBackgroundColor: "transparent",
      selectedBackgroundColor: theme.selectSelectedBackgroundColor,
      textColor: theme.selectTextColor,
      selectedTextColor: theme.selectSelectedTextColor,
      descriptionColor: theme.selectDescriptionColor,
      selectedDescriptionColor: theme.selectSelectedDescriptionColor,
      showScrollIndicator: true,
      wrapSelection: true,
      showDescription: true,
      fastScrollStep: 5,
    })
    this.selectBox.add(this.selectElement)

    this.selectElement.on(SelectRenderableEvents.ITEM_SELECTED, (index: number, option: SelectOption) => {
      void this.runSelected(option.value as Example)
    })

    // Instructions at the bottom
    this.instructions = new TextRenderable(renderer, {
      id: "example-index-instructions",
      height: 1,
      flexShrink: 0,
      alignSelf: "center",
      content: "Type to filter | ↑↓/j/k navigate | Enter run | Esc clear/return | ctrl+c quit",
      fg: theme.instructionsColor,
    })
    this.menuContainer.add(this.instructions)
  }

  private applyTheme(mode: ThemeMode | null): void {
    this.themeMode = mode ?? DEFAULT_THEME_MODE
    const theme = MENU_THEMES[this.themeMode]

    if (this.title) {
      this.title.color = theme.titleColor
    }

    if (this.filterBox) {
      this.filterBox.borderColor = theme.borderColor
    }

    if (this.filterInput) {
      this.filterInput.textColor = theme.inputTextColor
      this.filterInput.focusedTextColor = theme.inputFocusedTextColor
      this.filterInput.placeholderColor = theme.inputPlaceholderColor
      this.filterInput.cursorColor = theme.inputCursorColor
    }

    if (this.selectBox) {
      this.selectBox.borderColor = theme.borderColor
      this.selectBox.focusedBorderColor = theme.focusedBorderColor
    }

    if (this.selectElement) {
      this.selectElement.selectedBackgroundColor = theme.selectSelectedBackgroundColor
      this.selectElement.textColor = theme.selectTextColor
      this.selectElement.selectedTextColor = theme.selectSelectedTextColor
      this.selectElement.descriptionColor = theme.selectDescriptionColor
      this.selectElement.selectedDescriptionColor = theme.selectSelectedDescriptionColor
    }

    if (this.instructions) {
      this.instructions.fg = theme.instructionsColor
    }

    if (this.notImplementedText) {
      this.notImplementedText.fg = theme.notImplementedColor
    }

    this.renderer.requestRender()
  }

  private filterExamples(): void {
    if (!this.filterInput || !this.selectElement) return

    const filterText = this.filterInput.editBuffer.getText().toLowerCase().trim()

    if (filterText === "") {
      // Show all examples
      const selectOptions: SelectOption[] = this.allExamples.map((example) => ({
        name: example.name,
        description: example.description,
        value: example,
      }))
      this.selectElement.options = selectOptions
    } else {
      // Filter by title only
      const filtered = this.allExamples.filter((example) => example.name.toLowerCase().includes(filterText))
      const selectOptions: SelectOption[] = filtered.map((example) => ({
        name: example.name,
        description: example.description,
        value: example,
      }))
      this.selectElement.options = selectOptions
    }
  }

  private handleResize(width: number, height: number): void {
    if (this.title) {
      const titleWidth = this.title.frameBuffer.width
      const centerX = Math.floor(width / 2) - Math.floor(titleWidth / 2)
      this.title.x = centerX
    }

    this.renderer.requestRender()
  }

  private setupKeyboardHandling(): void {
    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (key.name === "c" && key.ctrl) {
        this.cleanup()
        return
      }

      if (!this.inMenu) {
        switch (key.name) {
          case "escape":
            this.returnToMenu()
            break
        }
        return
      }

      // Forward navigation keys to select even when filter is focused
      if (this.filterInput?.focused && this.selectElement) {
        // Navigation keys: arrow up/down, j/k, shift variants
        if (key.name === "up" || key.name === "k") {
          key.preventDefault()
          if (key.shift) {
            this.selectElement.moveUp(5)
          } else {
            this.selectElement.moveUp(1)
          }
          return
        }
        if (key.name === "down" || key.name === "j") {
          key.preventDefault()
          if (key.shift) {
            this.selectElement.moveDown(5)
          } else {
            this.selectElement.moveDown(1)
          }
          return
        }
        // Enter to select
        if (key.name === "return" || key.name === "linefeed") {
          key.preventDefault()
          this.selectElement.selectCurrent()
          return
        }
      }

      // Handle Escape: clear filter if has content
      if (key.name === "escape") {
        if (this.filterInput) {
          const filterText = this.filterInput.editBuffer.getText()
          if (filterText.length > 0) {
            key.preventDefault()
            this.filterInput.editBuffer.setText("")
            this.filterExamples()
            return
          }
        }
      }

      if (key.name === "c" && key.ctrl) {
        this.cleanup()
        return
      }
      switch (key.name) {
        case "c":
          console.log("Capabilities:", this.renderer.capabilities)
          break
        case "z":
          if (key.ctrl) {
            console.log("Suspending renderer... (will auto-resume in 5 seconds)")
            this.renderer.suspend()
            setTimeout(() => {
              console.log("Resuming renderer...")
              this.renderer.resume()
            }, 5000)
          }
          break
      }
    })
    setupCommonDemoKeys(this.renderer)
  }

  private async runSelected(selected: Example): Promise<void> {
    this.inMenu = false
    this.hideMenuElements()

    this.currentExample = selected
    this.currentExampleModule = null

    try {
      const module = (await import(selected.modulePath)) as ExampleModule
      this.currentExampleModule = module

      if (module.run) {
        module.run(this.renderer)
      } else {
        this.showExampleError(`${selected.name} not yet implemented. Press Escape to return.`)
      }
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.showExampleError(`${selected.name} failed to load: ${message}`)
      return
    }
  }

  private showExampleError(content: string): void {
    if (!this.notImplementedText) {
      const theme = MENU_THEMES[this.themeMode]
      this.notImplementedText = new TextRenderable(this.renderer, {
        id: "not-implemented",
        position: "absolute",
        left: 2,
        top: 2,
        width: "95%",
        content,
        fg: theme.notImplementedColor,
        zIndex: 10,
      })
      this.renderer.root.add(this.notImplementedText)
    } else {
      this.notImplementedText.content = content
    }

    this.renderer.requestRender()
  }

  private hideMenuElements(): void {
    if (this.menuContainer) {
      this.menuContainer.visible = false
    }
    if (this.title) {
      this.title.visible = false
    }
    if (this.filterBox) {
      this.filterBox.visible = false
    }
    if (this.selectBox) {
      this.selectBox.visible = false
    }
    if (this.instructions) {
      this.instructions.visible = false
    }
    if (this.filterInput) {
      this.filterInput.blur()
    }
    if (this.selectElement) {
      this.selectElement.blur()
    }
  }

  private showMenuElements(): void {
    if (this.menuContainer) {
      this.menuContainer.visible = true
    }
    if (this.title) {
      this.title.visible = true
    }
    if (this.filterBox) {
      this.filterBox.visible = true
    }
    if (this.selectBox) {
      this.selectBox.visible = true
    }
    if (this.instructions) {
      this.instructions.visible = true
    }
    if (this.filterInput) {
      // Clear filter when returning to menu
      this.filterInput.editBuffer.setText("")
      this.filterInput.focus()
    }
    // Reset filter to show all examples
    this.filterExamples()
  }

  private returnToMenu(): void {
    if (this.currentExample) {
      this.currentExampleModule?.destroy?.(this.renderer)
      this.currentExample = null
      this.currentExampleModule = null
    }

    if (this.notImplementedText) {
      this.renderer.root.remove(this.notImplementedText.id)
      this.notImplementedText = null
    }

    this.inMenu = true
    this.restart()
  }

  private restart(): void {
    this.renderer.pause()
    this.renderer.auto()
    this.showMenuElements()
    this.renderer.setBackgroundColor("transparent")
    this.renderer.requestRender()
  }

  private cleanup(): void {
    if (this.currentExample) {
      this.currentExampleModule?.destroy?.(this.renderer)
    }
    if (this.filterInput) {
      this.filterInput.blur()
    }
    if (this.selectElement) {
      this.selectElement.blur()
    }
    if (this.menuContainer) {
      this.menuContainer.destroy()
    }
    this.renderer.destroy()
  }
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  targetFps: 60,
  // useAlternateScreen: false,
})

renderer.setBackgroundColor("transparent")
new ExampleSelector(renderer)
