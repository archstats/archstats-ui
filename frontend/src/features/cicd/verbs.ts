// One colour per verb, so a strip of them reads at a glance: the orange
// accent is kept for deploy, where a pipeline reaches production.

export const VERB_TONE: Record<string, string> = {
  checkout: "bg-neutral-300",
  setup: "bg-neutral-300",
  build: "bg-neutral-500",
  test: "bg-blue-500",
  scan: "bg-violet-500",
  package: "bg-amber-400",
  publish: "bg-amber-600",
  deploy: "bg-accent-500",
  approve: "bg-green-600",
  other: "bg-neutral-200",
}

export const VERB_TEXT: Record<string, string> = {
  checkout: "text-neutral-500",
  setup: "text-neutral-500",
  build: "text-neutral-700",
  test: "text-blue-700",
  scan: "text-violet-700",
  package: "text-amber-700",
  publish: "text-amber-800",
  deploy: "text-accent-600",
  approve: "text-green-700",
  other: "text-neutral-500",
}
