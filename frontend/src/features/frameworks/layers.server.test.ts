import { describe, expect, it } from "vitest"
import { EMPTY_FACTS, UNCLASSIFIED, classify, detectFramework, profileById, type ClassFacts, type FrameworkProfile } from "./frameworkProfiles"
import { layersOf } from "~/features/reports/anatomy"

// The lanes and layers of Django, FastAPI, Laravel, Symfony and ASP.NET Core,
// fed exactly what the engine's packs record for the same mini-apps: the Go
// tests in extensions/treesitter/{python,php,csharp}/layers_test.go assert
// the markers, raw imports and refs these facts and edges are copied from.
//
// loadUnits turns every marker that is not a supertype into an annotation
// (so `filename:models`, `path:migrations` and `keyword:record` arrive as
// annotations), reads `supertype:interface` as isInterface, and lists only
// units with no owner; a method's refs reach the graph through its owner.

type Facts = Partial<{ annotations: string[]; supertypes: string[]; imports: string[]; usedImports: string[] }>
function unit(name: string, file: string, o: Facts = {}): ClassFacts {
    const supertypes = new Set(o.supertypes ?? [])
    return {
        ...EMPTY_FACTS, name, file,
        annotations: new Set(o.annotations ?? []), supertypes,
        imports: new Set(o.imports ?? []),
        ...(o.usedImports ? { usedImports: new Set(o.usedImports) } : {}),
        isInterface: supertypes.has("interface"),
    }
}

/** What the layers reading makes of an edge between two lanes. */
function direction(profile: FrameworkProfile, from: string, to: string): "down" | "skip" | "back" | "same" | "unranked" {
    const rank = new Map(layersOf(profile).map((id, i) => [id, i]))
    const f = rank.get(from), t = rank.get(to)
    if (f === undefined || t === undefined) return "unranked"
    if (f === t) return "same"
    return t === f + 1 ? "down" : t > f ? "skip" : "back"
}
const edge = (profile: FrameworkProfile, from: ClassFacts, to: ClassFacts) => direction(profile, classify(profile, from), classify(profile, to))

