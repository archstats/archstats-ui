import { computed, ref, watch } from "vue";

export type Platform = "darwin" | "windows" | "linux" | "web";

// One shared platform value for the whole shell. Wails reports the real OS
// through its runtime; outside Wails (tests, headless captures) we fall back to
// the navigator so macOS captures still show the macOS chrome.
const platform = ref<Platform>(guess());
let resolved = false;

function guess(): Platform {
  if (typeof navigator === "undefined") return "web";
  const p = navigator.platform || "";
  if (/Mac/i.test(p)) return "darwin";
  if (/Win/i.test(p)) return "windows";
  if (/Linux/i.test(p)) return "linux";
  return "web";
}

export function usePlatform() {
  if (!resolved && typeof window !== "undefined") {
    resolved = true;
    const rt = (window as any).runtime;
    if (rt?.Environment) {
      rt.Environment().then((env: { platform?: string }) => {
        if (env?.platform === "darwin" || env?.platform === "windows" || env?.platform === "linux") platform.value = env.platform;
      }).catch(() => {});
    }
    watch(platform, (p) => { document.documentElement.dataset.platform = p; }, { immediate: true });
  }
  return {
    platform,
    isMac: computed(() => platform.value === "darwin"),
  };
}
