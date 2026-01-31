import { createSignal, Show } from "solid-js"
import { render, useKeyboard, useRenderer } from "@opentui/solid"
import { t } from "@opentui/core"

process.env.DEBUG = "true"

const EmptyStyledTextTest = () => {
  const renderer = useRenderer()

  renderer.useConsole = true
  renderer.console.show()

  return (
    <box border title="first">
      <box id="first"/>
      <box id="second"/>
    </box>
  )
}

render(EmptyStyledTextTest)
