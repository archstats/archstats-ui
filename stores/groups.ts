import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface SavedGroup {
    id: string
    name: string
    type: 'component' | 'file'
    members: string[]
    color: string       // HSL string, e.g. "hsl(210, 80%, 55%)"
    createdAt: number
}

interface GroupsState {
    componentGroups: SavedGroup[]
    fileGroups: SavedGroup[]
    projectKey: string | null
}

// ═══════════════════════════════════════════════════════
// COLOR PALETTE
// ═══════════════════════════════════════════════════════

const GROUP_COLOR_PALETTE = [
    'hsl(210, 80%, 55%)',   // Blue
    'hsl(160, 70%, 42%)',   // Emerald
    'hsl(340, 75%, 55%)',   // Rose
    'hsl(45, 90%, 50%)',    // Amber
    'hsl(270, 65%, 58%)',   // Violet
    'hsl(15, 85%, 55%)',    // Orange
    'hsl(190, 75%, 45%)',   // Cyan
    'hsl(330, 65%, 50%)',   // Pink
    'hsl(95, 60%, 45%)',    // Lime
    'hsl(240, 55%, 60%)',   // Indigo
    'hsl(30, 80%, 52%)',    // Tangerine
    'hsl(175, 65%, 40%)',   // Teal
]

function getNextColor(existingGroups: SavedGroup[]): string {
    const usedColors = new Set(existingGroups.map(g => g.color))
    // Find first unused color from the palette
    for (const color of GROUP_COLOR_PALETTE) {
        if (!usedColors.has(color)) {
            return color
        }
    }
    // All palette colors used — cycle with a lightness offset
    const cycleIndex = existingGroups.length % GROUP_COLOR_PALETTE.length
    const base = GROUP_COLOR_PALETTE[cycleIndex]
    // Shift lightness by +15% for the second cycle, +30% for third, etc.
    const cycleRound = Math.floor(existingGroups.length / GROUP_COLOR_PALETTE.length)
    const lightnessShift = cycleRound * 15
    return base.replace(/(\d+)%\)$/, (_, l) => {
        const newL = Math.min(85, parseInt(l) + lightnessShift)
        return `${newL}%)`
    })
}

// ═══════════════════════════════════════════════════════
// LOCALSTORAGE HELPERS
// ═══════════════════════════════════════════════════════

const STORAGE_PREFIX = 'archstats-groups-'

function getStorageKey(projectKey: string): string {
    return `${STORAGE_PREFIX}${projectKey}`
}

function saveToLocalStorage(projectKey: string, componentGroups: SavedGroup[], fileGroups: SavedGroup[]) {
    if (!projectKey) return
    try {
        const data = JSON.stringify({ componentGroups, fileGroups })
        localStorage.setItem(getStorageKey(projectKey), data)
    } catch (e) {
        console.warn('Failed to save groups to localStorage:', e)
    }
}

function loadFromLocalStorageRaw(projectKey: string): { componentGroups: SavedGroup[], fileGroups: SavedGroup[] } | null {
    if (!projectKey) return null
    try {
        const raw = localStorage.getItem(getStorageKey(projectKey))
        if (!raw) return null
        const data = JSON.parse(raw)
        return {
            componentGroups: data.componentGroups || [],
            fileGroups: data.fileGroups || [],
        }
    } catch (e) {
        console.warn('Failed to load groups from localStorage:', e)
        return null
    }
}

// ═══════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════

