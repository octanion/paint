import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { systemColorBase } from "./system-color-base.js";
import { materialsDB } from "./materials-db.js";
import {
  C,
  clear,
  printHeader,
  printLine,
  printInfo,
  printSuccess,
  printError,
  printMuted,
  printSection,
  printKV,
  printCard,
  printMenuHint,
} from "./artone-ui.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_EXPORT = "colorSystem";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();

  if (!normalized) return 0;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsObjectExport(filePath, exportName) {
  const source = fs.readFileSync(filePath, "utf-8");
  const cleaned = source
    .replace(
      new RegExp(`^\\s*export\\s+const\\s+${exportName}\\s*=\\s*`, "m"),
      "",
    )
    .replace(/;\s*$/, "");

  return Function(`return (${cleaned});`)();
}

function loadSystemFromFile(fileName) {
  const filePath = path.join(
    __dirname,
    String(fileName || "").replace(/^\.\//, ""),
  );
  return readJsObjectExport(filePath, SYSTEM_EXPORT);
}

function loadExportArray(fileName, exportName) {
  const filePath = path.join(
    __dirname,
    String(fileName || "").replace(/^\.\//, ""),
  );
  if (!fs.existsSync(filePath)) return [];
  const data = readJsObjectExport(filePath, exportName);
  return Array.isArray(data) ? data : [];
}

function normalizeSystem(system) {
  if (!Array.isArray(system.questions)) system.questions = [];
  if (!Array.isArray(system.layers)) system.layers = [];
  if (!Array.isArray(system.colors)) system.colors = [];

  for (const question of system.questions) {
    if (question.type === "select" && !Array.isArray(question.options)) {
      question.options = [];
    }

    if (Array.isArray(question.options)) {
      for (const option of question.options) {
        if (!option.binding || typeof option.binding !== "object") {
          option.binding = {
            layerId: "",
            materialKey: "",
            materialQuery: "",
            skipLayer: false,
          };
        } else {
          option.binding.layerId = normalizeText(option.binding.layerId || "");
          option.binding.materialKey = normalizeText(
            option.binding.materialKey || "",
          );
          option.binding.materialQuery = normalizeText(
            option.binding.materialQuery || "",
          );
          option.binding.skipLayer = Boolean(option.binding.skipLayer);
        }
      }
    }
  }

  for (const layer of system.layers) {
    if (!Array.isArray(layer.packaging)) layer.packaging = [];
    if (!layer.materialOptions || typeof layer.materialOptions !== "object") {
      layer.materialOptions = null;
    }
  }

  return system;
}

function getColorModel(system) {
  return system.colorConfig?.colorModel || "layer-coefficients-multi";
}

function getColorRegistryConfig(system) {
  if (!system.colorConfig?.registryFile || !system.colorConfig?.registryKey) {
    return null;
  }

  return {
    file: system.colorConfig.registryFile,
    exportName: system.colorConfig.registryKey,
  };
}

function getMathRegistryConfig(system) {
  return {
    file: system.colorConfig?.mathRegistryFile || "type-colerovka-math.js",
    exportName:
      system.colorConfig?.mathRegistryExport || "colorerovkaMathTypes",
  };
}

function loadColorRegistry(system) {
  const cfg = getColorRegistryConfig(system);
  if (!cfg) return [];
  return loadExportArray(cfg.file, cfg.exportName);
}

function loadMathRegistry(system) {
  const cfg = getMathRegistryConfig(system);
  return loadExportArray(cfg.file, cfg.exportName);
}

function listSystems() {
  const active = (systemColorBase.registry || []).filter(
    (item) => item.active !== false,
  );

  printSection("Системы колеровки");

  if (!active.length) {
    printMuted("Нет активных систем.");
  } else {
    active.forEach((item, index) => {
      printCard({
        key: String(index + 1),
        title: item.name,
        file: item.file || "",
        status: "Активна",
        statusColor: C.green,
      });
    });
  }

  printSection("Главное меню");
  printInfo("1. Выбрать систему");
  printInfo("2. Выход");

  return active;
}

async function chooseSystem() {
  while (true) {
    clear();
    printHeader("ARTONE", "FRESCO CLI · Калькулятор");
    const systems = listSystems();
    printMenuHint("1 — выбрать систему    2 — выход");

    const choice = await ask("Выбор: ");

    if (choice === "2") return null;
    if (choice !== "1") {
      printError("Неизвестный пункт меню.");
      continue;
    }

    const number = Number(await ask("Номер системы: ")) - 1;
    const picked = systems[number];
    if (!picked) {
      printError("Неверный номер.");
      continue;
    }

    return normalizeSystem(loadSystemFromFile(picked.file));
  }
}

function listQuestionOptions(question) {
  (question.options || []).forEach((option, index) => {
    printInfo(`${index + 1}. ${option.label}`);
  });
}

async function askSelectQuestion(question) {
  while (true) {
    printSection(question.label);
    listQuestionOptions(question);

    const raw = await ask("Выбор: ");
    const index = Number(raw) - 1;
    const option = question.options[index];

    if (option) return option.value;
    printError("Неверный номер.");
  }
}

async function askBooleanQuestion(question) {
  while (true) {
    const raw = normalizeText(
      await ask(`\n${question.label} (да/нет): `),
    ).toLowerCase();
    if (raw === "да" || raw === "д" || raw === "yes" || raw === "y")
      return true;
    if (raw === "нет" || raw === "н" || raw === "no" || raw === "n")
      return false;
    printError("Введите да или нет.");
  }
}

async function askNumberQuestion(question) {
  while (true) {
    const raw = await ask(`\n${question.label}: `);
    const value = parseNumber(raw);
    if (value > 0) return value;
    printError("Введите число больше нуля.");
  }
}

async function askTextQuestion(question) {
  while (true) {
    const raw = normalizeText(await ask(`\n${question.label}: `));
    if (raw) return raw;
    printError("Поле не должно быть пустым.");
  }
}

function ensureColorApplication(system, color) {
  if (!color.application || typeof color.application !== "object") {
    color.application = {};
  }

  for (const layer of system.layers) {
    if (
      !color.application[layer.id] ||
      typeof color.application[layer.id] !== "object"
    ) {
      color.application[layer.id] = {};
    }

    for (const pack of layer.packaging || []) {
      if (
        !color.application[layer.id][pack] ||
        typeof color.application[layer.id][pack] !== "object"
      ) {
        color.application[layer.id][pack] = {
          enabled: false,
          coefficient: 0,
        };
      }
    }
  }

  return color;
}

async function askColorQuestion(system, question) {
  const model = getColorModel(system);

  if (model === "value-linked") {
    const colors = loadColorRegistry(system).map((item) =>
      ensureColorApplication(system, deepClone(item)),
    );

    while (true) {
      printSection(question.label);
      colors.forEach((color, index) => {
        const title = color.shortName
          ? `${color.name} / ${color.shortName}`
          : `${color.name} / ${color.id}`;
        printInfo(`${index + 1}. ${title}`);
      });

      const raw = await ask("Номер цвета: ");
      const index = Number(raw) - 1;
      const color = colors[index];

      if (color) return color;
      printError("Неверный номер.");
    }
  }

  while (true) {
    printSection(question.label);
    system.colors.forEach((color, index) => {
      printInfo(`${index + 1}. ${color.name} / ${color.id}`);
    });

    const raw = await ask("Номер цвета: ");
    const index = Number(raw) - 1;
    const color = system.colors[index];

    if (color) return color;
    printError("Неверный номер.");
  }
}

async function askQuestionByConfig(system, question) {
  if (question.key === "color") {
    return askColorQuestion(system, question);
  }

  if (question.type === "number") {
    return askNumberQuestion(question);
  }

  if (question.type === "text") {
    return askTextQuestion(question);
  }

  if (
    question.type === "select" &&
    Array.isArray(question.options) &&
    question.options.length
  ) {
    return askSelectQuestion(question);
  }

  return askBooleanQuestion(question);
}

function getSelectedOption(question, value) {
  return (
    (question?.options || []).find((option) => option.value === value) || null
  );
}

function buildLayerBindings(system, answers) {
  const result = {};

  for (const question of system.questions || []) {
    if (question.type !== "select" || !Array.isArray(question.options))
      continue;

    const value = answers[question.key];
    const option = getSelectedOption(question, value);
    if (!option?.binding?.layerId) continue;

    result[option.binding.layerId] = {
      layerId: option.binding.layerId,
      materialKey: normalizeText(option.binding.materialKey || ""),
      materialQuery: normalizeText(option.binding.materialQuery || ""),
      skipLayer: Boolean(option.binding.skipLayer),
      optionValue: option.value,
      optionLabel: option.label,
      questionKey: question.key,
      questionLabel: question.label,
    };
  }

  return result;
}

function findMaterialByName(materialName) {
  const wanted = normalizeText(materialName);
  if (!wanted) return null;

  for (const [country, materials] of Object.entries(materialsDB || {})) {
    if (!materials || typeof materials !== "object") continue;

    for (const [name, variants] of Object.entries(materials)) {
      if (normalizeText(name) === wanted) {
        return {
          country,
          name,
          variants: Array.isArray(variants) ? variants : [],
        };
      }
    }
  }

  return null;
}

function resolveLayerMaterialName(layer, binding) {
  if (binding?.materialKey) return binding.materialKey;
  if (binding?.materialQuery) return binding.materialQuery;
  return layer.material || "";
}

function splitAreaIntoPackCounts(area, variants) {
  const sorted = [...variants]
    .filter(
      (item) => Number(item.coverage_m2) > 0 && Number(item.price_rub) > 0,
    )
    .sort((a, b) => Number(b.coverage_m2) - Number(a.coverage_m2));

  let remaining = area;
  const result = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const coverage = Number(item.coverage_m2);
    const isLast = i === sorted.length - 1;

    let count = 0;
    if (isLast) {
      count = Math.ceil(remaining / coverage);
    } else {
      count = Math.floor(remaining / coverage);
    }

    if (count > 0) {
      result.push({
        packName: item.variant,
        coverage,
        unitPrice: Number(item.price_rub),
        count,
        total: roundMoney(count * Number(item.price_rub)),
      });
      remaining -= count * coverage;
    }
  }

  if (remaining > 0 && sorted.length) {
    const last = sorted[sorted.length - 1];
    const existing = result.find((x) => x.packName === last.variant);
    if (existing) {
      existing.count += 1;
      existing.total = roundMoney(existing.count * existing.unitPrice);
    } else {
      result.push({
        packName: last.variant,
        coverage: Number(last.coverage_m2),
        unitPrice: Number(last.price_rub),
        count: 1,
        total: roundMoney(Number(last.price_rub)),
      });
    }
  }

  return result.filter((item) => item.count > 0);
}

function calculateMaterialLayer(layer, answers, bindings) {
  const binding = bindings[layer.id];

  if (binding?.skipLayer) {
    return {
      layerId: layer.id,
      layerName: layer.name,
      materialName: "",
      skipped: true,
      skipReason: `${binding.questionLabel}: ${binding.optionLabel}`,
      items: [],
      total: 0,
      packCountsMap: {},
    };
  }

  const materialName = resolveLayerMaterialName(layer, binding);
  const material = findMaterialByName(materialName);

  if (!material) {
    printError(`Не найден материал: ${materialName}`);
    return {
      layerId: layer.id,
      layerName: layer.name,
      materialName,
      skipped: false,
      notFound: true,
      items: [],
      total: 0,
      packCountsMap: {},
    };
  }

  const area = Number(answers.aream2 || 0);
  const items = splitAreaIntoPackCounts(area, material.variants);
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));

  const packCountsMap = {};
  for (const item of items) {
    packCountsMap[item.packName] = item.count;
  }

  return {
    layerId: layer.id,
    layerName: layer.name,
    materialName: material.name,
    country: material.country,
    skipped: false,
    items,
    total,
    packCountsMap,
  };
}