describe("Django", () => {
    const django = profileById("django")
    const product = unit("Product", "shop/catalogue/models.py", { annotations: ["models"], supertypes: ["Model"], imports: ["django.db", ".managers"] })
    const order = unit("Order", "shop/orders/models/order.py", { annotations: ["models"], supertypes: ["Model"], imports: ["django.db", "shop.catalogue.models"] })
    const abstractProduct = unit("AbstractProduct", "shop/catalogue/abstract_models.py", { annotations: ["abstract_models"], supertypes: ["Model"], imports: ["django.db"] })
    const migration = unit("Migration", "shop/catalogue/migrations/0001_initial.py", { annotations: ["migrations"], supertypes: ["Migration"], imports: ["django.db"] })
    const listView = unit("ProductListView", "shop/catalogue/views.py", { annotations: ["views"], supertypes: ["ListView"], imports: ["django.views.generic", "django.shortcuts", ".models", ".forms"] })
    const createView = unit("product_create", "shop/catalogue/views.py", { annotations: ["views"], imports: ["django.views.generic", "django.shortcuts", ".models", ".forms"] })
    const form = unit("ProductForm", "shop/catalogue/forms.py", { annotations: ["forms"], supertypes: ["ModelForm"], imports: ["django", ".models"] })
    const serializer = unit("ProductSerializer", "shop/catalogue/serializers.py", { annotations: ["serializers"], supertypes: ["ModelSerializer"], imports: ["rest_framework", ".models"] })
    const viewSet = unit("ProductViewSet", "shop/catalogue/api.py", { supertypes: ["ModelViewSet"], imports: ["rest_framework", "rest_framework.decorators", ".models", ".serializers"] })
    const unrelated = unit("Unrelated", "shop/catalogue/api.py", { imports: ["rest_framework", "rest_framework.decorators", ".models", ".serializers"] })
    const admin = unit("ProductAdmin", "shop/catalogue/admin.py", { annotations: ["admin", "register"], supertypes: ["ModelAdmin"], imports: ["django.contrib", ".models"] })
    const receiver = unit("on_product_saved", "shop/catalogue/signals.py", { annotations: ["signals", "receiver"], imports: ["django.db.models.signals", "django.dispatch", ".models"] })
    const appConfig = unit("CatalogueConfig", "shop/catalogue/apps.py", { annotations: ["apps"], supertypes: ["AppConfig"], imports: ["django.apps"] })
    const urls = unit("urls", "shop/catalogue/urls.py", { annotations: ["urls"], imports: ["django.urls", "."] })
    const review = unit("Review", "shop/reviews/models.py", { annotations: ["models"], supertypes: ["Model"], imports: ["django.db", "shop.catalogue.views"] })
    const service = unit("PricingService", "shop/catalogue/services.py", { imports: ["decimal"] })
    const all = [product, order, abstractProduct, migration, listView, createView, form, serializer, viewSet, unrelated, admin, receiver, appConfig, urls, review, service]

    it("is detected over FastAPI in a repo that also has a small FastAPI service", () => {
        const fastapi = [unit("health", "api/main.py", { annotations: ["get"], imports: ["fastapi"] }), unit("Ping", "api/main.py", { supertypes: ["BaseModel"], imports: ["fastapi", "pydantic"] })]
        const d = detectFramework([...all, ...fastapi], "python")
        expect(d.id).toBe("django")
        expect(d.confident).toBe(true)
    })

    it("puts each unit where a Django developer would look for it", () => {
        expect(classify(django, product)).toBe("models")
        expect(classify(django, order)).toBe("models")
        expect(classify(django, abstractProduct)).toBe("models")
        expect(classify(django, listView)).toBe("views")
        expect(classify(django, createView)).toBe("views")
        expect(classify(django, form)).toBe("forms")
        expect(classify(django, serializer)).toBe("forms")
        // A DRF viewset in api.py has no Django filename; its base says what it is.
        expect(classify(django, viewSet)).toBe("views")
        // The action's decorator did not leak onto the class after it.
        expect(classify(django, unrelated)).toBe(UNCLASSIFIED)
        expect(classify(django, admin)).toBe("views")
        expect(classify(django, receiver)).toBe("wiring")
        expect(classify(django, appConfig)).toBe("wiring")
        expect(classify(django, urls)).toBe("views")
        expect(classify(django, migration)).toBe("migrations")
        expect(classify(django, service)).toBe(UNCLASSIFIED)
    })

    it("reads the app's own edges as running down, and a model importing a view as back up", () => {
        expect(layersOf(django)).toEqual(["views", "forms", "models"])
        expect(edge(django, createView, form)).toBe("down")
        expect(edge(django, form, product)).toBe("down")
        expect(edge(django, serializer, product)).toBe("down")
        expect(edge(django, viewSet, serializer)).toBe("down")
        // A view querying its model directly is ordinary Django, and reads as a skipped layer.
        expect(edge(django, listView, product)).toBe("skip")
        expect(edge(django, admin, product)).toBe("skip")
        // Signals, apps and migrations sit beside the layers.
        expect(edge(django, receiver, product)).toBe("unranked")
        expect(edge(django, review, listView)).toBe("back")
    })
})

