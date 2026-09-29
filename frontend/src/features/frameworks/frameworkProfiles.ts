// Framework profiles for the Classes view. The engine records neutral facts
// about every type (annotations, supertypes, imports, declarations, member
// counts); a profile turns those plus the class graph into lanes. Detection
// is by imports first, because a project's package imports say what it is
// built on far more reliably than any one annotation.

export type LaneColor = "blue" | "green" | "amber" | "violet" | "red" | "neutral"

/** The languages that have profiles of their own. */
export type Language = "java" | "kotlin" | "csharp" | "typescript" | "python" | "go" | "php" | "swift" | "objc" | "dart"

/**
 * Which language a codebase is, from the files its units are declared in.
 *
 * The plurality wins rather than the majority: a Spring service with a
 * handful of Kotlin tests is a Java codebase, and a Next.js app with one
 * build script in Python is not a Python one.
 */
export function languageOf(files: Iterable<string>): Language | null {
  const counts = new Map<Language, number>()
  for (const f of files) {
    const lang = languageOfFile(f)
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  let best: Language | null = null
  let most = 0
  for (const [lang, n] of counts) {
    if (n > most) { most = n; best = lang }
  }
  return best
}

export function languageOfFile(path: string): Language | null {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase()
  switch (ext) {
    case "java": return "java"
    case "kt": case "kts": return "kotlin"
    case "cs": return "csharp"
    // A .vue or .svelte component's code is its script block, TypeScript or JavaScript.
    case "ts": case "tsx": case "mts": case "cts": case "js": case "jsx": case "mjs": case "cjs": case "vue": case "svelte": return "typescript"
    case "py": return "python"
    case "go": return "go"
    case "php": return "php"
    case "swift": return "swift"
    case "m": case "mm": return "objc"
    case "dart": return "dart"
    default: return null
  }
}

export interface ClassFacts {
  name: string
  /** The file the unit is declared in, when known. */
  file?: string
  annotations: ReadonlySet<string>
  supertypes: ReadonlySet<string>
  /** Older engine snippet types, so snapshots scanned before the neutral facts still classify. */
  legacy: ReadonlySet<string>
  /** Full import strings, e.g. "org.springframework.web.bind.annotation.RestController". */
  imports: ReadonlySet<string>
  /**
   * The file's imports this unit itself uses, when the snapshot records it.
   * A file's imports are the file's: gin's context_test.go imports a MongoDB
   * package for one test, and every test function in it read as a store.
   * Lanes are placed by this; detection still reads the whole file.
   */
  usedImports?: ReadonlySet<string>
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
  /** The rule decides before imports and names: a React component that imports axios is still a component. */
  ruleFirst?: boolean
  /** Simple-name suffixes, the weakest signal. */
  nameSuffixes?: string[]
  /**
   * The lane is defined by who references its members ("nothing references
   * it"), so nothing depending on it is its definition, not a finding.
   */
  byReferences?: boolean
  hint?: string
}

export interface FrameworkProfile {
  id: string
  label: string
  /**
   * The language this profile is about. Detection votes only among the
   * profiles for the language a codebase is written in, because the signals
   * are not disjoint: `@Injectable` is Angular and NestJS, `Controller` is
   * Spring and Micronaut and Laravel, and a profile allowed to vote on a
   * codebase it was never written for will eventually win one.
   *
   * Absent means any language, which is what the structural profile is.
   * Several when a platform is written in more than one: an Android app is
   * Kotlin and Java, often in one module; an iOS app Swift and Objective-C.
   */
  language?: Language | Language[]
  /**
   * Strong signals mean "this is an application on that framework" (its web,
   * boot or runtime packages). Weak signals are APIs many things reuse (CDI,
   * injection, validation, JPA); they support a verdict but never make one.
   */
  detect: { annotations?: string[]; supertypes?: string[]; legacy?: string[]; imports?: string[]; weakImports?: string[] }
  /**
   * How distinctive the profile's evidence is. At 4 or more, strong evidence
   * for it demotes the shared Jakarta standard it is built on. Votes are not
   * multiplied by it.
   */
  weight?: number
  /**
   * A general profile this one is a specific way of using: TCA is written in
   * SwiftUI, React Native in React. When this one has strong evidence the
   * general one's votes are its own, as Jakarta EE's are Quarkus's.
   */
  refines?: string
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

/**
 * A Java class with a main method, or a unit that is itself called main: a Go
 * or Python program's entry is a function, and the unit loader has no method
 * names to put in `methods`, so the name is the only place it can be read.
 */
export const isMain = (f: ClassFacts) => f.methods.has("main") || f.name === "main"
export const looksLikeModel = (f: ClassFacts, s: ClassSignals) => f.isRecord || (!f.isInterface && f.fields >= 1 && f.methodCount <= f.fields * 2 + 2 && s.outDegree <= 2 && !isMain(f))
export const looksLikeEntry = (f: ClassFacts, s: ClassSignals) => isMain(f) || (s.inDegree === 0 && s.outDegree > 0 && !f.isRecord && !f.isInterface)

/**
 * An annotation that says how a bean lives, not what it does: a lifecycle
 * scope, an EJB kind, a Micronaut bean scope. Read after imports, because a
 * `@Stateless` DAO holding an EntityManager and an `@ApplicationScoped`
 * Panache repository are data access first and beans second, while the role
 * annotations (`@Path`, `@Repository`, `@Entity`) still come before anything.
 */
const anyAnnotation = (keys: string[]) => (f: ClassFacts) => keys.some(k => f.annotations.has(k))

export const SPRING: FrameworkProfile = {
  // Spring Boot is written in Kotlin as often as in Java, with the same
  // annotations on data classes and interfaces.
  language: ["java", "kotlin"],
  id: "spring",
  label: "Spring",
  detect: { imports: ["org.springframework.boot", "org.springframework.web", "org.springframework.stereotype", "org.springframework.data", "org.springframework.context"], weakImports: ["org.springframework"], annotations: ["SpringBootApplication"], legacy: ["java__spring__bean"] },
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["Controller", "RestController", "ControllerAdvice", "RestControllerAdvice", "Path"], legacy: ["java__spring__controller"], hint: "Web entry points, JAX-RS resources among them" },
    // `@Component` is a bean of no particular role, so it is read after the
    // imports: a component listening to Kafka is messaging, one holding a
    // JdbcTemplate is data access. `@Service` is the architect's word.
    { id: "services", label: "Services & Other", color: "green", annotations: ["Service"], rule: anyAnnotation(["Component"]), legacy: ["java__spring__service", "java__spring__component"], hint: "Services, plain components and everything unclassified" },
    // Wiring sits beside the layers, not in them: a configuration class
    // creating beans reaches into every layer, and that is its job.
    { id: "config", label: "Configuration", color: "neutral", annotations: ["Configuration", "SpringBootApplication", "AutoConfiguration", "ConfigurationProperties", "EnableAutoConfiguration"], legacy: ["java__spring__configuration"], rule: isMain, hint: "Configuration classes and the application" },
    { id: "messaging", label: "Messaging", color: "red", annotations: ["KafkaListener", "RabbitListener", "JmsListener", "SqsListener"], supertypes: ["MessageListener"], imports: ["org.springframework.kafka", "org.springframework.amqp", "org.springframework.jms", "org.springframework.cloud.stream", "org.springframework.integration", "org.springframework.messaging"], hint: "Listeners and channels: entry points that are not requests" },
    { id: "repositories", label: "Repositories", color: "amber", annotations: ["Repository"], supertypes: ["JpaRepository", "CrudRepository", "PagingAndSortingRepository", "ListCrudRepository", "MongoRepository", "ReactiveCrudRepository", "R2dbcRepository", "ElasticsearchRepository", "JpaSpecificationExecutor"], legacy: ["java__spring__repository"], imports: ["org.springframework.data.repository", "org.springframework.jdbc", "org.springframework.r2dbc"], hint: "Data access" },
    { id: "entities", label: "Entities", color: "violet", annotations: ENTITY_ANNOTATIONS, legacy: ["java__jpa__entity"], hint: "Persistent models" },
  ],
  fallback: "services",
}

export const JAKARTA: FrameworkProfile = {
  language: "java",
  id: "jakarta",
  label: "Jakarta EE",
  detect: { imports: [...JAXRS, "jakarta.ejb", "javax.ejb", "jakarta.servlet", "javax.servlet", "jakarta.faces", "javax.faces", "jakarta.websocket", "javax.websocket"], weakImports: ["jakarta.enterprise", "javax.enterprise", "jakarta.inject", "javax.inject"], supertypes: ["HttpServlet"] },
  lanes: [
    { id: "endpoints", label: "Endpoints", color: "blue", annotations: ["Path", "WebServlet", "ServerEndpoint", "WebFilter", "WebListener", "ApplicationPath"], supertypes: ["HttpServlet", "HttpFilter", "Application"], hint: "JAX-RS, servlets, filters, sockets" },
    // A Java EE DAO is a `@Stateless` bean holding an EntityManager; the
    // scope is read after the imports so that it is data access.
    { id: "beans", label: "Beans & Other", color: "green", rule: anyAnnotation(["Stateless", "Stateful", "Singleton", "ApplicationScoped", "RequestScoped", "SessionScoped", "ConversationScoped", "Dependent", "Named", "Startup", "Interceptor", "Decorator"]), hint: "EJBs, CDI beans and everything unclassified" },
    { id: "messaging", label: "Messaging", color: "red", annotations: ["MessageDriven", "JMSDestinationDefinition"], supertypes: ["MessageListener"], imports: ["jakarta.jms", "javax.jms"], hint: "Message-driven beans" },
    { id: "repositories", label: "Repositories", color: "amber", annotations: ["Repository"], imports: ["jakarta.persistence.EntityManager", "javax.persistence.EntityManager", "jakarta.data.repository"], nameSuffixes: ["Repository", "Dao", "DAO"], hint: "Data access" },
    { id: "entities", label: "Entities", color: "violet", annotations: ENTITY_ANNOTATIONS, legacy: ["java__jpa__entity"], hint: "Persistent models" },
  ],
  fallback: "beans",
}

