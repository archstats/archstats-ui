export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.directive('click-outside',
        {
            mounted(el, binding) {
                const onClickOutside = (e: Event) => {

                    if (!el.contains(e.target) && el !== e.target) {
                        if (binding.value) {
                            binding.value();
                        }
                    }
                };

                const escapeKeyListener = (e) => {
                    if (e.key === "Escape") {
                        binding.value();
                    }
                };

                document.addEventListener("mousedown", onClickOutside);
                document.addEventListener("keydown", escapeKeyListener);

                el._clickOutside = onClickOutside;
                el._escapeKeyListener = escapeKeyListener;
            },
            unmounted(el) {
                document.removeEventListener("mousedown", el._clickOutside);
                document.removeEventListener("keydown", el._escapeKeyListener);
            },
        })
})
