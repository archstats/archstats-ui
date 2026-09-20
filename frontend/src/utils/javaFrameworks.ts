// Framework profiles for the Classes view. The engine records neutral facts
// about every type (annotations, supertypes, imports, declarations, member
// counts); a profile turns those plus the class graph into lanes. Detection
// is by imports first, because a project's package imports say what it is
// built on far more reliably than any one annotation.

export type LaneColor = "blue" | "green" | "amber" | "violet" | "red" | "neutral"

export interface ClassFacts {
  name: string
  annotations: ReadonlySet<string>
  supertypes: ReadonlySet<string>
  /** Older engine snippet types, so snapshots scanned before the neutral facts still classify. */
  legacy: ReadonlySet<string>
  /** Full import strings, e.g. "org.springframework.web.bind.annotation.RestController". */
  imports: ReadonlySet<string>
  /** Declared method names. */
  methods: ReadonlySet<string>
  fields: number
  methodCount: number
  isRecord: boolean
  isInterface: boolean
}

/** What the class graph knows about a type. */
export interface ClassSignals { inDegree: number; outDegree: number }

export interface LaneDef {
  id: string
  label: string
  color: LaneColor
  annotations?: string[]
  supertypes?: string[]
  legacy?: string[]
  /** Import prefixes; a class importing any of them belongs here. */
  imports?: string[]
  /** A structural rule, after the fact-based signals and before naming. */
  rule?: (facts: ClassFacts, signals: ClassSignals) => boolean
  /** Simple-name suffixes, the weakest signal. */
  nameSuffixes?: string[]
  hint?: string
}

export interface FrameworkProfile {
  id: string
  label: string
  /**
   * Strong signals mean "this is an application on that framework" (its web,
   * boot or runtime packages). Weak signals are APIs many things reuse (CDI,
   * injection, validation, JPA); they support a verdict but never make one.
   */
  detect: { annotations?: string[]; supertypes?: string[]; legacy?: string[]; imports?: string[]; weakImports?: string[] }
  /** Votes for this profile count this many times; distinctive imports outrank shared standards. */
  weight?: number
  lanes: LaneDef[]
  fallback: string
}

export const EMPTY_FACTS: ClassFacts = {
  name: "", annotations: new Set(), supertypes: new Set(), legacy: new Set(), imports: new Set(), methods: new Set(),
  fields: 0, methodCount: 0, isRecord: false, isInterface: false,
}

const ENTITY_ANNOTATIONS = ["Entity", "Embeddable", "MappedSuperclass", "Document", "Table"]
const JAXRS = ["jakarta.ws.rs", "javax.ws.rs"]
const DATA_IMPORTS = [
  "java.sql", "javax.sql", "jakarta.persistence", "javax.persistence", "org.hibernate", "org.jdbi", "org.jooq", "com.mongodb",
  "redis.clients", "io.lettuce", "org.apache.kafka", "java.net.http", "okhttp3", "retrofit2", "org.apache.http", "feign",
  "software.amazon.awssdk", "com.amazonaws", "com.google.cloud", "javax.jms", "jakarta.jms", "org.springframework.data",
]

const isMain = (f: ClassFacts) => f.methods.has("main")
const looksLikeModel = (f: ClassFacts, s: ClassSignals) => f.isRecord || (!f.isInterface && f.fields >= 1 && f.methodCount <= f.fields * 2 + 2 && s.outDegree <= 2 && !isMain(f))
const looksLikeEntry = (f: ClassFacts, s: ClassSignals) => isMain(f) || (s.inDegree === 0 && s.outDegree > 0 && !f.isRecord && !f.isInterface)

export const SPRING: FrameworkProfile = {
  id: "spring",
  label: "Spring",
  detect: { imports: ["org.springframework.boot", "org.springframework.web", "org.springframework.stereotype", "org.springframework.data", "org.springframework.context"], weakImports: ["org.springframework"], annotations: ["SpringBootApplication"], legacy: ["java__spring__bean"] },
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["Controller", "RestController", "ControllerAdvice", "RestControllerAdvice"], legacy: ["java__spring__controller"], hint: "Web entry points" },
    { id: "services", label: "Services & Other", color: "green", annotations: ["Service", "Component", "Configuration", "SpringBootApplication"], legacy: ["java__spring__service", "java__spring__component", "java__spring__configuration"], hint: "Beans and everything unclassified" },
    { id: "repositories", label: "Repositories", color: "amber", annotations: ["Repository"], supertypes: ["JpaRepository", "CrudRepository", "PagingAndSortingRepository", "MongoRepository", "ReactiveCrudRepository", "R2dbcRepository", "ElasticsearchRepository"], legacy: ["java__spring__repository"], imports: ["org.springframework.data.repository"], hint: "Data access" },
    { id: "entities", label: "Entities", color: "violet", annotations: ENTITY_ANNOTATIONS, legacy: ["java__jpa__entity"], hint: "Persistent models" },
  ],
  fallback: "services",
}

