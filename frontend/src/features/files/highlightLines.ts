// highlight.js returns one HTML string for the whole file, and a block
// comment or a text block runs over many lines inside one span. Cut at the
// newlines as they are, the lines after the first lost their colour (the
// span opened on the line above) and carried a stray closing tag. Each line
// here closes what is still open at its end and opens it again at the start
// of the next, so every line is whole HTML on its own.

const TAG = /<\/?span[^>]*>/g

/** The highlighted file, one balanced HTML string per line. */
export function splitHighlighted(html: string): string[] {
    const lines: string[] = []
    const open: string[] = []
    let line = ""
    let at = 0
    const text = (chunk: string) => {
        const parts = chunk.split("\n")
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                lines.push(line + "</span>".repeat(open.length))
                line = open.join("")
            }
            line += parts[i]
        }
    }
    for (const m of html.matchAll(TAG)) {
        text(html.slice(at, m.index))
        if (m[0].startsWith("</")) open.pop()
        else open.push(m[0])
        line += m[0]
        at = m.index! + m[0].length
    }
    text(html.slice(at))
    lines.push(line + "</span>".repeat(open.length))
    return lines
}
