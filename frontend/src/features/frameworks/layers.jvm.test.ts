import { describe, expect, it } from "vitest"
import { EMPTY_FACTS, UNCLASSIFIED, adoptSubtypeLanes, classify, detectFramework, profileById, type ClassFacts, type Language } from "./frameworkProfiles"
import { layersOf } from "~/features/reports/anatomy"

// The JVM server frameworks, end to end: the mini-applications in the
// engine's frameworks_test.go (Java and Kotlin packs) produce exactly these
// units, markers and raw imports. Here they go through the unit loader's
// reading of them -- a supertype marker is a supertype, every other marker
// source is an annotation, the imports are the file's -- into detection,
// lanes and the layer order the "layers" reading checks edges against.

/** A unit as loadUnits hands it to the profiles. Markers are "source:key". */
function unit(name: string, file: string, markers: string[] = [], imports: string[] = []): ClassFacts {
  const annotations = new Set<string>()
  const supertypes = new Set<string>()
  for (const m of markers) {
    const [source, key] = m.split(":")
    ;(source === "supertype" ? supertypes : annotations).add(key)
  }
  return { ...EMPTY_FACTS, name, file, annotations, supertypes, imports: new Set(imports), isInterface: supertypes.has("interface") }
}

type App = Record<string, ClassFacts>

function lanesOf(profileId: string, app: App): Record<string, string> {
  const profile = profileById(profileId)
  return Object.fromEntries(Object.entries(app).map(([id, f]) => [id, classify(profile, f)]))
}

/** How the layers reading counts one edge, given the roles at each end. */
function direction(order: string[], from: string, to: string): "down" | "skip" | "back" | "same" | "beside" {
  const f = order.indexOf(from), t = order.indexOf(to)
  if (f < 0 || t < 0) return "beside"
  if (f === t) return "same"
  if (t === f + 1) return "down"
  return t > f ? "skip" : "back"
}

function expectConfident(app: App, language: Language, id: string) {
  const d = detectFramework(Object.values(app), language)
  expect(d.id, d.reason).toBe(id)
  expect(d.confident, d.reason).toBe(true)
}

// ── Spring ──────────────────────────────────────────────────────────────────

const springApp: App = {
  OrderController: unit("OrderController", "src/main/java/com/acme/shop/web/OrderController.java", ["annotation:RestController", "annotation:RequestMapping"],
    ["org.springframework.web.bind.annotation.RestController", "org.springframework.web.bind.annotation.GetMapping", "org.springframework.web.bind.annotation.RequestMapping", "com.acme.shop.service.OrderService", "com.acme.shop.model.Order"]),
  OrderDto: unit("OrderDto", "src/main/java/com/acme/shop/web/OrderDto.java", [], ["com.acme.shop.model.Order"]),
  // The stereotype was written qualified, so the file imports nothing called Service.
  OrderService: unit("OrderService", "src/main/java/com/acme/shop/service/OrderService.java", ["annotation:Service", "annotation:Transactional"],
    ["org.springframework.transaction.annotation.Transactional", "org.springframework.jdbc.core.RowMapper", "com.acme.shop.repo.OrderRepository", "com.acme.shop.model.Order"]),
  OrderRepository: unit("OrderRepository", "src/main/java/com/acme/shop/repo/OrderRepository.java", ["supertype:JpaRepository", "supertype:JpaSpecificationExecutor", "supertype:interface"],
    ["org.springframework.data.jpa.repository.JpaRepository", "org.springframework.data.jpa.repository.JpaSpecificationExecutor", "com.acme.shop.model.Order"]),
  Order: unit("Order", "src/main/java/com/acme/shop/model/Order.java", ["annotation:Entity", "annotation:Table", "supertype:Auditable"], ["jakarta.persistence.Entity", "jakarta.persistence.Table", "jakarta.persistence.Embedded"]),
  Auditable: unit("Auditable", "src/main/java/com/acme/shop/model/Auditable.java", ["annotation:MappedSuperclass"], ["jakarta.persistence.MappedSuperclass"]),
  Money: unit("Money", "src/main/java/com/acme/shop/model/Money.java", ["annotation:Embeddable"], ["jakarta.persistence.Embeddable"]),
  ShopApplication: unit("ShopApplication", "src/main/java/com/acme/shop/ShopApplication.java", ["annotation:SpringBootApplication"], ["org.springframework.boot.SpringApplication", "org.springframework.boot.autoconfigure.SpringBootApplication"]),
  WebConfig: unit("WebConfig", "src/main/java/com/acme/shop/config/WebConfig.java", ["annotation:Configuration", "supertype:WebMvcConfigurer"],
    ["org.springframework.context.annotation.Configuration", "org.springframework.web.servlet.config.annotation.WebMvcConfigurer", "com.acme.shop.web.OrderController"]),
  OrderEvents: unit("OrderEvents", "src/main/java/com/acme/shop/messaging/OrderEvents.java", ["annotation:Component"],
    ["org.springframework.stereotype.Component", "org.springframework.kafka.annotation.KafkaListener", "com.acme.shop.service.OrderService"]),
}

