import { ref, watch } from "vue"
import { useDataStore } from "~/stores/data"

export function useJavaMetrics() {
  const store = useDataStore()

  // Dynamic progressive enhancement checks
  const isJavaProject = ref(false)

  watch(
    () => store.hasData,
    async (hasData) => {
      if (!hasData) {
        isJavaProject.value = false
        return
      }
      try {
        const summaryKeys = (await store.getView<{ name: string }>("summary")) || []
        isJavaProject.value = summaryKeys.some((item) => item.name && item.name.startsWith("java__"))
      } catch {
        isJavaProject.value = false
      }
    },
    { immediate: true }
  )

  const isSpringProject = ref(false)

  watch(
    () => store.hasData,
    async (hasData) => {
      if (!hasData) {
        isSpringProject.value = false
        return
      }
      try {
        const summaryKeys = (await store.getView<{ name: string }>("summary")) || []
        isSpringProject.value = summaryKeys.some((item) => item.name && item.name.startsWith("java__spring__"))
      } catch {
        isSpringProject.value = false
      }
    },
    { immediate: true }
  )

  const isJpaProject = ref(false)

  watch(
    () => store.hasData,
    async (hasData) => {
      if (!hasData) {
        isJpaProject.value = false
        return
      }
      try {
        const summaryKeys = (await store.getView<{ name: string }>("summary")) || []
        isJpaProject.value = summaryKeys.some((item) => item.name && item.name.startsWith("java__jpa__"))
      } catch {
        isJpaProject.value = false
      }
    },
    { immediate: true }
  )

  // Safe fetch from summary table
  const getSummaryVal = async (key: string): Promise<number> => {
    if (!store.hasData) return 0
    try {
      const summary = (await store.getView<any>("summary")) || []
      const found = summary.find((item: any) => item.name === key)
      return found ? Number(found.value) || 0 : 0
    } catch {
      return 0
    }
  }

  // Safe fetch for component columns
  const getComponentMetric = async (compName: string, colName: string): Promise<number> => {
    if (!store.hasData) return 0
    try {
      const cols = store.getDistinctComponentColumns || []
      const resolvedColName = colName.toLowerCase()
      const hasCol = cols.some(c => c.toLowerCase() === resolvedColName)
      if (!hasCol) return 0
      
      const escName = compName.replace(/'/g, "''")
      const rows = await store.query<any>(`SELECT ${colName} FROM components WHERE name = '${escName}' LIMIT 1`)
      return rows.length > 0 ? Number(rows[0][colName]) || 0 : 0
    } catch {
      return 0
    }
  }

  // Safe fetch for file columns
  const getFileMetric = async (fileName: string, colName: string): Promise<number> => {
    if (!store.hasData || !store.hasView("files")) return 0
    try {
      const rawCols = await store.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('files')")
      const hasCol = rawCols.some(c => c.name.toLowerCase() === colName.toLowerCase())
      if (!hasCol) return 0

      const escName = fileName.replace(/'/g, "''")
      const rows = await store.query<any>(`SELECT ${colName} FROM files WHERE name = '${escName}' LIMIT 1`)
      return rows.length > 0 ? Number(rows[0][colName]) || 0 : 0
    } catch {
      return 0
    }
  }

  // Retrieve global Java summary statistics
  const getJavaSummary = async () => {
    return {
      classes: await getSummaryVal("java__class__declarations"),
      methods: await getSummaryVal("java__method_declarations"),
      fields: await getSummaryVal("java__field__declarations"),
      springControllers: await getSummaryVal("java__spring__controllers"),
      springServices: await getSummaryVal("java__spring__services"),
      springRepositories: await getSummaryVal("java__spring__repositories"),
      springComponents: await getSummaryVal("java__spring__components"),
      springConfigurations: await getSummaryVal("java__spring__configurations"),
      springBeans: await getSummaryVal("java__spring__beans"),
      jpaEntities: await getSummaryVal("java__jpa__entities"),
      restTotal: await getSummaryVal("java__spring__request_mappings__total")
    }
  }

  // Retrieve Java metrics for a specific component
  const getJavaMetricsForComponent = async (compName: string) => {
    const classes = await getComponentMetric(compName, "java__class__declarations")
    const methods = await getComponentMetric(compName, "java__method_declarations")
    const fields = await getComponentMetric(compName, "java__field__declarations")

    return {
      classes,
      methods,
      fields,
      springControllers: await getComponentMetric(compName, "java__spring__controllers"),
      springServices: await getComponentMetric(compName, "java__spring__services"),
      springRepositories: await getComponentMetric(compName, "java__spring__repositories"),
      springComponents: await getComponentMetric(compName, "java__spring__components"),
      springConfigurations: await getComponentMetric(compName, "java__spring__configurations"),
      springBeans: await getComponentMetric(compName, "java__spring__beans"),
      jpaEntities: await getComponentMetric(compName, "java__jpa__entities"),
      restTotal: await getComponentMetric(compName, "java__spring__request_mappings__total"),
      avgMethodsPerClass: classes ? methods / classes : 0,
      avgFieldsPerClass: classes ? fields / classes : 0
    }
  }

  // Retrieve Java annotations and metrics for a specific file
  const getJavaMetricsForFile = async (fileName: string) => {
    const classes = await getFileMetric(fileName, "java__class__declarations")
    const methods = await getFileMetric(fileName, "java__method_declarations")
    const fields = await getFileMetric(fileName, "java__field__declarations")

    // Get snippets for annotations
    let snippets: { snippet_type: string; count: number }[] = []
    if (store.hasData && store.hasView("snippets")) {
      const escName = fileName.replace(/'/g, "''")
      snippets = await store.query<{ snippet_type: string; count: number }>(
        `SELECT snippet_type, count(*) as count FROM snippets WHERE file = '${escName}' AND snippet_type LIKE 'java__%' GROUP BY snippet_type`
      )
    }

    const roles: string[] = []
    const snippetTypes = new Set(snippets.map(s => s.snippet_type))
    
    if (snippetTypes.has("java__spring__controller")) roles.push("Spring Controller")
    if (snippetTypes.has("java__spring__service")) roles.push("Spring Service")
    if (snippetTypes.has("java__spring__repository")) roles.push("Spring Repository")
    if (snippetTypes.has("java__spring__component")) roles.push("Spring Component")
    if (snippetTypes.has("java__spring__configuration")) roles.push("Spring Configuration")
    if (snippetTypes.has("java__jpa__entity")) roles.push("JPA Entity")
    if (snippetTypes.has("java__interface__declaration")) roles.push("Interface")
    if (snippetTypes.has("java__record__declaration")) roles.push("Record")
    if (snippetTypes.has("java__class__declaration") && roles.length === 0) roles.push("Class")

    // Get request mapping endpoints inside the file
    const restGet = await getFileMetric(fileName, "java__spring__request_mappings__get")
    const restPost = await getFileMetric(fileName, "java__spring__request_mappings__post")
    const restPut = await getFileMetric(fileName, "java__spring__request_mappings__put")
    const restDelete = await getFileMetric(fileName, "java__spring__request_mappings__delete")
    const restPatch = await getFileMetric(fileName, "java__spring__request_mappings__patch")
    const restTotal = await getFileMetric(fileName, "java__spring__request_mappings__total")

    return {
      classes,
      methods,
      fields,
      roles,
      hasSpring: snippetTypes.has("java__spring__bean") || restTotal > 0,
      hasJpa: snippetTypes.has("java__jpa__entity"),
      rest: {
        total: restTotal,
        get: restGet,
        post: restPost,
        put: restPut,
        delete: restDelete,
        patch: restPatch
      }
    }
  }

  // Get list of Spring Controllers and their rest mapping stats
  const getSpringControllers = async () => {
    if (!store.hasData || !store.hasView("files")) return []
    try {
      const rawCols = await store.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('files')")
      const hasTotal = rawCols.some(c => c.name === "java__spring__request_mappings__total")
      if (!hasTotal) return []

      const query = `
        SELECT name, component, 
               java__spring__request_mappings__total as total,
               COALESCE(java__spring__request_mappings__get, 0) as get_count,
               COALESCE(java__spring__request_mappings__post, 0) as post_count,
               COALESCE(java__spring__request_mappings__put, 0) as put_count,
               COALESCE(java__spring__request_mappings__delete, 0) as delete_count,
               COALESCE(java__spring__request_mappings__patch, 0) as patch_count
        FROM files 
        WHERE java__spring__request_mappings__total > 0
        ORDER BY total DESC
      `
      return await store.query<any>(query)
    } catch {
      return []
    }
  }

  // Get list of JPA Entities
  const getJpaEntitiesList = async () => {
    if (!store.hasData || !store.hasView("snippets")) return []
    try {
      // Find files containing java__jpa__entity snippets
      const query = `
        SELECT DISTINCT file as name, component, content as entity_name
        FROM snippets
        WHERE snippet_type = 'java__jpa__entity'
        ORDER BY entity_name
      `
      return await store.query<any>(query)
    } catch {
      return []
    }
  }

  return {
    isJavaProject,
    isSpringProject,
    isJpaProject,
    getJavaSummary,
    getJavaMetricsForComponent,
    getJavaMetricsForFile,
    getSpringControllers,
    getJpaEntitiesList
  }
}
