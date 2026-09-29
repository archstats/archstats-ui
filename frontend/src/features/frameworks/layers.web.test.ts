import { describe, expect, it } from "vitest"
import { ANGULAR, EMPTY_FACTS, EXPRESS, NESTJS, REACT, UNCLASSIFIED, VUE, classify, detectFramework, isReactComponent, isReactPage, languageOf, profileById, type ClassFacts } from "./frameworkProfiles"
import { loadUnits } from "~/features/units/units"
import { isTestPath } from "~/features/snapshot/fileRole"
import { layersOf } from "~/features/reports/anatomy"
import { runReading } from "~/features/reports/readings"

// The JavaScript and TypeScript mini-apps the engine's pack tests read
// (extensions/treesitter/typescript/frameworks_test.go), written down as the
// snapshot rows the UI loads: one app each for NestJS, Angular, React with
// Next.js, Vue with Nuxt, and Express. Each unit is [id, kind, owner, file];
// imports are the raw import strings per file, markers what the engine
// attached, uses the modules each unit's references name, and edges what
// unit.Connections resolved. Every row below is what the Go test asserts.

type Row = [id: string, kind: string, owner: string, file: string]
type Mark = [unit: string, source: string, key: string]
interface Fixture { units: Row[]; imports: Record<string, string[]>; markers: Mark[]; uses: Record<string, string[]>; edges: Array<[string, string]> }
const nameOf = (id: string) => { const tail = id.slice(id.lastIndexOf("#") + 1); return tail.slice(tail.lastIndexOf(".") + 1) }

const NEST: Fixture = {
    units: [
        ["src/audit/audit.controller#AuditController", "type", "", "src/audit/audit.controller.ts"],
        ["src/audit/audit.controller#AuditController.all", "function", "src/audit/audit.controller#AuditController", "src/audit/audit.controller.ts"],
        ["src/audit/audit.controller#AuditController.constructor", "function", "src/audit/audit.controller#AuditController", "src/audit/audit.controller.ts"],
        ["src/auth/auth.guard#AuthGuard", "type", "", "src/auth/auth.guard.ts"],
        ["src/auth/auth.guard#AuthGuard.canActivate", "function", "src/auth/auth.guard#AuthGuard", "src/auth/auth.guard.ts"],
        ["src/common/validation.pipe#ValidationPipe", "type", "", "src/common/validation.pipe.ts"],
        ["src/common/validation.pipe#ValidationPipe.transform", "function", "src/common/validation.pipe#ValidationPipe", "src/common/validation.pipe.ts"],
        ["src/users/dto/create-user.dto#CreateUserDto", "type", "", "src/users/dto/create-user.dto.ts"],
        ["src/users/dto/create-user.dto#UpdateUserDto", "type", "", "src/users/dto/create-user.dto.ts"],
        ["src/users/user.entity#User", "type", "", "src/users/user.entity.ts"],
        ["src/users/user.entity#User.count", "function", "src/users/user.entity#User", "src/users/user.entity.ts"],
        ["src/users/users.controller#UsersController", "type", "", "src/users/users.controller.ts"],
        ["src/users/users.controller#UsersController.constructor", "function", "src/users/users.controller#UsersController", "src/users/users.controller.ts"],
        ["src/users/users.controller#UsersController.create", "function", "src/users/users.controller#UsersController", "src/users/users.controller.ts"],
        ["src/users/users.controller#UsersController.findAll", "function", "src/users/users.controller#UsersController", "src/users/users.controller.ts"],
        ["src/users/users.module#UsersModule", "type", "", "src/users/users.module.ts"],
        ["src/users/users.repository#UsersRepository", "type", "", "src/users/users.repository.ts"],
        ["src/users/users.repository#UsersRepository.constructor", "function", "src/users/users.repository#UsersRepository", "src/users/users.repository.ts"],
        ["src/users/users.repository#UsersRepository.find", "function", "src/users/users.repository#UsersRepository", "src/users/users.repository.ts"],
        ["src/users/users.repository#UsersRepository.save", "function", "src/users/users.repository#UsersRepository", "src/users/users.repository.ts"],
        ["src/users/users.service#UsersService", "type", "", "src/users/users.service.ts"],
        ["src/users/users.service#UsersService.constructor", "function", "src/users/users.service#UsersService", "src/users/users.service.ts"],
        ["src/users/users.service#UsersService.create", "function", "src/users/users.service#UsersService", "src/users/users.service.ts"],
        ["src/users/users.service#UsersService.findAll", "function", "src/users/users.service#UsersService", "src/users/users.service.ts"],
        // A spec beside the service, which the roles leave out.
        ["src/users/users.service.spec#makeService", "function", "", "src/users/users.service.spec.ts"],
    ],
    imports: {
        "src/audit/audit.controller.ts": ["@nestjs/common", "../users/users.repository"],
        "src/auth/auth.guard.ts": ["@nestjs/common"],
        "src/common/validation.pipe.ts": ["@nestjs/common"],
        "src/users/dto/create-user.dto.ts": ["class-validator"],
        "src/users/user.entity.ts": ["typeorm", "./users.service"],
        "src/users/users.controller.ts": ["@nestjs/common", "./users.service", "./dto/create-user.dto", "../auth/auth.guard", "../common/validation.pipe"],
        "src/users/users.module.ts": ["@nestjs/common", "@nestjs/typeorm", "./users.controller", "./users.service", "./users.repository", "./user.entity"],
        "src/users/users.repository.ts": ["@nestjs/common", "@nestjs/typeorm", "typeorm", "./user.entity"],
        "src/users/users.service.ts": ["@nestjs/common", "./users.repository", "./dto/create-user.dto", "./user.entity"],
        "src/users/users.service.spec.ts": ["@nestjs/testing", "./users.service"],
    },
    markers: [
        ["src/audit/audit.controller#AuditController", "annotation", "Controller"],
        ["src/auth/auth.guard#AuthGuard", "annotation", "Injectable"],
        ["src/auth/auth.guard#AuthGuard", "supertype", "CanActivate"],
        ["src/common/validation.pipe#ValidationPipe", "annotation", "Injectable"],
        ["src/common/validation.pipe#ValidationPipe", "supertype", "PipeTransform"],
        ["src/users/user.entity#User", "annotation", "Entity"],
        ["src/users/users.controller#UsersController", "annotation", "Controller"],
        ["src/users/users.controller#UsersController", "annotation", "UseGuards"],
        ["src/users/users.module#UsersModule", "annotation", "Module"],
        ["src/users/users.repository#UsersRepository", "annotation", "Injectable"],
        ["src/users/users.service#UsersService", "annotation", "Injectable"],
    ],
    uses: {
        "src/audit/audit.controller#AuditController": ["@nestjs/common"],
        "src/audit/audit.controller#AuditController.constructor": ["../users/users.repository"],
        "src/auth/auth.guard#AuthGuard": ["@nestjs/common"],
        "src/auth/auth.guard#AuthGuard.canActivate": ["@nestjs/common"],
        "src/common/validation.pipe#ValidationPipe": ["@nestjs/common"],
        "src/users/dto/create-user.dto#CreateUserDto": ["class-validator"],
        "src/users/dto/create-user.dto#UpdateUserDto": ["class-validator"],
        "src/users/user.entity#User": ["typeorm"],
        "src/users/user.entity#User.count": ["./users.service"],
        "src/users/users.controller#UsersController": ["../auth/auth.guard", "../common/validation.pipe", "@nestjs/common"],
        "src/users/users.controller#UsersController.constructor": ["./users.service"],
        "src/users/users.controller#UsersController.create": ["./dto/create-user.dto", "@nestjs/common"],
        "src/users/users.module#UsersModule": ["./user.entity", "./users.controller", "./users.repository", "./users.service", "@nestjs/common", "@nestjs/typeorm"],
        "src/users/users.repository#UsersRepository": ["@nestjs/common"],
        "src/users/users.repository#UsersRepository.constructor": ["./user.entity", "@nestjs/typeorm", "typeorm"],
        "src/users/users.repository#UsersRepository.save": ["./user.entity"],
        "src/users/users.service#UsersService": ["@nestjs/common"],
        "src/users/users.service#UsersService.constructor": ["./users.repository"],
        "src/users/users.service#UsersService.create": ["./dto/create-user.dto"],
        "src/users/users.service#UsersService.findAll": ["./user.entity"],
        "src/users/users.service.spec#makeService": ["@nestjs/testing", "./users.service"],
    },
    edges: [
        ["src/audit/audit.controller#AuditController.constructor", "src/users/users.repository#UsersRepository"],
        ["src/users/user.entity#User.count", "src/users/users.service#UsersService"],
        ["src/users/users.controller#UsersController", "src/auth/auth.guard#AuthGuard"],
        ["src/users/users.controller#UsersController", "src/common/validation.pipe#ValidationPipe"],
        ["src/users/users.controller#UsersController.constructor", "src/users/users.service#UsersService"],
        ["src/users/users.controller#UsersController.create", "src/users/dto/create-user.dto#CreateUserDto"],
        ["src/users/users.module#UsersModule", "src/users/user.entity#User"],
        ["src/users/users.module#UsersModule", "src/users/users.controller#UsersController"],
        ["src/users/users.module#UsersModule", "src/users/users.repository#UsersRepository"],
        ["src/users/users.module#UsersModule", "src/users/users.service#UsersService"],
        ["src/users/users.repository#UsersRepository.constructor", "src/users/user.entity#User"],
        ["src/users/users.repository#UsersRepository.save", "src/users/user.entity#User"],
        ["src/users/users.service#UsersService.constructor", "src/users/users.repository#UsersRepository"],
        ["src/users/users.service#UsersService.create", "src/users/dto/create-user.dto#CreateUserDto"],
        ["src/users/users.service#UsersService.findAll", "src/users/user.entity#User"],
        ["src/users/users.service.spec#makeService", "src/users/users.service#UsersService"],
    ],
}

