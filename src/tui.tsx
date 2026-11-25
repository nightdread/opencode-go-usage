import { Plugin } from "@opencode/plugin/tui"

// Десктоп-приложение грузит только GUI-часть; пустой TUI-эндпоинт нужен,
// чтобы `opencode plugin add` принял пакет без серверной части.
export default Plugin.define({
  id: "go-usage",
  setup() {},
})