function applyRounding(value, mode) {
  if (mode === "floor") return Math.floor(value);
  if (mode === "round") return Math.round(value);
  return Math.ceil(value);
}

function calculateTintForLayer(system, selectedColor, layerResult) {
  if (getColorModel(system) !== "value-linked") return null;
  if (!selectedColor || !layerResult || layerResult.skipped) return null;

  const color = ensureColorApplication(system, deepClone(selectedColor));
  const mathTypes = loadMathRegistry(system);
  const mathType = mathTypes.find((item) => item.id === color.coloringTypeId);

  if (!mathType) return null;

  const application = color.application?.[layerResult.layerId];
  if (!application || typeof application !== "object") return null;

  let weightedSum = 0;

  for (const [packName, count] of Object.entries(
    layerResult.packCountsMap || {},
  )) {
    const app = application[packName];
    if (!app?.enabled) continue;

    const coefficient = Number(app.coefficient || 0);
    if (coefficient <= 0) continue;

    weightedSum += count * coefficient;
  }

  if (weightedSum <= 0) return null;

  const colorValue = Number(color.value || 0);
  const tubeSize = Number(mathType.tubeSize || 0);
  const productPrice = Number(mathType.productPrice || 0);

  if (tubeSize <= 0 || productPrice <= 0) return null;

  let rawAmount = weightedSum;

  if (mathType.usesColorValue !== false) {
    rawAmount *= colorValue;
  }

  if (mathType.usesApplicationCoefficients === false) {
    rawAmount = colorValue;
  }

  const tubeCount = applyRounding(
    rawAmount / tubeSize,
    mathType.rounding || "ceil",
  );
  if (tubeCount <= 0) return null;

  const total = roundMoney(tubeCount * productPrice);

  return {
    layerId: layerResult.layerId,
    layerName: layerResult.layerName,
    productName: mathType.productName,
    typeName: mathType.name,
    tubeSize,
    tubeCount,
    unitPrice: productPrice,
    total,
    colorName: color.name,
    colorShortName: color.shortName || color.id,
    colorValue,
    weightedSum: roundMoney(weightedSum),
  };
}