const NG: Fixture = {
    units: [
        ["src/app/auth/auth.guard#authGuard", "function", "", "src/app/auth/auth.guard.ts"],
        ["src/app/auth/auth.interceptor#AuthInterceptor", "type", "", "src/app/auth/auth.interceptor.ts"],
        ["src/app/auth/auth.interceptor#AuthInterceptor.intercept", "function", "src/app/auth/auth.interceptor#AuthInterceptor", "src/app/auth/auth.interceptor.ts"],
        ["src/app/heroes/hero-list.component#HeroListComponent", "type", "", "src/app/heroes/hero-list.component.ts"],
        ["src/app/heroes/hero-list.component#HeroListComponent.ngOnInit", "function", "src/app/heroes/hero-list.component#HeroListComponent", "src/app/heroes/hero-list.component.ts"],
        ["src/app/heroes/hero.api#HeroApi", "type", "", "src/app/heroes/hero.api.ts"],
        ["src/app/heroes/hero.api#HeroApi.fetchAll", "function", "src/app/heroes/hero.api#HeroApi", "src/app/heroes/hero.api.ts"],
        ["src/app/heroes/hero.model#Hero", "type", "", "src/app/heroes/hero.model.ts"],
        ["src/app/heroes/hero.model#Power", "type", "", "src/app/heroes/hero.model.ts"],
        ["src/app/heroes/hero.service#HeroService", "type", "", "src/app/heroes/hero.service.ts"],
        ["src/app/heroes/hero.service#HeroService.first", "function", "src/app/heroes/hero.service#HeroService", "src/app/heroes/hero.service.ts"],
        ["src/app/heroes/hero.service#HeroService.load", "function", "src/app/heroes/hero.service#HeroService", "src/app/heroes/hero.service.ts"],
        ["src/app/shared/highlight.directive#HighlightDirective", "type", "", "src/app/shared/highlight.directive.ts"],
        ["src/app/shared/title-case.pipe#TitleCasePipe", "type", "", "src/app/shared/title-case.pipe.ts"],
        ["src/app/shared/title-case.pipe#TitleCasePipe.transform", "function", "src/app/shared/title-case.pipe#TitleCasePipe", "src/app/shared/title-case.pipe.ts"],
    ],
    imports: {
        "src/app/auth/auth.guard.ts": ["@angular/core", "@angular/router", "../heroes/hero.service"],
        "src/app/auth/auth.interceptor.ts": ["@angular/core", "@angular/common/http"],
        "src/app/heroes/hero-list.component.ts": ["@angular/core", "@ngrx/store", "./hero.service", "./hero.model", "../shared/highlight.directive", "../shared/title-case.pipe"],
        "src/app/heroes/hero.api.ts": ["@angular/core", "@angular/common/http", "./hero.model", "./hero.service"],
        "src/app/heroes/hero.service.ts": ["@angular/core", "./hero.api", "./hero.model"],
        "src/app/shared/highlight.directive.ts": ["@angular/core"],
        "src/app/shared/title-case.pipe.ts": ["@angular/core"],
    },
    markers: [
        ["src/app/auth/auth.interceptor#AuthInterceptor", "annotation", "Injectable"],
        ["src/app/auth/auth.interceptor#AuthInterceptor", "supertype", "HttpInterceptor"],
        ["src/app/heroes/hero-list.component#HeroListComponent", "annotation", "Component"],
        ["src/app/heroes/hero.api#HeroApi", "annotation", "Injectable"],
        ["src/app/heroes/hero.model#Hero", "supertype", "interface"],
        ["src/app/heroes/hero.model#Power", "supertype", "type_alias"],
        ["src/app/heroes/hero.service#HeroService", "annotation", "Injectable"],
        ["src/app/shared/highlight.directive#HighlightDirective", "annotation", "Directive"],
        ["src/app/shared/title-case.pipe#TitleCasePipe", "annotation", "Pipe"],
        ["src/app/shared/title-case.pipe#TitleCasePipe", "supertype", "PipeTransform"],
    ],
    uses: {
        "src/app/auth/auth.guard#authGuard": ["../heroes/hero.service", "@angular/core", "@angular/router"],
        "src/app/auth/auth.interceptor#AuthInterceptor": ["@angular/common/http", "@angular/core"],
        "src/app/auth/auth.interceptor#AuthInterceptor.intercept": ["@angular/common/http"],
        "src/app/heroes/hero-list.component#HeroListComponent": ["../shared/highlight.directive", "../shared/title-case.pipe", "./hero.model", "./hero.service", "@angular/core", "@ngrx/store"],
        "src/app/heroes/hero.api#HeroApi": ["./hero.service", "@angular/common/http", "@angular/core"],
        "src/app/heroes/hero.api#HeroApi.fetchAll": ["./hero.model"],
        "src/app/heroes/hero.service#HeroService": ["./hero.api", "@angular/core"],
        "src/app/heroes/hero.service#HeroService.first": ["./hero.model"],
        "src/app/shared/highlight.directive#HighlightDirective": ["@angular/core"],
        "src/app/shared/title-case.pipe#TitleCasePipe": ["@angular/core"],
    },
    edges: [
        ["src/app/auth/auth.guard#authGuard", "src/app/heroes/hero.service#HeroService"],
        ["src/app/heroes/hero-list.component#HeroListComponent", "src/app/heroes/hero.model#Hero"],
        ["src/app/heroes/hero-list.component#HeroListComponent", "src/app/heroes/hero.service#HeroService"],
        ["src/app/heroes/hero-list.component#HeroListComponent", "src/app/shared/highlight.directive#HighlightDirective"],
        ["src/app/heroes/hero-list.component#HeroListComponent", "src/app/shared/title-case.pipe#TitleCasePipe"],
        ["src/app/heroes/hero.api#HeroApi", "src/app/heroes/hero.service#HeroService"],
        ["src/app/heroes/hero.api#HeroApi.fetchAll", "src/app/heroes/hero.model#Hero"],
        ["src/app/heroes/hero.service#HeroService", "src/app/heroes/hero.api#HeroApi"],
        ["src/app/heroes/hero.service#HeroService.first", "src/app/heroes/hero.model#Hero"],
    ],
}