describe("Spring", () => {
  it("is detected confidently from the mini-application", () => {
    expectConfident(springApp, "java", "spring")
  })

  it("puts every unit in the lane an architect would", () => {
    expect(lanesOf("spring", springApp)).toEqual({
      OrderController: "controllers",
      OrderDto: UNCLASSIFIED,
      OrderService: "services",
      OrderRepository: "repositories",
      Order: "entities",
      Auditable: "entities",
      Money: "entities",
      ShopApplication: "config",
      WebConfig: "config",
      OrderEvents: "messaging",
    })
  })

  it("reads the normal edges as running down and a planted one as running back up", () => {
    const order = layersOf(profileById("spring"))
    expect(order).toEqual(["controllers", "services", "repositories", "entities"])
    const lane = lanesOf("spring", springApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("OrderController", "OrderService")).toBe("down")
    expect(edge("OrderService", "OrderRepository")).toBe("down")
    expect(edge("OrderRepository", "Order")).toBe("down")
    // A controller handing out entities skips the service and repository.
    expect(edge("OrderController", "Order")).toBe("skip")
    // Wiring and listeners sit beside the layers: a configuration class
    // reaching into the web layer is its job, not a violation.
    expect(edge("WebConfig", "OrderController")).toBe("beside")
    expect(edge("OrderEvents", "OrderService")).toBe("beside")
    // Planted: an entity calling a service.
    expect(edge("Order", "OrderService")).toBe("back")
  })

  it("tells stereotypes, meta-annotations and generic bean scopes apart", () => {
    const spring = profileById("spring")
    const lane = (name: string, markers: string[], imports: string[] = []) => classify(spring, unit(name, `${name}.java`, markers, imports))
    // @Controller and @RestController are the same role; advice belongs with them.
    expect(lane("PageController", ["annotation:Controller"])).toBe("controllers")
    expect(lane("Errors", ["annotation:RestControllerAdvice"])).toBe("controllers")
    // JAX-RS @Path in a Spring app (fineract) is a controller.
    expect(lane("LoansApiResource", ["annotation:Path", "annotation:Component"], ["jakarta.ws.rs.Path"])).toBe("controllers")
    // @Component is a bean of no role: what it imports decides, then it is a plain component.
    expect(lane("OrderJdbcStore", ["annotation:Component"], ["org.springframework.jdbc.core.JdbcTemplate"])).toBe("repositories")
    expect(lane("OrderMapper", ["annotation:Component"])).toBe("services")
    // @Service is the architect's word and beats the imports.
    expect(lane("LoanReadPlatformServiceImpl", ["annotation:Service"], ["org.springframework.jdbc.core.JdbcTemplate"])).toBe("services")
    // A repository interface with no annotation, and a Spring Data JDBC one.
    expect(lane("UserRepository", ["supertype:CrudRepository", "supertype:interface"])).toBe("repositories")
    expect(lane("UserRepository", ["annotation:Repository"])).toBe("repositories")
    // Configuration is wiring, not a service.
    expect(lane("SecurityConfig", ["annotation:Configuration"])).toBe("config")
    expect(lane("MailProperties", ["annotation:ConfigurationProperties"])).toBe("config")
    // A class-level @KafkaListener, and a plain listener bean.
    expect(lane("OrderListener", ["annotation:KafkaListener", "annotation:Component"])).toBe("messaging")
    expect(lane("OrderListener", ["annotation:Component"], ["org.springframework.amqp.rabbit.annotation.RabbitListener"])).toBe("messaging")
  })

  it("is written in Kotlin too", () => {
    const app: App = {
      OrderController: unit("OrderController", "src/main/kotlin/com/acme/shop/web/OrderController.kt", ["annotation:RestController", "annotation:RequestMapping"],
        ["org.springframework.web.bind.annotation.GetMapping", "org.springframework.web.bind.annotation.RequestMapping", "org.springframework.web.bind.annotation.RestController", "com.acme.shop.service.OrderService"]),
      OrderService: unit("OrderService", "src/main/kotlin/com/acme/shop/service/OrderService.kt", ["annotation:Service", "annotation:Transactional"],
        ["org.springframework.stereotype.Service", "org.springframework.transaction.annotation.Transactional", "com.acme.shop.repo.OrderRepository"]),
      OrderRepository: unit("OrderRepository", "src/main/kotlin/com/acme/shop/repo/OrderRepository.kt", ["supertype:JpaRepository"], ["org.springframework.data.jpa.repository.JpaRepository", "com.acme.shop.model.Order"]),
      Order: unit("Order", "src/main/kotlin/com/acme/shop/model/Order.kt", ["annotation:Entity", "annotation:Table", "keyword:data"], ["jakarta.persistence.Entity", "jakarta.persistence.Id", "jakarta.persistence.Table"]),
      ShopApplication: unit("ShopApplication", "src/main/kotlin/com/acme/shop/ShopApplication.kt", ["annotation:SpringBootApplication"], ["org.springframework.boot.autoconfigure.SpringBootApplication", "org.springframework.boot.runApplication"]),
      main: unit("main", "src/main/kotlin/com/acme/shop/ShopApplication.kt", [], ["org.springframework.boot.autoconfigure.SpringBootApplication", "org.springframework.boot.runApplication"]),
    }
    expectConfident(app, "kotlin", "spring")
    expect(lanesOf("spring", app)).toEqual({
      OrderController: "controllers", OrderService: "services", OrderRepository: "repositories", Order: "entities", ShopApplication: "config", main: "config",
    })
  })

  it("stays confident when the application is a small share of a large codebase", () => {
    const rest = Array.from({ length: 400 }, (_, i) => unit(`Util${i}`, `src/main/java/com/acme/util/Util${i}.java`))
    const d = detectFramework([...Object.values(springApp), ...rest], "java")
    // Ten strong units among 410 is 2%: real, but too thin to be sure of.
    expect(d.candidates[0].id).toBe("spring")
    expect(d.confident).toBe(false)
    expect(d.reason).toMatch(/Too small a share/)
  })
})