export const JAKARTA: FrameworkProfile = {
  id: "jakarta",
  label: "Jakarta EE",
  detect: { imports: [...JAXRS, "jakarta.ejb", "javax.ejb", "jakarta.servlet", "javax.servlet", "jakarta.faces", "javax.faces", "jakarta.websocket", "javax.websocket"], weakImports: ["jakarta.enterprise", "javax.enterprise", "jakarta.inject", "javax.inject"], supertypes: ["HttpServlet"] },
  lanes: [
    { id: "endpoints", label: "Endpoints", color: "blue", annotations: ["Path", "WebServlet", "ServerEndpoint", "WebFilter", "WebListener", "ApplicationPath"], supertypes: ["HttpServlet", "Application"], hint: "JAX-RS, servlets, sockets" },
    { id: "beans", label: "Beans & Other", color: "green", annotations: ["Stateless", "Stateful", "Singleton", "ApplicationScoped", "RequestScoped", "SessionScoped", "ConversationScoped", "Dependent", "Named", "Startup", "Interceptor", "Decorator"], hint: "EJBs, CDI beans and everything unclassified" },
    { id: "messaging", label: "Messaging", color: "red", annotations: ["MessageDriven", "JMSDestinationDefinition"], supertypes: ["MessageListener"], imports: ["jakarta.jms", "javax.jms"], hint: "Message-driven beans" },
    { id: "repositories", label: "Repositories", color: "amber", annotations: ["Repository"], imports: ["jakarta.persistence.EntityManager", "javax.persistence.EntityManager"], nameSuffixes: ["Repository", "Dao", "DAO"], hint: "Data access" },
    { id: "entities", label: "Entities", color: "violet", annotations: ENTITY_ANNOTATIONS, legacy: ["java__jpa__entity"], hint: "Persistent models" },
  ],
  fallback: "beans",
}

export const QUARKUS: FrameworkProfile = {
  id: "quarkus",
  label: "Quarkus",
  detect: { imports: ["io.quarkus"], weakImports: ["io.smallrye", "org.eclipse.microprofile"] },
  weight: 4,
  lanes: [
    { id: "resources", label: "Resources", color: "blue", annotations: ["Path", "WebSocket", "GraphQLApi", "GrpcService", "WebSocketServer"], imports: JAXRS, hint: "REST, GraphQL, gRPC, sockets" },
    { id: "beans", label: "Beans & Other", color: "green", annotations: ["ApplicationScoped", "Singleton", "RequestScoped", "Dependent", "Startup", "QuarkusMain"], hint: "CDI beans and everything unclassified" },
    { id: "messaging", label: "Messaging & Scheduling", color: "red", annotations: ["Incoming", "Outgoing", "ConsumeEvent", "Scheduled", "Channel"], imports: ["org.eclipse.microprofile.reactive.messaging", "io.smallrye.reactive.messaging", "io.quarkus.scheduler"], hint: "Channels, event bus, schedules" },
    { id: "data", label: "Repositories & Clients", color: "amber", annotations: ["RegisterRestClient"], supertypes: ["PanacheRepository", "PanacheRepositoryBase", "PanacheMongoRepository", "PanacheMongoRepositoryBase"], imports: ["io.quarkus.hibernate.orm.panache", "io.quarkus.mongodb.panache", "org.eclipse.microprofile.rest.client", "io.quarkus.hibernate.reactive"], hint: "Panache repositories, REST clients" },
    { id: "entities", label: "Entities", color: "violet", annotations: ENTITY_ANNOTATIONS, supertypes: ["PanacheEntity", "PanacheEntityBase", "PanacheMongoEntity", "PanacheMongoEntityBase"], legacy: ["java__jpa__entity"], hint: "Persistent models" },
  ],
  fallback: "beans",
}

