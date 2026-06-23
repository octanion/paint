export const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",

    sand: "\x1b[38;2;214;190;140m",
    ochre: "\x1b[38;2;176;126;44m",
    gold: "\x1b[38;2;196;158;84m",
    brown: "\x1b[38;2;98;67;44m",
    clay: "\x1b[38;2;140;98;70m",
    teal: "\x1b[38;2;86;129;124m",
    red: "\x1b[38;2;170;82;66m",
    green: "\x1b[38;2;118;146;92m",
    line: "\x1b[38;2;120;92;64m",
    soft: "\x1b[38;2;160;140;118m",
};

export const paint = (style, text) => `${style}${text}${C.reset}`;

function termWidth() {
    return Math.max(72, Math.min(process.stdout.columns || 80, 120));
}

function innerWidth() {
    return termWidth() - 4;
}

function pad(text, width = innerWidth()) {
    return String(text).padEnd(width, " ");
}

function rule(char = "═", width = termWidth()) {
    return char.repeat(width);
}

export function clear() {
    console.clear();
}

export function printHeader(title = "ARTONE", subtitle = "FRESCO CLI") {
    const width = termWidth();
    const inside = width - 4;
    const text = `${title} · ${subtitle}`;

    console.clear();
    console.log("");
    console.log(paint(C.ochre, `╔${"═".repeat(width - 2)}╗`));
    console.log(
        paint(C.ochre, "║ ") +
        paint(C.bold + C.sand, pad(text, inside)) +
        paint(C.ochre, " ║")
    );
    console.log(paint(C.ochre, `╚${"═".repeat(width - 2)}╝`));
    console.log("");
}

export function printLine() {
    console.log(paint(C.line, rule("═")));
}

export function printInfo(text = "") {
    console.log(paint(C.soft, text));
}

export function printSuccess(text = "") {
    console.log(paint(C.green, text));
}

export function printError(text = "") {
    console.log(paint(C.red, text));
}

export function printMuted(text = "") {
    console.log(paint(C.dim + C.soft, text));
}

export function printSection(title = "") {
    printLine();
    console.log(paint(C.gold + C.bold, title));
    printLine();
}

export function printKV(label, value, color = C.soft) {
    console.log(
        paint(C.clay, `${label}: `) +
        paint(color, String(value))
    );
}

export function wrapText(text, width = innerWidth() - 12) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = "";

    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > width) {
            if (current) lines.push(current);
            current = word;
        } else {
            current = next;
        }
    }

    if (current) lines.push(current);
    return lines;
}

export function printCard({
    key = "",
    title = "",
    file = "",
    description = "",
    status = "",
    statusColor = C.soft,
}) {
    const width = termWidth();
    const inside = width - 4;
    const descLines = wrapText(description, inside - 11);

    console.log(paint(C.line, `┌${"─".repeat(width - 2)}┐`));

    const headLeft = key ? `[${key}] ${title}` : title;
    console.log(
        paint(C.line, "│ ") +
        paint(C.teal, pad(headLeft, inside)) +
        paint(C.line, " ║").replace("║", "│")
    );

    if (file) {
        console.log(
            paint(C.line, "│ ") +
            paint(C.clay, "Файл: ") +
            paint(C.soft, pad(file, inside - 6)) +
            paint(C.line, " │")
        );
    }

    if (description) {
        descLines.forEach((line, index) => {
            const prefix = index === 0 ? "Описание: " : "          ";
            console.log(
                paint(C.line, "│ ") +
                paint(C.gold, prefix) +
                paint(C.soft, pad(line, inside - prefix.length)) +
                paint(C.line, " │")
            );
        });
    }

    if (status) {
        console.log(
            paint(C.line, "│ ") +
            paint(C.clay, "Статус: ") +
            paint(statusColor, pad(status, inside - 8)) +
            paint(C.line, " │")
        );
    }

    console.log(paint(C.line, `└${"─".repeat(width - 2)}┘`));
    console.log("");
}

export function printMenuHint(text = "1, 2, 3 — запуск раздела    0 — выход") {
    printLine();
    console.log(paint(C.teal, text));
    printLine();
    console.log("");
}
