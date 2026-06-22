import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_FILE_MAP = {
  "грунт глубокого проникновения": "ggp.js",
  ггп: "ggp.js",
  "грунт-подложка": "grunt-podlozhka.js",
  "грунт подложка": "grunt-podlozhka.js",
  подложка: "grunt-podlozhka.js",
  "гладкие краски": "paint.js",
  краски: "paint.js",
  шелка: "silk.js",
  шелк: "silk.js",
  "декоративные штукатурки": "dekor-shtukaturki.js",
  штукатурки: "dekor-shtukaturki.js",
  "защитные лаки": "finish-laki.js",
  лаки: "finish-laki.js",
};

function normalizeCategoryName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function normalizeProductName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVariant(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/\s*(л|кг)\b/gi, "$1")
    .replace(/\bлак\b/gi, "лак")
    .trim();
}

function parsePrice(value) {
  const cleaned = String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "")
    .replace(",00", "")
    .replace(",", ".")
    .trim();

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseCoverageFromVariant(variant) {
  const v = normalizeVariant(variant);

  if (v.includes("0,25л")) return 10;
  if (v.includes("0,4кг") || v.includes("0,40кг")) return 3;
  if (v.includes("0,5л")) return 7.5;
  if (v.includes("1л") && v.includes("лак")) return 12;
  if (v.includes("1л") || v.includes("1кг")) return 12;
  if (v.includes("2,5л/2,5кг")) return 30;
  if (v.includes("2,5кг")) return 12;
  if (v.includes("3,3кг")) return 40;

  return 0;
}

function extractVariantAndName(rawLine) {
  const line = rawLine
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const priceMatch = line.match(/(\d[\d\s]*,\d{2})\s*$/);
  if (!priceMatch) return null;

  const priceRaw = priceMatch[1];
  let beforePrice = line.slice(0, priceMatch.index).trim();
  beforePrice = beforePrice.replace(/\s+1\s+шт\s*$/i, "").trim();

  let productName = beforePrice;
  let variant = "";

  const bracketMatch = beforePrice.match(/^(.*)\(([^)]+)\)\s*$/);
  if (bracketMatch) {
    productName = bracketMatch[1].trim();
    variant = bracketMatch[2].trim();
  } else {
    const variantPatterns = [
      /(.*?)(\d+,\d+л\/\d+,\d+кг\s*лак?)$/i,
      /(.*?)(\d+,\d+л\/\d+,\d+кг)$/i,
      /(.*?)(\d+,\d+кг\s*лак?)$/i,
      /(.*?)(\d+,\d+л\s*лак?)$/i,
      /(.*?)(\d+кг\s*лак?)$/i,
      /(.*?)(\d+л\s*лак?)$/i,
      /(.*?)(\d+,\d+кг)$/i,
      /(.*?)(\d+,\d+л)$/i,
      /(.*?)(\d+кг)$/i,
      /(.*?)(\d+л)$/i,
    ];

    for (const pattern of variantPatterns) {
      const match = beforePrice.match(pattern);
      if (match) {
        productName = match[1].trim();
        variant = match[2].trim();
        break;
      }
    }
  }

  productName = normalizeProductName(productName);
  variant = normalizeProductName(variant);

  return {
    productName,
    variant,
    price_rub: parsePrice(priceRaw),
    coverage_m2: parseCoverageFromVariant(variant),
    rawLine: line,
  };
}

function parseInput(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Пустой ввод.");
  }

  const firstLine = lines[0];
  const categoryMatch = firstLine.match(/^категория\s*:\s*(.+)$/i);

  if (!categoryMatch) {
    throw new Error("Первая строка должна быть в формате: категория: Название");
  }

  const categoryLabel = categoryMatch[1].trim();
  const categoryKey = normalizeCategoryName(categoryLabel);
  const fileName = CATEGORY_FILE_MAP[categoryKey];

  if (!fileName) {
    throw new Error(`Неизвестная категория: ${categoryLabel}`);
  }

  const items = [];

  for (const line of lines.slice(1)) {
    const parsed = extractVariantAndName(line);
    if (!parsed) continue;
    items.push(parsed);
  }

  return { categoryLabel, categoryKey, fileName, items };
}

function loadCategoryDb(filePath) {
  if (!fs.existsSync(filePath)) {
    return { Россия: {} };
  }

  const source = fs.readFileSync(filePath, "utf-8");
  const jsonLike = source
    .replace(/^\s*export\s+const\s+materialsDB\s*=\s*/m, "")
    .replace(/;\s*$/, "");

  return Function(`return (${jsonLike});`)();
}

function saveCategoryDb(filePath, db) {
  const content = `export const materialsDB = ${JSON.stringify(db, null, 2)};\n`;
  fs.writeFileSync(filePath, content, "utf-8");
}