// ── Jakarta EE ──────────────────────────────────────────────────────────────

const jakartaApp: App = {
  AccountResource: unit("AccountResource", "src/main/java/com/acme/bank/api/AccountResource.java", ["annotation:Path", "annotation:RequestScoped"],
    ["jakarta.ws.rs.Path", "jakarta.ws.rs.GET", "jakarta.enterprise.context.RequestScoped", "jakarta.inject.Inject", "com.acme.bank.service.AccountService"]),
  BankApplication: unit("BankApplication", "src/main/java/com/acme/bank/api/BankApplication.java", ["annotation:ApplicationPath", "supertype:Application"], ["jakarta.ws.rs.ApplicationPath", "jakarta.ws.rs.core.Application"]),
  AccountService: unit("AccountService", "src/main/java/com/acme/bank/service/AccountService.java", ["annotation:Stateless"], ["jakarta.ejb.Stateless", "jakarta.inject.Inject", "com.acme.bank.dao.AccountDao", "com.acme.bank.model.Account"]),
  AccountDao: unit("AccountDao", "src/main/java/com/acme/bank/dao/AccountDao.java", ["annotation:ApplicationScoped"],
    ["jakarta.enterprise.context.ApplicationScoped", "jakarta.persistence.EntityManager", "jakarta.persistence.PersistenceContext", "com.acme.bank.model.Account"]),
  Account: unit("Account", "src/main/java/com/acme/bank/model/Account.java", ["annotation:Entity"], ["jakarta.persistence.Entity"]),
  TransferListener: unit("TransferListener", "src/main/java/com/acme/bank/messaging/TransferListener.java", ["annotation:MessageDriven", "supertype:MessageListener"],
    ["jakarta.ejb.MessageDriven", "jakarta.jms.MessageListener", "jakarta.jms.Message", "com.acme.bank.service.AccountService"]),
  AuditFilter: unit("AuditFilter", "src/main/java/com/acme/bank/web/AuditFilter.java", ["annotation:WebFilter", "supertype:Filter"], ["jakarta.servlet.Filter", "jakarta.servlet.annotation.WebFilter"]),
}

describe("Jakarta EE", () => {
  it("is detected confidently, and lanes every unit", () => {
    expectConfident(jakartaApp, "java", "jakarta")
    expect(lanesOf("jakarta", jakartaApp)).toEqual({
      AccountResource: "endpoints",
      BankApplication: "endpoints",
      AccountService: "beans",
      // A scoped bean holding an EntityManager is data access; the scope used to win.
      AccountDao: "repositories",
      Account: "entities",
      TransferListener: "messaging",
      AuditFilter: "endpoints",
    })
  })

  it("runs endpoints, beans, repositories, entities", () => {
    const order = layersOf(profileById("jakarta"))
    expect(order).toEqual(["endpoints", "beans", "repositories", "entities"])
    const lane = lanesOf("jakarta", jakartaApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("AccountResource", "AccountService")).toBe("down")
    expect(edge("AccountService", "AccountDao")).toBe("down")
    expect(edge("AccountDao", "Account")).toBe("down")
    expect(edge("TransferListener", "AccountService")).toBe("beside")
    expect(edge("Account", "AccountService")).toBe("back")
  })

  it("keeps the old EJB spellings and reads a bean with no data imports as a bean", () => {
    const jakarta = profileById("jakarta")
    expect(classify(jakarta, unit("OrderDao", "OrderDao.java", ["annotation:Stateless"], ["javax.ejb.Stateless", "javax.persistence.EntityManager"]))).toBe("repositories")
    expect(classify(jakarta, unit("OrderRepository", "OrderRepository.java", ["annotation:Stateless"]))).toBe("beans")
    expect(classify(jakarta, unit("Pricing", "Pricing.java", ["annotation:ApplicationScoped"]))).toBe("beans")
    expect(classify(jakarta, unit("Legacy", "Legacy.java", ["annotation:WebServlet", "supertype:HttpServlet"]))).toBe("endpoints")
  })
})

// ── Quarkus ─────────────────────────────────────────────────────────────────