export const MICRONAUT: FrameworkProfile = {
  id: "micronaut",
  label: "Micronaut",
  detect: { imports: ["io.micronaut"] },
  weight: 4,
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["Controller"], imports: ["io.micronaut.http.annotation.Controller"], hint: "HTTP entry points" },
    { id: "beans", label: "Beans & Other", color: "green", annotations: ["Singleton", "Prototype", "RequestScope", "Factory", "Bean", "Context", "ConfigurationProperties"], hint: "Beans and everything unclassified" },
    { id: "clients", label: "Clients & Messaging", color: "red", annotations: ["Client", "KafkaListener", "KafkaClient", "RabbitListener", "RabbitClient", "JMSListener"], imports: ["io.micronaut.http.client", "io.micronaut.configuration.kafka", "io.micronaut.rabbitmq", "io.micronaut.jms"], hint: "Declarative clients and listeners" },
    { id: "repositories", label: "Repositories", color: "amber", annotations: ["Repository", "JdbcRepository", "MongoRepository", "R2dbcRepository"], supertypes: ["CrudRepository", "PageableRepository", "GenericRepository", "ReactiveStreamsCrudRepository", "ReactorCrudRepository"], imports: ["io.micronaut.data.repository"], hint: "Micronaut Data" },
    { id: "entities", label: "Entities", color: "violet", annotations: ["MappedEntity", "Entity", "Embeddable"], hint: "Persistent models" },
  ],
  fallback: "beans",
}

export const VERTX: FrameworkProfile = {
  id: "vertx",
  label: "Vert.x",
  detect: { imports: ["io.vertx"], supertypes: ["AbstractVerticle"] },
  weight: 2,
  lanes: [
    { id: "verticles", label: "Verticles", color: "blue", supertypes: ["AbstractVerticle", "Verticle", "Launcher"], hint: "Deployable units" },
    { id: "handlers", label: "Handlers & Other", color: "green", supertypes: ["Handler"], hint: "Request handling and everything unclassified" },
    { id: "eventbus", label: "Event bus & Messaging", color: "red", imports: ["io.vertx.core.eventbus", "io.vertx.kafka", "io.vertx.amqp", "io.vertx.rabbitmq", "io.vertx.mqtt"], hint: "Messages between verticles and brokers" },
    { id: "clients", label: "Clients & Data", color: "amber", imports: ["io.vertx.ext.web.client", "io.vertx.sqlclient", "io.vertx.jdbcclient", "io.vertx.pgclient", "io.vertx.mysqlclient", "io.vertx.ext.mongo", "io.vertx.redis", "io.vertx.cassandra"], hint: "Outbound calls and stores" },
    { id: "models", label: "Codecs & Models", color: "violet", supertypes: ["MessageCodec"], annotations: ["DataObject"], rule: looksLikeModel, hint: "Data shapes and how they travel" },
  ],
  fallback: "handlers",
}

export const DROPWIZARD: FrameworkProfile = {
  id: "dropwizard",
  label: "Dropwizard",
  detect: { imports: ["io.dropwizard"] },
  weight: 4,
  lanes: [
    { id: "resources", label: "Resources", color: "blue", annotations: ["Path"], imports: JAXRS, hint: "JAX-RS entry points" },
    { id: "app", label: "Application & Other", color: "green", supertypes: ["Application", "Bundle", "ConfiguredBundle", "Command", "ConfiguredCommand", "EnvironmentCommand", "Managed", "HealthCheck", "Task"], hint: "Bootstrap, lifecycle and everything unclassified" },
    { id: "data", label: "Data access", color: "amber", supertypes: ["AbstractDAO"], imports: ["org.jdbi", "io.dropwizard.hibernate", "io.dropwizard.jdbi3", "io.dropwizard.db", ...DATA_IMPORTS], hint: "DAOs and clients" },
    { id: "models", label: "Configuration & Models", color: "violet", supertypes: ["Configuration"], rule: looksLikeModel, hint: "Config and data shapes" },
  ],
  fallback: "app",
}

export const ANDROID: FrameworkProfile = {
  id: "android",
  label: "Android",
  detect: { imports: ["android.", "androidx."] },
  lanes: [
    { id: "screens", label: "Activities & Fragments", color: "blue", supertypes: ["Activity", "AppCompatActivity", "FragmentActivity", "ComponentActivity", "Fragment", "DialogFragment", "BottomSheetDialogFragment", "PreferenceFragmentCompat"], hint: "What the user sees" },
    { id: "viewmodels", label: "ViewModels & Other", color: "green", supertypes: ["ViewModel", "AndroidViewModel"], hint: "State holders and everything unclassified" },
    { id: "background", label: "Services & Receivers", color: "red", supertypes: ["Service", "IntentService", "JobIntentService", "BroadcastReceiver", "Worker", "CoroutineWorker", "ListenableWorker", "ContentProvider"], hint: "Work off the screen" },
    { id: "data", label: "Data", color: "amber", annotations: ["Dao", "Database"], supertypes: ["RoomDatabase"], imports: ["androidx.room", "retrofit2", "okhttp3", "androidx.datastore", "android.database"], hint: "Room, network, storage" },
    { id: "models", label: "Entities & Models", color: "violet", annotations: ["Entity"], supertypes: ["Parcelable"], rule: looksLikeModel, hint: "Data shapes" },
  ],
  fallback: "viewmodels",
}