const NEXT: Fixture = {
    units: [
        ["app/users/page#Page", "function", "", "app/users/page.tsx"],
        ["components/UserCard#UserCard", "function", "", "components/UserCard.tsx"],
        ["components/UserList#RefreshButton", "function", "", "components/UserList.tsx"],
        ["components/UserList#RefreshButton.onClick", "function", "components/UserList#RefreshButton", "components/UserList.tsx"],
        ["components/UserList#UserList", "function", "", "components/UserList.tsx"],
        ["hooks/useUsers#useUsers", "function", "", "hooks/useUsers.ts"],
        ["lib/api/users#fetchUsers", "function", "", "lib/api/users.ts"],
        ["pages#Home", "function", "", "pages/index.tsx"],
        ["types/user#Role", "type", "", "types/user.ts"],
        ["types/user#User", "type", "", "types/user.ts"],
    ],
    imports: {
        "app/users/page.tsx": ["@/components/UserList", "@/hooks/useUsers"],
        "components/UserCard.tsx": ["react", "@/types/user"],
        "components/UserList.tsx": ["react", "axios", "@/types/user", "./UserCard"],
        "hooks/useUsers.ts": ["@tanstack/react-query", "@/lib/api/users", "@/types/user", "@/components/UserCard"],
        "lib/api/users.ts": ["axios", "@/types/user"],
        "pages/index.tsx": ["next/link", "@/components/UserCard"],
    },
    markers: [
        ["components/UserCard#UserCard", "supertype", "forwardRef"],
        ["components/UserList#UserList", "supertype", "memo"],
        ["types/user#Role", "supertype", "type_alias"],
        ["types/user#User", "supertype", "interface"],
    ],
    uses: {
        "app/users/page#Page": ["@/components/UserList", "@/hooks/useUsers"],
        "components/UserCard#UserCard": ["@/types/user", "react"],
        "components/UserList#RefreshButton.onClick": ["axios"],
        "components/UserList#UserList": ["./UserCard", "@/types/user", "react"],
        "hooks/useUsers#useUsers": ["@/components/UserCard", "@/lib/api/users", "@/types/user", "@tanstack/react-query"],
        "lib/api/users#fetchUsers": ["@/types/user", "axios"],
        "pages#Home": ["@/components/UserCard", "next/link"],
    },
    edges: [
        ["app/users/page#Page", "components/UserList#UserList"],
        ["app/users/page#Page", "hooks/useUsers#useUsers"],
        ["components/UserCard#UserCard", "types/user#User"],
        ["components/UserList#UserList", "components/UserCard#UserCard"],
        ["components/UserList#UserList", "types/user#User"],
        ["hooks/useUsers#useUsers", "components/UserCard#UserCard"],
        ["hooks/useUsers#useUsers", "lib/api/users#fetchUsers"],
        ["hooks/useUsers#useUsers", "types/user#User"],
        ["lib/api/users#fetchUsers", "types/user#User"],
        ["pages#Home", "components/UserCard#UserCard"],
    ],
}