const quarkusApp: App = {
  ItemResource: unit("ItemResource", "src/main/java/com/acme/inventory/ItemResource.java", ["annotation:Path"], ["jakarta.ws.rs.Path", "jakarta.ws.rs.GET", "jakarta.inject.Inject"]),
  ItemService: unit("ItemService", "src/main/java/com/acme/inventory/ItemService.java", ["annotation:ApplicationScoped"], ["jakarta.enterprise.context.ApplicationScoped", "jakarta.inject.Inject", "io.quarkus.logging.Log"]),
  ItemRepository: unit("ItemRepository", "src/main/java/com/acme/inventory/ItemRepository.java", ["annotation:ApplicationScoped", "supertype:PanacheRepository"], ["jakarta.enterprise.context.ApplicationScoped", "io.quarkus.hibernate.orm.panache.PanacheRepository"]),
  Item: unit("Item", "src/main/java/com/acme/inventory/Item.java", ["annotation:Entity", "supertype:PanacheEntity"], ["jakarta.persistence.Entity", "io.quarkus.hibernate.orm.panache.PanacheEntity"]),
  StockConsumer: unit("StockConsumer", "src/main/java/com/acme/inventory/StockConsumer.java", ["annotation:ApplicationScoped"], ["jakarta.enterprise.context.ApplicationScoped", "org.eclipse.microprofile.reactive.messaging.Incoming"]),
  SupplierClient: unit("SupplierClient", "src/main/java/com/acme/inventory/SupplierClient.java", ["annotation:RegisterRestClient", "annotation:Path", "supertype:interface"],
    ["jakarta.ws.rs.Path", "jakarta.ws.rs.GET", "org.eclipse.microprofile.rest.client.inject.RegisterRestClient"]),
  Main: unit("Main", "src/main/java/com/acme/inventory/Main.java", ["annotation:QuarkusMain"], ["io.quarkus.runtime.Quarkus", "io.quarkus.runtime.annotations.QuarkusMain"]),
}

describe("Quarkus", () => {
  it("wins over the Jakarta standard it is built on", () => {
    expectConfident(quarkusApp, "java", "quarkus")
    const d = detectFramework(Object.values(quarkusApp), "java")
    expect(d.candidates.map(c => c.id)).toContain("jakarta")
  })

  it("lanes every unit", () => {
    expect(lanesOf("quarkus", quarkusApp)).toEqual({
      ItemResource: "resources",
      ItemService: "beans",
      // Every Panache repository is @ApplicationScoped; it used to be a bean.
      ItemRepository: "data",
      Item: "entities",
      // A bean with @Incoming methods is messaging.
      StockConsumer: "messaging",
      // A REST client interface carries @Path too; it used to be a resource.
      SupplierClient: "data",
      Main: "beans",
    })
  })

  it("runs resources, beans, data, entities", () => {
    const order = layersOf(profileById("quarkus"))
    expect(order).toEqual(["resources", "beans", "data", "entities"])
    const lane = lanesOf("quarkus", quarkusApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("ItemResource", "ItemService")).toBe("down")
    expect(edge("ItemService", "ItemRepository")).toBe("down")
    expect(edge("ItemRepository", "Item")).toBe("down")
    // Active-record Panache: a resource calling Item.listAll() skips two layers, and that is Quarkus's own idiom.
    expect(edge("ItemResource", "Item")).toBe("skip")
    expect(edge("Item", "ItemService")).toBe("back")
  })

  it("is written in Kotlin too", () => {
    const app = Object.fromEntries(Object.entries(quarkusApp).map(([k, f]) => [k, { ...f, file: f.file!.replace(/\.java$/, ".kt") }]))
    expectConfident(app, "kotlin", "quarkus")
  })
})

// ── Micronaut ───────────────────────────────────────────────────────────────

const micronautApp: App = {
  PaymentController: unit("PaymentController", "src/main/java/com/acme/pay/PaymentController.java", ["annotation:Controller"], ["io.micronaut.http.annotation.Controller", "io.micronaut.http.annotation.Get"]),
  PaymentService: unit("PaymentService", "src/main/java/com/acme/pay/PaymentService.java", ["annotation:Singleton"], ["jakarta.inject.Singleton"]),
  PaymentRepository: unit("PaymentRepository", "src/main/java/com/acme/pay/PaymentRepository.java", ["annotation:JdbcRepository", "supertype:CrudRepository", "supertype:interface"],
    ["io.micronaut.data.jdbc.annotation.JdbcRepository", "io.micronaut.data.model.query.builder.sql.Dialect", "io.micronaut.data.repository.CrudRepository"]),
  Payment: unit("Payment", "src/main/java/com/acme/pay/Payment.java", ["annotation:MappedEntity"], ["io.micronaut.data.annotation.MappedEntity", "io.micronaut.data.annotation.Id"]),
  BankClient: unit("BankClient", "src/main/java/com/acme/pay/BankClient.java", ["annotation:Client", "supertype:interface"], ["io.micronaut.http.client.annotation.Client", "io.micronaut.http.annotation.Get"]),
  PaymentListener: unit("PaymentListener", "src/main/java/com/acme/pay/PaymentListener.java", ["annotation:KafkaListener"], ["io.micronaut.configuration.kafka.annotation.KafkaListener", "io.micronaut.configuration.kafka.annotation.Topic"]),
  PayConfig: unit("PayConfig", "src/main/java/com/acme/pay/PayConfig.java", ["annotation:ConfigurationProperties"], ["io.micronaut.context.annotation.ConfigurationProperties"]),
  PayFactory: unit("PayFactory", "src/main/java/com/acme/pay/PayFactory.java", ["annotation:Factory"], ["io.micronaut.context.annotation.Factory", "io.micronaut.context.annotation.Bean"]),
}