describe("FastAPI and Flask", () => {
    const fastapi = profileById("fastapi")
    const routerImports = ["fastapi", "sqlalchemy.orm", "..schemas", "..repositories", "..db"]
    const listUsers = unit("list_users", "api/routers/users.py", { annotations: ["get"], imports: routerImports, usedImports: ["fastapi", "sqlalchemy.orm", "..schemas", "..repositories", "..db"] })
    const createUser = unit("create_user", "api/routers/users.py", { annotations: ["post"], imports: routerImports, usedImports: ["..schemas"] })
    const helper = unit("helper", "api/routers/users.py", { imports: routerImports, usedImports: [] })
    const unrelated = unit("Unrelated", "api/routers/users.py", { imports: routerImports, usedImports: [] })
    const userOut = unit("UserOut", "api/schemas.py", { supertypes: ["BaseModel"], imports: ["pydantic", "dataclasses"] })
    const settings = unit("Settings", "api/schemas.py", { supertypes: ["BaseSettings"], imports: ["pydantic", "dataclasses"] })
    const page = unit("Page", "api/schemas.py", { annotations: ["dataclass"], imports: ["pydantic", "dataclasses"] })
    const user = unit("User", "api/models.py", { annotations: ["models"], supertypes: ["Base"], imports: ["sqlalchemy", ".db"], usedImports: ["sqlalchemy", ".db"] })
    const repository = unit("UserRepository", "api/repositories.py", { imports: ["sqlalchemy.orm", ".models"], usedImports: ["sqlalchemy.orm", ".models"] })
    const task = unit("send_welcome", "api/tasks.py", { annotations: ["tasks", "shared_task"], imports: ["celery", ".repositories"] })
    const health = unit("health", "web/app.py", { annotations: ["route"], imports: ["flask", "flask.views"] })
    const itemView = unit("ItemView", "web/app.py", { supertypes: ["MethodView"], imports: ["flask", "flask.views"] })
    const all = [listUsers, createUser, helper, unrelated, userOut, settings, page, user, repository, task, health, itemView]

    it("is detected from fastapi, flask and pydantic imports, with no Django in sight", () => {
        const d = detectFramework(all, "python")
        expect(d.id).toBe("fastapi")
        expect(d.confident).toBe(true)
    })

    it("tells routes, schemas, ORM models, repositories and tasks apart", () => {
        expect(classify(fastapi, listUsers)).toBe("routes")
        expect(classify(fastapi, createUser)).toBe("routes")
        expect(classify(fastapi, health)).toBe("routes")
        expect(classify(fastapi, itemView)).toBe("routes")
        expect(classify(fastapi, helper)).toBe(UNCLASSIFIED)
        // The route's decorator did not leak onto the class after it.
        expect(classify(fastapi, unrelated)).toBe(UNCLASSIFIED)
        expect(classify(fastapi, userOut)).toBe("models")
        expect(classify(fastapi, settings)).toBe("models")
        expect(classify(fastapi, page)).toBe("models")
        // A SQLAlchemy model uses sqlalchemy; its base puts it with the shapes, not with data access.
        expect(classify(fastapi, user)).toBe("models")
        expect(classify(fastapi, repository)).toBe("data")
        expect(classify(fastapi, task)).toBe("background")
    })

    it("orders routes over repositories over models, and a model reaching a route as back up", () => {
        expect(layersOf(fastapi)).toEqual(["routes", "data", "models"])
        expect(edge(fastapi, listUsers, repository)).toBe("down")
        expect(edge(fastapi, repository, user)).toBe("down")
        // A route's response_model names a schema directly, which is every FastAPI route.
        expect(edge(fastapi, listUsers, userOut)).toBe("skip")
        expect(edge(fastapi, task, repository)).toBe("unranked")
        expect(edge(fastapi, user, listUsers)).toBe("back")
    })
})

