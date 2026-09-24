// Framework profiles for the Classes view. The engine records neutral facts
// about every type (annotations, supertypes, imports, declarations, member
// counts); a profile turns those plus the class graph into lanes. Detection
// is by imports first, because a project's package imports say what it is
// built on far more reliably than any one annotation.

export type LaneColor = "blue" | "green" | "amber" | "violet" | "red" | "neutral"

/** The languages that have profiles of their own. */
export type Language = "java" | "kotlin" | "csharp" | "typescript" | "python" | "go" | "php"

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
    case "ts": case "tsx": case "mts": case "cts": case "js": case "jsx": case "mjs": case "cjs": return "typescript"
    case "py": return "python"
    case "go": return "go"
    case "php": return "php"
    default: return null
  }
}

export interface ClassFacts {
  name: string
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
   */
  language?: Language
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
  language: "java",
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
  language: "java",
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
  language: "java",
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
  language: "java",
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
  language: "java",
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
    { id: "models", label: "Configuration & Models", color: "violet", supertypes: ["Configuration"], rule: looksLikeModel, hint: "Config and data shapes" },
  ],
  fallback: "app",
}

export const ANDROID: FrameworkProfile = {
  // Written in both, and the signals are identical either way.
  language: "java",
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
  language: "java",
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


// ---------------------------------------------------------------------------
// TypeScript and JavaScript
//
// The unit here is usually a function: LibreChat is 3,241 of them to 294
// types. Decorators exist only in Angular and NestJS; everywhere else the
// evidence is the import and the name.
// ---------------------------------------------------------------------------

export const NESTJS: FrameworkProfile = {
  language: "typescript",
  id: "nestjs",
  label: "NestJS",
  detect: { imports: ["@nestjs/"], annotations: ["Module", "Controller", "Injectable"] },
  weight: 4,
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["Controller", "Resolver", "WebSocketGateway"], hint: "HTTP, GraphQL and socket entry points" },
    { id: "providers", label: "Providers & Other", color: "green", annotations: ["Injectable", "Module"], hint: "Services, modules and everything unclassified" },
    { id: "data", label: "Repositories & Clients", color: "amber", annotations: ["InjectRepository", "InjectModel"], imports: ["typeorm", "@nestjs/typeorm", "@nestjs/mongoose", "prisma", "@prisma/client"], nameSuffixes: ["Repository", "Store", "Client", "Gateway"], hint: "Data access and outbound calls" },
    { id: "models", label: "DTOs & Entities", color: "violet", annotations: ["Entity", "Schema", "ObjectType", "InputType"], nameSuffixes: ["Dto", "DTO", "Entity", "Schema", "Model"], hint: "Shapes crossing the boundary" },
    { id: "pipeline", label: "Guards, Pipes & Filters", color: "red", annotations: ["Catch"], nameSuffixes: ["Guard", "Pipe", "Filter", "Interceptor", "Middleware"], hint: "What every request passes through" },
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
    { id: "services", label: "Services & Other", color: "green", annotations: ["Injectable", "NgModule"], nameSuffixes: ["Service", "Store", "Facade"], hint: "Injectables and everything unclassified" },
    { id: "pipeline", label: "Directives, Pipes & Guards", color: "red", annotations: ["Directive", "Pipe"], nameSuffixes: ["Directive", "Pipe", "Guard", "Resolver", "Interceptor"], hint: "What wraps the view and the router" },
    { id: "data", label: "Data access", color: "amber", imports: ["@angular/common/http", "rxjs/ajax", "@apollo/client", "@ngrx/"], nameSuffixes: ["Api", "Client", "Repository", "Gateway", "Adapter"], hint: "HTTP and state" },
    { id: "models", label: "Models", color: "violet", rule: looksLikeModel, nameSuffixes: ["Model", "Dto", "DTO", "Entity", "State", "Config"], hint: "Data shapes" },
  ],
  fallback: "services",
}