describe("Micronaut", () => {
  it("is detected confidently, and lanes every unit", () => {
    expectConfident(micronautApp, "java", "micronaut")
    expect(lanesOf("micronaut", micronautApp)).toEqual({
      PaymentController: "controllers",
      PaymentService: "beans",
      PaymentRepository: "repositories",
      Payment: "entities",
      BankClient: "clients",
      PaymentListener: "clients",
      PayConfig: "beans",
      PayFactory: "beans",
    })
  })

  it("runs controllers, beans, repositories, entities", () => {
    const order = layersOf(profileById("micronaut"))
    expect(order).toEqual(["controllers", "beans", "repositories", "entities"])
    const lane = lanesOf("micronaut", micronautApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("PaymentController", "PaymentService")).toBe("down")
    expect(edge("PaymentService", "PaymentRepository")).toBe("down")
    expect(edge("PaymentRepository", "Payment")).toBe("down")
    expect(edge("PaymentService", "BankClient")).toBe("beside")
    expect(edge("Payment", "PaymentService")).toBe("back")
  })

  it("shares Spring's annotation names but never its votes", () => {
    // @Controller is Spring's and Micronaut's; only the imports say which.
    const d = detectFramework(Object.values(micronautApp), "java")
    expect(d.candidates.map(c => c.id)).not.toContain("spring")
    // A bean holding a Micronaut HTTP client is a client, whatever its scope.
    expect(classify(profileById("micronaut"), unit("BankGateway", "BankGateway.java", ["annotation:Singleton"], ["io.micronaut.http.client.HttpClient"]))).toBe("clients")
  })
})

// ── Vert.x ──────────────────────────────────────────────────────────────────

const vertxApp: App = {
  MainVerticle: unit("MainVerticle", "src/main/java/com/acme/chat/MainVerticle.java", ["supertype:AbstractVerticle"], ["io.vertx.core.AbstractVerticle", "io.vertx.core.Promise", "io.vertx.ext.web.Router"]),
  MessageHandler: unit("MessageHandler", "src/main/java/com/acme/chat/MessageHandler.java", ["supertype:Handler"], ["io.vertx.core.Handler", "io.vertx.ext.web.RoutingContext"]),
  MessageStore: unit("MessageStore", "src/main/java/com/acme/chat/MessageStore.java", [], ["io.vertx.core.Vertx", "io.vertx.core.Future", "io.vertx.pgclient.PgPool"]),
  Broadcaster: unit("Broadcaster", "src/main/java/com/acme/chat/Broadcaster.java", [], ["io.vertx.core.eventbus.EventBus"]),
  ChatMessage: unit("ChatMessage", "src/main/java/com/acme/chat/ChatMessage.java", ["annotation:DataObject"], ["io.vertx.codegen.annotations.DataObject", "io.vertx.core.json.JsonObject"]),
  ChatMessageCodec: unit("ChatMessageCodec", "src/main/java/com/acme/chat/ChatMessageCodec.java", ["supertype:MessageCodec"], ["io.vertx.core.buffer.Buffer", "io.vertx.core.eventbus.MessageCodec"]),
}

describe("Vert.x", () => {
  it("is detected confidently, and lanes every unit", () => {
    expectConfident(vertxApp, "java", "vertx")
    expect(lanesOf("vertx", vertxApp)).toEqual({
      MainVerticle: "verticles",
      MessageHandler: "handlers",
      MessageStore: "clients",
      Broadcaster: "eventbus",
      ChatMessage: "models",
      // A codec imports the event bus package, but it is a codec first.
      ChatMessageCodec: "models",
    })
  })

  it("runs verticles, handlers, clients, models, with the event bus beside them", () => {
    const order = layersOf(profileById("vertx"))
    expect(order).toEqual(["verticles", "handlers", "clients", "models"])
    const lane = lanesOf("vertx", vertxApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("MainVerticle", "MessageHandler")).toBe("down")
    expect(edge("MessageHandler", "MessageStore")).toBe("down")
    expect(edge("MessageStore", "ChatMessage")).toBe("down")
    // A verticle opening the database pool itself skips its handlers.
    expect(edge("MainVerticle", "MessageStore")).toBe("skip")
    expect(edge("Broadcaster", "ChatMessage")).toBe("beside")
    expect(edge("ChatMessage", "MessageHandler")).toBe("back")
  })
})

// ── Dropwizard ──────────────────────────────────────────────────────────────

