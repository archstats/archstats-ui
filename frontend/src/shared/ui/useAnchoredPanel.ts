import { onBeforeUnmount, ref, watch, type Ref } from "vue";

/**
 * A dropdown placed against its trigger in viewport coordinates.
 *
 * An absolutely-positioned menu is only as visible as its ancestors allow,
 * and in a real layout one of them is always a scroller. The metrics plot's
 * control row is `overflow-x-auto` so that its controls can scroll on a
 * narrow window — and CSS will not let one axis scroll while the other stays
 * visible, so the row clipped vertically too and every axis menu opened
 * inside a forty-pixel-tall box. Nothing was above anything in z-order; the
 * menu was simply cut off.
 *
 * Teleported to the body and positioned as fixed, a menu has no ancestors
 * left to be cut off by. It still has to be told where its trigger is.
 */
export function useAnchoredPanel(
  trigger: Ref<HTMLElement | null>,
  open: Ref<boolean>,
  align: "left" | "right" = "left",
) {
  /** Placement only: the panel decides its own height from `space`. */
  const style = ref<Record<string, string>>({});
  /** Room in the direction it opened, so a list can cap itself honestly. */
  const space = ref(320);

  const GAP = 4;
  const EDGE = 8;
  /** Below this it is worth opening upwards instead. */
  const ROOM = 200;

  function place() {
    const el = trigger.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const down = below >= ROOM || below >= above;
    space.value = Math.max(120, Math.round(down ? below : above));

    const next: Record<string, string> = {
      position: "fixed",
      minWidth: `${Math.round(r.width)}px`,
      zIndex: "70",
    };
    if (down) next.top = `${Math.round(r.bottom + GAP)}px`;
    else next.bottom = `${Math.round(window.innerHeight - r.top + GAP)}px`;
    if (align === "right") next.right = `${Math.round(window.innerWidth - r.right)}px`;
    else next.left = `${Math.round(r.left)}px`;
    style.value = next;
  }

  // A trigger can move under an open panel — a toolbar scrolled sideways, a
  // pane dragged wider — so the panel follows rather than being left behind.
  const follow = () => { if (open.value) place(); };
  const listen = (on: boolean) => {
    const fn = on ? window.addEventListener : window.removeEventListener;
    fn("scroll", follow, true);
    fn("resize", follow);
  };

  watch(open, isOpen => {
    if (isOpen) { place(); listen(true); } else listen(false);
  });
  onBeforeUnmount(() => listen(false));

  return { style, space, place };
}