// A MicroProfile REST client is an interface carrying @Path like a resource
// does; @RegisterRestClient is what tells the two apart.
const isJaxrsResource = (f: ClassFacts) => f.annotations.has("Path") && !f.annotations.has("RegisterRestClient")

export const QUARKUS: FrameworkProfile = {
  language: ["java", "kotlin"],
  id: "quarkus",
  label: "Quarkus",
  detect: { imports: ["io.quarkus"], weakImports: ["io.smallrye", "org.eclipse.microprofile"] },
  weight: 4,
  lanes: [
    { id: "resources", label: "Resources", color: "blue", annotations: ["WebSocket", "GraphQLApi", "GrpcService", "WebSocketServer"], rule: isJaxrsResource, ruleFirst: true, imports: JAXRS, hint: "REST, GraphQL, gRPC, sockets" },
    // Every Panache repository is @ApplicationScoped; the scope is read
    // after its supertype and imports so that it is a repository.
    { id: "beans", label: "Beans & Other", color: "green", rule: anyAnnotation(["ApplicationScoped", "Singleton", "RequestScoped", "Dependent", "Startup", "QuarkusMain"]), hint: "CDI beans and everything unclassified" },
    { id: "messaging", label: "Messaging & Scheduling", color: "red", annotations: ["Incoming", "Outgoing", "ConsumeEvent", "Scheduled", "Channel"], imports: ["org.eclipse.microprofile.reactive.messaging", "io.smallrye.reactive.messaging", "io.quarkus.scheduler"], hint: "Channels, event bus, schedules" },
    { id: "data", label: "Repositories & Clients", color: "amber", annotations: ["RegisterRestClient"], supertypes: ["PanacheRepository", "PanacheRepositoryBase", "PanacheMongoRepository", "PanacheMongoRepositoryBase"], imports: ["io.quarkus.hibernate.orm.panache", "io.quarkus.mongodb.panache", "org.eclipse.microprofile.rest.client", "io.quarkus.hibernate.reactive"], hint: "Panache repositories, REST clients" },
    { id: "entities", label: "Entities", color: "violet", annotations: ENTITY_ANNOTATIONS, supertypes: ["PanacheEntity", "PanacheEntityBase", "PanacheMongoEntity", "PanacheMongoEntityBase"], legacy: ["java__jpa__entity"], hint: "Persistent models" },
  ],
  fallback: "beans",
}

export const MICRONAUT: FrameworkProfile = {
  language: ["java", "kotlin"],
  id: "micronaut",
  label: "Micronaut",
  detect: { imports: ["io.micronaut"] },
  weight: 4,
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["Controller"], imports: ["io.micronaut.http.annotation.Controller"], hint: "HTTP entry points" },
    { id: "beans", label: "Beans & Other", color: "green", rule: anyAnnotation(["Singleton", "Prototype", "RequestScope", "Factory", "Bean", "Context", "ConfigurationProperties", "EachProperty"]), hint: "Beans and everything unclassified" },
    { id: "clients", label: "Clients & Messaging", color: "red", annotations: ["Client", "KafkaListener", "KafkaClient", "RabbitListener", "RabbitClient", "JMSListener"], imports: ["io.micronaut.http.client", "io.micronaut.configuration.kafka", "io.micronaut.rabbitmq", "io.micronaut.jms"], hint: "Declarative clients and listeners" },
    { id: "repositories", label: "Repositories", color: "amber", annotations: ["Repository", "JdbcRepository", "MongoRepository", "R2dbcRepository"], supertypes: ["CrudRepository", "PageableRepository", "GenericRepository", "ReactiveStreamsCrudRepository", "ReactorCrudRepository"], imports: ["io.micronaut.data.repository"], hint: "Micronaut Data" },
    { id: "entities", label: "Entities", color: "violet", annotations: ["MappedEntity", "Entity", "Embeddable"], hint: "Persistent models" },
  ],
  fallback: "beans",
}

export const VERTX: FrameworkProfile = {
  language: ["java", "kotlin"],
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
  language: "java",
  id: "dropwizard",
  label: "Dropwizard",
  detect: { imports: ["io.dropwizard"] },
  weight: 4,
  lanes: [
    { id: "resources", label: "Resources", color: "blue", annotations: ["Path"], imports: JAXRS, hint: "JAX-RS entry points" },
    { id: "app", label: "Application & Other", color: "green", supertypes: ["Application", "Bundle", "ConfiguredBundle", "Command", "ConfiguredCommand", "EnvironmentCommand", "Managed", "HealthCheck", "Task"], hint: "Bootstrap, lifecycle and everything unclassified" },
    { id: "data", label: "Data access", color: "amber", supertypes: ["AbstractDAO"], imports: ["org.jdbi", "io.dropwizard.hibernate", "io.dropwizard.jdbi3", "io.dropwizard.db", ...DATA_IMPORTS], hint: "DAOs and clients" },
    // dropwizard-hibernate entities are JPA entities; the profile had no
    // lane for them, so every @Entity in a Dropwizard app was unclassified.
    { id: "models", label: "Configuration & Models", color: "violet", annotations: ENTITY_ANNOTATIONS, supertypes: ["Configuration"], rule: looksLikeModel, hint: "Config, entities and data shapes" },
  ],
  fallback: "app",
}

// Android, in Kotlin and Java. Compose screens are functions, so a
// composable is a unit here like a class is; the manifest says which classes
// the system starts (the engine marks them activity, service, receiver,
// provider).
const isComposable = (f: ClassFacts) => f.annotations.has("Composable")
export const isComposeScreen = (f: ClassFacts) => isComposable(f) && /(Screen|Route|Page|Dialog|Sheet)$/.test(f.name)

export const ANDROID: FrameworkProfile = {
  language: ["java", "kotlin"],
  id: "android",
  label: "Android",
  detect: { imports: ["android.", "androidx."], annotations: ["activity", "HiltAndroidApp", "AndroidEntryPoint", "Composable"] },
  lanes: [
    { id: "screens", label: "Screens", color: "blue", annotations: ["activity"], supertypes: ["Activity", "AppCompatActivity", "FragmentActivity", "ComponentActivity", "Fragment", "DialogFragment", "BottomSheetDialogFragment", "PreferenceFragmentCompat"], rule: isComposeScreen, ruleFirst: true, hint: "Activities, fragments and composables named for a screen" },
    { id: "ui", label: "UI components", color: "blue", annotations: ["Composable"], supertypes: ["View", "ViewGroup", "FrameLayout", "LinearLayout", "ConstraintLayout", "RecyclerView", "Adapter", "ViewHolder", "ListAdapter"], hint: "Composables and Views below the screen" },
    { id: "viewmodels", label: "ViewModels & Other", color: "green", annotations: ["HiltViewModel"], supertypes: ["ViewModel", "AndroidViewModel"], nameSuffixes: ["ViewModel", "Presenter"], hint: "State holders and everything unclassified" },
    { id: "di", label: "Dependency injection", color: "neutral", annotations: ["Module", "InstallIn", "Component", "Subcomponent", "HiltAndroidApp", "application"], supertypes: ["Application"], imports: ["org.koin"], hint: "Hilt, Dagger and Koin modules, the Application" },
    { id: "background", label: "Services & Receivers", color: "red", annotations: ["service", "receiver", "provider", "HiltWorker"], supertypes: ["Service", "IntentService", "JobIntentService", "LifecycleService", "BroadcastReceiver", "Worker", "CoroutineWorker", "ListenableWorker", "ContentProvider"], hint: "Work off the screen" },
    { id: "data", label: "Data", color: "amber", annotations: ["Dao", "Database"], supertypes: ["RoomDatabase"], imports: ["androidx.room", "retrofit2", "okhttp3", "io.ktor.client", "androidx.datastore", "android.database", "app.cash.sqldelight", "io.realm"], nameSuffixes: ["Repository", "DataSource", "Dao", "Api", "Service", "Client"], hint: "Room, network, storage" },
    // A Kotlin `data class` is a data shape by declaration; the engine records
    // the keyword. The unit loader knows no field counts, so looksLikeModel
    // alone never fired for one.
    { id: "models", label: "Entities & Models", color: "violet", annotations: ["Entity", "Parcelize", "Serializable", "Immutable", "Stable", "data"], supertypes: ["Parcelable"], rule: looksLikeModel, hint: "Data shapes" },
  ],
  fallback: "viewmodels",
}

