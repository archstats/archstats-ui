// Finding a common query by a question's words. The recipes themselves are
// the snapshot's (features/snapshot/recipes.ts).

import { words } from "./capabilities"
import { RECIPES, type Recipe } from "~/features/snapshot/recipes"

export { RECIPES, bindRecipe, recipe, type CookbookParam, type Recipe } from "~/features/snapshot/recipes"

/** Recipes the snapshot can run, best first for a question. */
export function searchRecipes(question: string, tables: Record<string, string[]>, limit = 3): Recipe[] {
    const q = new Set(words(question))
    return RECIPES
        .filter(r => r.needs.every(t => t in tables))
        .map(r => {
            const bag = new Set(words([r.question, ...r.also, r.id.replace(/-/g, " ")].join(" ")))
            let s = 0
            for (const w of q) if (bag.has(w)) s += 1
            return { r, s }
        })
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map(x => x.r)
}