const NUXT: Fixture = {
    units: [
        ["api/cart#fetchCart", "function", "", "api/cart.ts"],
        ["app#app", "type", "", "./app.vue"],
        ["components/AppHeader#AppHeader", "type", "", "components/AppHeader.vue"],
        ["components/CartLine#CartLine", "type", "", "components/CartLine.vue"],
        ["components/CartLine#price", "function", "components/CartLine#CartLine", "components/CartLine.vue"],
        ["components/CartPanel#CartPanel", "type", "", "components/CartPanel.vue"],
        ["components/CartPanel#Props", "type", "components/CartPanel#CartPanel", "components/CartPanel.vue"],
        ["components/CartPanel#pick", "function", "components/CartPanel#CartPanel", "components/CartPanel.vue"],
        ["composables/useCart#useCart", "function", "", "composables/useCart.ts"],
        ["error#error", "type", "", "./error.vue"],
        ["layouts/default#default", "type", "", "layouts/default.vue"],
        ["pages/cart/[id]#[id]", "type", "", "pages/cart/[id].vue"],
        ["stores/cart#useCartStore", "type", "", "stores/cart.ts"],
        ["stores/cart#useCartStore.load", "function", "stores/cart#useCartStore", "stores/cart.ts"],
        ["stores/user#useUserStore", "type", "", "stores/user.ts"],
        ["stores/user#useUserStore.rename", "function", "stores/user#useUserStore", "stores/user.ts"],
        ["types/cart#CartItem", "type", "", "types/cart.ts"],
        ["utils/price#formatPrice", "function", "", "utils/price.ts"],
    ],
    imports: {
        "api/cart.ts": ["ofetch", "~/types/cart", "~/stores/user"],
        "components/CartLine.vue": ["~/utils/price"],
        "components/CartPanel.vue": ["./CartLine.vue", "~/types/cart"],
        "composables/useCart.ts": ["vue", "~/stores/cart"],
        "pages/cart/[id].vue": ["~/components/CartPanel.vue", "~/composables/useCart"],
        "stores/cart.ts": ["pinia", "vue", "~/api/cart", "~/types/cart"],
        "stores/user.ts": ["pinia"],
    },
    markers: [
        ["app#app", "filename", "vue_component"],
        ["components/AppHeader#AppHeader", "filename", "vue_component"],
        ["components/CartLine#CartLine", "filename", "vue_component"],
        ["components/CartPanel#CartPanel", "filename", "vue_component"],
        ["components/CartPanel#Props", "supertype", "interface"],
        ["error#error", "filename", "vue_component"],
        ["layouts/default#default", "filename", "vue_component"],
        ["pages/cart/[id]#[id]", "filename", "vue_component"],
        ["stores/cart#useCartStore", "supertype", "defineStore"],
        ["stores/user#useUserStore", "supertype", "defineStore"],
        ["types/cart#CartItem", "supertype", "interface"],
    ],
    uses: {
        "api/cart#fetchCart": ["ofetch", "~/stores/user", "~/types/cart"],
        "components/CartLine#price": ["~/utils/price"],
        "components/CartPanel#CartPanel": ["./CartLine.vue", "~/types/cart"],
        "components/CartPanel#Props": ["~/types/cart"],
        "components/CartPanel#pick": ["~/types/cart"],
        "composables/useCart#useCart": ["vue", "~/stores/cart"],
        "pages/cart/[id]#[id]": ["~/components/CartPanel.vue", "~/composables/useCart"],
        "stores/cart#useCartStore": ["pinia", "vue", "~/types/cart"],
        "stores/cart#useCartStore.load": ["~/api/cart"],
        "stores/user#useUserStore": ["pinia"],
    },
    edges: [
        ["api/cart#fetchCart", "stores/user#useUserStore"],
        ["api/cart#fetchCart", "types/cart#CartItem"],
        ["components/CartLine#price", "utils/price#formatPrice"],
        ["components/CartPanel#CartPanel", "components/CartLine#CartLine"],
        ["components/CartPanel#CartPanel", "types/cart#CartItem"],
        ["components/CartPanel#Props", "types/cart#CartItem"],
        ["components/CartPanel#pick", "types/cart#CartItem"],
        ["composables/useCart#useCart", "stores/cart#useCartStore"],
        ["pages/cart/[id]#[id]", "components/CartPanel#CartPanel"],
        ["pages/cart/[id]#[id]", "composables/useCart#useCart"],
        ["stores/cart#useCartStore", "types/cart#CartItem"],
        ["stores/cart#useCartStore.load", "api/cart#fetchCart"],
    ],
}

const EXP: Fixture = {
    units: [
        ["src/app#", "module", "", "src/app.ts"],
        ["src/controllers/users.controller#createUser", "function", "", "src/controllers/users.controller.ts"],
        ["src/controllers/users.controller#listUsers", "function", "", "src/controllers/users.controller.ts"],
        ["src/middleware/auth#requireAuth", "function", "", "src/middleware/auth.ts"],
        ["src/middleware/error#errorHandler", "function", "", "src/middleware/error.ts"],
        ["src/models/user#User", "type", "", "src/models/user.ts"],
        ["src/repositories/user.repository#UserRepository", "type", "", "src/repositories/user.repository.ts"],
        ["src/repositories/user.repository#UserRepository.audit", "function", "src/repositories/user.repository#UserRepository", "src/repositories/user.repository.ts"],
        ["src/repositories/user.repository#UserRepository.findAll", "function", "src/repositories/user.repository#UserRepository", "src/repositories/user.repository.ts"],
        ["src/repositories/user.repository#UserRepository.insert", "function", "src/repositories/user.repository#UserRepository", "src/repositories/user.repository.ts"],
        ["src/routes/users#", "module", "", "src/routes/users.ts"],
        ["src/services/users.service#", "module", "", "src/services/users.service.ts"],
        ["src/services/users.service#createOne", "function", "", "src/services/users.service.ts"],
        ["src/services/users.service#findAllUsers", "function", "", "src/services/users.service.ts"],
    ],
    imports: {
        "src/app.ts": ["express", "./routes/users", "./middleware/error"],
        "src/controllers/users.controller.ts": ["express", "../services/users.service"],
        "src/middleware/auth.ts": ["express"],
        "src/middleware/error.ts": ["express"],
        "src/repositories/user.repository.ts": ["pg", "../models/user", "../controllers/users.controller"],
        "src/routes/users.ts": ["express", "../middleware/auth", "../controllers/users.controller"],
        "src/services/users.service.ts": ["../repositories/user.repository", "../models/user"],
    },
    markers: [
        ["src/models/user#User", "supertype", "interface"],
    ],
    uses: {
        "src/app#": ["./middleware/error", "./routes/users", "express"],
        "src/controllers/users.controller#createUser": ["../services/users.service", "express"],
        "src/controllers/users.controller#listUsers": ["../services/users.service", "express"],
        "src/middleware/auth#requireAuth": ["express"],
        "src/middleware/error#errorHandler": ["express"],
        "src/repositories/user.repository#UserRepository": ["pg"],
        "src/repositories/user.repository#UserRepository.audit": ["../controllers/users.controller"],
        "src/repositories/user.repository#UserRepository.findAll": ["../models/user"],
        "src/repositories/user.repository#UserRepository.insert": ["../models/user"],
        "src/routes/users#": ["../controllers/users.controller", "../middleware/auth", "express"],
        "src/services/users.service#": ["../repositories/user.repository"],
        "src/services/users.service#createOne": ["../models/user"],
        "src/services/users.service#findAllUsers": ["../models/user"],
    },
    edges: [
        ["src/app#", "src/middleware/error#errorHandler"],
        ["src/controllers/users.controller#createUser", "src/services/users.service#createOne"],
        ["src/controllers/users.controller#listUsers", "src/services/users.service#findAllUsers"],
        ["src/repositories/user.repository#UserRepository.audit", "src/controllers/users.controller#listUsers"],
        ["src/repositories/user.repository#UserRepository.findAll", "src/models/user#User"],
        ["src/repositories/user.repository#UserRepository.insert", "src/models/user#User"],
        ["src/routes/users#", "src/controllers/users.controller#createUser"],
        ["src/routes/users#", "src/controllers/users.controller#listUsers"],
        ["src/routes/users#", "src/middleware/auth#requireAuth"],
        ["src/services/users.service#", "src/repositories/user.repository#UserRepository"],
        ["src/services/users.service#createOne", "src/models/user#User"],
        ["src/services/users.service#findAllUsers", "src/models/user#User"],
    ],
}