export const BEAM: FrameworkProfile = {
  language: "java",
  id: "beam",
  label: "Apache Beam",
  detect: { imports: ["org.apache.beam"], supertypes: ["PTransform", "DoFn", "PipelineOptions", "CombineFn", "Coder", "SimpleFunction"] },
  weight: 2,
  lanes: [
    { id: "pipelines", label: "Pipelines & Options", color: "blue", supertypes: ["PipelineOptions", "DataflowPipelineOptions", "GcpOptions"], rule: (f) => isMain(f), nameSuffixes: ["Pipeline", "Job", "Runner"], hint: "Entry points and their options" },
    { id: "transforms", label: "Transforms", color: "green", supertypes: ["PTransform"], hint: "Composite steps" },
    { id: "fns", label: "DoFns", color: "amber", supertypes: ["DoFn", "SimpleFunction", "CombineFn", "SerializableFunction", "ProcessFunction", "InferableFunction", "PartitionFn", "WindowFn", "Trigger"], hint: "Per-element logic" },
    // By supertype only: every pipeline imports TextIO or BigQueryIO to read
    // its input, and importing an IO is using one, not being one.
    { id: "io", label: "IO & Coders", color: "violet", supertypes: ["Coder", "CustomCoder", "AtomicCoder", "StructuredCoder", "BoundedSource", "UnboundedSource", "FileBasedSource", "FileBasedSink", "BoundedReader", "UnboundedReader"], hint: "Sources, sinks and encodings" },
    { id: "other", label: "Other", color: "neutral", hint: "Models, utilities, tests" },
  ],
  fallback: "other",
}


// ---------------------------------------------------------------------------
// TypeScript and JavaScript
//
// The unit here is usually a function: LibreChat is 3,241 of them to 294
// types. Decorators exist only in Angular and NestJS; everywhere else the
// evidence is the import and the name.
// ---------------------------------------------------------------------------

/** The shapes TypeScript declares, as the engine marks them. */
const TS_SHAPES = ["interface", "type_alias", "enum"]
const isShape = (f: ClassFacts) => f.isInterface || TS_SHAPES.some(s => f.supertypes.has(s))
/** A class carrying `@Injectable()`, which in NestJS and Angular is every service, guard, pipe, interceptor and repository alike. */
const isInjectable = (f: ClassFacts) => f.annotations.has("Injectable")
/** Whether the unit's file sits under a folder named by the pattern (`routes?`, `middlewares?`). */
const inFolder = (f: ClassFacts, dirs: string) => !!f.file && new RegExp(`(^|/)(${dirs})/`).test(f.file)

export const NESTJS: FrameworkProfile = {
  language: "typescript",
  id: "nestjs",
  label: "NestJS",
  // `Injectable` is no vote: Angular services carry it too, and an Angular
  // app with more injectables than components read as a NestJS tie.
  detect: { imports: ["@nestjs/"], annotations: ["Module", "Controller"] },
  weight: 4,
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["Controller", "Resolver", "WebSocketGateway"], hint: "HTTP, GraphQL and socket entry points" },
    // Everything below is @Injectable() like every service, so the decorator
    // is read last: what a class implements, imports or is called decides.
    { id: "pipeline", label: "Guards, Pipes & Filters", color: "red", annotations: ["Catch"], supertypes: ["CanActivate", "PipeTransform", "NestInterceptor", "ExceptionFilter", "NestMiddleware"], rule: (f) => /(Guard|Pipe|Filter|Interceptor|Middleware)$/.test(f.name), nameSuffixes: ["Guard", "Pipe", "Filter", "Interceptor", "Middleware"], hint: "What every request passes through" },
    { id: "data", label: "Repositories & Clients", color: "amber", supertypes: ["Repository"], imports: ["typeorm", "@nestjs/typeorm", "@nestjs/mongoose", "prisma", "@prisma/client"], rule: (f) => /(Repository|Store|Client|Gateway|Dao)$/.test(f.name), nameSuffixes: ["Repository", "Store", "Client", "Gateway", "Dao"], hint: "Data access and outbound calls" },
    { id: "models", label: "DTOs & Entities", color: "violet", annotations: ["Entity", "Schema", "ObjectType", "InputType"], supertypes: TS_SHAPES, rule: isShape, nameSuffixes: ["Dto", "DTO", "Entity", "Schema", "Model"], hint: "Shapes crossing the boundary" },
    // A service that injects Repository<T> itself is still a service, so a
    // name ending in Service wins over the typeorm import.
    { id: "providers", label: "Providers & Other", color: "green", rule: (f) => isInjectable(f) && !/(Guard|Pipe|Filter|Interceptor|Middleware|Repository|Store|Client|Gateway|Dao)$/.test(f.name), ruleFirst: true, hint: "Services and everything unclassified" },
    // Wiring sits beside the layers, not in them: a module names its
    // controllers and providers alike.
    { id: "modules", label: "Modules", color: "neutral", annotations: ["Module"], hint: "What each module imports, provides and exports" },
  ],
  fallback: "providers",
}

export const ANGULAR: FrameworkProfile = {
  language: "typescript",
  id: "angular",
  label: "Angular",
  detect: { imports: ["@angular/"], annotations: ["NgModule"] },
  weight: 4,
  lanes: [
    { id: "components", label: "Components", color: "blue", annotations: ["Component"], nameSuffixes: ["Component", "Page", "View"], hint: "What the user sees" },
    // Guards, interceptors and resolvers are @Injectable() like every
    // service, and a functional guard is a plain function: what they
    // implement or are called decides before the decorator does.
    { id: "pipeline", label: "Directives, Pipes & Guards", color: "red", annotations: ["Directive", "Pipe"], supertypes: ["PipeTransform", "HttpInterceptor", "CanActivate", "CanActivateChild", "CanDeactivate", "CanMatch", "Resolve"], rule: (f) => /(Directive|Pipe|Guard|Resolver|Interceptor)$/.test(f.name), nameSuffixes: ["Directive", "Pipe", "Guard", "Resolver", "Interceptor"], hint: "What wraps the view and the router" },
    { id: "data", label: "Data access", color: "amber", imports: ["@angular/common/http", "rxjs/ajax", "@apollo/client", "@ngrx/"], nameSuffixes: ["Api", "Client", "Repository", "Gateway", "Adapter"], hint: "HTTP and state" },
    // A service is a service even when it is the one holding HttpClient,
    // which in Angular it usually is; only a name saying Api or Client is data.
    { id: "services", label: "Services & Other", color: "green", annotations: ["NgModule"], rule: (f) => isInjectable(f) && !/(Directive|Pipe|Guard|Resolver|Interceptor|Api|Client|Repository|Gateway|Adapter)$/.test(f.name), ruleFirst: true, nameSuffixes: ["Service", "Store", "Facade"], hint: "Injectables and everything unclassified" },
    { id: "models", label: "Models", color: "violet", supertypes: TS_SHAPES, rule: (f, s) => isShape(f) || looksLikeModel(f, s), nameSuffixes: ["Model", "Dto", "DTO", "Entity", "State", "Config"], hint: "Data shapes" },
  ],
  fallback: "services",
}

const importsReact = (f: ClassFacts) => [...f.imports].some(i => /^(react|preact)(\/|$)/.test(i))
/**
 * A React component: a top-level name in Pascal case that is not a declared
 * shape, in a .tsx or .jsx file, or in a .js file that imports React (Create
 * React App wrote JSX in .js for years). The report's tables count the same
 * way (REACT_COMPONENT).
 */
export const isReactComponent = (f: ClassFacts) => /^[A-Z]/.test(f.name) && !isShape(f) && (!f.file || /\.[jt]sx$/.test(f.file) || (/\.js$/.test(f.file) && importsReact(f)))
/** A component Next.js routes to: anything under pages/ but its API routes, and the app router's special files. */
export const isReactPage = (f: ClassFacts) =>
  isReactComponent(f) && !!f.file && (/(^|\/)pages\/(?!api\/).*\.[jt]sx?$/.test(f.file) || /(^|\/)app\/(.*\/)?(page|layout|template|loading|error|not-found|default)\.[jt]sx$/.test(f.file))

export const REACT: FrameworkProfile = {
  language: "typescript",
  id: "react",
  label: "React",
  detect: { imports: ["react", "react-dom", "next/", "@remix-run/"], weakImports: ["@testing-library/react"] },
  lanes: [
    { id: "pages", label: "Pages & Layouts", color: "blue", rule: isReactPage, ruleFirst: true, hint: "Components Next.js routes to, under pages/ or as app/ page and layout files" },
    { id: "components", label: "Components", color: "blue", rule: isReactComponent, ruleFirst: true, supertypes: ["Component", "PureComponent"], hint: "Named in Pascal case, in a .tsx or .jsx file" },
    // A hook that wraps useQuery or swr is still the hook the components
    // call; the client it calls is the data layer.
    { id: "hooks", label: "Hooks", color: "green", rule: (f) => /^use[A-Z]/.test(f.name), ruleFirst: true, hint: "Reusable stateful logic" },
    { id: "data", label: "Data & Clients", color: "amber", supertypes: ["createApi", "createSlice", "createAsyncThunk", "createSelector"], imports: ["@tanstack/react-query", "swr", "axios", "@apollo/client", "graphql-request"], nameSuffixes: ["Api", "Client", "Service", "Store", "Repository"], hint: "What talks to a server, and Redux state" },
    { id: "models", label: "Types & Models", color: "violet", supertypes: TS_SHAPES, rule: isShape, nameSuffixes: ["Type", "Types", "Model", "Schema", "Props", "State"], hint: "Shapes rather than behaviour" },
    { id: "other", label: "Utilities & Other", color: "neutral", hint: "Everything unclassified" },
  ],
  fallback: "other",
}

