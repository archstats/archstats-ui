import { describe, expect, it } from "vitest"
import { hopsOf, walkNextHops } from "./hops"

describe("hopsOf", () => {
  it("counts the steps on a path, not the components", () => {
    expect(hopsOf("a -> b")).toBe(1)
    expect(hopsOf("a -> b -> c -> d")).toBe(3)
  })
  it("falls back to the stored number without a path", () => {
    expect(hopsOf(null, 4)).toBe(4)
    expect(hopsOf("", "2")).toBe(2)
  })
})

describe("walkNextHops", () => {
  // Towards d: a -> b -> c -> d, and e does not reach it.
  const towardsD = new Map([["a", "b"], ["b", "c"], ["c", "d"]])

  it("spells the route from the first step of each pair", () => {
    expect(walkNextHops(towardsD, "a", "d")).toEqual(["a", "b", "c", "d"])
    expect(walkNextHops(towardsD, "c", "d")).toEqual(["c", "d"])
  })

  it("is empty when there is no route", () => {
    expect(walkNextHops(towardsD, "e", "d")).toEqual([])
    expect(walkNextHops(towardsD, "d", "d")).toEqual([])
  })

  it("stops rather than loop on rows that disagree", () => {
    expect(walkNextHops(new Map([["a", "b"], ["b", "a"]]), "a", "d")).toEqual([])
  })
})
