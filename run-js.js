import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const C = {
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

const paint = (style, text) => `${style}${text}${C.reset}`;

const APPS = [
  {
    key: "1",
    file: "db-manager.js",
    title: "БАЗА ПРОДУКТОВ",
    description:
      "Управление категориями и товарами: создание, редактирование, удаление, импорт и обновление базы материалов.",
  },
  {
    key: "2",
    file: "mainmenu.js",
    title: "ПРИЛОЖЕНИЕ",
    description:
      "Запуск основного интерфейса приложения для работы с системами, расчетами и пользовательским сценарием.",
  },
  {
    key: "3",
    file: "made-colerovka.js",
    title: "БАЗА СИСТЕМ",
    description:
      "Админка систем колеровки: вопросы, слои, цвета, коэффициенты, типы колеровки и настройка логики системы.",
  },
];

function fileExists(fileName) {
  return fs.existsSync(path.join(__dirname, fileName));
}

function line(width = 72) {
  return paint(C.line, "═".repeat(width));
}

function wrapText(text, width = 58) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function padRight(text, width) {
  return text + " ".repeat(Math.max(0, width - text.length));
}

function printHeader() {
  console.clear();

  console.log("");
  console.log(
    paint(
      C.ochre,
      "╔════════════════════════════════════════════════════════════════════╗",
    ),
  );
  console.log(
    paint(C.ochre, "║ ") +
      paint(C.bold + C.sand, "ARTONE") +
      paint(C.ochre, " · ") +
      paint(C.teal, "FRESCO CLI") +
      paint(C.ochre, padRight(" ", 48 - "ARTONE · FRESCO CLI".length)) +
      paint(C.ochre, "║"),
  );
  console.log(
    paint(C.ochre, "║ ") +
      paint(
        C.dim + C.soft,
        "Тёплый запуск модулей в палитре старой мастерской",
      ) +
      paint(
        C.ochre,
        padRight(
          " ",
          58 - "Тёплый запуск модулей в палитре старой мастерской".length,
        ),
      ) +
      paint(C.ochre, "║"),
  );
  console.log(
    paint(
      C.ochre,
      "╚════════════════════════════════════════════════════════════════════╝",
    ),
  );
  console.log("");
}

function printCard(app) {
  const exists = fileExists(app.file);
  const statusText = exists ? "доступно" : "файл не найден";
  const statusColor = exists ? C.green : C.red;
  const descLines = wrapText(app.description, 54);

  console.log(
    paint(
      C.line,
      "┌────────────────────────────────────────────────────────────────────┐",
    ),
  );
  console.log(
    paint(C.line, "│ ") +
      paint(C.teal, `[${app.key}]`) +
      " " +
      paint(C.bold + C.sand, padRight(app.title, 52)) +
      paint(C.line, " │"),
  );
  console.log(
    paint(C.line, "│ ") +
      paint(C.clay, "Файл: ") +
      paint(C.soft, padRight(app.file, 54)) +
      paint(C.line, " │"),
  );

  for (const row of descLines) {
    console.log(
      paint(C.line, "│ ") +
        paint(C.gold, "Описание: ") +
        paint(C.soft, padRight(row, 49)) +
        paint(C.line, " │"),
    );
  }

  console.log(
    paint(C.line, "│ ") +
      paint(C.clay, "Статус: ") +
      paint(statusColor, padRight(statusText, 52)) +
      paint(C.line, " │"),
  );
  console.log(
    paint(
      C.line,
      "└────────────────────────────────────────────────────────────────────┘",
    ),
  );
  console.log("");
}

function printMenu() {
  printHeader();

  console.log(paint(C.gold, "Доступные разделы:\n"));

  APPS.forEach(printCard);

  console.log(paint(C.ochre, line(72)));
  console.log(
    paint(C.teal, " 1, 2, 3 ") +
      paint(C.soft, "— запуск раздела    ") +
      paint(C.red, " 0 ") +
      paint(C.soft, "— выход"),
  );
  console.log(paint(C.ochre, line(72)));
  console.log("");
}

function getAppByChoice(choice) {
  return APPS.find((app) => app.key === choice) || null;
}

function runApp(app) {
  return new Promise((resolve) => {
    const child = spawn("node", [app.file], {
      cwd: __dirname,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      resolve(code ?? 0);
    });
  });
}

async function main() {
  while (true) {
    printMenu();

    const choice = (
      await ask(paint(C.bold + C.sand, "ARTONE → Выбор: "))
    ).trim();

    if (choice === "0") {
      console.log(paint(C.clay, "\nВыход из ARTONE.\n"));
      break;
    }

    const app = getAppByChoice(choice);

    if (!app) {
      console.log(paint(C.red, "\nНеверный пункт меню.\n"));
      continue;
    }

    if (!fileExists(app.file)) {
      console.log(paint(C.red, `\nФайл не найден: ${app.file}\n`));
      continue;
    }

    console.log(paint(C.teal, `\nЗапуск: ${app.title}\n`));

    rl.pause();
    await runApp(app);
    rl.resume();

    await ask(
      paint(C.dim + C.soft, "\nНажми Enter, чтобы вернуться в ARTONE... "),
    );
  }

  rl.close();
}

main().catch((error) => {
  console.error(paint(C.red, `Ошибка: ${error.message}`));
  rl.close();
  process.exit(1);
});