describe("Laravel", () => {
    const laravel = profileById("laravel")
    const controller = unit("OrderController", "app/Http/Controllers/OrderController.php", { supertypes: ["Controller"], imports: ["App\\Http\\Requests\\StoreOrderRequest", "App\\Models\\Order", "App\\Services\\OrderService", "Illuminate\\Http\\JsonResponse"] })
    const model = unit("Order", "app/Models/Order.php", { supertypes: ["Model"], imports: ["Illuminate\\Database\\Eloquent\\Factories\\HasFactory", "Illuminate\\Database\\Eloquent\\Model", "Illuminate\\Database\\Eloquent\\Relations\\BelongsTo"] })
    const provider = unit("AppServiceProvider", "app/Providers/AppServiceProvider.php", { supertypes: ["ServiceProvider"], imports: ["App\\Services\\OrderService", "Illuminate\\Support\\ServiceProvider"] })
    // Middleware extends nothing, and imports a Symfony component.
    const middleware = unit("EnsureTenant", "app/Http/Middleware/EnsureTenant.php", { imports: ["Closure", "Illuminate\\Http\\Request", "Symfony\\Component\\HttpFoundation\\Response"] })
    const job = unit("ProcessOrder", "app/Jobs/ProcessOrder.php", { supertypes: ["ShouldQueue"], imports: ["App\\Models\\Order", "App\\Services\\OrderService", "Illuminate\\Bus\\Queueable", "Illuminate\\Contracts\\Queue\\ShouldQueue", "Illuminate\\Foundation\\Bus\\Dispatchable"] })
    const request = unit("StoreOrderRequest", "app/Http/Requests/StoreOrderRequest.php", { supertypes: ["FormRequest"], imports: ["Illuminate\\Foundation\\Http\\FormRequest"] })
    const customer = unit("Customer", "app/Models/Customer.php", { supertypes: ["Model"], imports: ["Illuminate\\Database\\Eloquent\\Model"] })
    const repository = unit("OrderRepository", "app/Repositories/OrderRepository.php", { imports: ["Illuminate\\Support\\Facades\\DB"] })
    const service = unit("OrderService", "app/Services/OrderService.php", { imports: ["App\\Models\\Order", "App\\Repositories\\OrderRepository"] })
    const all = [controller, model, provider, middleware, job, request, customer, repository, service]

    it("is detected over Symfony although Laravel is built on Symfony components", () => {
        const d = detectFramework(all, "php")
        expect(d.id).toBe("laravel")
        expect(d.confident).toBe(true)
        expect(d.candidates.map(c => c.id)).toContain("symfony")
    })

    it("puts each class where artisan would have written it", () => {
        expect(classify(laravel, controller)).toBe("controllers")
        expect(classify(laravel, model)).toBe("models")
        expect(classify(laravel, customer)).toBe("models")
        expect(classify(laravel, provider)).toBe("wiring")
        expect(classify(laravel, middleware)).toBe("wiring")
        expect(classify(laravel, job)).toBe("background")
        expect(classify(laravel, request)).toBe("forms")
        expect(classify(laravel, repository)).toBe("data")
        expect(classify(laravel, service)).toBe("logic")
        // The Laravel 8+ default directory is enough for a model that extends an alias the engine did not resolve.
        expect(classify(laravel, unit("Invoice", "app/Models/Invoice.php"))).toBe("models")
        expect(classify(laravel, unit("Notify", "app/Http/Controllers/Notify.php"))).toBe("controllers")
    })

    it("orders controllers over services over repositories over models", () => {
        expect(layersOf(laravel)).toEqual(["controllers", "logic", "data", "models"])
        expect(edge(laravel, controller, service)).toBe("down")
        expect(edge(laravel, service, repository)).toBe("down")
        expect(edge(laravel, repository, model)).toBe("down")
        expect(edge(laravel, controller, model)).toBe("skip")
        expect(edge(laravel, controller, request)).toBe("unranked")
        expect(edge(laravel, job, service)).toBe("unranked")
        expect(edge(laravel, model, service)).toBe("back")
    })
})