/** The snapshot's tables, answered the way the real ones answer each query. */
function snapshot(fx: Fixture) {
    const units = fx.units.map(([id, kind, owner, file]) => ({ id, kind, name: nameOf(id), component: file.slice(0, file.lastIndexOf("/")) || ".", module: "", owner, file }))
    const tables = ["units", "unit_markers", "unit_uses", "unit_connections", "snippets", "files"]
    const query = async (sql: string): Promise<any[]> => {
        if (sql.includes("sqlite_master")) return tables.map(name => ({ name }))
        if (sql.includes("pragma_table_info('files')")) return [{ name: "role" }]
        if (sql.includes("FROM units")) return units
        if (sql.includes("FROM unit_markers")) return fx.markers.map(([unit, source, key]) => ({ unit, source, key, value: null }))
        if (sql.includes("FROM unit_uses")) return Object.entries(fx.uses).flatMap(([unit, mods]) => mods.map(module => ({ unit, module })))
        if (sql.includes("FROM unit_connections")) return fx.edges.map(([from, to]) => ({ from, to }))
        if (sql.includes("FROM snippets")) return Object.entries(fx.imports).flatMap(([file, imps]) => imps.map(content => ({ file, content })))
        if (sql.includes("FROM files")) return [...new Set(fx.units.map(u => u[3]))].map(name => ({ name, role: isTestPath(name) ? "test" : "production" }))
        return []
    }
    return { query, hasView: (v: string) => tables.includes(v), ctx: { query, revision: 3, label: (x: string) => x, aliases: {} } }
}

async function facts(fx: Fixture) {
    const { query, hasView } = snapshot(fx)
    return loadUnits(query, hasView)
}
async function detect(fx: Fixture) {
    return detectFramework([...(await facts(fx)).values()].map(f => f.facts), "typescript")
}
async function lanesOf(fx: Fixture, profileId: string) {
    const all = await facts(fx)
    const p = profileById(profileId)
    return (id: string) => { const f = all.get(id); if (!f) throw new Error(`no top-level unit ${id}`); return classify(p, f.facts) }
}

const bare = (name: string, o: Partial<{ file: string; annotations: string[]; supertypes: string[]; imports: string[]; isInterface: boolean }> = {}): ClassFacts => ({
    ...EMPTY_FACTS, name, file: o.file,
    annotations: new Set(o.annotations ?? []), supertypes: new Set(o.supertypes ?? []), imports: new Set(o.imports ?? []),
    isInterface: o.isInterface ?? false,
})

describe("detecting a JavaScript or TypeScript codebase", () => {
    it("reads each mini-app as its own framework", async () => {
        for (const [fx, id] of [[NEST, "nestjs"], [NG, "angular"], [NEXT, "react"], [NUXT, "vue"], [EXP, "express"]] as const) {
            const d = await detect(fx)
            expect(d.id, id).toBe(id)
            expect(d.confident, d.reason).toBe(true)
        }
        expect(languageOf(NUXT.units.map(u => u[3]))).toBe("typescript")
    })

    it("does not confuse React with Vue", async () => {
        expect((await detect(NEXT)).candidates.map(c => c.id)).not.toContain("vue")
        expect((await detect(NUXT)).candidates.map(c => c.id)).not.toContain("react")
    })

    it("does not confuse NestJS with Angular, which both write @Injectable()", async () => {
        // Neither app carries the other's imports, so neither is a candidate.
        expect((await detect(NEST)).candidates.map(c => c.id)).not.toContain("angular")
        expect((await detect(NG)).candidates.map(c => c.id)).not.toContain("nestjs")
        // An Angular app with more injectables than components: services,
        // guards, interceptors, resolvers and effects are all @Injectable(),
        // and every one of them used to be a NestJS vote too, which put the
        // two within a hair and detection said it could not choose.
        const app = [
            ...Array.from({ length: 12 }, (_, i) => bare(`Page${i}Component`, { file: `src/app/p${i}.component.ts`, annotations: ["Component"], imports: ["@angular/core"] })),
            ...Array.from({ length: 14 }, (_, i) => bare(`Thing${i}Service`, { file: `src/app/t${i}.service.ts`, annotations: ["Injectable"], imports: ["@angular/core"] })),
        ]
        const d = detectFramework(app, "typescript")
        expect(d.id).toBe("angular")
        expect(d.confident).toBe(true)
        expect(d.candidates.map(c => c.id)).toEqual(["angular"])
    })

    it("reads Koa and Fastify apps with the Express profile", () => {
        const koa = Array.from({ length: 6 }, (_, i) => bare(`handler${i}`, { file: `src/routes/r${i}.ts`, imports: i % 2 ? ["koa"] : ["@koa/router"] }))
        expect(detectFramework(koa, "typescript").id).toBe("express")
        const fastify = Array.from({ length: 6 }, (_, i) => bare(`handler${i}`, { file: `src/routes/r${i}.ts`, imports: i % 2 ? ["fastify"] : ["@fastify/cors"] }))
        expect(detectFramework(fastify, "typescript").id).toBe("express")
    })

    it("reads a monorepo of a React client and an Express API as React, and leaves the API unread", async () => {
        // One profile per codebase: the client's forty components outvote
        // the API's handlers, and every handler then lands in React's
        // Unclassified. A per-directory profile is what this needs, not a
        // better vote.
        const client = Array.from({ length: 40 }, (_, i) => bare(`Panel${i}`, { file: `client/src/components/Panel${i}.tsx`, imports: ["react"] }))
        const api = [...(await facts(EXP)).values()].map(f => ({ ...f.facts, file: "api/" + f.file }))
        const d = detectFramework([...client, ...api], "typescript")
        expect(d.id).toBe("react")
        expect(d.confident).toBe(true)
        expect(d.candidates.map(c => c.id)).toEqual(["react", "express"])
        expect(classify(profileById("react"), api.find(f => f.name === "listUsers")!)).toBe(UNCLASSIFIED)
    })

    it("has no profile for Svelte, so a SvelteKit app reads by structure", () => {
        // The engine marks every .svelte file svelte_component, and the file
        // tells the language, but no profile claims the marker or the
        // `svelte`, `$app/` and `$lib/` imports. A Svelte profile (routes'
        // +page and +layout, components, stores from svelte/store, data,
        // models) is the missing piece.
        const app = Array.from({ length: 10 }, (_, i) => bare(`Widget${i}`, { file: `src/lib/Widget${i}.svelte`, annotations: ["svelte_component"], imports: ["svelte", "$lib/stores"] }))
        expect(languageOf(app.map(f => f.file!))).toBe("typescript")
        const d = detectFramework(app, "typescript")
        expect(d.id).toBe("structure")
        expect(d.candidates).toEqual([])
    })
})

