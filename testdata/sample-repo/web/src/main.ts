import { add } from "./util";
import type { Total } from "./util";

export async function load(): Promise<number> {
  const res = await fetch("/orders/1");
  const body: Total = await res.json();
  return add(body.total, 1);
}
