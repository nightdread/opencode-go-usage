import { createSignal } from "solid-js"
import { ComposerPill, Plugin } from "@opencode/plugin/gui"

type Meter = { status?: string; percent?: number; resetsAt?: string }
type Usage = { rolling?: Meter; weekly?: Meter; monthly?: Meter }

const METERS: [keyof Usage, string][] = [
  ["rolling", "5ч"],
  ["weekly", "нед"],
  ["monthly", "мес"],
]

export default Plugin.define({
  setup(ctx) {
    const [usage, setUsage] = createSignal<Usage>()
    const [gone, setGone] = createSignal("")

    const apiKey = async (): Promise<string | undefined> => {
      try {
        let list: unknown = await (ctx.client as { credential: { list(): Promise<unknown> } }).credential.list()
        if (list && !Array.isArray(list) && Array.isArray((list as { data: unknown }).data)) {
          list = (list as { data: unknown[] }).data
        }
        if (!Array.isArray(list)) return
        const entry = list.find((c) => c?.integrationID === "opencode-go" && c.active !== false)
        const value = entry?.value
        if (typeof value === "string") return JSON.parse(value).key
        return value?.key
      } catch (error) {
        ctx.log?.write?.("warn", "go-usage: credential list failed: " + String(error))
        setGone(String(error))
      }
    }

    const refresh = async () => {
      const key = await apiKey()
      if (!key) return
      try {
        const response = await fetch("https://opencode.ai/inference/go/v1/usage", {
          headers: { Authorization: "Bearer " + key },
        })
        if (!response.ok) {
          setGone("HTTP " + response.status)
          return
        }
        const body = await response.json()
        if (body?.usage) setUsage(body.usage)
      } catch (error) {
        ctx.log?.write?.("warn", "go-usage: usage fetch failed: " + String(error))
        setGone(String(error))
      }
    }

    const when = (meter?: Meter, withDate = true) => {
      if (!meter?.resetsAt) return ""
      const sameDay = new Date(meter.resetsAt).toDateString() === new Date().toDateString()
      const options: Intl.DateTimeFormatOptions = withDate || !sameDay
        ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
        : { hour: "2-digit", minute: "2-digit" }
      return new Date(meter.resetsAt).toLocaleString([], options)
    }
    const tone = (u?: Usage) => {
      const peak = Math.max(...METERS.map(([key]) => u?.[key]?.percent ?? 0))
      return peak > 85 ? "danger" : peak > 65 ? "warning" : "success"
    }

    ctx.add(ComposerPill, {
      id: "usage",
      show: () => {
        const u = usage()
        if (!u) return gone() ? { label: "Go: нет данных", tone: "warning", title: "Лимиты Go недоступны: " + gone() } : undefined
        return {
          label: "Go " + METERS.map(([key, short]) => `${short} ${u[key]?.percent ?? "?"}%`).join(" · "),
          tone: tone(u),
          title: "Использование OpenCode Go (5-часовое окно / неделя / месяц)",
          rows: METERS.map(([key, short]) => ({
            id: key,
            label: { rolling: "5-часовое окно", weekly: "Недельный лимит", monthly: "Месячный лимит" }[key] + ": " + (u[key]?.percent ?? "?") + "%",
            tone: u[key]?.status === "rate-limited" ? "danger" : "success",
            // 5-часовое окно сбрасывается сегодня — достаточно времени; неделя и месяц — всегда с датой.
            detail: u[key]?.resetsAt ? "сброс " + when(u[key], key !== "rolling") : "",
            icon: u[key]?.status === "rate-limited" ? "circle-x" : "circle-check",
          })),
        }
      },
    })

    void refresh()
    const timer = setInterval(() => void refresh(), 5 * 60_000)
    return () => clearInterval(timer)
  },
})
