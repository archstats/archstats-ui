import { describe, expect, it } from "vitest"
import { fuzzyRank, fuzzyScore } from "./fuzzy"

describe("fuzzy", () => {
    it("matches a subsequence and refuses what is out of order", () => {
        expect(fuzzyScore("ordsvcimpl", "core/src/main/java/org/broadleafcommerce/core/order/service/OrderServiceImpl.java")).not.toBeNull()
        expect(fuzzyScore("lpmi", "OrderServiceImpl.java")).toBeNull()
    })
    it("ranks the remembered name above paths that merely contain the letters", () => {
        const items = [
            "core/order/service/call/OrderItemRequestDTO.java",
            "core/order/service/OrderServiceImpl.java",
            "core/order/strategy/FulfillmentGroupItemStrategyImpl.java",
            "profile/core/service/impl/OrderedStatusImpl.java",
            "common/src/main/java/org/broadleafcommerce/common/cache/StatisticsServiceImpl.java",
            "admin/broadleaf-open-admin-platform/src/main/java/org/broadleafcommerce/openadmin/security/ClassNameRequestParamValidationServiceImpl.java",
            "core/broadleaf-framework/src/main/java/org/broadleafcommerce/core/order/service/OrderServiceImpl.java",
        ]
        const top = fuzzyRank("ordsvcimpl", items, x => x).slice(0, 2).map(r => r.item)
        expect(top).toEqual(expect.arrayContaining(["core/order/service/OrderServiceImpl.java", "core/broadleaf-framework/src/main/java/org/broadleafcommerce/core/order/service/OrderServiceImpl.java"]))
    })
    it("prefers the whole word to letters picked out of a longer text", () => {
        const items = ["Short Cycle Count app__short_cycle_count", "Cycles tangles", "Static Complexity Score"]
        expect(fuzzyRank("cycles", items, x => x, 50, () => -1)[0].item).toBe("Cycles tangles")
        const props = ["stopPropagation", "Propagation cost app__propagation_cost", "SystemPropertyServiceExtensionManager.java"]
        expect(fuzzyRank("propag", props, x => x, 50, () => -1)[0].item).toBe("Propagation cost app__propagation_cost")
    })
    it("keeps letters picked from the middle of words below a word that holds them", () => {
        const items = ["runInternalDataHandlers", "HTMLRender", "runGenericHandlers"]
        expect(fuzzyRank("render", items, x => x)[0].item).toBe("HTMLRender")
        expect(fuzzyScore("render", "runInternalDataHandlers")!).toBeLessThan(fuzzyScore("ordsvcimpl", "OrderServiceImpl.java")! / 2)
    })
    it("finds a file by the words of its name", () => {
        const items = [
            "common/src/main/java/org/broadleafcommerce/common/email/service/LoggingMailSender.java",
            "core/src/main/java/org/broadleafcommerce/core/offer/service/OfferService.java",
            "common/src/main/java/org/broadleafcommerce/common/persistence/transaction/LifecycleAwareJDBCServices.java",
        ]
        expect(fuzzyRank("offerservice", items, x => x)[0].item).toBe("core/src/main/java/org/broadleafcommerce/core/offer/service/OfferService.java")
    })
})