export const useGroupsStore = defineStore('groups', {
    state: (): GroupsState => ({
        componentGroups: [],
        fileGroups: [],
        projectKey: null,
    }),

    getters: {
        allComponentGroups: (state) => state.componentGroups,
        allFileGroups: (state) => state.fileGroups,
        allGroups: (state) => [...state.componentGroups, ...state.fileGroups],

        getGroupById: (state) => {
            return (id: string): SavedGroup | undefined => {
                return state.componentGroups.find(g => g.id === id)
                    || state.fileGroups.find(g => g.id === id)
            }
        },

        getGroupColor: (state) => {
            return (groupId: string): string | null => {
                const group = state.componentGroups.find(g => g.id === groupId)
                    || state.fileGroups.find(g => g.id === groupId)
                return group?.color || null
            }
        },

        getGroupsForComponent: (state) => {
            return (componentName: string): SavedGroup[] => {
                return state.componentGroups.filter(g => g.members.includes(componentName))
            }
        },

        getGroupsForFile: (state) => {
            return (filePath: string): SavedGroup[] => {
                return state.fileGroups.filter(g => g.members.includes(filePath))
            }
        },

        // Precomputed lookup maps for O(1) access in hot rendering paths
        componentGroupIndex(): Map<string, SavedGroup[]> {
            const index = new Map<string, SavedGroup[]>()
            for (const group of this.componentGroups) {
                for (const member of group.members) {
                    const existing = index.get(member)
                    if (existing) {
                        existing.push(group)
                    } else {
                        index.set(member, [group])
                    }
                }
            }
            return index
        },

        fileGroupIndex(): Map<string, SavedGroup[]> {
            const index = new Map<string, SavedGroup[]>()
            for (const group of this.fileGroups) {
                for (const member of group.members) {
                    const existing = index.get(member)
                    if (existing) {
                        existing.push(group)
                    } else {
                        index.set(member, [group])
                    }
                }
            }
            return index
        },
    },

    actions: {
        // ── Lifecycle ──────────────────────────────────────
        initForProject(projectKey: string) {
            this.projectKey = projectKey
            const saved = loadFromLocalStorageRaw(projectKey)
            if (saved) {
                this.componentGroups = saved.componentGroups
                this.fileGroups = saved.fileGroups
            } else {
                this.componentGroups = []
                this.fileGroups = []
            }
        },

        // ── CRUD ───────────────────────────────────────────
        createGroup(type: 'component' | 'file', name: string, members: string[] = []): SavedGroup {
            const targetList = type === 'component' ? this.componentGroups : this.fileGroups
            const allGroups = [...this.componentGroups, ...this.fileGroups]
            const group: SavedGroup = {
                id: uuidv4(),
                name,
                type,
                members: [...members],
                color: getNextColor(allGroups),
                createdAt: Date.now(),
            }
            targetList.push(group)
            this._persist()
            return group
        },

        updateGroup(id: string, updates: Partial<Pick<SavedGroup, 'name' | 'color' | 'members'>>) {
            const group = this._findGroup(id)
            if (!group) return
            if (updates.name !== undefined) group.name = updates.name
            if (updates.color !== undefined) group.color = updates.color
            if (updates.members !== undefined) group.members = [...updates.members]
            this._persist()
        },

        addMembersToGroup(id: string, newMembers: string[]) {
            const group = this._findGroup(id)
            if (!group) return
            const memberSet = new Set(group.members)
            for (const m of newMembers) {
                memberSet.add(m)
            }
            group.members = Array.from(memberSet)
            this._persist()
        },

        removeMembersFromGroup(id: string, toRemove: string[]) {
            const group = this._findGroup(id)
            if (!group) return
            const removeSet = new Set(toRemove)
            group.members = group.members.filter(m => !removeSet.has(m))
            this._persist()
        },

        deleteGroup(id: string) {
            this.componentGroups = this.componentGroups.filter(g => g.id !== id)
            this.fileGroups = this.fileGroups.filter(g => g.id !== id)
            this._persist()
        },

        // ── Import / Export ────────────────────────────────
        exportGroups(): string {
            return JSON.stringify({
                version: 1,
                componentGroups: this.componentGroups,
                fileGroups: this.fileGroups,
            }, null, 2)
        },

        importGroups(jsonString: string, mode: 'merge' | 'replace' = 'merge') {
            try {
                const data = JSON.parse(jsonString)
                const importedComponent: SavedGroup[] = data.componentGroups || []
                const importedFile: SavedGroup[] = data.fileGroups || []

                if (mode === 'replace') {
                    this.componentGroups = importedComponent
                    this.fileGroups = importedFile
                } else {
                    // Merge: add groups that don't already exist (by id)
                    const existingIds = new Set(this.allGroups.map(g => g.id))
                    for (const g of importedComponent) {
                        if (!existingIds.has(g.id)) {
                            this.componentGroups.push(g)
                        }
                    }
                    for (const g of importedFile) {
                        if (!existingIds.has(g.id)) {
                            this.fileGroups.push(g)
                        }
                    }
                }
                this._persist()
            } catch (e) {
                console.error('Failed to import groups:', e)
                throw new Error('Invalid groups JSON format')
            }
        },

        // ── Internal ──────────────────────────────────────
        _findGroup(id: string): SavedGroup | undefined {
            return this.componentGroups.find(g => g.id === id)
                || this.fileGroups.find(g => g.id === id)
        },

        _persist() {
            if (this.projectKey) {
                saveToLocalStorage(this.projectKey, this.componentGroups, this.fileGroups)
            }
        },
    },
})