function calculateResults(system, answers) {
  const bindings = buildLayerBindings(system, answers);

  const layers = [];
  const tintResults = [];

  for (const layer of system.layers) {
    const layerResult = calculateMaterialLayer(layer, answers, bindings);
    layers.push(layerResult);

    const tintResult = calculateTintForLayer(
      system,
      answers.color,
      layerResult,
    );
    if (tintResult) {
      tintResults.push(tintResult);
    }
  }

  const materialsTotal = roundMoney(
    layers.reduce((sum, layer) => sum + layer.total, 0),
  );
  const tintTotal = roundMoney(
    tintResults.reduce((sum, item) => sum + item.total, 0),
  );
  const grandTotal = roundMoney(materialsTotal + tintTotal);

  return {
    layers,
    tintResults,
    materialsTotal,
    tintTotal,
    grandTotal,
  };
}

function printResults(report) {
  printHeader("ARTONE", "Результат расчета");
  printSection("Слои и материалы");

  for (const layer of report.layers) {
    printCard({
      title: `${layer.layerName}: ${layer.materialName || "-"}`,
      description: layer.skipped
        ? `Слой пропущен (${layer.skipReason}).`
        : layer.items.length
          ? layer.items
              .map(
                (item) =>
                  `${item.packName} × ${item.count} = ${item.total} руб.`,
              )
              .join(" ; ")
          : "Нет данных по фасовкам.",
      status: layer.skipped ? "Пропущен" : "Рассчитан",
      statusColor: layer.skipped ? C.red : C.green,
    });

    const tint = report.tintResults.find((x) => x.layerId === layer.layerId);
    if (tint) {
      printMuted(
        `Колеровка: ${tint.productName} (${tint.colorShortName}) × ${tint.tubeCount} = ${tint.total} руб.`,
      );
    }

    const layerTotalWithTint = roundMoney(
      layer.total + (tint ? tint.total : 0),
    );
    printKV("Итого по слою", `${layerTotalWithTint} руб.`, C.gold);
    console.log("");
  }

  printSection("Колеровка всего");
  if (report.tintResults.length) {
    for (const tint of report.tintResults) {
      printInfo(
        `${tint.layerName}: ${tint.productName} (${tint.colorShortName}) × ${tint.tubeCount} = ${tint.total} руб.`,
      );
    }
    printKV("Итого колеровка", `${report.tintTotal} руб.`, C.teal);
  } else {
    printMuted("Колеровка всего: 0 руб.");
  }

  printSection("Итоги");
  printKV("Итого материалы", `${report.materialsTotal} руб.`, C.soft);
  printKV("Итого с колеровкой", `${report.grandTotal} руб.`, C.gold);
}

async function runSystem(system) {
  clear();
  printHeader("ARTONE", `Система: ${system.name}`);
  if (system.description) {
    printInfo(system.description);
    printLine();
  }

  const answers = {};

  for (const question of system.questions) {
    answers[question.key] = await askQuestionByConfig(system, question);
  }

  const report = calculateResults(system, answers);
  printResults(report);

  await ask("\nНажми Enter, чтобы вернуться в меню...");
}

async function main() {
  while (true) {
    const system = await chooseSystem();
    if (!system) break;
    await runSystem(system);
  }

  rl.close();
}

main();
