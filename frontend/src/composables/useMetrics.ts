import { useDataStore } from "~/stores/data";

export function useMetrics() {
  const store = useDataStore();

  /**
   * Defensive check to verify if a metric column is present in the loaded SQLite database.
   * Checks both direct key names and resolved mapping keys (case-insensitive).
   */
  const hasMetric = (keyName: string): boolean => {
    if (!store.hasData) return false;
    
    const columns = store.getDistinctComponentColumns || [];
    const lowerKey = keyName.toLowerCase();
    
    // Also check resolved keys from stat name resolver
    const resolvedKey = store.statName ? store.statName(keyName).toLowerCase() : "";

    return columns.some((col: string) => {
      const lowerCol = col.toLowerCase();
      return lowerCol === lowerKey || lowerCol === resolvedKey;
    });
  };

  /**
   * Retrieves the full definition of a metric from the database definitions table.
   * If not found, falls back to short description, or a default string.
   */
  const getMetricDefinition = (keyName: string): string => {
    if (!store.hasData) return "";
    
    const defs = store.definitions;
    if (!defs) return "";

    const lowerKey = keyName.toLowerCase();
    const resolvedKey = store.statName ? store.statName(keyName).toLowerCase() : "";

    // Find the definition object case-insensitively
    let foundDef: any = null;
    for (const [id, def] of defs.entries()) {
      const lowerId = id.toLowerCase();
      if (lowerId === lowerKey || lowerId === resolvedKey) {
        foundDef = def;
        break;
      }
    }

    if (foundDef) {
      return foundDef.long || foundDef.short || foundDef.name || "";
    }

    return "";
  };

  /**
   * Retrieves the short definition of a metric from the database definitions table.
   */
  const getMetricShortDefinition = (keyName: string): string => {
    if (!store.hasData) return "";
    
    const defs = store.definitions;
    if (!defs) return "";

    const lowerKey = keyName.toLowerCase();
    const resolvedKey = store.statName ? store.statName(keyName).toLowerCase() : "";

    let foundDef: any = null;
    for (const [id, def] of defs.entries()) {
      const lowerId = id.toLowerCase();
      if (lowerId === lowerKey || lowerId === resolvedKey) {
        foundDef = def;
        break;
      }
    }

    if (foundDef) {
      return foundDef.short || foundDef.name || "";
    }

    return "";
  };

  /**
   * Retrieves the long definition (full methodology/rationale) of a metric.
   */
  const getMetricLongDefinition = (keyName: string): string => {
    if (!store.hasData) return "";
    
    const defs = store.definitions;
    if (!defs) return "";

    const lowerKey = keyName.toLowerCase();
    const resolvedKey = store.statName ? store.statName(keyName).toLowerCase() : "";

    let foundDef: any = null;
    for (const [id, def] of defs.entries()) {
      const lowerId = id.toLowerCase();
      if (lowerId === lowerKey || lowerId === resolvedKey) {
        foundDef = def;
        break;
      }
    }

    if (foundDef) {
      return foundDef.long || foundDef.short || foundDef.name || "";
    }

    return "";
  };

  return {
    hasMetric,
    getMetricDefinition,
    getMetricShortDefinition,
    getMetricLongDefinition
  };
}
