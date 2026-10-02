// Every exhibit Archstats can make, listed once and registered with the
// engine on import. Adding one: write its definition next to its component
// (features/<feature>/exhibits/), list it here, and the contract test holds
// it to the rules.

import { folders } from "~/features/checks/exhibits/folders"
import { stack } from "~/features/checks/exhibits/stack"
import { neighbours } from "~/features/connections/exhibits/neighbours"
import { cycles } from "~/features/cycles/exhibits/cycles"
import { tangle } from "~/features/cycles/exhibits/tangle"
import { deployables } from "~/features/deployables/exhibits/deployables"
import { activity } from "~/features/git/exhibits/activity"
import { authors } from "~/features/git/exhibits/authors"
import { cochange } from "~/features/git/exhibits/cochange"
import { knowledge } from "~/features/git/exhibits/knowledge"
import { ranking } from "~/features/metrics/exhibits/ranking"
import { rules } from "~/features/rules/exhibits/rules"
import { excerpt, files, matches, names } from "./generic/code"
import { profile } from "./generic/profile"
import { recipeExhibit } from "./generic/recipe"
import { conventions } from "~/features/landmarks/exhibits/conventions"
import { data } from "~/features/landmarks/exhibits/data"
import { docs } from "~/features/landmarks/exhibits/docs"
import { entries } from "~/features/landmarks/exhibits/entries"
import { implementations } from "~/features/landmarks/exhibits/implementations"
import { map } from "~/features/landmarks/exhibits/map"
import { notes } from "~/features/landmarks/exhibits/notes"
import { origins } from "~/features/landmarks/exhibits/origins"
import { surface } from "~/features/landmarks/exhibits/surface"
import { surprises } from "~/features/landmarks/exhibits/surprises"
import { trace } from "~/features/landmarks/exhibits/trace"
import { registerExhibits } from "~/features/exhibits/engine"
import type { ExhibitDef } from "~/features/exhibits/types"

export const CATALOG: readonly ExhibitDef[] = [
    profile, stack, tangle, cycles, neighbours, folders, ranking,
    activity, cochange, authors, knowledge,
    files, excerpt, matches, names,
    deployables, rules, recipeExhibit,
    map, entries, trace, data, surface, implementations, origins, docs, conventions, surprises, notes,
]

registerExhibits(CATALOG)