export const BEAM: FrameworkProfile = {
  id: "beam",
  label: "Apache Beam",
  detect: { imports: ["org.apache.beam"], supertypes: ["PTransform", "DoFn", "PipelineOptions", "CombineFn", "Coder", "SimpleFunction"] },
  weight: 2,
  lanes: [
    { id: "pipelines", label: "Pipelines & Options", color: "blue", supertypes: ["PipelineOptions", "DataflowPipelineOptions", "GcpOptions"], rule: (f) => isMain(f), nameSuffixes: ["Pipeline", "Job", "Runner"], hint: "Entry points and their options" },
    { id: "transforms", label: "Transforms", color: "green", supertypes: ["PTransform"], hint: "Composite steps" },
    { id: "fns", label: "DoFns", color: "amber", supertypes: ["DoFn", "SimpleFunction", "CombineFn", "SerializableFunction", "ProcessFunction", "InferableFunction", "PartitionFn", "WindowFn", "Trigger"], hint: "Per-element logic" },
    { id: "io", label: "IO & Coders", color: "violet", supertypes: ["Coder", "CustomCoder", "AtomicCoder", "StructuredCoder", "BoundedSource", "UnboundedSource", "FileBasedSource", "FileBasedSink", "BoundedReader", "UnboundedReader"], imports: ["org.apache.beam.sdk.io"], hint: "Sources, sinks and encodings" },
    { id: "other", label: "Other", color: "neutral", hint: "Models, utilities, tests" },
  ],
  fallback: "other",
}

/** No framework: lanes from what the code does, with naming only as a tiebreaker. */
export const STRUCTURE: FrameworkProfile = {
  id: "structure",
  label: "By structure",
  detect: {},
  lanes: [
    { id: "entry", label: "Entry points", color: "blue", rule: looksLikeEntry, nameSuffixes: ["Controller", "Resource", "Handler", "Endpoint", "Listener", "Main", "Application", "Command", "Cli", "Job", "Task", "Scheduler"], hint: "Has main, or nothing references it" },
    { id: "logic", label: "Logic & Other", color: "green", nameSuffixes: ["Service", "Manager", "Processor", "UseCase", "Interactor", "Facade", "Engine", "Strategy", "Validator", "Factory", "Builder", "Helper", "Util", "Utils"], hint: "Everything unclassified" },
    { id: "data", label: "Data access", color: "amber", imports: DATA_IMPORTS, nameSuffixes: ["Repository", "Dao", "DAO", "Store", "Client", "Gateway", "Adapter", "Connector", "Provider"], hint: "Imports a database, queue or HTTP client" },
    { id: "models", label: "Models", color: "violet", rule: looksLikeModel, nameSuffixes: ["Entity", "Dto", "DTO", "Model", "Request", "Response", "Event", "Record", "Vo", "VO", "Pojo", "Config", "Properties", "Exception"], hint: "Records and field-heavy types" },
  ],
  fallback: "logic",
}

export const PROFILES: FrameworkProfile[] = [SPRING, JAKARTA, QUARKUS, MICRONAUT, VERTX, DROPWIZARD, ANDROID, BEAM, STRUCTURE]
export const AUTO = "auto"
const NO_SIGNALS: ClassSignals = { inDegree: 0, outDegree: 0 }

export function profileById(id: string): FrameworkProfile {
  return PROFILES.find(p => p.id === id) ?? (id === "generic" ? STRUCTURE : STRUCTURE)
}

function hasAny(set: ReadonlySet<string>, list?: string[]): boolean {
  if (!list) return false
  for (const x of list) if (set.has(x)) return true
  return false
}
function importsAny(imports: ReadonlySet<string>, prefixes?: string[]): boolean {
  if (!prefixes) return false
  for (const imp of imports) for (const p of prefixes) if (imp.startsWith(p)) return true
  return false
}
function strongVote(p: FrameworkProfile, f: ClassFacts): boolean {
  return hasAny(f.annotations, p.detect.annotations) || hasAny(f.supertypes, p.detect.supertypes) || hasAny(f.legacy, p.detect.legacy) || importsAny(f.imports, p.detect.imports)
}
function weakVote(p: FrameworkProfile, f: ClassFacts): boolean {
  return importsAny(f.imports, p.detect.weakImports)
}

