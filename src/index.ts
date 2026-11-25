import { Plugin } from "@opencode/plugin"

// Пустая серверная часть: без неё `opencode plugin add` в старых версиях
// не принимает пакет только с GUI-частью (до поддержки GUI-эндпоинтов).
export default Plugin.define({
  id: "go-usage",
  async setup() {},
})