export const REACT: FrameworkProfile = {
  language: "typescript",
  id: "react",
  label: "React",
  detect: { imports: ["react", "react-dom", "next/", "@remix-run/"], weakImports: ["@testing-library/react"] },
  lanes: [
    { id: "components", label: "Components", color: "blue", rule: (f) => /^[A-Z]/.test(f.name) && !f.isInterface, hint: "Named in Pascal case and rendered" },
    { id: "hooks", label: "Hooks", color: "green", rule: (f) => /^use[A-Z]/.test(f.name), hint: "Reusable stateful logic" },
    { id: "data", label: "Data & Clients", color: "amber", imports: ["@tanstack/react-query", "swr", "axios", "@apollo/client", "graphql-request"], nameSuffixes: ["Api", "Client", "Service", "Store", "Repository"], hint: "What talks to a server" },
    { id: "models", label: "Types & Models", color: "violet", rule: (f) => f.isInterface, nameSuffixes: ["Type", "Types", "Model", "Schema", "Props", "State"], hint: "Shapes rather than behaviour" },
    { id: "other", label: "Utilities & Other", color: "neutral", hint: "Everything unclassified" },
  ],
  fallback: "other",
}

export const EXPRESS: FrameworkProfile = {
  language: "typescript",
  id: "express",
  label: "Express",
  detect: { imports: ["express", "koa", "fastify", "@hapi/hapi"] },
  weight: 2,
  lanes: [
    { id: "routes", label: "Routes & Handlers", color: "blue", nameSuffixes: ["Route", "Routes", "Router", "Controller", "Handler", "Endpoint"], hint: "What answers a request" },
    { id: "middleware", label: "Middleware", color: "red", nameSuffixes: ["Middleware", "Guard", "Auth", "Validator"], hint: "What every request passes through" },
    { id: "data", label: "Data access", color: "amber", imports: ["mongoose", "sequelize", "typeorm", "knex", "pg", "mysql2", "redis", "ioredis", "@prisma/client"], nameSuffixes: ["Model", "Repository", "Dao", "Store", "Client"], hint: "Databases and caches" },
    { id: "services", label: "Services & Other", color: "green", nameSuffixes: ["Service", "Manager", "Processor", "Job"], hint: "Everything unclassified" },
    { id: "models", label: "Schemas", color: "violet", rule: (f) => f.isInterface, nameSuffixes: ["Schema", "Dto", "DTO", "Type", "Types"], hint: "Shapes crossing the boundary" },
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
  detect: { imports: ["django", "rest_framework", "oscar"], annotations: ["apps", "models", "views"] },
  weight: 4,
  lanes: [
    { id: "views", label: "Views & URLs", color: "blue", annotations: ["views", "urls", "viewsets"], nameSuffixes: ["View", "ViewSet", "Api"], hint: "What answers a request" },
    { id: "models", label: "Models", color: "violet", annotations: ["models", "abstract_models"], nameSuffixes: ["Model"], hint: "Persistent state" },
    { id: "forms", label: "Forms & Serializers", color: "amber", annotations: ["forms", "serializers"], nameSuffixes: ["Form", "Serializer"], hint: "What validates input" },
    { id: "wiring", label: "Apps, Signals & Admin", color: "red", annotations: ["apps", "admin", "signals", "receivers", "middleware", "settings"], hint: "Registration and cross-cutting" },
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
    { id: "routes", label: "Routes", color: "blue", annotations: ["get", "post", "put", "delete", "patch", "route", "router"], nameSuffixes: ["Router", "Api", "Endpoint"], hint: "Decorated request handlers" },
    { id: "models", label: "Schemas", color: "violet", supertypes: ["BaseModel"], nameSuffixes: ["Schema", "Model", "Request", "Response"], hint: "Pydantic shapes" },
    { id: "data", label: "Data access", color: "amber", imports: ["sqlalchemy", "databases", "motor", "pymongo", "redis", "asyncpg", "psycopg2", "httpx", "requests"], nameSuffixes: ["Repository", "Dao", "Store", "Client"], hint: "Databases and outbound calls" },
    { id: "background", label: "Tasks", color: "red", imports: ["celery", "rq", "apscheduler", "arq"], annotations: ["task", "shared_task"], nameSuffixes: ["Task", "Job", "Worker"], hint: "Work off the request path" },
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
    { id: "logic", label: "Logic & Other", color: "green", hint: "Everything unclassified" },
    { id: "data", label: "Stores & Clients", color: "amber", imports: ["database/sql", "net/http", "os/exec"], nameSuffixes: ["Repository", "Store", "Client", "Reader", "Writer", "Loader"], hint: "What reaches outside the process" },
    { id: "models", label: "Config & Models", color: "violet", annotations: ["json", "yaml", "toml", "mapstructure"], nameSuffixes: ["Config", "Options", "Settings", "Result", "Report"], hint: "Shapes and configuration" },
  ],
  fallback: "logic",
}

// ---------------------------------------------------------------------------
// C#
// ---------------------------------------------------------------------------

export const ASPNET: FrameworkProfile = {
  language: "csharp",
  id: "aspnet",
  label: "ASP.NET Core",
  detect: { imports: ["Microsoft.AspNetCore", "Microsoft.Extensions.DependencyInjection"], supertypes: ["ControllerBase", "Controller", "PageModel"] },
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["ApiController", "Route", "HttpGet", "HttpPost"], supertypes: ["ControllerBase", "Controller", "PageModel"], nameSuffixes: ["Controller", "Endpoint", "Hub"], hint: "Web entry points" },
    { id: "services", label: "Services & Other", color: "green", nameSuffixes: ["Service", "Manager", "Handler", "Factory", "Provider"], hint: "Everything unclassified" },
    { id: "data", label: "Data access", color: "amber", supertypes: ["DbContext", "IdentityDbContext"], imports: ["Microsoft.EntityFrameworkCore", "Dapper", "MongoDB.Driver", "StackExchange.Redis"], nameSuffixes: ["Repository", "DbContext", "Dao", "Store", "Client"], hint: "EF Core and clients" },
    { id: "models", label: "Entities & DTOs", color: "violet", annotations: ["Table", "Key", "JsonProperty", "DataContract"], nameSuffixes: ["Entity", "Model", "Dto", "DTO", "Request", "Response", "ViewModel", "Options", "Settings"], hint: "Shapes and persistent state" },
    { id: "pipeline", label: "Middleware & Filters", color: "red", nameSuffixes: ["Middleware", "Filter", "Attribute", "Handler", "Policy"], hint: "What every request passes through" },
  ],
  fallback: "services",
}

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------