export interface Candidate { id: string; label: string; strong: number; weak: number; score: number }
export interface Detection {
  /** The profile to use: the winner when confident, otherwise "structure". */
  id: string
  confident: boolean
  /** Profiles with any evidence, best first. */
  candidates: Candidate[]
  total: number
  /** One line a person can read: what was seen and why it did or did not settle it. */
  reason: string
}

/**
 * Votes per profile with a confidence verdict. Confident needs strong
 * evidence in at least three classes, evidence in a noticeable share of the
 * codebase, and a clear lead over the runner-up. Anything less is a question
 * for the user, not a guess.
 */
export function detectFramework(facts: Iterable<ClassFacts>): Detection {
  const counts = new Map<string, { strong: number; weak: number }>()
  for (const p of PROFILES) counts.set(p.id, { strong: 0, weak: 0 })
  let total = 0
  for (const f of facts) {
    total++
    for (const p of PROFILES) {
      if (p.id === STRUCTURE.id) continue
      const c = counts.get(p.id)!
      if (strongVote(p, f)) c.strong++
      else if (weakVote(p, f)) c.weak++
    }
  }
  const candidates: Candidate[] = PROFILES
    .filter(p => p.id !== STRUCTURE.id)
    .map(p => { const c = counts.get(p.id)!; return { id: p.id, label: p.label, strong: c.strong, weak: c.weak, score: c.strong * 3 + c.weak } })
    .filter(c => c.strong + c.weak > 0)
  // Quarkus, Micronaut and Dropwizard are built on the Jakarta standard, so
  // Jakarta EE votes are theirs when any of them shows strong evidence.
  const specific = candidates.some(c => (profileById(c.id).weight ?? 1) >= 4 && c.strong > 0)
  const demoted = new Set<string>()
  if (specific) for (const c of candidates) if (c.id === JAKARTA.id) { c.score = Math.floor(c.score / 4); demoted.add(c.id) }
  candidates.sort((a, b) => b.score - a.score || b.strong - a.strong)
  const best = candidates[0]
  const runnerUp = candidates.find(c => c !== best && !demoted.has(c.id))
  if (!best) return { id: STRUCTURE.id, confident: true, candidates, total, reason: total ? "No framework packages are imported anywhere." : "" }
  const share = total ? (best.strong + best.weak) / total : 0
  const enoughStrong = best.strong >= 3
  const enoughShare = share >= 0.03 || best.strong >= 10
  const clearLead = !runnerUp || (best.strong >= runnerUp.strong * 2 && best.score >= runnerUp.score * 1.5)
  const confident = enoughStrong && enoughShare && clearLead
  const evidence = `${best.label}: ${best.strong} class${best.strong === 1 ? "" : "es"} with strong signals, ${best.weak} with shared APIs only, of ${total}.`
  let reason = evidence
  if (!enoughStrong) reason = `${evidence} Shared APIs like injection or validation do not make an application.`
  else if (!enoughShare) reason = `${evidence} Too small a share of the codebase to be sure.`
  else if (!clearLead) reason = `${evidence} ${runnerUp!.label} is close behind.`
  return { id: confident ? best.id : STRUCTURE.id, confident, candidates, total, reason }
}

/** The lane a class lands in: facts, then imports, then structure, then naming, then the fallback. */
export function classify(profile: FrameworkProfile, facts: ClassFacts, signals: ClassSignals = NO_SIGNALS): string {
  for (const lane of profile.lanes) if (hasAny(facts.annotations, lane.annotations) || hasAny(facts.supertypes, lane.supertypes) || hasAny(facts.legacy, lane.legacy)) return lane.id
  for (const lane of profile.lanes) if (importsAny(facts.imports, lane.imports)) return lane.id
  for (const lane of profile.lanes) if (lane.rule && lane.rule(facts, signals)) return lane.id
  for (const lane of profile.lanes) if (lane.nameSuffixes?.some(suffix => facts.name.endsWith(suffix) && facts.name !== suffix)) return lane.id
  return profile.fallback
}

export function laneOf(profile: FrameworkProfile, laneId: string): LaneDef {
  return profile.lanes.find(l => l.id === laneId) ?? profile.lanes.find(l => l.id === profile.fallback) ?? profile.lanes[0]
}

export function laneDotClass(color: LaneColor): string {
  return { blue: "bg-blue-500", green: "bg-green-500", amber: "bg-amber-500", violet: "bg-violet-500", red: "bg-red-500", neutral: "bg-neutral-400" }[color]
}