/**
 * A Vue single-file component. The engine makes each .vue file one unit named
 * for the file and marks it, since nothing in the script says it is one.
 */
export const isVueComponent = (f: ClassFacts) => f.annotations.has("vue_component")
/** Where Vue Router's file-based routing and Nuxt look for pages and layouts, and the root component. */
export const isVuePage = (f: ClassFacts) =>
  isVueComponent(f) && !!f.file && /(^|\/)(pages|layouts|views)\/|(^|\/)(App|app|error)\.vue$/.test(f.file)

export const VUE: FrameworkProfile = {
  language: "typescript",
  id: "vue",
  label: "Vue",
  detect: { imports: ["vue", "nuxt", "#app", "#imports", "vue-router", "pinia", "vuex", "@vue/"], annotations: ["vue_component"] },
  weight: 4,
  lanes: [
    { id: "pages", label: "Pages & Layouts", color: "blue", rule: isVuePage, ruleFirst: true, hint: "Components under pages/, layouts/ or views/, and the root App" },
    { id: "components", label: "Components", color: "blue", annotations: ["vue_component"], supertypes: ["defineComponent"], hint: "Every other .vue file, and defineComponent() in a script" },
    { id: "stores", label: "Stores", color: "green", supertypes: ["defineStore"], imports: ["pinia", "vuex", "@pinia/"], nameSuffixes: ["Store"], hint: "Pinia and Vuex state" },
    // A composable that wraps ofetch or vue-query is still the composable
    // the components call; a useXStore is a store, whatever made it.
    { id: "composables", label: "Composables", color: "green", rule: (f) => /^use[A-Z]/.test(f.name) && !/Store$/.test(f.name), ruleFirst: true, hint: "Reusable stateful logic, named use…" },
    { id: "data", label: "Data & Clients", color: "amber", imports: ["axios", "ofetch", "@tanstack/vue-query", "@vue/apollo-composable", "@apollo/client", "graphql-request"], nameSuffixes: ["Api", "Client", "Service", "Repository"], hint: "What talks to a server" },
    { id: "models", label: "Types & Models", color: "violet", supertypes: TS_SHAPES, rule: isShape, nameSuffixes: ["Type", "Types", "Model", "Schema", "Props", "State"], hint: "Shapes rather than behaviour" },
    { id: "other", label: "Utilities & Other", color: "neutral", hint: "Everything unclassified" },
  ],
  fallback: "other",
}

export const EXPRESS: FrameworkProfile = {
  language: "typescript",
  id: "express",
  label: "Express",
  detect: { imports: ["express", "koa", "@koa/", "fastify", "@fastify/", "@hapi/hapi"] },
  weight: 2,
  // Express has no decorators and its handlers are mostly plain functions
  // named for what they do, so the folder is the evidence, as it is for
  // Django: routes/, controllers/, middleware/, services/, repositories/.
  lanes: [
    { id: "middleware", label: "Middleware", color: "red", rule: (f) => inFolder(f, "middlewares?") || /(Middleware|Auth|Validator)$/.test(f.name), ruleFirst: true, nameSuffixes: ["Middleware", "Guard", "Auth", "Validator"], hint: "What every request passes through" },
    { id: "routes", label: "Routes & Handlers", color: "blue", imports: ["express", "koa", "@koa/", "fastify", "@hapi/hapi"], rule: (f) => inFolder(f, "routes?|controllers?|handlers?"), nameSuffixes: ["Route", "Routes", "Router", "Controller", "Handler", "Endpoint"], hint: "What answers a request: uses the framework's request and response, or lives under routes/ or controllers/" },
    { id: "data", label: "Data access", color: "amber", imports: ["mongoose", "sequelize", "typeorm", "knex", "pg", "mysql2", "redis", "ioredis", "@prisma/client"], rule: (f) => inFolder(f, "repositories|repository|dal|db"), nameSuffixes: ["Model", "Repository", "Dao", "Store", "Client"], hint: "Databases and caches" },
    { id: "services", label: "Services & Other", color: "green", rule: (f) => inFolder(f, "services?"), nameSuffixes: ["Service", "Manager", "Processor", "Job"], hint: "Everything unclassified" },
    { id: "models", label: "Schemas", color: "violet", supertypes: TS_SHAPES, rule: isShape, nameSuffixes: ["Schema", "Dto", "DTO", "Type", "Types"], hint: "Shapes crossing the boundary" },
  ],
  fallback: "services",
}

// ---------------------------------------------------------------------------
// Python
//
// Django puts the role in the filename, not in an annotation: django-oscar
// has 29 apps.py, 25 views.py and 24 models.py against 39 architectural
// decorators in the whole repository. Those filenames arrive as markers, so
// the lanes below read them the same way a Java lane reads @Service.
// ---------------------------------------------------------------------------

