import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

// A canvas that fills its box at the screen's pixel density. `size` is the
// CSS size; `context()` returns a 2D context already scaled so drawing code
// works in CSS pixels. The overviews draw thousands of marks, which SVG
// cannot redraw at pointer speed.

export function useCanvas(box: Ref<HTMLElement | null>, canvas: Ref<HTMLCanvasElement | null>) {
  const size = ref({ w: 0, h: 0 });
  let observer: ResizeObserver | null = null;

  function measure() {
    const el = box.value;
    const c = canvas.value;
    if (!el || !c) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    size.value = { w, h };
  }

  function context(): CanvasRenderingContext2D | null {
    const c = canvas.value;
    const ctx = c?.getContext("2d") ?? null;
    if (!ctx || !c) return null;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    return ctx;
  }

  /** Pointer position in CSS pixels relative to the canvas. */
  function local(event: MouseEvent): { x: number; y: number } {
    const r = canvas.value!.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  onMounted(() => {
    measure();
    observer = new ResizeObserver(measure);
    if (box.value) observer.observe(box.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  return { size, context, local };
}