const dropwizardApp: App = {
  BooksApplication: unit("BooksApplication", "src/main/java/com/acme/books/BooksApplication.java", ["supertype:Application"], ["io.dropwizard.core.Application", "io.dropwizard.core.setup.Environment", "com.acme.books.resources.BookResource", "com.acme.books.db.BookDAO"]),
  BooksConfiguration: unit("BooksConfiguration", "src/main/java/com/acme/books/BooksConfiguration.java", ["supertype:Configuration"], ["io.dropwizard.core.Configuration", "io.dropwizard.db.DataSourceFactory"]),
  BookResource: unit("BookResource", "src/main/java/com/acme/books/resources/BookResource.java", ["annotation:Path"], ["jakarta.ws.rs.Path", "jakarta.ws.rs.GET", "io.dropwizard.hibernate.UnitOfWork", "com.acme.books.db.BookDAO", "com.acme.books.core.Book"]),
  BookDAO: unit("BookDAO", "src/main/java/com/acme/books/db/BookDAO.java", ["supertype:AbstractDAO"], ["io.dropwizard.hibernate.AbstractDAO", "org.hibernate.SessionFactory", "com.acme.books.core.Book"]),
  Book: unit("Book", "src/main/java/com/acme/books/core/Book.java", ["annotation:Entity"], ["jakarta.persistence.Entity"]),
  BooksHealthCheck: unit("BooksHealthCheck", "src/main/java/com/acme/books/health/BooksHealthCheck.java", ["supertype:HealthCheck"], ["com.codahale.metrics.health.HealthCheck"]),
}

describe("Dropwizard", () => {
  it("wins over the JAX-RS it serves with, and lanes every unit", () => {
    expectConfident(dropwizardApp, "java", "dropwizard")
    expect(lanesOf("dropwizard", dropwizardApp)).toEqual({
      BooksApplication: "app",
      BooksConfiguration: "models",
      BookResource: "resources",
      BookDAO: "data",
      // A dropwizard-hibernate entity; the profile had no lane for it.
      Book: "models",
      BooksHealthCheck: "app",
    })
  })

  it("runs resources, data, models, with the application beside them", () => {
    const order = layersOf(profileById("dropwizard"))
    expect(order).toEqual(["resources", "data", "models"])
    const lane = lanesOf("dropwizard", dropwizardApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("BookResource", "BookDAO")).toBe("down")
    expect(edge("BookDAO", "Book")).toBe("down")
    // The Application registers resources and builds DAOs: wiring, not a layer, so neither is a violation.
    expect(edge("BooksApplication", "BookResource")).toBe("beside")
    expect(edge("BooksApplication", "BookDAO")).toBe("beside")
    expect(edge("Book", "BookDAO")).toBe("back")
  })
})

// ── Apache Beam ─────────────────────────────────────────────────────────────

const beamApp: App = {
  OrdersPipeline: unit("OrdersPipeline", "src/main/java/com/acme/etl/OrdersPipeline.java", [], ["org.apache.beam.sdk.Pipeline", "org.apache.beam.sdk.io.TextIO", "org.apache.beam.sdk.options.PipelineOptionsFactory"]),
  OrdersOptions: unit("OrdersOptions", "src/main/java/com/acme/etl/OrdersOptions.java", ["supertype:PipelineOptions", "supertype:interface"], ["org.apache.beam.sdk.options.PipelineOptions"]),
  ParseOrders: unit("ParseOrders", "src/main/java/com/acme/etl/ParseOrders.java", ["supertype:PTransform"], ["org.apache.beam.sdk.transforms.PTransform", "org.apache.beam.sdk.transforms.ParDo", "org.apache.beam.sdk.transforms.DoFn", "org.apache.beam.sdk.values.PCollection"]),
  TotalFn: unit("TotalFn", "src/main/java/com/acme/etl/TotalFn.java", ["supertype:CombineFn"], ["org.apache.beam.sdk.transforms.Combine.CombineFn"]),
  OrderCoder: unit("OrderCoder", "src/main/java/com/acme/etl/OrderCoder.java", ["supertype:CustomCoder"], ["org.apache.beam.sdk.coders.CustomCoder"]),
  Order: unit("Order", "src/main/java/com/acme/etl/Order.java", ["annotation:DefaultCoder", "supertype:Serializable"], ["org.apache.beam.sdk.coders.DefaultCoder"]),
}