describe("the NestJS lanes", () => {
    it("puts controllers, services, repositories, entities, DTOs, guards, pipes and modules where a NestJS developer expects", async () => {
        const lane = await lanesOf(NEST, "nestjs")
        expect(lane("src/users/users.controller#UsersController")).toBe("controllers")
        expect(lane("src/audit/audit.controller#AuditController")).toBe("controllers")
        expect(lane("src/users/users.service#UsersService")).toBe("providers")
        // The repository is @Injectable() like the service; typeorm and its
        // name say what it is.
        expect(lane("src/users/users.repository#UsersRepository")).toBe("data")
        expect(lane("src/users/user.entity#User")).toBe("models")
        // A DTO carries only class-validator decorators on its fields, which
        // are not the class's; its name is what places it.
        expect(lane("src/users/dto/create-user.dto#CreateUserDto")).toBe("models")
        expect(lane("src/users/dto/create-user.dto#UpdateUserDto")).toBe("models")
        // Guards and pipes are @Injectable() too; what they implement decides.
        expect(lane("src/auth/auth.guard#AuthGuard")).toBe("pipeline")
        expect(lane("src/common/validation.pipe#ValidationPipe")).toBe("pipeline")
        // Wiring sits beside the layers.
        expect(lane("src/users/users.module#UsersModule")).toBe("modules")
    })

    it("reads an @Injectable() by what it implements, imports or is called before the decorator", () => {
        const p = profileById("nestjs")
        const inj = (name: string, o: Partial<{ supertypes: string[]; imports: string[] }> = {}) => bare(name, { annotations: ["Injectable"], imports: ["@nestjs/common", ...(o.imports ?? [])], ...o })
        expect(classify(p, inj("RolesGuard"))).toBe("pipeline")
        expect(classify(p, inj("LoggingInterceptor", { supertypes: ["NestInterceptor"] }))).toBe("pipeline")
        expect(classify(p, inj("HttpErrorFilter", { supertypes: ["ExceptionFilter"] }))).toBe("pipeline")
        expect(classify(p, inj("PaymentsClient"))).toBe("data")
        expect(classify(p, inj("UsersRepository", { supertypes: ["Repository"] }))).toBe("data")
        // A service that injects Repository<User> itself is still a service.
        expect(classify(p, inj("UsersService", { imports: ["typeorm"] }))).toBe("providers")
        expect(classify(p, inj("MailerService"))).toBe("providers")
        expect(classify(p, bare("Helper", { imports: ["@nestjs/common"] }))).toBe(UNCLASSIFIED)
    })

    it("keeps modules out of the layer order", () => {
        expect(layersOf(profileById("nestjs"))).toEqual(["controllers", "providers", "data", "models"])
    })
})

describe("the Angular lanes", () => {
    it("puts components, services, the HTTP class, models, directives, pipes, guards and interceptors where an Angular developer expects", async () => {
        const lane = await lanesOf(NG, "angular")
        // Standalone, with inject() and a signal, and importing @ngrx/store:
        // the decorator wins over the store import.
        expect(lane("src/app/heroes/hero-list.component#HeroListComponent")).toBe("components")
        expect(lane("src/app/heroes/hero.service#HeroService")).toBe("services")
        // Both are @Injectable(); the one named Api that uses HttpClient is
        // the data access.
        expect(lane("src/app/heroes/hero.api#HeroApi")).toBe("data")
        expect(lane("src/app/heroes/hero.model#Hero")).toBe("models")
        expect(lane("src/app/heroes/hero.model#Power")).toBe("models")
        expect(lane("src/app/shared/highlight.directive#HighlightDirective")).toBe("pipeline")
        expect(lane("src/app/shared/title-case.pipe#TitleCasePipe")).toBe("pipeline")
        // A functional guard has no decorator; its name says guard.
        expect(lane("src/app/auth/auth.guard#authGuard")).toBe("pipeline")
        expect(lane("src/app/auth/auth.interceptor#AuthInterceptor")).toBe("pipeline")
    })

    it("keeps a service that holds HttpClient a service, since in Angular the service usually is the HTTP layer", () => {
        const p = profileById("angular")
        expect(classify(p, bare("HeroService", { annotations: ["Injectable"], imports: ["@angular/core", "@angular/common/http"] }))).toBe("services")
        expect(classify(p, bare("HeroesStore", { annotations: ["Injectable"], imports: ["@angular/core", "@ngrx/component-store"] }))).toBe("services")
        expect(classify(p, bare("HeroesClient", { annotations: ["Injectable"], imports: ["@angular/core", "@angular/common/http"] }))).toBe("data")
    })
})

