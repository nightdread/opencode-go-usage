import { createSignal } from "solid-js"
import { ComposerPill, Plugin } from "@opencode/plugin/gui"

type Meter = { status?: string; percent?: number; resetsAt?: string }
type Usage = { rolling?: Meter; weekly?: Meter; monthly?: Meter }

const METERS: [keyof Usage, string, string][] = [
  ["rolling", "pill.short.five", "row.five"],
  ["weekly", "pill.short.week", "row.week"],
  ["monthly", "pill.short.month", "row.month"],
]

export default Plugin.define({
  i18n: {
    en: {
      "pill.title": "OpenCode Go usage (5-hour / weekly / monthly)",
      "pill.short.five": "5h",
      "pill.short.week": "wk",
      "pill.short.month": "mo",
      "row.five": "5-hour window",
      "row.week": "Weekly limit",
      "row.month": "Monthly limit",
      "row.reset": "resets",
      "pill.nodata": "Go: no data",
    },
    ru: {
      "pill.title": "Использование OpenCode Go (5-часовое окно / неделя / месяц)",
      "pill.short.five": "5ч",
      "pill.short.week": "нед",
      "pill.short.month": "мес",
      "row.five": "5-часовое окно",
      "row.week": "Недельный лимит",
      "row.month": "Месячный лимит",
      "row.reset": "сброс",
      "pill.nodata": "Go: нет данных",
    },
  },
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
        if (!u) return gone() ? { label: ctx.t("pill.nodata"), tone: "warning", title: ctx.t("pill.title") } : undefined
        return {
          label: "Go " + METERS.map(([, short, key]) => `${ctx.t(short)} ${u[key]?.percent ?? "?"}%`).join(" · "),
          tone: tone(u),
          title: ctx.t("pill.title"),
          rows: METERS.map(([key, , row]) => ({
            id: key,
            label: ctx.t(row) + ": " + (u[key]?.percent ?? "?") + "%",
            tone: u[key]?.status === "rate-limited" ? "danger" : "success",
            // 5-часовое окно сбрасывается сегодня — достаточно времени; неделя и месяц — всегда с датой.
            detail: u[key]?.resetsAt ? ctx.t("row.reset") + " " + when(u[key], key !== "rolling") : "",
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