export const DJANGO: FrameworkProfile = {
  language: "python",
  id: "django",
  label: "Django",
  detect: { imports: ["django", "rest_framework", "oscar"], annotations: ["apps", "models", "views"], supertypes: ["AppConfig", "ModelAdmin", "ModelViewSet", "ModelSerializer"] },
  weight: 4,
  lanes: [
    // The filename is Django's evidence; the base class is what tells a
    // model in a `models/` package or a DRF viewset in `api.py` apart. Admin
    // classes render pages over the models, so they answer requests too.
    { id: "views", label: "Views, URLs & Admin", color: "blue", annotations: ["views", "urls", "viewsets", "admin", "api_view"], supertypes: ["View", "TemplateView", "ListView", "DetailView", "CreateView", "UpdateView", "DeleteView", "FormView", "RedirectView", "APIView", "GenericAPIView", "ViewSet", "GenericViewSet", "ModelViewSet", "ReadOnlyModelViewSet", "ModelAdmin", "TabularInline", "StackedInline"], nameSuffixes: ["View", "ViewSet", "Api", "Admin"], hint: "What answers a request" },
    { id: "forms", label: "Forms & Serializers", color: "amber", annotations: ["forms", "serializers"], supertypes: ["Form", "ModelForm", "BaseFormSet", "Widget", "Serializer", "ModelSerializer", "HyperlinkedModelSerializer", "ListSerializer"], nameSuffixes: ["Form", "Serializer"], hint: "What validates input" },
    { id: "models", label: "Models & Managers", color: "violet", annotations: ["models", "abstract_models", "managers"], supertypes: ["Model", "AbstractUser", "AbstractBaseUser", "Manager", "QuerySet", "TextChoices", "IntegerChoices"], nameSuffixes: ["Model", "Manager", "QuerySet"], hint: "Persistent state" },
    { id: "wiring", label: "Apps, Signals & Middleware", color: "red", annotations: ["apps", "signals", "receivers", "middleware", "settings", "receiver"], supertypes: ["AppConfig", "MiddlewareMixin"], hint: "Registration and cross-cutting" },
    // Generated schema history: 182 classes in django-oscar, every one named Migration, which would otherwise swamp Unclassified.
    { id: "migrations", label: "Migrations", color: "neutral", annotations: ["migrations"], supertypes: ["Migration"], hint: "Generated schema history, counted apart" },
    { id: "logic", label: "Logic & Other", color: "green", hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

export const FASTAPI: FrameworkProfile = {
  language: "python",
  id: "fastapi",
  label: "FastAPI & Flask",
  detect: { imports: ["fastapi", "flask", "starlette", "pydantic"] },
  weight: 2,
  lanes: [
    { id: "routes", label: "Routes", color: "blue", annotations: ["get", "post", "put", "delete", "patch", "options", "head", "websocket", "api_route", "route", "router"], supertypes: ["APIRouter", "MethodView", "Resource", "HTTPEndpoint"], nameSuffixes: ["Router", "Api", "Endpoint", "View"], hint: "Decorated request handlers" },
    { id: "background", label: "Tasks", color: "red", imports: ["celery", "rq", "apscheduler", "arq", "dramatiq"], annotations: ["tasks", "task", "shared_task", "periodic_task", "job"], nameSuffixes: ["Task", "Job", "Worker"], hint: "Work off the request path" },
    // Pydantic schemas, settings and dataclasses are shapes; a SQLAlchemy
    // model is one too, at the bottom. `Base` is the declarative base, and
    // a `models.py` in a FastAPI project holds the ORM models.
    { id: "models", label: "Schemas & Models", color: "violet", annotations: ["dataclass", "models"], supertypes: ["BaseModel", "BaseSettings", "SQLModel", "Base", "DeclarativeBase", "TypedDict", "Enum"], nameSuffixes: ["Schema", "Model", "Request", "Response", "Settings"], hint: "Pydantic and dataclass shapes, ORM models" },
    { id: "data", label: "Data access", color: "amber", imports: ["sqlalchemy", "sqlmodel", "databases", "motor", "pymongo", "redis", "asyncpg", "psycopg", "aiomysql", "httpx", "requests", "aiohttp", "boto3"], nameSuffixes: ["Repository", "Repo", "Dao", "Store", "Client", "Gateway"], hint: "Databases and outbound calls" },
    { id: "logic", label: "Logic & Other", color: "green", hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

// ---------------------------------------------------------------------------
// Go
//
// There are no annotations at all. The evidence is the import, the struct
// tag and the name -- gin carries 150 `form:` tags and archstats 15
// `//go:embed`, and those arrive as markers.
// ---------------------------------------------------------------------------

export const GO_HTTP: FrameworkProfile = {
  language: "go",
  id: "go-http",
  label: "Go services",
  detect: { imports: ["net/http", "github.com/gin-gonic", "github.com/labstack/echo", "github.com/go-chi", "github.com/gorilla/mux", "google.golang.org/grpc"] },
  lanes: [
    { id: "handlers", label: "Handlers & Routes", color: "blue", nameSuffixes: ["Handler", "Handlers", "Route", "Routes", "Server", "Controller", "Endpoint", "API"], hint: "What answers a request" },
    { id: "middleware", label: "Middleware", color: "red", nameSuffixes: ["Middleware", "Interceptor", "Auth", "Recovery", "Logger"], hint: "What every request passes through" },
    { id: "data", label: "Stores & Clients", color: "amber", imports: ["database/sql", "gorm.io", "github.com/jmoiron/sqlx", "go.mongodb.org", "github.com/redis", "github.com/jackc/pgx", "cloud.google.com/go", "github.com/aws/aws-sdk-go"], nameSuffixes: ["Repository", "Repo", "Store", "DAO", "Client", "Gateway", "Adapter"], hint: "Databases and outbound calls" },
    { id: "models", label: "Models", color: "violet", annotations: ["json", "db", "gorm", "yaml", "form"], nameSuffixes: ["Model", "Entity", "DTO", "Request", "Response", "Config", "Options", "Params"], hint: "Carries struct tags, so it crosses a boundary" },
    { id: "logic", label: "Logic & Other", color: "green", nameSuffixes: ["Service", "Manager", "Processor", "Worker", "Runner"], hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

export const GO_CLI: FrameworkProfile = {
  language: "go",
  id: "go-cli",
  label: "Go command line",
  detect: { imports: ["github.com/spf13/cobra", "github.com/urfave/cli", "flag"] },
  weight: 2,
  lanes: [
    { id: "commands", label: "Commands", color: "blue", nameSuffixes: ["Cmd", "Command"], rule: (f) => f.name === "main" || f.name === "Execute", hint: "What the user invokes" },
    // Named the way the service profile names its logic, so the lane has a
    // rule and survives as the layer between commands and stores; with none
    // it was folded into Unclassified and every command-to-logic edge vanished.
    { id: "logic", label: "Logic & Other", color: "green", nameSuffixes: ["Service", "Manager", "Processor", "Worker", "Runner", "Engine"], hint: "Everything unclassified" },
    { id: "data", label: "Stores & Clients", color: "amber", imports: ["database/sql", "net/http", "os/exec"], nameSuffixes: ["Repository", "Store", "Client", "Reader", "Writer", "Loader"], hint: "What reaches outside the process" },
    { id: "models", label: "Config & Models", color: "violet", annotations: ["json", "yaml", "toml", "mapstructure"], nameSuffixes: ["Config", "Options", "Settings", "Result", "Report"], hint: "Shapes and configuration" },
  ],
  fallback: "logic",
}

// ---------------------------------------------------------------------------
// C#
// ---------------------------------------------------------------------------

// A minimal API's Program.cs declares no type: its top-level statements
// arrive as a module unit named after the file, and they are where the
// routes are mapped. Before imports, or its `using Microsoft.EntityFrameworkCore`
// would make it data access.
const isAspNetHost = (f: ClassFacts) => f.name === "Program" || f.name === "Startup"

export const ASPNET: FrameworkProfile = {
  language: "csharp",
  id: "aspnet",
  label: "ASP.NET Core",
  detect: { imports: ["Microsoft.AspNetCore", "Microsoft.Extensions.DependencyInjection"], weakImports: ["Microsoft.EntityFrameworkCore", "Microsoft.Extensions"], supertypes: ["ControllerBase", "Controller", "PageModel", "Hub"] },
  lanes: [
    { id: "controllers", label: "Controllers & Endpoints", color: "blue", annotations: ["ApiController", "Route", "HttpGet", "HttpPost", "HttpPut", "HttpDelete", "HttpPatch"], supertypes: ["ControllerBase", "Controller", "PageModel", "Hub", "Endpoint", "EndpointWithoutRequest", "ICarterModule"], rule: isAspNetHost, ruleFirst: true, nameSuffixes: ["Controller", "Endpoint", "Endpoints", "Hub"], hint: "Web entry points, Program and Startup among them" },
    // Before services, so an AuthorizationHandler is pipeline by its base and not a service by its name.
    { id: "pipeline", label: "Middleware & Filters", color: "red", supertypes: ["IMiddleware", "IActionFilter", "IAsyncActionFilter", "IExceptionFilter", "IAsyncExceptionFilter", "IAuthorizationFilter", "IAsyncAuthorizationFilter", "IResultFilter", "IAsyncResultFilter", "IResourceFilter", "IEndpointFilter", "IExceptionHandler", "ActionFilterAttribute", "ExceptionFilterAttribute", "ResultFilterAttribute", "AuthorizeAttribute", "AuthorizationHandler", "IAuthorizationRequirement", "DelegatingHandler", "Attribute"], nameSuffixes: ["Middleware", "Filter", "Attribute", "Policy", "Requirement"], hint: "What every request passes through" },
    { id: "services", label: "Services & Other", color: "green", supertypes: ["IRequestHandler", "INotificationHandler", "IHostedService", "BackgroundService", "AbstractValidator"], nameSuffixes: ["Service", "Manager", "Handler", "Factory", "Provider", "Processor", "Validator"], hint: "Everything unclassified" },
    { id: "data", label: "Data access", color: "amber", supertypes: ["DbContext", "IdentityDbContext", "IEntityTypeConfiguration", "IRepository"], imports: ["Microsoft.EntityFrameworkCore", "Dapper", "MongoDB.Driver", "StackExchange.Redis", "Npgsql", "Microsoft.Data.SqlClient", "System.Data.SqlClient"], nameSuffixes: ["Repository", "DbContext", "Dao", "Store", "Client"], hint: "EF Core and clients" },
    // A record, struct or enum is a shape by construction; the engine marks the keyword.
    { id: "models", label: "Entities & DTOs", color: "violet", annotations: ["Table", "Key", "Owned", "Keyless", "JsonProperty", "JsonPropertyName", "DataContract", "record", "struct", "enum"], supertypes: ["IRequest", "INotification", "BaseEntity", "Entity", "IEntity", "AggregateRoot", "ValueObject", "IdentityUser", "IdentityRole"], nameSuffixes: ["Entity", "Model", "Dto", "DTO", "Request", "Response", "ViewModel", "Options", "Settings", "Command", "Query", "Event"], hint: "Shapes and persistent state" },
  ],
  fallback: "services",
}

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------

// PHP puts a role in the directory as much as in the base class: `artisan
// make:middleware` writes to app/Http/Middleware and the class extends
// nothing, and a Sylius model is a class or an interface under Model/.
const under = (...dirs: string[]) => (f: ClassFacts) => !!f.file && dirs.some(d => f.file!.includes(`/${d}/`))

export const LARAVEL: FrameworkProfile = {
  language: "php",
  id: "laravel",
  label: "Laravel",
  detect: { imports: ["Illuminate\\"], supertypes: ["Model", "Controller", "ServiceProvider", "FormRequest", "Seeder"] },
  weight: 4,
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", supertypes: ["Controller", "BaseController"], rule: under("Http/Controllers"), nameSuffixes: ["Controller"], hint: "What answers a request" },
    { id: "forms", label: "Requests & Resources", color: "amber", supertypes: ["FormRequest", "JsonResource", "ResourceCollection"], rule: under("Http/Requests", "Http/Resources"), nameSuffixes: ["Request", "Resource"], hint: "What validates input and shapes output" },
    { id: "models", label: "Eloquent models", color: "violet", supertypes: ["Model", "Authenticatable", "Pivot", "MorphPivot"], rule: under("Models"), hint: "Persistent state" },
    // A job or command is an entry point the queue or the terminal calls, not data access; it used to sit in "Repositories & Jobs" below the logic it calls.
    { id: "background", label: "Jobs, Events & Listeners", color: "red", supertypes: ["ShouldQueue", "ShouldBroadcast", "Command", "Mailable", "Notification"], rule: under("Jobs", "Console/Commands", "Listeners", "Events", "Mail", "Notifications", "Observers"), nameSuffixes: ["Job", "Command", "Listener", "Event", "Mail", "Notification", "Observer"], hint: "Queued work, console commands and what reacts to events" },
    { id: "wiring", label: "Providers, Middleware & Policies", color: "neutral", supertypes: ["ServiceProvider", "HttpKernel", "ConsoleKernel", "ExceptionHandler"], rule: under("Providers", "Http/Middleware", "Policies", "Exceptions"), nameSuffixes: ["ServiceProvider", "Middleware", "Kernel", "Policy", "Gate"], hint: "Registration and cross-cutting" },
    { id: "data", label: "Repositories", color: "amber", imports: ["Illuminate\\Support\\Facades\\DB", "Illuminate\\Support\\Facades\\Http", "Illuminate\\Database\\Query", "Illuminate\\Database\\ConnectionInterface"], rule: under("Repositories"), nameSuffixes: ["Repository", "Query", "Client", "Gateway"], hint: "Data access and outbound calls" },
    { id: "logic", label: "Services & Other", color: "green", rule: under("Services", "Actions"), nameSuffixes: ["Service", "Action", "Manager", "Handler"], hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

export const SYMFONY: FrameworkProfile = {
  language: "php",
  id: "symfony",
  label: "Symfony",
  detect: { imports: ["Symfony\\Component", "Symfony\\Bundle", "Doctrine\\"], supertypes: ["AbstractController", "AbstractBundle", "Bundle", "ServiceEntityRepository"] },
  weight: 2,
  lanes: [
    // A message handler or console command is an entry point like a
    // controller: the bus or the terminal calls it, and it calls the
    // services. Read as wiring it sat beside the layers instead of on top.
    { id: "controllers", label: "Controllers & Handlers", color: "blue", annotations: ["Route", "AsController", "AsMessageHandler", "AsCommand"], supertypes: ["AbstractController", "Controller", "MessageHandlerInterface", "Command"], rule: under("Controller"), nameSuffixes: ["Controller", "Action"], hint: "Controllers, message handlers and console commands" },
    { id: "forms", label: "Forms & Validators", color: "amber", supertypes: ["AbstractType", "AbstractTypeExtension", "AbstractResourceType", "Constraint", "ConstraintValidator", "DataTransformerInterface", "NormalizerInterface", "DenormalizerInterface"], rule: under("Form", "Validator"), nameSuffixes: ["Type", "TypeExtension", "Validator", "Normalizer", "DataTransformer"], hint: "What validates input and shapes output" },
    // Sylius-style models map to Doctrine in XML, not in attributes: they are
    // known by the resource interface or a Model folder, interfaces included,
    // since every type hint in that code names the interface.
    { id: "models", label: "Entities & Models", color: "violet", annotations: ["Entity", "Embeddable", "MappedSuperclass", "Table"], supertypes: ["ResourceInterface", "TimestampableInterface", "Model", "Authenticatable", "UserInterface"], rule: under("Entity", "Model"), nameSuffixes: ["Entity"], hint: "Persistent state" },
    { id: "data", label: "Repositories & Providers", color: "amber", supertypes: ["ServiceEntityRepository", "EntityRepository", "RepositoryInterface", "ObjectRepository"], rule: under("Repository"), nameSuffixes: ["Repository", "RepositoryInterface", "Provider", "Loader", "Client"], hint: "Data access" },
    { id: "wiring", label: "Bundles, Subscribers & Compiler passes", color: "red", annotations: ["AsEventListener", "AsDecorator"], supertypes: ["Bundle", "AbstractBundle", "AbstractResourceBundle", "Extension", "AbstractExtension", "AbstractResourceExtension", "CompilerPassInterface", "EventSubscriberInterface", "ConfigurationInterface", "Voter", "Kernel"], rule: under("DependencyInjection", "EventSubscriber", "EventListener"), nameSuffixes: ["Bundle", "Extension", "Subscriber", "Listener", "Pass", "Voter", "Kernel"], hint: "Registration and events" },
    { id: "logic", label: "Services & Other", color: "green", rule: under("Service", "Services"), nameSuffixes: ["Service", "Manager", "Factory", "Handler", "Resolver", "Processor", "Calculator", "Checker", "Applicator", "Generator", "Assigner", "Modifier"], hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

// ---------------------------------------------------------------------------
// Kotlin
// ---------------------------------------------------------------------------

// Ktor's entry points are extension functions -- `fun Route.users()` answers
// requests, `fun Application.module()` installs them -- and the engine
// records the receiver as a marker, which the unit loader hands over as an
// annotation. A data class is Kotlin's model shape, recorded the same way.
export const KTOR: FrameworkProfile = {
  language: "kotlin",
  id: "ktor",
  label: "Ktor",
  // The server packages, not the client: an Android or multiplatform app
  // calling an API with io.ktor.client is not a Ktor application.
  detect: { imports: ["io.ktor.server", "io.ktor.application", "io.ktor.routing", "io.ktor.features"], weakImports: ["io.ktor"] },
  weight: 2,
  lanes: [
    { id: "routes", label: "Routes & Modules", color: "blue", annotations: ["Route", "Routing", "Application"], rule: isMain, nameSuffixes: ["Route", "Routes", "Routing", "Api", "Controller"], hint: "What answers a request, and the modules that install it" },
    { id: "plugins", label: "Plugins", color: "red", supertypes: ["BaseApplicationPlugin", "ApplicationPlugin", "BaseRouteScopedPlugin"], nameSuffixes: ["Plugin", "Feature", "Interceptor", "Auth"], hint: "What every request passes through" },
    { id: "data", label: "Repositories & Clients", color: "amber", supertypes: ["Table", "IdTable", "IntIdTable", "LongIdTable", "UUIDTable", "CompositeIdTable"], imports: ["org.jetbrains.exposed", "io.ktor.client", "com.zaxxer.hikari", "org.jdbi", "org.ktorm", "app.cash.sqldelight"], nameSuffixes: ["Repository", "Dao", "Store", "Client", "Table"], hint: "Databases and outbound calls" },
    { id: "models", label: "Models", color: "violet", annotations: ["Serializable", "data"], supertypes: ["IntEntity", "LongEntity", "UUIDEntity"], rule: looksLikeModel, nameSuffixes: ["Dto", "DTO", "Model", "Request", "Response", "Entity"], hint: "Data classes and Exposed entities" },
    { id: "logic", label: "Services & Other", color: "green", nameSuffixes: ["Service", "UseCase", "Manager", "Processor", "Validator"], hint: "Services and everything unclassified" },
  ],
  fallback: "logic",
}

// ---------------------------------------------------------------------------
// iOS: SwiftUI and UIKit, in Swift and Objective-C
//
// A Swift import names a framework, so detection reads SwiftUI and UIKit
// themselves. A SwiftUI view conforms to View; a screen is one named for
// being one, since nothing else in the language says so.
// ---------------------------------------------------------------------------

const SWIFTUI_VIEWS = ["View", "ViewModifier", "UIViewRepresentable", "UIViewControllerRepresentable", "Shape", "ButtonStyle", "PreviewProvider"]
const UIKIT_VIEWS = ["UIView", "UITableViewCell", "UICollectionViewCell", "UICollectionReusableView", "UIControl", "UIButton", "UILabel", "UIStackView", "UIScrollView"]
const UIKIT_SCREENS = ["UIViewController", "UITableViewController", "UICollectionViewController", "UINavigationController", "UITabBarController", "UIPageViewController", "UIHostingController", "UISplitViewController"]
// A value type with any of these is a model; a class only when it is coded,
// since a class that is merely Hashable is as likely a coordinator.
const APPLE_VALUE_MODELS = ["Codable", "Decodable", "Encodable", "Identifiable", "Hashable", "Equatable", "Sendable"]
const APPLE_CODED = ["Codable", "Decodable", "Encodable", "NSCoding", "NSSecureCoding"]
// SwiftData's @Model and Core Data's NSManagedObject are the persistent
// records, the bottom of the stack as a JPA entity is; the stores that read
// them are the data layer.
const APPLE_RECORDS = ["NSManagedObject", "PersistentModel"]
export const isSwiftUIScreen = (f: ClassFacts) =>
  [...SWIFTUI_VIEWS].some(v => f.supertypes.has(v)) && /(Screen|Page|Tab|Scene)$/.test(f.name)
const looksLikeAppleModel = (f: ClassFacts, s: ClassSignals) =>
  !SWIFTUI_VIEWS.some(v => f.supertypes.has(v)) && s.outDegree <= 3 &&
  (((f.annotations.has("struct") || f.annotations.has("enum")) && APPLE_VALUE_MODELS.some(m => f.supertypes.has(m))) || APPLE_CODED.some(m => f.supertypes.has(m)))

export const IOS: FrameworkProfile = {
  language: ["swift", "objc"],
  id: "ios",
  label: "iOS (SwiftUI & UIKit)",
  detect: { imports: ["SwiftUI", "UIKit", "AppKit", "WidgetKit", "WatchKit"], weakImports: ["Foundation", "Combine", "Observation"], supertypes: ["UIApplicationDelegate", "App"] },
  lanes: [
    { id: "app", label: "App & lifecycle", color: "neutral", annotations: ["main", "UIApplicationMain", "NSApplicationMain"], supertypes: ["App", "UIApplicationDelegate", "UIWindowSceneDelegate", "UISceneDelegate", "WidgetBundle", "Widget"], nameSuffixes: ["AppDelegate", "SceneDelegate"], hint: "Where the app starts" },
    { id: "screens", label: "Screens", color: "blue", supertypes: UIKIT_SCREENS, rule: isSwiftUIScreen, ruleFirst: true, nameSuffixes: ["ViewController"], hint: "View controllers, and SwiftUI views named for a screen" },
    { id: "views", label: "Views", color: "blue", supertypes: [...SWIFTUI_VIEWS, ...UIKIT_VIEWS], nameSuffixes: ["View", "Cell"], hint: "SwiftUI views and UIKit views below the screen" },
    { id: "state", label: "State & Logic", color: "green", annotations: ["Observable", "ObservableState", "Published", "MainActor"], supertypes: ["ObservableObject"], nameSuffixes: ["ViewModel", "Store", "Coordinator", "Router", "Presenter", "Interactor", "Manager"], hint: "View models, stores and coordinators" },
    { id: "data", label: "Data & Networking", color: "amber", supertypes: ["Endpoint", "TargetType"], imports: ["Alamofire", "Moya", "CoreData", "SwiftData", "GRDB", "RealmSwift", "Apollo", "FirebaseFirestore"], nameSuffixes: ["Client", "Service", "API", "Api", "Repository", "Endpoint", "Request", "Cache"], hint: "Network clients, persistence, caches" },
    { id: "models", label: "Models", color: "violet", annotations: ["Model"], supertypes: APPLE_RECORDS, rule: looksLikeAppleModel, hint: "Value types that cross boundaries, and the persistent records" },
  ],
  fallback: "state",
}

/** The Composable Architecture: reducers, their views, and dependency clients. */
export const TCA: FrameworkProfile = {
  language: ["swift"],
  id: "tca",
  label: "The Composable Architecture",
  refines: "ios",
  weight: 4,
  detect: { imports: ["ComposableArchitecture"], annotations: ["Reducer", "DependencyClient"], supertypes: ["Reducer"] },
  lanes: [
    { id: "features", label: "Reducers", color: "green", annotations: ["Reducer", "ObservableState"], supertypes: ["Reducer"], hint: "Features: state, actions and how one becomes the next" },
    { id: "views", label: "Views", color: "blue", supertypes: SWIFTUI_VIEWS, nameSuffixes: ["View"], hint: "What renders a store" },
    { id: "clients", label: "Dependencies", color: "amber", annotations: ["DependencyClient"], supertypes: ["DependencyKey", "TestDependencyKey"], nameSuffixes: ["Client"], hint: "Effects behind an interface: network, storage, clocks" },
    { id: "models", label: "Models", color: "violet", annotations: ["Model"], supertypes: APPLE_RECORDS, rule: looksLikeAppleModel, hint: "Value types" },
    { id: "app", label: "App & lifecycle", color: "neutral", annotations: ["main"], supertypes: ["App", "UIApplicationDelegate"], nameSuffixes: ["AppDelegate", "SceneDelegate"], hint: "Where the app starts" },
    // Most TCA apps keep a corner of plain SwiftUI state; shown apart, since
    // it is what a migration has left to do.
    { id: "state", label: "SwiftUI state", color: "neutral", annotations: ["Observable", "Published"], supertypes: ["ObservableObject"], hint: "ObservableObjects beside the reducers" },
  ],
  fallback: "features",
}

// ---------------------------------------------------------------------------
// Flutter
//
// Everything is a widget, so the widget's name and what it holds decide the
// lane. State management is whichever of Bloc, Riverpod, Provider or GetX
// the app chose, read from the base types and the riverpod annotation.
// ---------------------------------------------------------------------------

const FLUTTER_WIDGETS = ["StatelessWidget", "StatefulWidget", "ConsumerWidget", "ConsumerStatefulWidget", "HookWidget", "HookConsumerWidget", "StatelessHookWidget", "GetView", "GetWidget"]
const FLUTTER_STATES = ["State", "ConsumerState"]
// Riverpod without codegen declares providers as top-level variables; the
// engine makes each one a unit marked with the constructor that made it.
const RIVERPOD_PROVIDERS = ["Provider", "StateProvider", "FutureProvider", "StreamProvider", "StateNotifierProvider", "ChangeNotifierProvider", "NotifierProvider", "AsyncNotifierProvider", "StreamNotifierProvider"]
const FLUTTER_SCREEN_NAME = /(Screen|Page|Route|View)$/
// A StatefulWidget's code is in its State class, `_HomeScreenState`; the
// screen's edges to its bloc or repository come from there, so it is the
// screen too.
export const isFlutterScreen = (f: ClassFacts) =>
  f.annotations.has("RoutePage") ||
  (FLUTTER_WIDGETS.some(w => f.supertypes.has(w)) && FLUTTER_SCREEN_NAME.test(f.name)) ||
  (FLUTTER_STATES.some(w => f.supertypes.has(w)) && /(Screen|Page|Route|View)State$/.test(f.name))
// Bloc spreads a feature over `x_bloc.dart`, `x_event.dart` and `x_state.dart`:
// the event and state classes extend the app's own base class, so the file
// is what says they are data shapes.
const isBlocShapeFile = (f: ClassFacts) => !!f.file && /_(event|state)\.dart$/.test(f.file)

export const FLUTTER: FrameworkProfile = {
  language: ["dart"],
  id: "flutter",
  label: "Flutter",
  detect: { imports: ["flutter/", "flutter_riverpod/", "hooks_riverpod/", "flutter_bloc/", "get/"], supertypes: ["StatelessWidget", "StatefulWidget"] },
  lanes: [
    { id: "screens", label: "Screens", color: "blue", annotations: ["RoutePage"], rule: isFlutterScreen, ruleFirst: true, hint: "Widgets named for a screen or page, with their State classes" },
    { id: "widgets", label: "Widgets", color: "blue", supertypes: [...FLUTTER_WIDGETS, ...FLUTTER_STATES, "CustomPainter", "CustomClipper", "RenderBox", "SingleChildRenderObjectWidget", "InheritedWidget"], hint: "Everything else that builds UI" },
    { id: "state", label: "State management", color: "green", annotations: ["riverpod", "Riverpod", "injectable", "singleton", "lazySingleton"], supertypes: ["Bloc", "Cubit", "HydratedBloc", "HydratedCubit", "ChangeNotifier", "StateNotifier", "Notifier", "AsyncNotifier", "StreamNotifier", "ValueNotifier", "GetxController", ...RIVERPOD_PROVIDERS], nameSuffixes: ["Bloc", "Cubit", "Notifier", "Controller", "Provider", "Store", "ViewModel", "Logic"], hint: "Bloc, Riverpod, Provider, GetX" },
    { id: "data", label: "Data & Services", color: "amber", supertypes: ["Table", "DatabaseAccessor", "GeneratedDatabase", "GetxService"], imports: ["dio/", "http/", "drift/", "sqflite/", "isar/", "hive/", "shared_preferences/", "cloud_firestore/", "supabase_flutter/"], nameSuffixes: ["Repository", "Api", "Client", "Service", "Dao", "DataSource", "Database"], hint: "Network, storage, platform services" },
    { id: "models", label: "Models", color: "violet", annotations: ["freezed", "Freezed", "JsonSerializable", "collection", "HiveType", "immutable"], supertypes: ["Equatable"], rule: (f, s) => looksLikeModel(f, s) || isBlocShapeFile(f), nameSuffixes: ["Model", "Entity", "Dto", "Event", "State"], hint: "Data shapes, Bloc events and states" },
    { id: "other", label: "Utilities & Other", color: "neutral", hint: "Everything unclassified" },
  ],
  fallback: "other",
}

// React Native: React with native modules and screens behind a navigator.
const isRNComponent = (f: ClassFacts) => /^[A-Z]/.test(f.name) && !f.isInterface && (!f.file || /\.[jt]sx$/.test(f.file))
// Expo Router and React Navigation name screens by where the file is, not by
// a suffix: every component under app/ is a route or a layout, and screens/
// is the folder React Navigation apps keep them in.
const isRNRouteFile = (f: ClassFacts) => !!f.file && /(^|\/)(app|screens)\//.test(f.file) && !/\/(components|ui|hooks|utils|lib)\//.test(f.file)
export const isRNScreen = (f: ClassFacts) => isRNComponent(f) && (/(Screen|Page|Route|Modal|Layout)$/.test(f.name) || isRNRouteFile(f))
// A TurboModule spec is an interface called Spec, by the codegen's convention, in specs/.
const isNativeSpec = (f: ClassFacts) => (f.isInterface && f.name === "Spec") || (!!f.file && /(^|\/)specs\//.test(f.file))

export const REACT_NATIVE: FrameworkProfile = {
  language: "typescript",
  id: "react-native",
  label: "React Native",
  refines: "react",
  weight: 4,
  detect: { imports: ["react-native", "expo", "expo-", "@react-navigation/", "expo-router"] },
  lanes: [
    { id: "screens", label: "Screens", color: "blue", rule: isRNScreen, ruleFirst: true, hint: "Components named for a screen, and route files" },
    { id: "components", label: "Components", color: "blue", rule: isRNComponent, ruleFirst: true, hint: "Named in Pascal case, in a .tsx or .jsx file" },
    // Before the imports: a hook that reads a Redux store or calls axios is a hook, as its name says.
    { id: "hooks", label: "Hooks", color: "green", rule: (f) => /^use[A-Z]/.test(f.name), ruleFirst: true, hint: "Reusable stateful logic" },
    { id: "state", label: "State", color: "green", supertypes: ["createSlice"], imports: ["@reduxjs/toolkit", "react-redux", "zustand", "jotai", "mobx", "@tanstack/react-query", "recoil"], rule: (f) => /^select[A-Z]/.test(f.name), nameSuffixes: ["Store", "Slice", "Reducer", "Context"], hint: "Slices, stores, selectors and server state" },
    { id: "native", label: "Native bridges", color: "red", imports: ["react-native/Libraries", "expo-modules-core"], rule: isNativeSpec, nameSuffixes: ["Module", "NativeModule", "Spec"], hint: "Where JavaScript calls native code" },
    { id: "data", label: "Data & Clients", color: "amber", supertypes: ["createApi"], imports: ["axios", "@apollo/client", "graphql-request", "@atproto/api"], nameSuffixes: ["Api", "Client", "Service", "Repository"], hint: "What talks to a server" },
    { id: "models", label: "Types & Models", color: "violet", rule: (f) => f.isInterface, nameSuffixes: ["Type", "Types", "Model", "Schema", "Props", "State"], hint: "Shapes rather than behaviour" },
    { id: "other", label: "Utilities & Other", color: "neutral", hint: "Everything unclassified" },
  ],
  fallback: "other",
}

/**
 * The database, cache, queue and HTTP-client packages of every language the
 * structural profile is used for, since it is used for all of them. Read
 * with DATA_IMPORTS alone, a Go store calling database/sql or a Python one on
 * sqlalchemy was logic.
 */
const STRUCTURE_DATA_IMPORTS = [
  ...DATA_IMPORTS,
  "database/sql", "gorm.io", "github.com/jmoiron/sqlx", "go.mongodb.org", "github.com/redis", "github.com/jackc/pgx", "cloud.google.com/go", "github.com/aws/aws-sdk-go",
  "sqlalchemy", "pymongo", "motor", "psycopg2", "asyncpg", "httpx", "requests",
  "mongoose", "sequelize", "typeorm", "knex", "mysql2", "ioredis", "@prisma/client", "axios",
  "Microsoft.EntityFrameworkCore", "Dapper", "MongoDB.Driver", "StackExchange.Redis",
  "Doctrine\\", "Illuminate\\Database",
  "org.jetbrains.exposed",
]

/** No framework: lanes from what the code does, with naming only as a tiebreaker. */
export const STRUCTURE: FrameworkProfile = {
  id: "structure",
  label: "By structure",
  detect: {},
  lanes: [
    { id: "entry", label: "Entry points", color: "blue", byReferences: true, rule: looksLikeEntry, nameSuffixes: ["Controller", "Resource", "Handler", "Endpoint", "Listener", "Main", "Application", "Command", "Cli", "Job", "Task", "Scheduler"], hint: "Has main, or nothing references it" },
    { id: "logic", label: "Logic & Other", color: "green", nameSuffixes: ["Service", "Manager", "Processor", "UseCase", "Interactor", "Facade", "Engine", "Strategy", "Validator", "Factory", "Builder", "Helper", "Util", "Utils"], hint: "Everything unclassified" },
    { id: "data", label: "Data access", color: "amber", imports: STRUCTURE_DATA_IMPORTS, nameSuffixes: ["Repository", "Dao", "DAO", "Store", "Client", "Gateway", "Adapter", "Connector", "Provider"], hint: "Imports a database, queue or HTTP client" },
    { id: "models", label: "Models", color: "violet", rule: looksLikeModel, nameSuffixes: ["Entity", "Dto", "DTO", "Model", "Request", "Response", "Event", "Record", "Vo", "VO", "Pojo", "Config", "Properties", "Exception"], hint: "Records and field-heavy types" },
  ],
  fallback: "logic",
}

/** The lane of a unit that matched none of its profile's rules. */
export const UNCLASSIFIED = "unclassified"

/**
 * A profile with its own "& Other" lane split in two: what the rules matched,
 * and a separate Unclassified lane for what they did not.
 *
 * Every profile used to send unmatched units into one of its real lanes --
 * "Services & Other", "Logic & Other" -- so an explicit @Service and a class
 * that matched nothing were indistinguishable, and every claim about lanes
 * inherited it: Broadleaf's lead finding, "Entities and Services & Other
 * depend on each other", was 978 of 1,099 references landing on classes that
 * were Services only by default. A lane that no rule ever fills is folded
 * into Unclassified rather than kept under a name nothing earned.
 */
export function withUnclassified(p: FrameworkProfile): FrameworkProfile {
  const hasRule = (l: LaneDef) => !!(l.annotations?.length || l.supertypes?.length || l.legacy?.length ||
    l.imports?.length || l.rule || l.nameSuffixes?.length)
  const lanes = p.lanes.filter(hasRule).map(l => {
    const hint = l.hint?.replace(/,?\s*(and\s+)?everything unclassified$/i, "").trim()
    return { ...l, label: l.label.replace(/\s*&\s*Other$/, ""), hint: hint || undefined }
  })
  lanes.push({ id: UNCLASSIFIED, label: "Unclassified", color: "neutral", hint: "Matched none of this profile's rules" })
  return { ...p, lanes, fallback: UNCLASSIFIED }
}

export const PROFILES: FrameworkProfile[] = [
  SPRING, JAKARTA, QUARKUS, MICRONAUT, VERTX, DROPWIZARD, ANDROID, BEAM,
  NESTJS, ANGULAR, REACT, VUE, EXPRESS,
  DJANGO, FASTAPI,
  GO_HTTP, GO_CLI,
  ASPNET,
  LARAVEL, SYMFONY,
  KTOR,
  IOS, TCA,
  FLUTTER,
  REACT_NATIVE,
  STRUCTURE,
].map(withUnclassified)

/**
 * The profiles worth offering for a language, plus the structural one, which
 * is about no framework and therefore about all of them.
 */
export function profilesFor(language: Language | null): FrameworkProfile[] {
  if (!language) return PROFILES
  return PROFILES.filter(p => !p.language || (Array.isArray(p.language) ? p.language.includes(language) : p.language === language))
}
export const AUTO = "auto"
const NO_SIGNALS: ClassSignals = { inDegree: 0, outDegree: 0 }

const STRUCTURE_PROFILE = withUnclassified(STRUCTURE)

export function profileById(id: string): FrameworkProfile {
  return PROFILES.find(p => p.id === id) ?? STRUCTURE_PROFILE
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
export function detectFramework(facts: Iterable<ClassFacts>, language: Language | null = null): Detection {
  // Only the profiles for this language get a vote. The signals are not
  // disjoint -- `@Injectable` is Angular and NestJS, `Controller` is Spring
  // and Micronaut and Laravel -- so a profile allowed to vote on a codebase
  // it was never written for will eventually win one.
  const eligible = profilesFor(language)
  const counts = new Map<string, { strong: number; weak: number }>()
  for (const p of eligible) counts.set(p.id, { strong: 0, weak: 0 })
  let total = 0
  for (const f of facts) {
    total++
    for (const p of eligible) {
      if (p.id === STRUCTURE.id) continue
      const c = counts.get(p.id)!
      if (strongVote(p, f)) c.strong++
      else if (weakVote(p, f)) c.weak++
    }
  }
  const candidates: Candidate[] = eligible
    .filter(p => p.id !== STRUCTURE.id)
    .map(p => { const c = counts.get(p.id)!; return { id: p.id, label: p.label, strong: c.strong, weak: c.weak, score: c.strong * 3 + c.weak } })
    .filter(c => c.strong + c.weak > 0)
  // Quarkus, Micronaut and Dropwizard are built on the Jakarta standard, so
  // Jakarta EE votes are theirs when any of them shows strong evidence.
  const specific = candidates.some(c => (profileById(c.id).weight ?? 1) >= 4 && c.strong > 0 && !profileById(c.id).refines)
  const demoted = new Set<string>()
  if (specific) for (const c of candidates) if (c.id === JAKARTA.id) { c.score = Math.floor(c.score / 4); demoted.add(c.id) }
  for (const c of candidates) {
    const general = profileById(c.id).refines
    if (!general || c.strong < 3) continue
    for (const g of candidates) if (g.id === general) { g.score = Math.floor(g.score / 4); demoted.add(g.id) }
  }
  candidates.sort((a, b) => b.score - a.score || b.strong - a.strong)
  const best = candidates[0]
  const runnerUp = candidates.find(c => c !== best && !demoted.has(c.id))
  if (!best) return { id: STRUCTURE.id, confident: true, candidates, total, reason: total ? "No framework packages are imported anywhere." : "" }
  const share = total ? (best.strong + best.weak) / total : 0
  const enoughStrong = best.strong >= 3
  // Ten strong classes carry a large codebase with a small share, but not a
  // vanishing one: Exposed, an ORM, has 14 files importing Ktor among 2,810
  // and was read as a Ktor application with 2,163 "repositories".
  const enoughShare = share >= 0.03 || (best.strong >= 10 && share >= 0.01)
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
  for (const lane of profile.lanes) if (hasAny(facts.annotations, lane.annotations) || hasAny(facts.supertypes, lane.supertypes) || hasAny(facts.legacy, lane.legacy) || (lane.ruleFirst && lane.rule?.(facts, signals))) return lane.id
  for (const lane of profile.lanes) if (importsAny(facts.usedImports ?? facts.imports, lane.imports)) return lane.id
  for (const lane of profile.lanes) if (lane.rule && lane.rule(facts, signals)) return lane.id
  // A name that is only the suffix says nothing in a language that qualifies
  // by class: a Java `Service` is a base type or a placeholder. Go qualifies
  // by package, so `grpc.Server`, `store.Store` and `config.Config` are the
  // idiom and say exactly what they are.
  const bare = packageQualified(facts)
  // PHP names an interface for its role and then says so: OrderRepositoryInterface.
  const name = facts.name.length > "Interface".length ? facts.name.replace(/Interface$/, "") : facts.name
  for (const lane of profile.lanes) if (lane.nameSuffixes?.some(suffix => name.endsWith(suffix) && (bare || name !== suffix))) return lane.id
  return profile.fallback
}

const packageQualified = (f: ClassFacts) => !!f.file && f.file.endsWith(".go")

export function laneOf(profile: FrameworkProfile, laneId: string): LaneDef {
  return profile.lanes.find(l => l.id === laneId) ?? profile.lanes.find(l => l.id === profile.fallback) ?? profile.lanes[0]
}

export function laneDotClass(color: LaneColor): string {
  return { blue: "bg-blue-500", green: "bg-green-500", amber: "bg-amber-500", violet: "bg-violet-500", red: "bg-red-500", neutral: "bg-neutral-400" }[color]
}