describe("the React lanes", () => {
    it("puts routes, components, hooks, the client and the types where a React developer expects", async () => {
        const lane = await lanesOf(NEXT, "react")
        // Next.js routes: an app router page and a pages router index.
        expect(lane("app/users/page#Page")).toBe("pages")
        expect(lane("pages#Home")).toBe("pages")
        // memo() and forwardRef() wrap the component; it is still one.
        expect(lane("components/UserList#UserList")).toBe("components")
        expect(lane("components/UserCard#UserCard")).toBe("components")
        // A component whose callback calls axios is a component: the callback
        // is its member, and the component's own uses roll it up.
        expect(lane("components/UserList#RefreshButton")).toBe("components")
        // A hook wrapping react-query is the hook the components call, not
        // the data layer; the client it calls is.
        expect(lane("hooks/useUsers#useUsers")).toBe("hooks")
        expect(lane("lib/api/users#fetchUsers")).toBe("data")
        expect(lane("types/user#User")).toBe("models")
        expect(lane("types/user#Role")).toBe("models")
    })

    it("reads a component by its shape and its file", () => {
        const p = profileById("react")
        const tsx = (name: string, o: Partial<{ supertypes: string[]; imports: string[] }> = {}) => bare(name, { file: "src/Shapes.tsx", imports: ["react"], ...o })
        // Declared, arrow, class, wrapped: all Pascal case in a .tsx file.
        expect(classify(p, tsx("Declared"))).toBe("components")
        expect(classify(p, tsx("Arrow"))).toBe("components")
        expect(classify(p, tsx("Legacy", { supertypes: ["Component"] }))).toBe("components")
        expect(classify(p, tsx("Pure", { supertypes: ["PureComponent"] }))).toBe("components")
        // .jsx, and .js when the file imports React; a .js file that does
        // not is plain JavaScript and a capital is a constructor.
        expect(classify(p, bare("Button", { file: "src/legacy/Button.jsx", imports: ["react"] }))).toBe("components")
        expect(classify(p, bare("Panel", { file: "src/legacy/Panel.js", imports: ["react"] }))).toBe("components")
        expect(classify(p, bare("Panel", { file: "src/legacy/Panel.js", imports: ["jquery"] }))).toBe(UNCLASSIFIED)
        // Not a component: a Pascal-case shape in the same .tsx file, a
        // Pascal-case class in a .ts file, and a lower-case HOC.
        expect(classify(p, tsx("Props", { supertypes: ["type_alias"] }))).toBe("models")
        expect(classify(p, bare("UserStore", { file: "src/store.ts", imports: ["react"] }))).toBe("data")
        expect(classify(p, tsx("withAuth"))).toBe(UNCLASSIFIED)
        // useless is not a hook: no capital after use.
        expect(classify(p, tsx("useless"))).toBe(UNCLASSIFIED)
        expect(classify(p, tsx("useLess"))).toBe("hooks")
        expect(isReactComponent(bare("Grid", { file: "src/Grid.tsx", isInterface: true }))).toBe(false)
    })

    it("reads Next.js routes from their path and leaves API routes and the CRA App out", () => {
        const page = (file: string) => isReactPage(bare("Page", { file, imports: ["react"] }))
        expect(page("app/page.tsx")).toBe(true)
        expect(page("src/app/(shop)/cart/[id]/page.tsx")).toBe(true)
        expect(page("app/dashboard/layout.tsx")).toBe(true)
        expect(page("app/dashboard/loading.tsx")).toBe(true)
        expect(page("pages/index.tsx")).toBe(true)
        expect(page("pages/blog/[slug].jsx")).toBe(true)
        expect(page("pages/_app.tsx")).toBe(true)
        // An API route is a handler, not a component, and app/App.tsx is a
        // Create React App root, not a Next.js route.
        expect(page("pages/api/users.ts")).toBe(false)
        expect(page("src/app/App.tsx")).toBe(false)
        expect(page("app/users/UserTable.tsx")).toBe(false)
        expect(page("components/Page.tsx")).toBe(false)
    })

    it("puts Redux Toolkit state with the data layer", () => {
        const p = profileById("react")
        expect(classify(p, bare("cartSlice", { file: "src/features/cart/slice.ts", supertypes: ["createSlice"], imports: ["@reduxjs/toolkit"] }))).toBe("data")
        expect(classify(p, bare("api", { file: "src/services/api.ts", supertypes: ["createApi"], imports: ["@reduxjs/toolkit/query/react"] }))).toBe("data")
        // A thunk is a function whose body calls the client; a selector reads the state.
        expect(classify(p, bare("loadUsers", { file: "src/features/users/thunks.ts", supertypes: ["createAsyncThunk"], imports: ["@reduxjs/toolkit", "../../lib/api/users"] }))).toBe("data")
        expect(classify(p, bare("selectUsers", { file: "src/features/users/selectors.ts", supertypes: ["createSelector"], imports: ["@reduxjs/toolkit"] }))).toBe("data")
    })
})