describe("Apache Beam", () => {
  it("is detected confidently, and lanes every unit", () => {
    expectConfident(beamApp, "java", "beam")
    expect(lanesOf("beam", beamApp)).toEqual({
      // The main method is not recorded for a Java unit; the name carries the pipeline.
      OrdersPipeline: "pipelines",
      OrdersOptions: "pipelines",
      ParseOrders: "transforms",
      TotalFn: "fns",
      OrderCoder: "io",
      Order: UNCLASSIFIED,
    })
    // Beam nests its DoFns in the transform that applies them. Nested types
    // are members and reach the graph through their owner, so ParseFn is
    // not listed; had it been, it would be a DoFn.
    expect(classify(profileById("beam"), unit("ParseFn", "src/main/java/com/acme/etl/ParseOrders.java", ["supertype:DoFn"]))).toBe("fns")
  })

  it("runs pipelines, transforms, fns, with IO and coders beside them", () => {
    const order = layersOf(profileById("beam"))
    expect(order).toEqual(["pipelines", "transforms", "fns"])
    const lane = lanesOf("beam", beamApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("OrdersPipeline", "ParseOrders")).toBe("down")
    expect(edge("ParseOrders", "TotalFn")).toBe("down")
    // A pipeline applying a DoFn directly, without a composite transform.
    expect(edge("OrdersPipeline", "TotalFn")).toBe("skip")
    expect(edge("OrdersPipeline", "OrderCoder")).toBe("beside")
    expect(edge("TotalFn", "ParseOrders")).toBe("back")
  })
})

// ── Ktor ────────────────────────────────────────────────────────────────────

// The engine gives an extension function a "receiver" marker, which the
// loader reads as an annotation. Note that loadUnits currently drops every
// unit with an owner, and the Kotlin pack owns `fun Route.orders()` to a
// Route it invents in the file's package, so on a real scan these route
// functions never reach the profile. The facts here are what the loader
// would hand over once it lists a unit whose owner is not itself a unit.
const ktorImports = ["io.ktor.server.application.Application", "io.ktor.server.routing.Route", "io.ktor.server.routing.get", "io.ktor.server.routing.routing", "io.ktor.server.response.respond", "com.acme.shop.service.OrderService", "com.acme.shop.model.OrderDto"]
const ktorApp: App = {
  main: unit("main", "src/main/kotlin/com/acme/shop/Application.kt", [], ["io.ktor.server.application.Application", "io.ktor.server.engine.embeddedServer", "io.ktor.server.netty.Netty", "com.acme.shop.routes.orderRoutes", "com.acme.shop.plugins.RequestTiming"]),
  module: unit("module", "src/main/kotlin/com/acme/shop/Application.kt", ["receiver:Application"], ["io.ktor.server.application.Application", "io.ktor.server.engine.embeddedServer", "io.ktor.server.netty.Netty", "com.acme.shop.routes.orderRoutes", "com.acme.shop.plugins.RequestTiming"]),
  orderRoutes: unit("orderRoutes", "src/main/kotlin/com/acme/shop/routes/OrderRoutes.kt", ["receiver:Application"], ktorImports),
  orders: unit("orders", "src/main/kotlin/com/acme/shop/routes/OrderRoutes.kt", ["receiver:Route"], ktorImports),
  RateLimitPlugin: unit("RateLimitPlugin", "src/main/kotlin/com/acme/shop/plugins/RequestTiming.kt", [], ["io.ktor.server.application.createApplicationPlugin"]),
  OrderService: unit("OrderService", "src/main/kotlin/com/acme/shop/service/OrderService.kt", [], ["com.acme.shop.db.OrderRepository", "com.acme.shop.model.Order"]),
  Orders: unit("Orders", "src/main/kotlin/com/acme/shop/db/OrderRepository.kt", ["supertype:Table"], ["org.jetbrains.exposed.sql.Table", "org.jetbrains.exposed.sql.selectAll", "org.jetbrains.exposed.sql.transactions.transaction", "com.acme.shop.model.Order"]),
  OrderRepository: unit("OrderRepository", "src/main/kotlin/com/acme/shop/db/OrderRepository.kt", [], ["org.jetbrains.exposed.sql.Table", "org.jetbrains.exposed.sql.selectAll", "org.jetbrains.exposed.sql.transactions.transaction", "com.acme.shop.model.Order"]),
  Order: unit("Order", "src/main/kotlin/com/acme/shop/model/Order.kt", ["keyword:data"], ["kotlinx.serialization.Serializable"]),
  OrderDto: unit("OrderDto", "src/main/kotlin/com/acme/shop/model/Order.kt", ["annotation:Serializable", "keyword:data"], ["kotlinx.serialization.Serializable"]),
}

describe("Ktor", () => {
  it("is detected confidently from the server packages", () => {
    expectConfident(ktorApp, "kotlin", "ktor")
    // A multiplatform or Android module calling an API with the Ktor client is not a Ktor application.
    const client = detectFramework(Array.from({ length: 12 }, (_, i) => unit(`Api${i}`, `shared/Api${i}.kt`, [], ["io.ktor.client.HttpClient"])), "kotlin")
    expect(client.id).toBe("structure")
    expect(client.candidates.find(c => c.id === "ktor")?.strong ?? 0).toBe(0)
  })

  it("reads routes off their receiver, not their name", () => {
    expect(lanesOf("ktor", ktorApp)).toEqual({
      main: "routes",
      module: "routes",
      orderRoutes: "routes",
      // `fun Route.orders()` has no telling suffix; the receiver says what it is.
      orders: "routes",
      RateLimitPlugin: "plugins",
      OrderService: "logic",
      Orders: "data",
      OrderRepository: "data",
      // A plain data class is a model; it used to need a suffix or @Serializable.
      Order: "models",
      OrderDto: "models",
    })
  })

  it("runs routes, logic, data, models", () => {
    const order = layersOf(profileById("ktor"))
    expect(order).toEqual(["routes", "logic", "data", "models"])
    const lane = lanesOf("ktor", ktorApp)
    const edge = (from: string, to: string) => direction(order, lane[from], lane[to])
    expect(edge("orders", "OrderService")).toBe("down")
    expect(edge("OrderService", "OrderRepository")).toBe("down")
    expect(edge("OrderRepository", "Order")).toBe("down")
    expect(edge("orders", "OrderDto")).toBe("skip")
    expect(edge("module", "orderRoutes")).toBe("same")
    expect(edge("module", "RateLimitPlugin")).toBe("beside")
    expect(edge("Order", "OrderService")).toBe("back")
  })
})

