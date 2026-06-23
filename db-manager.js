import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { materialsCategories } from "./materials-db.js";
import {
  C,
  printHeader,
  printInfo,
  printSuccess,
  printError,
  printLine,
  printSection,
  printKV,
  printCard,
  printMenuHint,
} from "./artone-ui.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COUNTRY_MAP = {
  russia: "Россия",
  italy: "Италия",
};

const COUNTRY_LABELS = Object.values(COUNTRY_MAP);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupLine(line) {
  return String(line || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-zа-я0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

function normalizeFileBaseName(value) {
  return String(value || "")
    .trim()
    .replace(/\.js$/i, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
}

function toImportVarName(fileName) {
  const base = fileName.replace(/^\.\//, "").replace(/\.js$/i, "");
  return base
    .split(/[^a-zA-Z0-9а-яА-ЯёЁ]+/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

function detectCountryLabel(rawText) {
  const text = normalizeText(rawText);
  if (
    text.includes("италия") ||
    text.includes("italia") ||
    text.includes("italy")
  ) {
    return "Италия";
  }
  return "Россия";
}

function detectCategoryHeader(lines) {
  if (!lines.length) return null;
  const first = normalizeText(lines[0]);
  const match = first.match(/^категория\s*:\s*(.+)$/i);
  if (!match) return null;

  const categoryName = normalizeText(match[1]);
  return (
    materialsCategories.find((category) => {
      const variants = [
        category.id,
        category.name,
        ...(category.aliases || []),
      ].map(normalizeText);
      return variants.includes(categoryName);
    }) || null
  );
}

function parseNumber(value) {
  if (value == null) return null;
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseInteger(value) {
  const num = parseNumber(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function formatPriceRub(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
}

function splitRawTextToCandidateLines(rawText) {
  const prepared = String(rawText || "")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ");

  const lines = prepared.split("\n").map(cleanupLine).filter(Boolean);

  if (!lines.length) return [];

  const candidates = [];
  let startIndex = 0;

  if (/^категория\s*:/i.test(lines[0])) {
    candidates.push(lines[0]);
    startIndex = 1;
  }

  const rest = lines.slice(startIndex).join(" ");
  if (!rest) return candidates;

  const priceRegex = /\d[\d\s]*,\d{2}/g;
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = priceRegex.exec(rest)) !== null) {
    const end = match.index + match[0].length;
    const segment = cleanupLine(rest.slice(lastIndex, end));
    if (segment) segments.push(segment);
    lastIndex = end;
  }

  if (segments.length) {
    candidates.push(...segments);
  } else {
    candidates.push(...lines.slice(startIndex));
  }

  return candidates;
}

function extractVariantFromName(rawName) {
  let name = cleanupLine(rawName);
  let variant = "";

  const bracketMatch = name.match(/\(([^()]+)\)\s*$/);
  if (bracketMatch) {
    variant = cleanupLine(bracketMatch[1]);
    name = cleanupLine(name.slice(0, bracketMatch.index));
    return { name, variant };
  }

  const tailVariantMatch = name.match(
    /^(.*?)(\d+(?:[.,]\d+)?\s*(?:кг|г|гр|л|мл)(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:кг|г|гр|л|мл))?(?:\s+[A-Za-zА-Яа-яЁё0-9-]+)?)$/i,
  );

  if (tailVariantMatch) {
    const possibleName = cleanupLine(tailVariantMatch[1]);
    const possibleVariant = cleanupLine(tailVariantMatch[2]);

    if (possibleName && possibleVariant) {
      name = possibleName;
      variant = possibleVariant;
    }
  }

  return { name, variant };
}

function parseLineToRecord(line) {
  const cleaned = cleanupLine(line);
  if (!cleaned) return null;
  if (/^категория\s*:/i.test(cleaned)) return null;

  const priceMatch = cleaned.match(/(\d[\d\s]*,\d{2})\s*$/);
  if (!priceMatch) return null;

  const price_rub = formatPriceRub(parseNumber(priceMatch[1]));
  let left = cleanupLine(cleaned.slice(0, priceMatch.index));

  left = cleanupLine(left.replace(/\b\d+\s*шт\b/gi, ""));
  left = cleanupLine(left.replace(/\b\d+\s*piece\b/gi, ""));
  left = cleanupLine(left.replace(/\b\d+\s*pcs\b/gi, ""));

  if (!left) return null;

  const { name, variant } = extractVariantFromName(left);
  if (!name) return null;

  return {
    name,
    variant,
    coverage_m2: null,
    price_rub,
  };
}

function extractRecords(rawText) {
  const candidates = splitRawTextToCandidateLines(rawText);
  if (!candidates.length) return [];

  const records = [];
  for (const line of candidates) {
    const record = parseLineToRecord(line);
    if (record) records.push(record);
  }

  return records;
}

function getCategoryAbsolutePath(category) {
  return path.resolve(__dirname, category.file);
}

function readCategoryData(category) {
  const filePath = getCategoryAbsolutePath(category);
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(
    /export\s+const\s+materialsDB\s*=\s*(\{[\s\S]*\});?\s*$/,
  );
  if (!match) {
    throw new Error(`Не удалось прочитать materialsDB из ${category.file}`);
  }
  return Function(`"use strict"; return (${match[1]});`)();
}

function writeCategoryData(category, data) {
  const filePath = getCategoryAbsolutePath(category);
  const content = `export const materialsDB = ${JSON.stringify(data, null, 4)};\n`;
  fs.writeFileSync(filePath, content, "utf8");
}

function ensureCountryBuckets(data) {
  for (const country of COUNTRY_LABELS) {
    if (!data[country] || typeof data[country] !== "object") {
      data[country] = {};
    }
  }
  return data;
}

function normalizeVariantRecord(item) {
  return {
    variant: cleanupLine(item?.variant || ""),
    coverage_m2:
      item?.coverage_m2 == null ? null : parseNumber(item.coverage_m2),
    price_rub: formatPriceRub(item?.price_rub),
  };
}

function findProductInCategoryData(categoryData, productName) {
  const normalizedTarget = normalizeText(productName);

  for (const country of COUNTRY_LABELS) {
    const materials = categoryData[country] || {};
    for (const [existingName, variants] of Object.entries(materials)) {
      if (normalizeText(existingName) === normalizedTarget) {
        return { country, name: existingName, variants };
      }
    }
  }

  return null;
}

function findProductAcrossCategories(productName) {
  const normalizedTarget = normalizeText(productName);

  for (const category of materialsCategories) {
    const data = ensureCountryBuckets(readCategoryData(category));
    for (const country of COUNTRY_LABELS) {
      for (const [existingName, variants] of Object.entries(
        data[country] || {},
      )) {
        if (normalizeText(existingName) === normalizedTarget) {
          return {
            category,
            country,
            name: existingName,
            variants,
          };
        }
      }
    }
  }

  return null;
}

function upsertVariant(variants, variant, coverage_m2, price_rub) {
  const normalizedVariant = cleanupLine(variant || "");
  const index = variants.findIndex(
    (item) => cleanupLine(item?.variant || "") === normalizedVariant,
  );

  const nextValue = normalizeVariantRecord({
    variant: normalizedVariant,
    coverage_m2,
    price_rub,
  });

  if (index >= 0) {
    variants[index] = {
      ...variants[index],
      ...nextValue,
    };
    return "updated";
  }

  variants.push(nextValue);
  return "created";
}

function createEmptyCategoryFile(category) {
  const filePath = getCategoryAbsolutePath(category);
  const initialData = {
    Россия: {},
    Италия: {},
  };
  fs.writeFileSync(
    filePath,
    `export const materialsDB = ${JSON.stringify(initialData, null, 4)};\n`,
    "utf8",
  );
}

function rebuildMaterialsDbFile() {
  const imports = materialsCategories
    .map(
      (category) =>
        `import { materialsDB as ${category.importName} } from "${category.file}";`,
    )
    .join("\n");

  const categoriesLiteral = JSON.stringify(materialsCategories, null, 2);
  const mergedArgs = materialsCategories
    .map((item) => item.importName)
    .join(",\n  ");

  const content = `${imports}

export const materialsCategories = ${categoriesLiteral};

function mergeCountryData(...sources) {
  const merged = {};

  for (const source of sources) {
    for (const [country, materials] of Object.entries(source)) {
      if (!merged[country]) merged[country] = {};
      Object.assign(merged[country], materials);
    }
  }

  return merged;
}

export const materialsDB = mergeCountryData(
  ${mergedArgs},
);
`;

  fs.writeFileSync(
    path.resolve(__dirname, "./materials-db.js"),
    content,
    "utf8",
  );
}

function updateCategoryRegistry(nextCategories) {
  const uniqueIds = new Set();
  for (const item of nextCategories) {
    if (uniqueIds.has(item.id)) {
      throw new Error(`Дублирующийся id категории: ${item.id}`);
    }
    uniqueIds.add(item.id);
  }

  materialsCategories.length = 0;
  materialsCategories.push(...nextCategories);
  rebuildMaterialsDbFile();
}

function askCategoryForNewBlock(newItems, options = {}) {
  if (options.categoryId) {
    const category = materialsCategories.find(
      (item) => item.id === options.categoryId,
    );
    if (!category) {
      throw new Error(`Категория "${options.categoryId}" не найдена`);
    }
    return category;
  }

  const names = newItems.map((item) => item.name).join(", ");
  throw new Error(
    `Есть новые товары без категории: ${names}. Передай options.categoryId для всего блока.`,
  );
}

function findCategoryById(categoryId) {
  return materialsCategories.find((item) => item.id === categoryId) || null;
}

function getAllProducts() {
  const rows = [];

  for (const category of materialsCategories) {
    const data = ensureCountryBuckets(readCategoryData(category));
    for (const country of COUNTRY_LABELS) {
      for (const [name, variants] of Object.entries(data[country] || {})) {
        rows.push({
          categoryId: category.id,
          categoryName: category.name,
          country,
          name,
          variants: Array.isArray(variants) ? variants : [],
        });
      }
    }
  }

  return rows.sort((a, b) => {
    const s1 = `${a.categoryName} ${a.country} ${a.name}`;
    const s2 = `${b.categoryName} ${b.country} ${b.name}`;
    return s1.localeCompare(s2, "ru");
  });
}

export class MaterialsDBManager {
  getCategories() {
    return materialsCategories.map((item) => ({ ...item }));
  }

  getProducts(categoryId = null) {
    const rows = getAllProducts();
    if (!categoryId) return rows;
    return rows.filter((item) => item.categoryId === categoryId);
  }

  createCategory({ name, aliases = [], fileName, id }) {
    if (!name) throw new Error("name обязателен");

    const fileBaseName = normalizeFileBaseName(fileName || id || slugify(name));
    if (!fileBaseName) {
      throw new Error("Некорректное имя файла категории");
    }

    const categoryId = id || slugify(name) || fileBaseName;
    if (materialsCategories.some((item) => item.id === categoryId)) {
      throw new Error(`Категория "${categoryId}" уже существует`);
    }

    const normalizedFileName = `./${fileBaseName}.js`;
    if (
      materialsCategories.some(
        (item) =>
          String(item.file).toLowerCase() === normalizedFileName.toLowerCase(),
      )
    ) {
      throw new Error(`Файл категории "${normalizedFileName}" уже существует`);
    }

    const importName = toImportVarName(normalizedFileName);
    const category = {
      id: categoryId,
      name,
      aliases,
      file: normalizedFileName,
      importName,
    };

    createEmptyCategoryFile(category);
    updateCategoryRegistry([...materialsCategories, category]);

    return category;
  }

  editCategory(categoryId, updates = {}) {
    const index = materialsCategories.findIndex(
      (item) => item.id === categoryId,
    );
    if (index < 0) throw new Error(`Категория "${categoryId}" не найдена`);

    const current = materialsCategories[index];
    const next = {
      ...current,
      ...updates,
    };

    if (updates.file && updates.file !== current.file) {
      const fileBaseName = normalizeFileBaseName(updates.file);
      if (!fileBaseName) {
        throw new Error("Некорректное новое имя файла");
      }

      const targetFile = `./${fileBaseName}.js`;
      const fileAlreadyUsed = materialsCategories.some(
        (item, itemIndex) =>
          itemIndex !== index &&
          String(item.file).toLowerCase() === targetFile.toLowerCase(),
      );

      if (fileAlreadyUsed) {
        throw new Error(
          `Файл "${targetFile}" уже используется другой категорией`,
        );
      }

      const oldPath = getCategoryAbsolutePath(current);
      const newPath = path.resolve(__dirname, targetFile);
      fs.renameSync(oldPath, newPath);
      next.file = targetFile;
      next.importName = updates.importName || toImportVarName(targetFile);
    }

    const nextCategories = [...materialsCategories];
    nextCategories[index] = next;
    updateCategoryRegistry(nextCategories);

    return next;
  }

  deleteCategory(categoryId, { deleteFile = true } = {}) {
    const category = materialsCategories.find((item) => item.id === categoryId);
    if (!category) throw new Error(`Категория "${categoryId}" не найдена`);

    const nextCategories = materialsCategories.filter(
      (item) => item.id !== categoryId,
    );

    if (deleteFile) {
      const filePath = getCategoryAbsolutePath(category);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    updateCategoryRegistry(nextCategories);
    return true;
  }

  createProduct(categoryId, product) {
    const category = findCategoryById(categoryId);
    if (!category) throw new Error(`Категория "${categoryId}" не найдена`);

    const {
      name,
      variant,
      coverage_m2 = null,
      price_rub,
      country = "Россия",
    } = product;

    if (!name || price_rub == null) {
      throw new Error("name и price_rub обязательны");
    }

    const data = ensureCountryBuckets(readCategoryData(category));

    if (!data[country][name]) {
      data[country][name] = [];
    }

    upsertVariant(data[country][name], variant || "", coverage_m2, price_rub);
    writeCategoryData(category, data);

    return true;
  }

  editProduct(categoryId, productName, updater) {
    const category = findCategoryById(categoryId);
    if (!category) throw new Error(`Категория "${categoryId}" не найдена`);

    const data = ensureCountryBuckets(readCategoryData(category));
    const found = findProductInCategoryData(data, productName);
    if (!found) {
      throw new Error(
        `Продукт "${productName}" не найден в категории "${categoryId}"`,
      );
    }

    const nextName = updater.name || found.name;
    const nextCountry = updater.country || found.country;
    const nextVariants = (updater.variants || found.variants).map(
      normalizeVariantRecord,
    );

    if (!data[nextCountry]) data[nextCountry] = {};
    delete data[found.country][found.name];
    data[nextCountry][nextName] = nextVariants;
    writeCategoryData(category, data);

    return true;
  }

  deleteProduct(categoryId, productName, country = null) {
    const category = findCategoryById(categoryId);
    if (!category) throw new Error(`Категория "${categoryId}" не найдена`);

    const data = ensureCountryBuckets(readCategoryData(category));

    if (country) {
      const found = Object.keys(data[country] || {}).find(
        (name) => normalizeText(name) === normalizeText(productName),
      );
      if (found) {
        delete data[country][found];
        writeCategoryData(category, data);
        return true;
      }
      return false;
    }

    let removed = false;
    for (const key of COUNTRY_LABELS) {
      for (const name of Object.keys(data[key] || {})) {
        if (normalizeText(name) === normalizeText(productName)) {
          delete data[key][name];
          removed = true;
        }
      }
    }

    if (removed) {
      writeCategoryData(category, data);
    }

    return removed;
  }

  importFromText(rawText, options = {}) {
    const candidates = splitRawTextToCandidateLines(rawText);
    if (!candidates.length) {
      return { updated: [], created: [], pendingCategoryChoice: [] };
    }

    const explicitCategory = detectCategoryHeader(candidates);
    const records = extractRecords(rawText);
    const country = options.country || detectCountryLabel(rawText);

    if (!records.length) {
      throw new Error("Не удалось распарсить товары из текста");
    }

    if (explicitCategory) {
      const data = ensureCountryBuckets(readCategoryData(explicitCategory));
      const updated = [];
      const created = [];

      for (const record of records) {
        if (!data[country][record.name]) {
          data[country][record.name] = [];
        }

        const action = upsertVariant(
          data[country][record.name],
          record.variant,
          record.coverage_m2,
          record.price_rub,
        );

        (action === "updated" ? updated : created).push({
          categoryId: explicitCategory.id,
          country,
          ...record,
        });
      }

      writeCategoryData(explicitCategory, data);

      return { updated, created, pendingCategoryChoice: [] };
    }

    const updated = [];
    const newItems = [];

    for (const record of records) {
      const existing = findProductAcrossCategories(record.name);

      if (existing) {
        const data = ensureCountryBuckets(readCategoryData(existing.category));
        if (!data[existing.country][existing.name]) {
          data[existing.country][existing.name] = [];
        }

        upsertVariant(
          data[existing.country][existing.name],
          record.variant,
          record.coverage_m2,
          record.price_rub,
        );

        writeCategoryData(existing.category, data);

        updated.push({
          categoryId: existing.category.id,
          country: existing.country,
          name: existing.name,
          variant: record.variant,
          coverage_m2: record.coverage_m2,
          price_rub: record.price_rub,
        });
      } else {
        newItems.push({
          country,
          ...record,
        });
      }
    }

    if (!newItems.length) {
      return { updated, created: [], pendingCategoryChoice: [] };
    }

    const targetCategory = askCategoryForNewBlock(newItems, options);
    const data = ensureCountryBuckets(readCategoryData(targetCategory));
    const created = [];

    for (const record of newItems) {
      if (!data[record.country][record.name]) {
        data[record.country][record.name] = [];
      }

      upsertVariant(
        data[record.country][record.name],
        record.variant,
        record.coverage_m2,
        record.price_rub,
      );

      created.push({
        categoryId: targetCategory.id,
        ...record,
      });
    }

    writeCategoryData(targetCategory, data);

    return { updated, created, pendingCategoryChoice: [] };
  }
}

export const dbManager = new MaterialsDBManager();

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function printCategories() {
  const list = dbManager.getCategories();
  printSection("КАТЕГОРИИ");
  if (!list.length) {
    printInfo("Категорий пока нет.");
    return;
  }

  list.forEach((cat, index) => {
    printCard({
      key: String(index + 1),
      title: cat.name,
      file: cat.file,
      description: `ID: ${cat.id}. Алиасы: ${(cat.aliases || []).join(", ") || "-"}`,
      status: "готово",
      statusColor: C.green,
    });
  });
}

function printProducts(categoryId = null) {
  const rows = dbManager.getProducts(categoryId);
  printSection("ПРОДУКТЫ");
  if (!rows.length) {
    printInfo("Продуктов пока нет.");
    return;
  }

  rows.forEach((item, index) => {
    const variantsText = (item.variants || [])
      .map((v) => {
        const coverage = v.coverage_m2 == null ? "-" : v.coverage_m2;
        const variant = v.variant || "(без варианта)";
        return `${variant} | укрывистость=${coverage} м2 | цена=${v.price_rub} руб`;
      })
      .join("; ");

    printCard({
      key: String(index + 1),
      title: item.name,
      file: `${item.categoryName} (${item.categoryId})`,
      description: `Страна: ${item.country}. Варианты: ${variantsText || "-"}`,
      status: "доступно",
      statusColor: C.green,
    });
  });
}

async function chooseCategoryId(rl, prompt = "ID категории или номер: ") {
  const categories = dbManager.getCategories();
  if (!categories.length) {
    printError("Категорий нет.");
    return null;
  }

  printCategories();
  const raw = (await ask(rl, prompt)).trim();
  if (!raw) return null;

  const num = Number(raw);
  if (Number.isFinite(num) && num >= 1 && num <= categories.length) {
    return categories[num - 1].id;
  }

  const found = categories.find((item) => item.id === raw);
  return found ? found.id : null;
}

async function chooseOrCreateCategoryId(rl) {
  while (true) {
    printSection("КАТЕГОРИЯ ДЛЯ НОВЫХ ТОВАРОВ");
    printInfo("1. Выбрать существующую");
    printInfo("2. Создать новую");
    printInfo("0. Отмена");

    const mode = (await ask(rl, "Выбор: ")).trim();

    if (mode === "0") return null;

    if (mode === "1") {
      const categoryId = await chooseCategoryId(rl);
      if (categoryId) return categoryId;
      printError("Категория не найдена.");
      continue;
    }

    if (mode === "2") {
      const fileBaseInput = cleanupLine(
        await ask(rl, "Имя нового файла (без .js): "),
      );
      if (!fileBaseInput) {
        printError("Имя файла обязательно.");
        continue;
      }

      const categoryName = cleanupLine(
        await ask(rl, "Читаемое имя категории: "),
      );
      if (!categoryName) {
        printError("Имя категории обязательно.");
        continue;
      }

      const aliasesRaw = cleanupLine(
        await ask(rl, "Алиасы через запятую (Enter = нет): "),
      );

      const aliases = aliasesRaw
        ? aliasesRaw
            .split(",")
            .map((x) => cleanupLine(x))
            .filter(Boolean)
        : [];

      try {
        const category = dbManager.createCategory({
          name: categoryName,
          aliases,
          fileName: fileBaseInput,
        });
        printSuccess(
          `Категория создана: ${category.name} [id=${category.id}] файл=${category.file}`,
        );
        return category.id;
      } catch (error) {
        printError(`Ошибка создания категории: ${error.message}`);
      }
      continue;
    }

    printError("Неверный пункт меню.");
  }
}

async function chooseCountryLabel(
  rl,
  prompt = "Страна (Россия/Италия, Enter = Россия): ",
) {
  const raw = (await ask(rl, prompt)).trim();
  const normalized = normalizeText(raw);

  if (
    normalized === "италия" ||
    normalized === "italy" ||
    normalized === "italia"
  ) {
    return "Италия";
  }

  return "Россия";
}

async function cliCreateCategory(rl) {
  printSection("СОЗДАНИЕ КАТЕГОРИИ");

  const fileBaseInput = cleanupLine(
    await ask(rl, "Имя файла категории (без .js): "),
  );
  if (!fileBaseInput) {
    printError("Имя файла обязательно.");
    return;
  }

  const name = cleanupLine(await ask(rl, "Читаемое имя категории: "));
  if (!name) {
    printError("Название обязательно.");
    return;
  }

  const aliasesRaw = cleanupLine(
    await ask(rl, "Алиасы через запятую (Enter = нет): "),
  );

  const aliases = aliasesRaw
    ? aliasesRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  try {
    const category = dbManager.createCategory({
      name,
      aliases,
      fileName: fileBaseInput,
    });
    printSuccess(
      `Категория создана: ${category.name} [id=${category.id}] файл=${category.file}`,
    );
  } catch (error) {
    printError(`Ошибка: ${error.message}`);
  }
}

async function cliEditCategory(rl) {
  const categoryId = await chooseCategoryId(rl);
  if (!categoryId) {
    printError("Категория не найдена.");
    return;
  }

  const current = findCategoryById(categoryId);
  const name = cleanupLine(await ask(rl, `Название [${current.name}]: `));
  const aliasesRaw = cleanupLine(
    await ask(
      rl,
      `Алиасы через запятую [${(current.aliases || []).join(", ")}]: `,
    ),
  );
  const fileInput = cleanupLine(
    await ask(
      rl,
      `Имя файла без .js [${String(current.file).replace(/^\.\//, "").replace(/\.js$/i, "")}]: `,
    ),
  );

  const updates = {};
  if (name) updates.name = name;
  if (aliasesRaw) {
    updates.aliases = aliasesRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (fileInput) updates.file = fileInput;

  try {
    const updated = dbManager.editCategory(categoryId, updates);
    printSuccess(
      `Категория обновлена: ${updated.name} [id=${updated.id}] файл=${updated.file}`,
    );
  } catch (error) {
    printError(`Ошибка: ${error.message}`);
  }
}

async function cliDeleteCategory(rl) {
  const categoryId = await chooseCategoryId(rl);
  if (!categoryId) {
    printError("Категория не найдена.");
    return;
  }

  const current = findCategoryById(categoryId);
  const confirm = (
    await ask(rl, `Удалить категорию "${current.name}" и её файл? (да/нет): `)
  ).trim();

  if (!confirm.toLowerCase().startsWith("д")) {
    printInfo("Отменено.");
    return;
  }

  try {
    dbManager.deleteCategory(categoryId, { deleteFile: true });
    printSuccess("Категория удалена.");
  } catch (error) {
    printError(`Ошибка: ${error.message}`);
  }
}

async function cliShowProducts(rl) {
  const filter = (
    await ask(rl, "Показать продукты одной категории? (да/нет): ")
  ).trim();

  if (filter.toLowerCase().startsWith("д")) {
    const categoryId = await chooseCategoryId(rl);
    if (!categoryId) {
      printError("Категория не найдена.");
      return;
    }
    printProducts(categoryId);
    return;
  }

  printProducts();
}

async function cliCreateProduct(rl) {
  const categoryId = await chooseCategoryId(rl, "Куда добавить продукт: ");
  if (!categoryId) {
    printError("Категория не найдена.");
    return;
  }

  const name = (await ask(rl, "Название продукта: ")).trim();
  const country = await chooseCountryLabel(rl);

  if (!name) {
    printError("Название обязательно.");
    return;
  }

  while (true) {
    const variant = (
      await ask(rl, "Вариант фасовки (например 1л/1,64кг, Enter = завершить): ")
    ).trim();

    if (!variant) break;

    const coverageRaw = (
      await ask(rl, "Укрывистость м2 (Enter = пусто): ")
    ).trim();
    const priceRaw = (await ask(rl, "Цена руб: ")).trim();

    try {
      dbManager.createProduct(categoryId, {
        name,
        variant,
        coverage_m2: coverageRaw ? parseNumber(coverageRaw) : null,
        price_rub: parseInteger(priceRaw),
        country,
      });
      printSuccess(`Вариант добавлен: ${name} / ${variant}`);
    } catch (error) {
      printError(`Ошибка: ${error.message}`);
      return;
    }
  }

  printSuccess("Добавление продукта завершено.");
}

async function cliEditProduct(rl) {
  const categoryId = await chooseCategoryId(
    rl,
    "Категория продукта для редактирования: ",
  );
  if (!categoryId) {
    printError("Категория не найдена.");
    return;
  }

  printProducts(categoryId);

  const productName = (await ask(rl, "Точное название продукта: ")).trim();
  if (!productName) {
    printError("Название обязательно.");
    return;
  }

  const category = findCategoryById(categoryId);
  const data = ensureCountryBuckets(readCategoryData(category));
  const found = findProductInCategoryData(data, productName);

  if (!found) {
    printError("Продукт не найден.");
    return;
  }

  printSection("НАЙДЕН ПРОДУКТ");
  printKV("Название", found.name);
  printKV("Страна", found.country);
  printKV(
    "Варианты",
    (found.variants || [])
      .map(
        (v) =>
          `${v.variant || "(без варианта)"} | ${v.coverage_m2 ?? "-"} м2 | ${v.price_rub} руб`,
      )
      .join("; ") || "-",
  );

  const newName = cleanupLine(await ask(rl, `Новое имя [${found.name}]: `));
  const countryInput = cleanupLine(
    await ask(rl, `Новая страна [${found.country}] (Россия/Италия): `),
  );

  let nextCountry = found.country;
  if (
    normalizeText(countryInput) === "италия" ||
    normalizeText(countryInput) === "italy"
  ) {
    nextCountry = "Италия";
  } else if (
    normalizeText(countryInput) === "россия" ||
    normalizeText(countryInput) === "russia"
  ) {
    nextCountry = "Россия";
  }

  const replaceVariants = (
    await ask(rl, "Полностью заменить список вариантов? (да/нет): ")
  ).trim();

  let nextVariants = found.variants;

  if (replaceVariants.toLowerCase().startsWith("д")) {
    nextVariants = [];
    while (true) {
      const variant = cleanupLine(
        await ask(rl, "Вариант фасовки (Enter = закончить): "),
      );
      if (!variant) break;

      const coverageRaw = cleanupLine(
        await ask(rl, "Укрывистость м2 (Enter = пусто): "),
      );
      const priceRaw = cleanupLine(await ask(rl, "Цена руб: "));

      nextVariants.push({
        variant,
        coverage_m2: coverageRaw ? parseNumber(coverageRaw) : null,
        price_rub: parseInteger(priceRaw),
      });
    }
  }

  try {
    dbManager.editProduct(categoryId, found.name, {
      name: newName || found.name,
      country: nextCountry,
      variants: nextVariants,
    });
    printSuccess("Продукт обновлен.");
  } catch (error) {
    printError(`Ошибка: ${error.message}`);
  }
}

async function cliDeleteProduct(rl) {
  const categoryId = await chooseCategoryId(
    rl,
    "Категория продукта для удаления: ",
  );
  if (!categoryId) {
    printError("Категория не найдена.");
    return;
  }

  printProducts(categoryId);

  const productName = (await ask(rl, "Точное название продукта: ")).trim();
  if (!productName) {
    printError("Название обязательно.");
    return;
  }

  const countryInput = (
    await ask(
      rl,
      "Удалять только в одной стране? (Россия/Италия, Enter = во всех): ",
    )
  ).trim();

  let country = null;
  if (
    normalizeText(countryInput) === "италия" ||
    normalizeText(countryInput) === "italy"
  ) {
    country = "Италия";
  } else if (
    normalizeText(countryInput) === "россия" ||
    normalizeText(countryInput) === "russia"
  ) {
    country = "Россия";
  }

  const confirm = (
    await ask(rl, `Удалить продукт "${productName}"? (да/нет): `)
  ).trim();

  if (!confirm.toLowerCase().startsWith("д")) {
    printInfo("Отменено.");
    return;
  }

  try {
    const deleted = dbManager.deleteProduct(categoryId, productName, country);
    if (deleted) {
      printSuccess("Продукт удален.");
    } else {
      printError("Продукт не найден.");
    }
  } catch (error) {
    printError(`Ошибка: ${error.message}`);
  }
}

async function cliImportText(rl) {
  printSection("ИМПОРТ БЛОКА ТЕКСТА");
  printInfo("Вставь блок текста.");
  printInfo("Для завершения введи отдельной строкой: END");
  printInfo(
    "Если первая строка вида 'Категория: ...', она будет использована автоматически.",
  );
  printLine();

  const lines = [];
  while (true) {
    const line = await ask(rl, "");
    if (String(line).trim().toUpperCase() === "END") break;
    lines.push(line);
  }

  const rawText = lines.join("\n").trim();
  if (!rawText) {
    printError("Ничего не введено.");
    return;
  }

  const countryInput = cleanupLine(
    await ask(rl, "Страна (Россия/Италия, Enter = автоопределение): "),
  );

  const options = {};
  if (
    normalizeText(countryInput) === "италия" ||
    normalizeText(countryInput) === "italy"
  ) {
    options.country = "Италия";
  } else if (
    normalizeText(countryInput) === "россия" ||
    normalizeText(countryInput) === "russia"
  ) {
    options.country = "Россия";
  }

  try {
    const result = dbManager.importFromText(rawText, options);

    printSuccess("Импорт завершен.");
    printKV("Обновлено", result.updated.length);
    printKV("Создано", result.created.length);

    if (result.updated.length) {
      printSection("ОБНОВЛЕННЫЕ ПОЗИЦИИ");
      result.updated.forEach((item) => {
        printInfo(
          `- [${item.country}] ${item.name} ${item.variant || "(без варианта)"} -> ${item.price_rub} руб (категория=${item.categoryId})`,
        );
      });
    }

    if (result.created.length) {
      printSection("НОВЫЕ ПОЗИЦИИ");
      result.created.forEach((item) => {
        printInfo(
          `- [${item.country}] ${item.name} ${item.variant || "(без варианта)"} -> ${item.price_rub} руб (категория=${item.categoryId})`,
        );
      });
    }
  } catch (error) {
    const message = String(error.message || "");
    if (!message.includes("Есть новые товары без категории")) {
      printError(`Ошибка при импорте: ${message}`);
      return;
    }

    printError("Для новых товаров не указана категория.");
    const categoryId = await chooseOrCreateCategoryId(rl);

    if (!categoryId) {
      printInfo("Категория не выбрана. Импорт отменен.");
      return;
    }

    try {
      const result = dbManager.importFromText(rawText, {
        ...options,
        categoryId,
      });

      printSuccess("Импорт завершен.");
      printKV("Обновлено", result.updated.length);
      printKV("Создано", result.created.length);

      if (result.updated.length) {
        printSection("ОБНОВЛЕННЫЕ ПОЗИЦИИ");
        result.updated.forEach((item) => {
          printInfo(
            `- [${item.country}] ${item.name} ${item.variant || "(без варианта)"} -> ${item.price_rub} руб (категория=${item.categoryId})`,
          );
        });
      }

      if (result.created.length) {
        printSection("НОВЫЕ ПОЗИЦИИ");
        result.created.forEach((item) => {
          printInfo(
            `- [${item.country}] ${item.name} ${item.variant || "(без варианта)"} -> ${item.price_rub} руб (категория=${item.categoryId})`,
          );
        });
      }
    } catch (retryError) {
      printError(`Ошибка при повторном импорте: ${retryError.message}`);
    }
  }
}

async function cliMain() {
  const rl = createReadline();

  printHeader("ARTONE", "БАЗА ПРОДУКТОВ");
  printInfo("Категории, продукты и импорт товарных блоков.");
  printLine();

  while (true) {
    printSection("МЕНЮ");
    printInfo("1. Показать категории");
    printInfo("2. Создать категорию");
    printInfo("3. Изменить категорию");
    printInfo("4. Удалить категорию");
    printInfo("5. Показать продукты");
    printInfo("6. Добавить продукт");
    printInfo("7. Изменить продукт");
    printInfo("8. Удалить продукт");
    printInfo("9. Импортировать блок текста");
    printInfo("0. Выход");
    printMenuHint("1-9 — действие    0 — выход");

    const choice = (await ask(rl, "Выбор: ")).trim();

    if (choice === "1") {
      printCategories();
    } else if (choice === "2") {
      await cliCreateCategory(rl);
    } else if (choice === "3") {
      await cliEditCategory(rl);
    } else if (choice === "4") {
      await cliDeleteCategory(rl);
    } else if (choice === "5") {
      await cliShowProducts(rl);
    } else if (choice === "6") {
      await cliCreateProduct(rl);
    } else if (choice === "7") {
      await cliEditProduct(rl);
    } else if (choice === "8") {
      await cliDeleteProduct(rl);
    } else if (choice === "9") {
      await cliImportText(rl);
    } else if (choice === "0") {
      printInfo("Выход из базы продуктов.");
      break;
    } else {
      printError("Неверный пункт меню.");
    }
  }

  rl.close();
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  cliMain().catch((error) => {
    console.error("Фатальная ошибка:", error);
    process.exit(1);
  });
}
