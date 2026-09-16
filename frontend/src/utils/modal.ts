
import { InjectionKey } from 'vue';

export const closeModalKey = Symbol() as InjectionKey<() => void>;

export default function useCloseModal() {
    return inject(closeModalKey)!;
}