function upsertItems(db, items) {
  if (!db.Россия) db.Россия = {};

  const stats = {
    addedProducts: 0,
    addedVariants: 0,
    updatedPrices: 0,
    unchanged: 0,
    logs: [],
  };

  for (const item of items) {
    const name = item.productName;
    if (!name || !item.variant || !item.price_rub) continue;

    if (!db.Россия[name]) {
      db.Россия[name] = [];
      stats.addedProducts += 1;
      stats.logs.push(`+ Новый продукт: ${name}`);
    }

    const existing = db.Россия[name].find(
      (v) => normalizeVariant(v.variant) === normalizeVariant(item.variant),
    );

    if (!existing) {
      db.Россия[name].push({
        variant: item.variant,
        coverage_m2: item.coverage_m2,
        price_rub: item.price_rub,
      });
      stats.addedVariants += 1;
      stats.logs.push(
        `+ Новый вариант: ${name} -> ${item.variant} = ${item.price_rub} ₽`,
      );
      continue;
    }

    let changed = false;

    if (Number(existing.price_rub) !== Number(item.price_rub)) {
      stats.logs.push(
        `~ Цена обновлена: ${name} -> ${item.variant}: ${existing.price_rub} ₽ -> ${item.price_rub} ₽`,
      );
      existing.price_rub = item.price_rub;
      stats.updatedPrices += 1;
      changed = true;
    }

    if (
      (!existing.coverage_m2 || Number(existing.coverage_m2) === 0) &&
      item.coverage_m2
    ) {
      existing.coverage_m2 = item.coverage_m2;
      if (!changed) {
        stats.logs.push(
          `~ Добавлено покрытие: ${name} -> ${item.variant}: ${item.coverage_m2} м²`,
        );
      }
      changed = true;
    }

    if (!changed) {
      stats.unchanged += 1;
      stats.logs.push(`= Без изменений: ${name} -> ${item.variant}`);
    }
  }

  return stats;
}

function rebuildMaterialsDb() {
  const categories = [
    ["ggp", "./ggp.js"],
    ["gruntPodlozhka", "./grunt-podlozhka.js"],
    ["paint", "./paint.js"],
    ["silk", "./silk.js"],
    ["dekorShtukaturki", "./dekor-shtukaturki.js"],
    ["finishLaki", "./finish-laki.js"],
  ];

  const imports = categories
    .map(([alias, rel]) => `import { materialsDB as ${alias} } from "${rel}";`)
    .join("\n");

  const mergeArgs = categories.map(([alias]) => alias).join(",\n  ");

  const content = `${imports}\n\nfunction mergeCountryData(...sources) {\n  const merged = {};\n\n  for (const source of sources) {\n    for (const [country, materials] of Object.entries(source)) {\n      if (!merged[country]) merged[country] = {};\n      Object.assign(merged[country], materials);\n    }\n  }\n\n  return merged;\n}\n\nexport const materialsDB = mergeCountryData(\n  ${mergeArgs},\n);\n`;

  fs.writeFileSync(path.join(__dirname, "materials-db.js"), content, "utf-8");
}

async function readFromStdin() {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  console.log("Вставь блок текста и заверши ввод:");
  console.log("- Linux/macOS: Ctrl+D");
  console.log("- Windows: Ctrl+Z, потом Enter");
  console.log("");

  const lines = [];

  for await (const line of rl) {
    lines.push(line);
  }

  rl.close();
  return lines.join("\n");
}

async function getInputText() {
  const inputPath = process.argv[2];

  if (inputPath) {
    const absoluteInputPath = path.resolve(process.cwd(), inputPath);

    if (!fs.existsSync(absoluteInputPath)) {
      throw new Error(`Файл не найден: ${absoluteInputPath}`);
    }

    return fs.readFileSync(absoluteInputPath, "utf-8");
  }

  return readFromStdin();
}

async function main() {
  try {
    const rawText = await getInputText();
    const { categoryLabel, fileName, items } = parseInput(rawText);
    const categoryFilePath = path.join(__dirname, fileName);

    const db = loadCategoryDb(categoryFilePath);
    const stats = upsertItems(db, items);
    saveCategoryDb(categoryFilePath, db);
    rebuildMaterialsDb();

    console.log(`\nКатегория: ${categoryLabel}`);
    console.log(`Файл: ${fileName}`);
    console.log(`Добавлено новых продуктов: ${stats.addedProducts}`);
    console.log(`Добавлено новых вариантов: ${stats.addedVariants}`);
    console.log(`Обновлено цен: ${stats.updatedPrices}`);
    console.log(`Без изменений: ${stats.unchanged}`);

    if (stats.logs.length) {
      console.log("\nЛог изменений:");
      stats.logs.forEach((line) => console.log(line));
    }

    console.log("\nГотово.");
  } catch (error) {
    console.error(`Ошибка: ${error.message}`);
    process.exit(1);
  }
}

main();