describe("Symfony", () => {
    const symfony = profileById("symfony")
    const controller = unit("ProductController", "src/Controller/ProductController.php", { annotations: ["Route"], supertypes: ["AbstractController"], imports: ["App\\Entity\\Product", "App\\Repository\\ProductRepository", "Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController", "Symfony\\Component\\HttpFoundation\\Response", "Symfony\\Component\\Routing\\Attribute\\Route"] })
    const health = unit("HealthController", "src/Controller/HealthController.php", { annotations: ["Route"], imports: ["Symfony\\Component\\Routing\\Attribute\\Route"] })
    const entity = unit("Product", "src/Entity/Product.php", { annotations: ["Entity", "Table", "Id", "GeneratedValue", "Column", "ManyToOne"], imports: ["App\\Repository\\ProductRepository", "Doctrine\\ORM\\Mapping"] })
    const legacy = unit("Legacy", "src/Entity/Legacy.php", { annotations: ["Entity", "Table"], imports: ["Doctrine\\ORM\\Mapping"] })
    const repository = unit("ProductRepository", "src/Repository/ProductRepository.php", { supertypes: ["ServiceEntityRepository"], imports: ["App\\Entity\\Product", "Doctrine\\Bundle\\DoctrineBundle\\Repository\\ServiceEntityRepository", "Doctrine\\Persistence\\ManagerRegistry"] })
    const subscriber = unit("OrderSubscriber", "src/EventSubscriber/OrderSubscriber.php", { supertypes: ["EventSubscriberInterface"], imports: ["App\\Service\\OrderMailer", "Symfony\\Component\\EventDispatcher\\EventSubscriberInterface"] })
    const handler = unit("PlaceOrderHandler", "src/MessageHandler/PlaceOrderHandler.php", { annotations: ["AsMessageHandler"], imports: ["App\\Message\\PlaceOrder", "App\\Repository\\ProductRepository", "Symfony\\Component\\Messenger\\Attribute\\AsMessageHandler"] })
    const bundle = unit("AcmeShopBundle", "src/AcmeShopBundle.php", { supertypes: ["AbstractBundle"], imports: ["Symfony\\Component\\HttpKernel\\Bundle\\AbstractBundle"] })
    const mailer = unit("OrderMailer", "src/Service/OrderMailer.php", { imports: ["Symfony\\Component\\Mailer\\MailerInterface"] })
    // Sylius: a model is an interface or a class under Model/, mapped in XML.
    const syliusInterface = unit("ProductInterface", "src/Sylius/Component/Product/Model/Product.php", { supertypes: ["interface", "ResourceInterface", "TimestampableInterface"], imports: ["Sylius\\Component\\Resource\\Model\\ResourceInterface", "Sylius\\Component\\Resource\\Model\\TimestampableInterface"] })
    const syliusModel = unit("Product", "src/Sylius/Component/Product/Model/Product.php", { supertypes: ["ProductInterface"], imports: ["Sylius\\Component\\Resource\\Model\\ResourceInterface", "Sylius\\Component\\Resource\\Model\\TimestampableInterface"] })
    const syliusAction = unit("GetProductBySlugAction", "src/Sylius/Bundle/ApiBundle/Controller/GetProductBySlugAction.php", { imports: ["Symfony\\Component\\HttpFoundation\\Request"] })
    const all = [controller, health, entity, legacy, repository, subscriber, handler, bundle, mailer, syliusInterface, syliusModel, syliusAction]

    it("is detected, and Laravel gets no vote from a codebase with no Illuminate", () => {
        const d = detectFramework(all, "php")
        expect(d.id).toBe("symfony")
        expect(d.confident).toBe(true)
        expect(d.candidates.map(c => c.id)).not.toContain("laravel")
    })

    it("puts each class where a Symfony developer would look for it", () => {
        expect(classify(symfony, controller)).toBe("controllers")
        // The route was on the action; the engine hands it to the class.
        expect(classify(symfony, health)).toBe("controllers")
        expect(classify(symfony, syliusAction)).toBe("controllers")
        expect(classify(symfony, handler)).toBe("controllers")
        expect(classify(symfony, entity)).toBe("models")
        expect(classify(symfony, legacy)).toBe("models")
        expect(classify(symfony, syliusInterface)).toBe("models")
        expect(classify(symfony, syliusModel)).toBe("models")
        expect(classify(symfony, repository)).toBe("data")
        expect(classify(symfony, subscriber)).toBe("wiring")
        expect(classify(symfony, bundle)).toBe("wiring")
        expect(classify(symfony, mailer)).toBe("logic")
        expect(classify(symfony, unit("ProductType", "src/Form/Type/ProductType.php", { supertypes: ["AbstractType"] }))).toBe("forms")
        expect(classify(symfony, unit("ProductRepositoryInterface", "src/Repository/ProductRepositoryInterface.php", { supertypes: ["interface", "RepositoryInterface"] }))).toBe("data")
    })

    it("orders controllers and handlers over services over repositories over entities", () => {
        expect(layersOf(symfony)).toEqual(["controllers", "logic", "data", "models"])
        expect(edge(symfony, repository, entity)).toBe("down")
        expect(edge(symfony, subscriber, mailer)).toBe("unranked")
        expect(edge(symfony, controller, entity)).toBe("skip")
        expect(edge(symfony, controller, repository)).toBe("skip")
        expect(edge(symfony, handler, repository)).toBe("skip")
        // Doctrine's `repositoryClass:` makes every entity name its repository,
        // and that reads as running back up. It is metadata, not a call, but
        // the engine records what the source names.
        expect(edge(symfony, entity, repository)).toBe("back")
        expect(edge(symfony, entity, mailer)).toBe("back")
    })
})

