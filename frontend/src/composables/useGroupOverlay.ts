import { computed } from 'vue'
import { useGroupsStore, type SavedGroup } from '~/stores/groups'

/**
 * Composable that provides group-aware color mapping and membership lookups
 * for any view rendering components or files.
 *
 * Usage:
 *   const { getColor, getGroups, getGradient, isInAnyGroup, groupLegend } = useGroupOverlay('component')
 */
export function useGroupOverlay(type: 'component' | 'file') {
    const groupsStore = useGroupsStore()

    const index = computed(() => {
        return type === 'component'
            ? groupsStore.componentGroupIndex
            : groupsStore.fileGroupIndex
    })

    const groups = computed(() => {
        return type === 'component'
            ? groupsStore.allComponentGroups
            : groupsStore.allFileGroups
    })

    /**
     * Returns the primary group color for an entity, or null if it belongs to no group.
     */
    function getColor(name: string): string | null {
        const memberGroups = index.value.get(name)
        if (!memberGroups || memberGroups.length === 0) return null
        return memberGroups[0].color
    }

    /**
     * Returns all groups that contain this entity.
     */
    function getGroups(name: string): SavedGroup[] {
        return index.value.get(name) || []
    }

    /**
     * Returns a CSS linear-gradient string if the entity belongs to multiple groups,
     * or a solid color if it belongs to one, or a default neutral color if ungrouped.
     */
    function getGradient(name: string, defaultColor: string = 'hsl(215, 15%, 75%)'): string {
        const memberGroups = index.value.get(name)
        if (!memberGroups || memberGroups.length === 0) return defaultColor
        if (memberGroups.length === 1) return memberGroups[0].color

        // Build equal-stop gradient from all group colors
        const stops = memberGroups.map((g, i) => {
            const start = (i / memberGroups.length) * 100
            const end = ((i + 1) / memberGroups.length) * 100
            return `${g.color} ${start}%, ${g.color} ${end}%`
        })
        return `linear-gradient(135deg, ${stops.join(', ')})`
    }

    /**
     * Returns true if the entity is a member of at least one group.
     */
    function isInAnyGroup(name: string): boolean {
        const memberGroups = index.value.get(name)
        return !!memberGroups && memberGroups.length > 0
    }

    /**
     * A reactive legend array suitable for rendering a group color legend in views.
     */
    const groupLegend = computed(() => {
        return groups.value.map(g => ({
            id: g.id,
            name: g.name,
            color: g.color,
            count: g.members.length,
        }))
    })

    /**
     * Returns the count of how many of the given entity names are in any group.
     */
    function countGrouped(names: string[]): number {
        let count = 0
        for (const name of names) {
            if (index.value.has(name)) count++
        }
        return count
    }

    return {
        getColor,
        getGroups,
        getGradient,
        isInAnyGroup,
        groupLegend,
        countGrouped,
    }
}