describe("the Vue lanes", () => {
    it("puts the root, layouts, pages, components, composables, stores, the client and the types where a Vue developer expects", async () => {
        const lane = await lanesOf(NUXT, "vue")
        expect(lane("app#app")).toBe("pages")
        expect(lane("error#error")).toBe("pages")
        expect(lane("layouts/default#default")).toBe("pages")
        expect(lane("pages/cart/[id]#[id]")).toBe("pages")
        expect(lane("components/AppHeader#AppHeader")).toBe("components")
        // <script setup> in TypeScript and the Options API in JavaScript
        // are the same kind of thing.
        expect(lane("components/CartPanel#CartPanel")).toBe("components")
        expect(lane("components/CartLine#CartLine")).toBe("components")
        expect(lane("composables/useCart#useCart")).toBe("composables")
        // A setup store and an options store are both stores.
        expect(lane("stores/cart#useCartStore")).toBe("stores")
        expect(lane("stores/user#useUserStore")).toBe("stores")
        expect(lane("api/cart#fetchCart")).toBe("data")
        expect(lane("types/cart#CartItem")).toBe("models")
        expect(lane("utils/price#formatPrice")).toBe(UNCLASSIFIED)
    })

    it("does not list what a component's script declares as units of their own", async () => {
        // pick() and interface Props belong to CartPanel, so a composable
        // written inside a component and a component's props type are the
        // component's and in no lane of their own.
        const all = await facts(NUXT)
        expect(all.has("components/CartPanel#pick")).toBe(false)
        expect(all.has("components/CartPanel#Props")).toBe(false)
        expect(all.has("components/CartLine#price")).toBe(false)
        // Compiler macros are values, not units.
        expect([...all.keys()].some(id => /#(props|emit)$/.test(id))).toBe(false)
        expect(all.get("components/CartPanel#CartPanel")!.facts.methodCount).toBe(2)
    })

    it("reads a useXStore as a store and a composable that fetches as a composable", () => {
        const p = profileById("vue")
        // A snapshot from before defineStore constants were units has the
        // store as a function in a file importing pinia.
        expect(classify(p, bare("useCartStore", { file: "stores/cart.ts", imports: ["pinia"] }))).toBe("stores")
        expect(classify(p, bare("useCartStore", { file: "stores/cart.ts", supertypes: ["defineStore"], imports: ["pinia"] }))).toBe("stores")
        expect(classify(p, bare("useCartApi", { file: "composables/useCartApi.ts", imports: ["ofetch"] }))).toBe("composables")
        expect(classify(p, bare("Badge", { file: "src/components/Badge.ts", supertypes: ["defineComponent"], imports: ["vue"] }))).toBe("components")
    })

    it("reads every .vue under views/ as a page, routed or not", () => {
        // Vue Router projects put routed components in views/, and nothing
        // in a .vue file says whether the router names it. A views/ folder
        // holding unrouted partials reads as pages here; the fix would need
        // the router file, which no pack reads.
        const p = profileById("vue")
        expect(classify(p, bare("Sidebar", { file: "src/views/partials/Sidebar.vue", annotations: ["vue_component"] }))).toBe("pages")
        expect(classify(p, bare("Sidebar", { file: "src/features/shell/Sidebar.vue", annotations: ["vue_component"] }))).toBe("components")
    })
})

describe("the Express lanes", () => {
    it("puts handlers, middleware, services, the repository and the model where an Express developer expects", async () => {
        const lane = await lanesOf(EXP, "express")
        // Handlers are plain functions named for what they do; the request
        // and response types they take from express say what they are.
        expect(lane("src/controllers/users.controller#listUsers")).toBe("routes")
        expect(lane("src/controllers/users.controller#createUser")).toBe("routes")
        // Middleware takes the same types; its folder and its name decide first.
        expect(lane("src/middleware/auth#requireAuth")).toBe("middleware")
        expect(lane("src/middleware/error#errorHandler")).toBe("middleware")
        expect(lane("src/services/users.service#findAllUsers")).toBe("services")
        expect(lane("src/services/users.service#createOne")).toBe("services")
        expect(lane("src/repositories/user.repository#UserRepository")).toBe("data")
        expect(lane("src/models/user#User")).toBe("models")
    })

    it("reads CommonJS handlers by their folder, since a require of express leaves no trace in the handler", () => {
        const p = profileById("express")
        expect(classify(p, bare("listUsers", { file: "api/server/controllers/users.js", imports: ["../services/users"] }))).toBe("routes")
        expect(classify(p, bare("requireAuth", { file: "api/server/middleware/auth.js" }))).toBe("middleware")
        expect(classify(p, bare("findAllUsers", { file: "api/server/services/users.js", imports: ["../models/User"] }))).toBe("services")
        expect(classify(p, bare("UserRepository", { file: "api/server/db/users.js", imports: ["mongoose"] }))).toBe("data")
        expect(classify(p, bare("slugify", { file: "api/server/utils/text.js" }))).toBe(UNCLASSIFIED)
    })

    it("has no unit for a Router() or an inline handler, so a routes file is read as nothing", async () => {
        // `export const usersRouter = Router()` and `router.get('/', async
        // (req, res) => …)` declare no name: the file is its module unit,
        // which the roles leave out. The routes lane holds the named
        // handlers the router points at, not the router.
        const all = await facts(EXP)
        expect(all.has("src/routes/users#usersRouter")).toBe(false)
        const out = await runReading("roles", { profile: "express" }, snapshot(EXP).ctx)
        expect(out.values).toMatchObject({ declared: 8, "Routes & Handlers": 2, Middleware: 2, Services: 2, "Data access": 1, Schemas: 1 })
    })
})

describe("the layer order", () => {
    it("runs each framework from its entry points down to its shapes, with the cross-cutting roles beside it", () => {
        expect(layersOf(profileById("nestjs"))).toEqual(["controllers", "providers", "data", "models"])
        expect(layersOf(profileById("angular"))).toEqual(["components", "services", "data", "models"])
        expect(layersOf(profileById("react"))).toEqual(["pages", "components", "hooks", "data", "models"])
        // Pages compose components, components call composables, composables
        // read stores, stores call the client, and everything is typed by
        // the models. Components reaching for a store directly, and pages for
        // a composable, are everyday Vue and read as a skipped layer, not a
        // violation; the client reading a store is the one that runs back up.
        expect(layersOf(profileById("vue"))).toEqual(["pages", "components", "composables", "stores", "data", "models"])
        expect(layersOf(profileById("express"))).toEqual(["routes", "services", "data", "models"])
    })

    it("counts the NestJS app's references down its order, and the entity reaching into the service as back up", async () => {
        const out = await runReading("layers", { profile: "nestjs" }, snapshot(NEST).ctx)
        // Down: controller -> service, service -> repository, repository ->
        // entity, and the controller binding its DTO and the service using
        // the DTO and the entity (reaching the bottom layer is expected).
        // Skipped: the audit controller injecting the repository. The
        // module's wiring and the controller's guard and pipe are beside the
        // layers and not counted.
        expect(out.values).toEqual({ "one step down": 6, "skip a layer": 1, "back up": 1 })
        expect(out.text).toContain("controllers → providers → repositories and clients → DTOs and entities")
        expect(out.text).toContain("Most go from DTOs and entities into providers")
    })

    it("counts the Angular app's references down its order, and the API class reaching into the service as back up", async () => {
        const out = await runReading("layers", { profile: "angular" }, snapshot(NG).ctx)
        // Down: component -> service, service -> api, and api, component and
        // service -> model. The guard and the directive and pipe sit beside
        // the layers.
        expect(out.values).toEqual({ "one step down": 5, "skip a layer": 0, "back up": 1 })
        expect(out.text).toContain("Most go from data access into services")
    })

    it("counts the Next.js app's references down its order, and the hook reaching into a component as back up", async () => {
        const out = await runReading("layers", { profile: "react" }, snapshot(NEXT).ctx)
        // Down: page -> component (twice), hook -> client, and the client,
        // every component and the hook using the types. Skipped: page ->
        // hook. Component -> component is one lane and not counted.
        expect(out.values).toEqual({ "one step down": 7, "skip a layer": 1, "back up": 1 })
        expect(out.text).toContain("pages and layouts → components → hooks → data and clients → types and models")
        expect(out.text).toContain("Most go from hooks into components")
    })

    it("counts the Nuxt app's references down its order, and the client reading a store as back up", async () => {
        const out = await runReading("layers", { profile: "vue" }, snapshot(NUXT).ctx)
        // Down: page -> component, composable -> store, store -> client, and
        // client, component and store -> types. Skipped: page -> composable.
        // The props interface and pick() roll up to their
        // component, so CartPanel -> CartItem is one edge; CartLine's use of
        // a utility is unclassified and not counted.
        expect(out.values).toEqual({ "one step down": 6, "skip a layer": 1, "back up": 1 })
        expect(out.text).toContain("Most go from data and clients into stores")
    })

    it("counts the Express app's references down its order, and the repository reaching into a handler as back up", async () => {
        const out = await runReading("layers", { profile: "express" }, snapshot(EXP).ctx)
        // Down: two handlers -> services, and the repository and both
        // services -> model. The service module's `new UserRepository()`
        // at top level is the module's use, and modules are not read, so
        // services -> data is not counted at all.
        expect(out.values).toEqual({ "one step down": 5, "skip a layer": 0, "back up": 1 })
        expect(out.text).toContain("Most go from data access into routes and handlers")
    })

    it("leaves the spec file out of the roles", async () => {
        expect(isTestPath("src/users/users.service.spec.ts")).toBe(true)
        const out = await runReading("roles", { profile: "nestjs" }, snapshot(NEST).ctx)
        // Ten top-level units outside the spec; every one fits a role.
        expect(out.values).toMatchObject({ declared: 10, Controllers: 2, Providers: 1, "Repositories & Clients": 1, "DTOs & Entities": 3, "Guards, Pipes & Filters": 2, Modules: 1, unclassified: 0 })
    })
})

describe("the profiles' own shape", () => {
    it("keeps the lanes the layer orders name", () => {
        for (const [p, ids] of [[NESTJS, ["controllers", "providers", "data", "models"]], [ANGULAR, ["components", "services", "data", "models"]], [REACT, ["pages", "components", "hooks", "data", "models"]], [VUE, ["pages", "components", "composables", "stores", "data", "models"]], [EXPRESS, ["routes", "services", "data", "models"]]] as const) {
            for (const id of ids) expect(p.lanes.map(l => l.id), p.id).toContain(id)
        }
    })
})