describe("ASP.NET Core", () => {
    const aspnet = profileById("aspnet")
    const controller = unit("OrdersController", "src/Shop.Api/Controllers/OrdersController.cs", { annotations: ["ApiController", "Route", "HttpGet", "HttpPost", "FromBody"], supertypes: ["ControllerBase"], imports: ["Microsoft.AspNetCore.Mvc", "Shop.Api.Dtos", "Shop.Api.Services"] })
    const legacy = unit("LegacyController", "src/Shop.Api/Controllers/LegacyController.cs", { annotations: ["ApiController"], supertypes: ["Controller"] })
    const typedRepository = unit("TypedRepository", "src/Shop.Api/Controllers/LegacyController.cs", { supertypes: ["Repository"] })
    const serviceInterface = unit("IOrderService", "src/Shop.Api/Services/OrderService.cs", { supertypes: ["interface"], imports: ["Shop.Api.Data", "Shop.Api.Domain", "Shop.Api.Dtos"] })
    const service = unit("OrderService", "src/Shop.Api/Services/OrderService.cs", { supertypes: ["IOrderService"], imports: ["Shop.Api.Data", "Shop.Api.Domain", "Shop.Api.Dtos"] })
    const dbContext = unit("ShopDbContext", "src/Shop.Api/Data/ShopDbContext.cs", { supertypes: ["DbContext"], imports: ["Microsoft.EntityFrameworkCore", "Microsoft.EntityFrameworkCore.Metadata.Builders", "Shop.Api.Domain"] })
    const configuration = unit("OrderConfiguration", "src/Shop.Api/Data/ShopDbContext.cs", { supertypes: ["IEntityTypeConfiguration"], imports: ["Microsoft.EntityFrameworkCore", "Microsoft.EntityFrameworkCore.Metadata.Builders", "Shop.Api.Domain"] })
    const order = unit("Order", "src/Shop.Api/Domain/Order.cs", { annotations: ["Table", "Key"], supertypes: ["BaseEntity"], imports: ["System.ComponentModel.DataAnnotations", "System.ComponentModel.DataAnnotations.Schema"] })
    const baseEntity = unit("BaseEntity", "src/Shop.Api/Domain/Order.cs", { imports: ["System.ComponentModel.DataAnnotations", "System.ComponentModel.DataAnnotations.Schema"] })
    const customer = unit("Customer", "src/Shop.Api/Domain/Customer.cs", { supertypes: ["BaseEntity"], imports: ["Shop.Api.Services"] })
    const orderDto = unit("OrderDto", "src/Shop.Api/Dtos/OrderDto.cs", { annotations: ["record"] })
    const createOrderRequest = unit("CreateOrderRequest", "src/Shop.Api/Dtos/OrderDto.cs", { annotations: ["record"] })
    const money = unit("Money", "src/Shop.Api/Dtos/OrderDto.cs", { annotations: ["struct"] })
    const orderState = unit("OrderState", "src/Shop.Api/Dtos/OrderDto.cs", { annotations: ["Flags", "enum"] })
    const plain = unit("Plain", "src/Shop.Api/Dtos/OrderDto.cs")
    const command = unit("CreateOrder", "src/Shop.Api/Features/Orders/CreateOrder.cs", { annotations: ["record"], supertypes: ["IRequest"], imports: ["MediatR", "Shop.Api.Data"] })
    const commandHandler = unit("CreateOrderHandler", "src/Shop.Api/Features/Orders/CreateOrder.cs", { supertypes: ["IRequestHandler"], imports: ["MediatR", "Shop.Api.Data"] })
    const middleware = unit("ErrorHandlingMiddleware", "src/Shop.Api/Pipeline/ErrorHandlingMiddleware.cs", { supertypes: ["IMiddleware"], imports: ["Microsoft.AspNetCore.Http", "Microsoft.AspNetCore.Mvc.Filters"] })
    const filter = unit("AuditFilter", "src/Shop.Api/Pipeline/ErrorHandlingMiddleware.cs", { supertypes: ["IActionFilter"], imports: ["Microsoft.AspNetCore.Http", "Microsoft.AspNetCore.Mvc.Filters"] })
    const tenantAttribute = unit("TenantAttribute", "src/Shop.Api/Pipeline/ErrorHandlingMiddleware.cs", { supertypes: ["Attribute"], imports: ["Microsoft.AspNetCore.Http", "Microsoft.AspNetCore.Mvc.Filters"] })
    const page = unit("IndexModel", "src/Shop.Api/Pages/Index.cshtml.cs", { supertypes: ["PageModel"], imports: ["Microsoft.AspNetCore.Mvc.RazorPages", "Shop.Api.Services"] })
    // Program.cs is a module unit: no markers, named after the file.
    const program = unit("Program", "src/Shop.Api/Program.cs", { imports: ["Microsoft.EntityFrameworkCore", "Shop.Api.Data", "Shop.Api.Services"] })
    const tests = unit("OrdersControllerTests", "tests/Shop.Api.Tests/OrdersControllerTests.cs", { annotations: ["Fact"], imports: ["Shop.Api.Controllers", "Xunit"] })
    const all = [controller, legacy, typedRepository, serviceInterface, service, dbContext, configuration, order, baseEntity, customer, orderDto, createOrderRequest, money, orderState, plain, command, commandHandler, middleware, filter, tenantAttribute, page, program, tests]

    it("is detected from the AspNetCore namespaces and the controller bases", () => {
        const d = detectFramework(all, "csharp")
        expect(d.id).toBe("aspnet")
        expect(d.confident).toBe(true)
    })

    it("puts each type where an ASP.NET developer would look for it", () => {
        expect(classify(aspnet, controller)).toBe("controllers")
        // [ApiControllerAttribute] and Microsoft.AspNetCore.Mvc.Controller arrive normalised.
        expect(classify(aspnet, legacy)).toBe("controllers")
        expect(classify(aspnet, page)).toBe("controllers")
        // A minimal API's routes live in Program, whose EF import must not make it data access.
        expect(classify(aspnet, program)).toBe("controllers")
        expect(classify(aspnet, serviceInterface)).toBe("services")
        expect(classify(aspnet, service)).toBe("services")
        expect(classify(aspnet, commandHandler)).toBe("services")
        expect(classify(aspnet, dbContext)).toBe("data")
        expect(classify(aspnet, configuration)).toBe("data")
        expect(classify(aspnet, typedRepository)).toBe("data")
        // [Key] on a property marks the entity, not the abstract base after it.
        expect(classify(aspnet, order)).toBe("models")
        expect(classify(aspnet, baseEntity)).toBe("models")
        expect(classify(aspnet, customer)).toBe("models")
        expect(classify(aspnet, orderDto)).toBe("models")
        expect(classify(aspnet, createOrderRequest)).toBe("models")
        expect(classify(aspnet, money)).toBe("models")
        expect(classify(aspnet, orderState)).toBe("models")
        expect(classify(aspnet, command)).toBe("models")
        expect(classify(aspnet, plain)).toBe(UNCLASSIFIED)
        expect(classify(aspnet, middleware)).toBe("pipeline")
        expect(classify(aspnet, filter)).toBe("pipeline")
        expect(classify(aspnet, tenantAttribute)).toBe("pipeline")
        expect(classify(aspnet, unit("MinimumAgeHandler", "src/Shop.Api/Auth/MinimumAgeHandler.cs", { supertypes: ["AuthorizationHandler"] }))).toBe("pipeline")
        expect(classify(aspnet, tests)).toBe(UNCLASSIFIED)
    })

    it("orders controllers over services over data over models, and an entity calling a service as back up", () => {
        expect(layersOf(aspnet)).toEqual(["controllers", "services", "data", "models"])
        expect(edge(aspnet, controller, serviceInterface)).toBe("down")
        expect(edge(aspnet, page, serviceInterface)).toBe("down")
        expect(edge(aspnet, service, dbContext)).toBe("down")
        expect(edge(aspnet, dbContext, order)).toBe("down")
        expect(edge(aspnet, controller, orderDto)).toBe("skip")
        expect(edge(aspnet, service, order)).toBe("skip")
        expect(edge(aspnet, commandHandler, command)).toBe("skip")
        expect(edge(aspnet, program, dbContext)).toBe("skip")
        expect(edge(aspnet, middleware, service)).toBe("unranked")
        expect(edge(aspnet, customer, serviceInterface)).toBe("back")
    })
})
