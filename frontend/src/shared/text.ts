
export function round<T>(value: T, decimals: number) : T{
    if (typeof value === 'number') {
        return Number(value.toFixed(decimals)) as unknown as T
    }else{
        return value
    }
}

export function truncate(text, length, clamp = '...') {
    if (text.length > length) {
        return text.substring(0, length) + clamp;
    } else {
        return text;
    }
}

export function findCommonPrefix(strings: string[]): string {

    if (strings.length === 1) {
        return strings[0]; // Return the single string if there is only one.
    }

    if (!strings.length) {
        return ""; // Return an empty string if the list is empty.
    }

    // Start with the first string as the initial prefix candidate.
    let prefix: string = strings[0];

    // Iterate through the remaining strings to find the common prefix.
    for (let i = 1; i < strings.length; i++) {
        const currentString: string = strings[i];
        let j: number = 0;

        // Compare characters until a mismatch is found or we reach the end of the shortest string.
        while (j < prefix.length && j < currentString.length && prefix[j] === currentString[j]) {
            j++;
        }

        // Update the prefix based on the common characters.
        prefix = prefix.slice(0, j);
    }

    return prefix;
}