export const LARAVEL: FrameworkProfile = {
  language: "php",
  id: "laravel",
  label: "Laravel",
  detect: { imports: ["Illuminate\\"], supertypes: ["Model", "Controller", "ServiceProvider"] },
  weight: 4,
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", supertypes: ["Controller"], nameSuffixes: ["Controller"], hint: "What answers a request" },
    { id: "models", label: "Eloquent models", color: "violet", supertypes: ["Model", "Authenticatable", "Pivot"], hint: "Persistent state" },
    { id: "wiring", label: "Providers & Middleware", color: "red", supertypes: ["ServiceProvider"], nameSuffixes: ["ServiceProvider", "Middleware", "Kernel", "Policy", "Gate"], hint: "Registration and cross-cutting" },
    { id: "data", label: "Repositories & Jobs", color: "amber", supertypes: ["Job", "Command"], nameSuffixes: ["Repository", "Job", "Query", "Client"], hint: "Data access and queued work" },
    { id: "logic", label: "Logic & Other", color: "green", nameSuffixes: ["Service", "Action", "Manager", "Handler"], hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

export const SYMFONY: FrameworkProfile = {
  language: "php",
  id: "symfony",
  label: "Symfony",
  detect: { imports: ["Symfony\\Component", "Symfony\\Bundle", "Doctrine\\"] },
  weight: 2,
  lanes: [
    { id: "controllers", label: "Controllers", color: "blue", annotations: ["Route", "AsController"], nameSuffixes: ["Controller", "Action"], hint: "What answers a request" },
    { id: "models", label: "Entities", color: "violet", annotations: ["Entity", "Embeddable", "ORM"], nameSuffixes: ["Entity"], hint: "Persistent state" },
    { id: "data", label: "Repositories", color: "amber", nameSuffixes: ["Repository", "Provider", "Loader", "Client"], hint: "Data access" },
    { id: "wiring", label: "Bundles & Subscribers", color: "red", annotations: ["AsEventListener", "AsMessageHandler"], nameSuffixes: ["Bundle", "Extension", "Subscriber", "Listener", "Compiler", "Pass"], hint: "Registration and events" },
    { id: "logic", label: "Services & Other", color: "green", nameSuffixes: ["Service", "Manager", "Factory", "Handler", "Resolver"], hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

// ---------------------------------------------------------------------------
// Kotlin
// ---------------------------------------------------------------------------

export const KTOR: FrameworkProfile = {
  language: "kotlin",
  id: "ktor",
  label: "Ktor",
  detect: { imports: ["io.ktor"] },
  weight: 2,
  lanes: [
    { id: "routes", label: "Routes", color: "blue", nameSuffixes: ["Route", "Routes", "Routing", "Api", "Controller"], hint: "What answers a request" },
    { id: "plugins", label: "Plugins", color: "red", nameSuffixes: ["Plugin", "Feature", "Interceptor", "Auth"], hint: "What every request passes through" },
    { id: "data", label: "Repositories & Clients", color: "amber", imports: ["org.jetbrains.exposed", "io.ktor.client", "com.zaxxer.hikari"], nameSuffixes: ["Repository", "Dao", "Store", "Client", "Table"], hint: "Databases and outbound calls" },
    { id: "models", label: "Models", color: "violet", annotations: ["Serializable"], rule: looksLikeModel, nameSuffixes: ["Dto", "DTO", "Model", "Request", "Response", "Entity"], hint: "Data shapes" },
    { id: "logic", label: "Services & Other", color: "green", hint: "Everything unclassified" },
  ],
  fallback: "logic",
}

/** No framework: lanes from what the code does, with naming only as a tiebreaker. */
export const STRUCTURE: FrameworkProfile = {
  id: "structure",
  label: "By structure",
  detect: {},
  lanes: [
    { id: "entry", label: "Entry points", color: "blue", byReferences: true, rule: looksLikeEntry, nameSuffixes: ["Controller", "Resource", "Handler", "Endpoint", "Listener", "Main", "Application", "Command", "Cli", "Job", "Task", "Scheduler"], hint: "Has main, or nothing references it" },
    { id: "logic", label: "Logic & Other", color: "green", nameSuffixes: ["Service", "Manager", "Processor", "UseCase", "Interactor", "Facade", "Engine", "Strategy", "Validator", "Factory", "Builder", "Helper", "Util", "Utils"], hint: "Everything unclassified" },
    { id: "data", label: "Data access", color: "amber", imports: DATA_IMPORTS, nameSuffixes: ["Repository", "Dao", "DAO", "Store", "Client", "Gateway", "Adapter", "Connector", "Provider"], hint: "Imports a database, queue or HTTP client" },
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
function withUnclassified(p: FrameworkProfile): FrameworkProfile {
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
  NESTJS, ANGULAR, REACT, EXPRESS,
  DJANGO, FASTAPI,
  GO_HTTP, GO_CLI,
  ASPNET,
  LARAVEL, SYMFONY,
  KTOR,
  STRUCTURE,
].map(withUnclassified)

/**
 * The profiles worth offering for a language, plus the structural one, which
 * is about no framework and therefore about all of them.
 */
export function profilesFor(language: Language | null): FrameworkProfile[] {
  if (!language) return PROFILES
  return PROFILES.filter(p => !p.language || p.language === language)
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
  const specific = candidates.some(c => (profileById(c.id).weight ?? 1) >= 4 && c.strong > 0)
  const demoted = new Set<string>()
  if (specific) for (const c of candidates) if (c.id === JAKARTA.id) { c.score = Math.floor(c.score / 4); demoted.add(c.id) }
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
  for (const lane of profile.lanes) if (hasAny(facts.annotations, lane.annotations) || hasAny(facts.supertypes, lane.supertypes) || hasAny(facts.legacy, lane.legacy)) return lane.id
  for (const lane of profile.lanes) if (importsAny(facts.usedImports ?? facts.imports, lane.imports)) return lane.id
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
