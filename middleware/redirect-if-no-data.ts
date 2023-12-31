import {useDataStore} from "~/stores/data";
const store = useDataStore();
export default defineNuxtRouteMiddleware((to, from) => {


    if (!store.hasData && to.path !== '/load-data') {
        return navigateTo('/load-data')
    }
})