// ── Across the group ────────────────────────────────────────────────────────

describe("the JVM profiles as a group", () => {
  it("keep every layer they name as a lane, in top-to-bottom order", () => {
    for (const id of ["spring", "jakarta", "quarkus", "micronaut", "vertx", "dropwizard", "beam", "ktor"]) {
      const p = profileById(id)
      const order = layersOf(p)
      expect(order.length, id).toBeGreaterThanOrEqual(3)
      for (const lane of order) expect(p.lanes.map(l => l.id), `${id}: ${lane}`).toContain(lane)
      // Every layer is a lane a rule can fill; the top one is the entry point.
      expect(p.lanes.find(l => l.id === order[0])!.color, id).toBe("blue")
    }
  })

  it("send a test class's own annotations nowhere in particular", () => {
    // Tests are left out of the anatomy by file role; a test that slipped through is unclassified, not a configuration.
    const t = unit("OrderServiceTest", "src/test/java/com/acme/shop/service/OrderServiceTest.java", ["annotation:SpringBootTest"], ["org.springframework.boot.test.context.SpringBootTest"])
    expect(classify(profileById("spring"), t)).toBe(UNCLASSIFIED)
  })
})

// ── Code written against interfaces ─────────────────────────────────────────

describe("interfaces take their implementations' lane", () => {
  // Broadleaf's shape: the role is on the Impl, every caller imports the interface.
  const app: App = {
    CartController: unit("CartController", "web/CartController.java", ["annotation:Controller"]),
    CatalogService: unit("CatalogService", "service/CatalogService.java", ["supertype:interface"]),
    CatalogServiceImpl: unit("CatalogServiceImpl", "service/CatalogServiceImpl.java", ["annotation:Service", "supertype:CatalogService"]),
    OrderDao: unit("OrderDao", "dao/OrderDao.java", ["supertype:interface"]),
    OrderDaoImpl: unit("OrderDaoImpl", "dao/OrderDaoImpl.java", ["annotation:Repository", "supertype:OrderDao"]),
    Indexable: unit("Indexable", "domain/Indexable.java", ["supertype:interface"]),
    Product: unit("Product", "domain/Product.java", ["supertype:interface", "supertype:Indexable"]),
    ProductImpl: unit("ProductImpl", "domain/ProductImpl.java", ["annotation:Entity", "supertype:Product"]),
    Status: unit("Status", "common/Status.java", ["supertype:interface"]),
    Sku: unit("Sku", "domain/Sku.java", ["annotation:Entity", "supertype:Status"]),
    Offer: unit("Offer", "offer/OfferServiceImpl.java", ["annotation:Service", "supertype:Status"]),
    Helper: unit("Helper", "util/Helper.java", ["supertype:interface"]),
  }
  const edges = [
    { from: "CartController", to: "CatalogService" },
    { from: "CatalogServiceImpl", to: "CatalogService" },
    { from: "CatalogServiceImpl", to: "OrderDao" },
    { from: "OrderDaoImpl", to: "OrderDao" },
    { from: "OrderDaoImpl", to: "Product" },
    { from: "ProductImpl", to: "Product" },
    { from: "Product", to: "Indexable" },
    { from: "Sku", to: "Status" },
    { from: "Offer", to: "Status" },
    { from: "CatalogServiceImpl", to: "Helper" },
  ]
  const lanes = new Map(Object.entries(lanesOf("spring", app)))
  const moved = adoptSubtypeLanes(lanes, edges, (id) => app[id])

  it("moves an interface to the lane its implementation is in", () => {
    expect(lanes.get("CatalogService")).toBe("services")
    expect(lanes.get("OrderDao")).toBe("repositories")
    expect(lanes.get("Product")).toBe("entities")
  })
  it("settles a chain of interfaces from the implementation up", () => {
    expect(lanes.get("Indexable")).toBe("entities")
    expect(moved).toBe(4)
  })
  it("leaves a type alone when its subtypes disagree, or when it is only used", () => {
    expect(lanes.get("Status")).toBe(UNCLASSIFIED)
    expect(lanes.get("Helper")).toBe(UNCLASSIFIED)
  })
  it("never moves a unit a rule already placed", () => {
    expect(lanes.get("CartController")).toBe("controllers")
    expect(lanes.get("Sku")).toBe("entities")
  })
})
