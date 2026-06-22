import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REGISTRY_EXPORT = "systemColorBase";
const SYSTEM_EXPORT = "colorSystem";
const DEFAULT_MATH_REGISTRY_FILE = "type-colerovka-math.js";
const DEFAULT_MATH_REGISTRY_EXPORT = "colorerovkaMathTypes";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

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

function writeJsExport(filePath, exportName, data) {
  const content = `export const ${exportName} = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(filePath, content, "utf-8");
}

function getRegistryPath() {
  return path.join(__dirname, "system-color-base.js");
}

function loadRegistry() {
  return readJsObjectExport(getRegistryPath(), REGISTRY_EXPORT);
}

function saveRegistry(registry) {
  writeJsExport(getRegistryPath(), REGISTRY_EXPORT, registry);
}

function resolveLocalPath(fileName) {
  return path.join(__dirname, String(fileName || "").replace(/^\.\//, ""));
}

function ensureFileExists(filePath, exportName, defaultValue) {
  if (!fs.existsSync(filePath)) {
    writeJsExport(filePath, exportName, defaultValue);
  }
}

function loadExportArray(fileName, exportName) {
  const filePath = resolveLocalPath(fileName);
  ensureFileExists(filePath, exportName, []);
  const data = readJsObjectExport(filePath, exportName);
  return Array.isArray(data) ? data : [];
}

function saveExportArray(fileName, exportName, data) {
  writeJsExport(resolveLocalPath(fileName), exportName, data);
}

function resolveSystemPath(fileName) {
  return resolveLocalPath(fileName);
}

function loadSystemByFile(fileName) {
  return readJsObjectExport(resolveSystemPath(fileName), SYSTEM_EXPORT);
}

function saveSystemByFile(fileName, data) {
  writeJsExport(resolveSystemPath(fileName), SYSTEM_EXPORT, data);
}

function normalizeLayerMaterialOptions(layer) {
  if (!layer || typeof layer !== "object") return layer;

  if (!layer.material || typeof layer.material !== "string") {
    layer.material = "";
  }

  if (!Array.isArray(layer.packaging)) {
    layer.packaging = [];
  }

  if (!layer.materialOptions || typeof layer.materialOptions !== "object") {
    layer.materialOptions = null;
    return layer;
  }

  const cleaned = {};
  for (const [name, value] of Object.entries(layer.materialOptions)) {
    const optionName = normalizeText(name);
    if (!optionName) continue;
    cleaned[optionName] = Array.isArray(value) ? value : [];
  }

  layer.materialOptions = Object.keys(cleaned).length ? cleaned : null;
  return layer;
}

function ensureSystemShape(data) {
  if (!Array.isArray(data.questions)) data.questions = [];
  if (!Array.isArray(data.layers)) data.layers = [];
  if (!Array.isArray(data.colors)) data.colors = [];
  if (!data.colorConfig || typeof data.colorConfig !== "object") {
    data.colorConfig = null;
  }

  for (const layer of data.layers) {
    normalizeLayerMaterialOptions(layer);
  }

  for (const question of data.questions) {
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
          option.binding.layerId = normalizeId(option.binding.layerId || "");
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

  for (const color of data.colors) {
    if (!color.layers || typeof color.layers !== "object") color.layers = {};
    for (const layer of data.layers) {
      if (!color.layers[layer.id]) color.layers[layer.id] = {};
      for (const pack of layer.packaging || []) {
        if (
          !Object.prototype.hasOwnProperty.call(color.layers[layer.id], pack)
        ) {
          color.layers[layer.id][pack] = {};
        }
      }
    }
  }

  return data;
}

function getColorModel(system) {
  return system.colorConfig?.colorModel || "layer-coefficients-multi";
}

function getMathRegistryConfig(system) {
  return {
    file: system.colorConfig?.mathRegistryFile || DEFAULT_MATH_REGISTRY_FILE,
    exportName:
      system.colorConfig?.mathRegistryExport || DEFAULT_MATH_REGISTRY_EXPORT,
  };
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

function loadColorRegistry(system) {
  const cfg = getColorRegistryConfig(system);
  if (!cfg) return null;
  return loadExportArray(cfg.file, cfg.exportName);
}

function saveColorRegistry(system, colors) {
  const cfg = getColorRegistryConfig(system);
  if (!cfg) return;
  saveExportArray(cfg.file, cfg.exportName, colors);
}

function loadMathRegistry(system) {
  const cfg = getMathRegistryConfig(system);
  return loadExportArray(cfg.file, cfg.exportName);
}

function saveMathRegistry(system, items) {
  const cfg = getMathRegistryConfig(system);
  saveExportArray(cfg.file, cfg.exportName, items);
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
      } else {
        if (typeof color.application[layer.id][pack].enabled !== "boolean") {
          color.application[layer.id][pack].enabled = false;
        }
        if (
          typeof color.application[layer.id][pack].coefficient !== "number" ||
          !Number.isFinite(color.application[layer.id][pack].coefficient)
        ) {
          color.application[layer.id][pack].coefficient = 0;
        }
      }
    }

    const validPacks = new Set(layer.packaging || []);
    Object.keys(color.application[layer.id]).forEach((pack) => {
      if (!validPacks.has(pack)) {
        delete color.application[layer.id][pack];
      }
    });
  }

  const validLayerIds = new Set(system.layers.map((layer) => layer.id));
  Object.keys(color.application).forEach((layerId) => {
    if (!validLayerIds.has(layerId)) {
      delete color.application[layerId];
    }
  });

  return color;
}

function ensureAllRegistryColorApplications(system, colors) {
  for (const color of colors) {
    ensureColorApplication(system, color);
  }
  return colors;
}

function listSystems(registry) {
  console.log("\nСистемы колеровки:");
  if (!registry.registry.length) {
    console.log("Пока нет ни одной системы.");
    return;
  }

  registry.registry.forEach((item, index) => {
    console.log(`${index + 1}. ${item.name} (${item.id}) -> ${item.file}`);
  });
}

function listQuestions(system) {
  console.log("\nВопросы системы:");
  if (!system.questions.length) {
    console.log("Вопросов пока нет.");
    return;
  }

  system.questions.forEach((q, index) => {
    const optionsInfo =
      q.type === "select"
        ? `, options=${Array.isArray(q.options) ? q.options.length : 0}`
        : "";
    console.log(
      `${index + 1}. ${q.label} [key=${q.key}, type=${q.type}, required=${q.required}${optionsInfo}]`,
    );
  });
}

function listQuestionOptions(question) {
  console.log(`\nВарианты ответа для: ${question.label}`);
  if (!Array.isArray(question.options) || !question.options.length) {
    console.log("Вариантов пока нет.");
    return;
  }

  question.options.forEach((item, index) => {
    const binding = item.binding || {};
    const bindingText = binding.layerId
      ? ` -> layer=${binding.layerId}, materialKey=${binding.materialKey || "-"}, materialQuery=${binding.materialQuery || "-"}, skip=${binding.skipLayer ? "yes" : "no"}`
      : "";
    console.log(
      `${index + 1}. ${item.label} [value=${item.value}]${bindingText}`,
    );
  });
}

function listLayers(system) {
  console.log("\nСлои системы:");
  if (!system.layers.length) {
    console.log("Слоев пока нет.");
    return;
  }

  system.layers.forEach((layer, index) => {
    const packs = (layer.packaging || []).join(", ");
    const materialMode = layer.materialOptions ? "options" : "single";
    console.log(
      `${index + 1}. ${layer.name} [id=${layer.id}] mode=${materialMode} материал=${layer.material || "-"} фасовки=${packs}`,
    );

    if (layer.materialOptions) {
      Object.keys(layer.materialOptions).forEach((key) => {
        console.log(`   - option: ${key}`);
      });
    }
  });
}

function listMathTypes(system, mathTypesState) {
  const items = mathTypesState.items;
  console.log("\nТипы колеровки:");
  if (!items.length) {
    console.log("Типов колеровки пока нет.");
    return items;
  }

  items.forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.name} [id=${item.id}] товар=${item.productName || "-"} туба=${item.tubeSize || "-"}`,
    );
  });

  return items;
}

function listColors(system, colorRegistryState) {
  const model = getColorModel(system);

  if (model === "value-linked") {
    const registryColors = ensureAllRegistryColorApplications(
      system,
      colorRegistryState.items,
    );

    console.log("\nЦвета системы:");
    if (!registryColors.length) {
      console.log("Цветов пока нет.");
      return;
    }

    registryColors.forEach((color, index) => {
      console.log(
        `${index + 1}. ${color.name} [id=${color.id}] short=${color.shortName || "-"} value=${color.value ?? "-"} type=${color.coloringTypeId || "-"}`,
      );
    });
    return;
  }

  console.log("\nЦвета системы:");
  if (!system.colors.length) {
    console.log("Цветов пока нет.");
    return;
  }

  system.colors.forEach((color, index) => {
    console.log(`${index + 1}. ${color.name} (${color.code}) [id=${color.id}]`);
  });
}

async function chooseSystem(registry, message) {
  listSystems(registry);
  const index = Number(await ask(message || "Номер системы: ")) - 1;
  return registry.registry[index] || null;
}

function getLayerByIndex(system, index) {
  return system.layers[index] || null;
}

function getLayerById(system, layerId) {
  return (system.layers || []).find((layer) => layer.id === layerId) || null;
}

function getMaterialOptionNames(layer) {
  if (!layer?.materialOptions) return [];
  return Object.keys(layer.materialOptions);
}

function markDirty(editorState) {
  editorState.dirty = true;
}

function saveEditorState(editorState) {
  const normalizedSystem = ensureSystemShape(deepClone(editorState.system));
  editorState.system = normalizedSystem;

  saveSystemByFile(editorState.registryItem.file, normalizedSystem);

  if (editorState.colorRegistryState) {
    const colors = ensureAllRegistryColorApplications(
      normalizedSystem,
      deepClone(editorState.colorRegistryState.items),
    );
    editorState.colorRegistryState.items = colors;
    saveColorRegistry(normalizedSystem, colors);
  }

  if (editorState.mathTypesState) {
    saveMathRegistry(
      normalizedSystem,
      deepClone(editorState.mathTypesState.items),
    );
  }

  if (editorState.registryDirty) {
    saveRegistry(editorState.registry);
    editorState.registryDirty = false;
  }

  editorState.dirty = false;
  console.log("Изменения сохранены.");
}

async function confirmSaveIfDirty(editorState) {
  if (!editorState.dirty && !editorState.registryDirty) {
    return true;
  }

  console.log("\nЕсть несохраненные изменения.");
  console.log("1. Сохранить и продолжить");
  console.log("2. Продолжить без сохранения");
  console.log("3. Отмена");

  const choice = await ask("Выбор: ");

  if (choice === "1") {
    saveEditorState(editorState);
    return true;
  }

  if (choice === "2") {
    return true;
  }

  return false;
}

async function chooseLayerForBinding(system, currentLayerId = "") {
  while (true) {
    console.log("\nК какому слою привязать option?");
    console.log("0. Без привязки");
    system.layers.forEach((layer, index) => {
      console.log(`${index + 1}. ${layer.name} [id=${layer.id}]`);
    });

    const raw = await ask(
      `Номер слоя${currentLayerId ? ` [текущий=${currentLayerId}]` : ""}: `,
    );

    if (!normalizeText(raw)) {
      return currentLayerId || "";
    }

    const num = Number(raw);
    if (num === 0) return "";

    const layer = getLayerByIndex(system, num - 1);
    if (layer) return layer.id;

    console.log("Неверный номер слоя.");
  }
}

async function chooseMaterialOptionKey(layer, currentKey = "") {
  const names = getMaterialOptionNames(layer);
  if (!names.length) return "";

  while (true) {
    console.log(`\nМатериальные опции слоя: ${layer.name}`);
    names.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });

    const raw = await ask(
      `Номер material option${currentKey ? ` [текущий=${currentKey}]` : ""}: `,
    );

    if (!normalizeText(raw)) {
      return currentKey || names[0];
    }

    const index = Number(raw) - 1;
    if (names[index]) return names[index];

    console.log("Неверный номер.");
  }
}

async function askBindingForOption(system, option) {
  if (!option.binding || typeof option.binding !== "object") {
    option.binding = {
      layerId: "",
      materialKey: "",
      materialQuery: "",
      skipLayer: false,
    };
  }

  const layerId = await chooseLayerForBinding(
    system,
    option.binding.layerId || "",
  );
  option.binding.layerId = layerId;

  if (!layerId) {
    option.binding.materialKey = "";
    option.binding.materialQuery = "";
    option.binding.skipLayer = false;
    return;
  }

  const layer = getLayerById(system, layerId);
  const skipInput = normalizeText(
    await ask(
      `Эта option должна отключать слой? [${option.binding.skipLayer ? "да" : "нет"}]: `,
    ),
  );

  if (skipInput) {
    option.binding.skipLayer = skipInput.startsWith("д");
  }

  if (option.binding.skipLayer) {
    option.binding.materialKey = "";
    option.binding.materialQuery = "";
    return;
  }

  if (layer?.materialOptions) {
    option.binding.materialKey = await chooseMaterialOptionKey(
      layer,
      option.binding.materialKey || "",
    );
    option.binding.materialQuery = option.binding.materialKey;
  } else {
    option.binding.materialKey = "";
    option.binding.materialQuery = normalizeText(
      (
        await ask(
          `Поисковая строка материала [${option.binding.materialQuery || layer?.material || ""}]: `,
        )
      ).trim() ||
        option.binding.materialQuery ||
        layer?.material ||
        "",
    );
  }
}

async function createQuestionOption(system) {
  const value = normalizeId(await ask("Значение option.value: "));
  const label = normalizeText(await ask("Текст option.label: "));
  const option = {
    value,
    label,
    binding: {
      layerId: "",
      materialKey: "",
      materialQuery: "",
      skipLayer: false,
    },
  };

  const needBinding = normalizeText(
    await ask("Нужно привязать option к слою/материалу? (да/нет): "),
  );

  if (needBinding.startsWith("д")) {
    await askBindingForOption(system, option);
  }

  return option;
}

async function manageQuestionOptions(editorState, question) {
  if (!Array.isArray(question.options)) {
    question.options = [];
  }

  while (true) {
    listQuestionOptions(question);
    console.log("\n1. Добавить вариант");
    console.log("2. Изменить вариант");
    console.log("3. Удалить вариант");
    console.log("4. Настроить привязку варианта");
    console.log("5. Сохранить");
    console.log("6. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      question.options.push(await createQuestionOption(editorState.system));
      markDirty(editorState);
    } else if (choice === "2") {
      const index = Number(await ask("Номер варианта: ")) - 1;
      const option = question.options[index];
      if (option) {
        option.value = normalizeId(
          (await ask(`value [${option.value}]: `)).trim() || option.value,
        );
        option.label = normalizeText(
          (await ask(`label [${option.label}]: `)).trim() || option.label,
        );
        markDirty(editorState);
      }
    } else if (choice === "3") {
      const index = Number(await ask("Номер варианта для удаления: ")) - 1;
      if (index >= 0 && index < question.options.length) {
        question.options.splice(index, 1);
        markDirty(editorState);
      }
    } else if (choice === "4") {
      const index = Number(await ask("Номер варианта: ")) - 1;
      const option = question.options[index];
      if (option) {
        await askBindingForOption(editorState.system, option);
        markDirty(editorState);
      }
    } else if (choice === "5") {
      saveEditorState(editorState);
    } else if (choice === "6") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function createQuestion(system) {
  const key = normalizeId(await ask("Ключ вопроса: "));
  const label = normalizeText(await ask("Текст вопроса: "));
  const type =
    normalizeText(await ask("Тип (select/text/number): ")) || "select";
  const requiredInput = normalizeText(await ask("Обязательный? (да/нет): "));

  const question = {
    key,
    label,
    type,
    required: requiredInput ? requiredInput.startsWith("д") : true,
  };

  if (type === "select") {
    question.options = [];
    const addOptionsNow = normalizeText(
      await ask("Добавить варианты ответа сейчас? (да/нет): "),
    );

    if (addOptionsNow.startsWith("д")) {
      while (true) {
        question.options.push(await createQuestionOption(system));
        const again = normalizeText(
          await ask("Добавить еще вариант? (да/нет): "),
        );
        if (!again.startsWith("д")) break;
      }
    }
  }

  return question;
}

async function createMaterialOptionsForLayer() {
  const count = Number(await ask("Сколько material options у слоя?: ")) || 0;
  const materialOptions = {};

  for (let i = 0; i < count; i++) {
    console.log(`\nMaterial option ${i + 1}`);
    const optionName = normalizeText(await ask("Название material option: "));
    if (!optionName) continue;
    materialOptions[optionName] = [];
  }

  return Object.keys(materialOptions).length ? materialOptions : null;
}

async function createLayer() {
  const id = normalizeId(await ask("ID слоя: "));
  const name = normalizeText(await ask("Название слоя: "));
  const packaging = normalizeText(await ask("Фасовки через ; : "))
    .split(";")
    .map((x) => normalizeText(x))
    .filter(Boolean);

  const isOptionalMaterial = normalizeText(
    await ask("У слоя несколько вариантов материалов? (да/нет): "),
  );

  let material = "";
  let materialOptions = null;

  if (isOptionalMaterial.startsWith("д")) {
    materialOptions = await createMaterialOptionsForLayer();
  } else {
    material = normalizeText(await ask("Материал слоя: "));
  }

  return normalizeLayerMaterialOptions({
    id,
    name,
    material,
    packaging,
    materialOptions,
  });
}

async function manageLayerMaterialOptions(editorState, layer) {
  if (!layer.materialOptions || typeof layer.materialOptions !== "object") {
    layer.materialOptions = {};
  }

  while (true) {
    console.log(`\nMaterial options слоя: ${layer.name}`);
    const keys = Object.keys(layer.materialOptions);
    if (!keys.length) {
      console.log("Опций пока нет.");
    } else {
      keys.forEach((key, index) => {
        console.log(`${index + 1}. ${key}`);
      });
    }

    console.log("\n1. Добавить material option");
    console.log("2. Переименовать material option");
    console.log("3. Удалить material option");
    console.log("4. Сохранить");
    console.log("5. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      const optionName = normalizeText(await ask("Название material option: "));
      if (optionName && !layer.materialOptions[optionName]) {
        layer.materialOptions[optionName] = [];
        markDirty(editorState);
      }
    } else if (choice === "2") {
      const index = Number(await ask("Номер material option: ")) - 1;
      const oldKey = keys[index];
      if (oldKey) {
        const newKey = normalizeText(
          (await ask(`Новое имя [${oldKey}]: `)).trim() || oldKey,
        );
        if (newKey && newKey !== oldKey) {
          layer.materialOptions[newKey] = layer.materialOptions[oldKey];
          delete layer.materialOptions[oldKey];
          markDirty(editorState);
        }
      }
    } else if (choice === "3") {
      const index =
        Number(await ask("Номер material option для удаления: ")) - 1;
      const key = keys[index];
      if (key) {
        delete layer.materialOptions[key];
        markDirty(editorState);
      }
    } else if (choice === "4") {
      saveEditorState(editorState);
    } else if (choice === "5") {
      if (!Object.keys(layer.materialOptions).length) {
        layer.materialOptions = null;
      }
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function askMultiCoefficients(layerName, packaging, current = {}) {
  console.log(`\nКоэффициенты для ${layerName} / ${packaging}`);
  if (Object.keys(current).length) {
    console.log(`Текущие: ${JSON.stringify(current)}`);
  }
  const raw = await ask("Введи в формате pasteA=0,pasteB=0,pasteC=0: ");
  const result = {};
  raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k) result[normalizeText(k)] = parseNumber(v || "0");
    });
  return result;
}

async function askSingleCoefficient(layerName, packaging, current = 0) {
  console.log(`\nКоэффициент для ${layerName} / ${packaging}`);
  console.log(`Текущий: ${current}`);
  return parseNumber(await ask("Введите число (например 1,24): "));
}

function syncColorsWithLayers(system) {
  if (!Array.isArray(system.colors)) return;

  for (const color of system.colors) {
    if (!color.layers || typeof color.layers !== "object") color.layers = {};

    for (const layer of system.layers) {
      if (!color.layers[layer.id]) color.layers[layer.id] = {};
      for (const pack of layer.packaging || []) {
        if (typeof color.layers[layer.id][pack] === "undefined") {
          color.layers[layer.id][pack] = {};
        }
      }

      const validPacks = new Set(layer.packaging || []);
      Object.keys(color.layers[layer.id]).forEach((pack) => {
        if (!validPacks.has(pack)) delete color.layers[layer.id][pack];
      });
    }

    const validLayerIds = new Set(system.layers.map((layer) => layer.id));
    Object.keys(color.layers).forEach((layerId) => {
      if (!validLayerIds.has(layerId)) delete color.layers[layerId];
    });
  }
}

async function chooseMathType(mathTypesState) {
  const items = mathTypesState.items;
  listMathTypes(null, mathTypesState);
  if (!items.length) return null;
  const index = Number(await ask("Номер типа колеровки: ")) - 1;
  return items[index] || null;
}

async function createValueLinkedColor(system, mathTypesState) {
  const id = normalizeId(await ask("ID цвета: "));
  const name = normalizeText(await ask("Полное имя цвета: "));
  const shortName = normalizeText(await ask("Короткое имя: "));
  const value = parseNumber(await ask("Значение цвета: "));
  const selectedType = await chooseMathType(mathTypesState);
  const coloringTypeId =
    selectedType?.id || normalizeId(await ask("ID типа колеровки: "));

  const color = {
    id,
    name,
    shortName,
    value,
    coloringTypeId,
    application: {},
  };

  ensureColorApplication(system, color);
  return color;
}

async function createLayerSingleColor(system) {
  const id = normalizeId(await ask("ID цвета: "));
  const name = normalizeText(await ask("Название цвета: "));
  const code = normalizeText(await ask("Код цвета: "));
  const layers = {};

  for (const layer of system.layers) {
    layers[layer.id] = {};
    for (const pack of layer.packaging || []) {
      layers[layer.id][pack] = await askSingleCoefficient(layer.name, pack, 0);
    }
  }

  return { id, name, code, layers };
}

async function createLayerMultiColor(system) {
  const id = normalizeId(await ask("ID цвета: "));
  const name = normalizeText(await ask("Название цвета: "));
  const code = normalizeText(await ask("Код цвета: "));
  const layers = {};

  for (const layer of system.layers) {
    layers[layer.id] = {};
    for (const pack of layer.packaging || []) {
      layers[layer.id][pack] = await askMultiCoefficients(layer.name, pack);
    }
  }

  return { id, name, code, layers };
}

async function createColor(system, mathTypesState) {
  const model = getColorModel(system);

  if (model === "value-linked") {
    return createValueLinkedColor(system, mathTypesState);
  }

  if (model === "layer-coefficients-single") {
    return createLayerSingleColor(system);
  }

  return createLayerMultiColor(system);
}

async function manageQuestions(editorState) {
  const system = editorState.system;

  while (true) {
    listQuestions(system);
    console.log("\n1. Добавить вопрос");
    console.log("2. Изменить вопрос");
    console.log("3. Удалить вопрос");
    console.log("4. Варианты select-вопроса");
    console.log("5. Сохранить");
    console.log("6. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      system.questions.push(await createQuestion(system));
      markDirty(editorState);
    } else if (choice === "2") {
      const index = Number(await ask("Номер вопроса: ")) - 1;
      const question = system.questions[index];
      if (question) {
        const oldType = question.type;

        question.key = normalizeId(
          (await ask(`Ключ [${question.key}]: `)).trim() || question.key,
        );
        question.label = normalizeText(
          (await ask(`Текст [${question.label}]: `)).trim() || question.label,
        );
        question.type = normalizeText(
          (await ask(`Тип [${question.type}]: `)).trim() || question.type,
        );
        const required = normalizeText(
          await ask(`Обязательный [${question.required ? "да" : "нет"}]: `),
        );
        if (required) question.required = required.startsWith("д");

        if (question.type === "select" && !Array.isArray(question.options)) {
          question.options = [];
        }

        if (oldType === "select" && question.type !== "select") {
          delete question.options;
        }

        if (oldType !== "select" && question.type === "select") {
          question.options = [];
        }

        markDirty(editorState);
      }
    } else if (choice === "3") {
      const index = Number(await ask("Номер вопроса для удаления: ")) - 1;
      if (index >= 0 && index < system.questions.length) {
        system.questions.splice(index, 1);
        markDirty(editorState);
      }
    } else if (choice === "4") {
      const index = Number(await ask("Номер select-вопроса: ")) - 1;
      const question = system.questions[index];
      if (question && question.type === "select") {
        if (!Array.isArray(question.options)) {
          question.options = [];
        }
        await manageQuestionOptions(editorState, question);
      } else {
        console.log("Это не select-вопрос.");
      }
    } else if (choice === "5") {
      saveEditorState(editorState);
    } else if (choice === "6") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function managePackaging(editorState, layer) {
  const system = editorState.system;

  while (true) {
    console.log(`\nФасовки слоя: ${layer.name}`);
    (layer.packaging || []).forEach((pack, index) => {
      console.log(`${index + 1}. ${pack}`);
    });
    console.log("\n1. Добавить фасовку");
    console.log("2. Переименовать фасовку");
    console.log("3. Удалить фасовку");
    console.log("4. Сохранить");
    console.log("5. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      const pack = normalizeText(await ask("Новая фасовка: "));
      if (pack && !layer.packaging.includes(pack)) {
        layer.packaging.push(pack);

        if (getColorModel(system) !== "value-linked") {
          for (const color of system.colors) {
            if (!color.layers[layer.id]) color.layers[layer.id] = {};
            color.layers[layer.id][pack] =
              getColorModel(system) === "layer-coefficients-single" ? 0 : {};
          }
        } else {
          ensureAllRegistryColorApplications(
            system,
            editorState.colorRegistryState.items,
          );
        }

        markDirty(editorState);
      }
    } else if (choice === "2") {
      const index = Number(await ask("Номер фасовки: ")) - 1;
      const oldPack = layer.packaging[index];
      if (oldPack) {
        const newPack = normalizeText(
          (await ask(`Новое имя [${oldPack}]: `)).trim() || oldPack,
        );
        layer.packaging[index] = newPack;

        if (getColorModel(system) !== "value-linked") {
          for (const color of system.colors) {
            if (!color.layers[layer.id]) color.layers[layer.id] = {};
            color.layers[layer.id][newPack] = color.layers[layer.id][oldPack];
            if (newPack !== oldPack) delete color.layers[layer.id][oldPack];
          }
        } else {
          for (const color of editorState.colorRegistryState.items) {
            ensureColorApplication(system, color);
            color.application[layer.id][newPack] = color.application[layer.id][
              oldPack
            ] || {
              enabled: false,
              coefficient: 0,
            };
            if (newPack !== oldPack) {
              delete color.application[layer.id][oldPack];
            }
          }
        }

        markDirty(editorState);
      }
    } else if (choice === "3") {
      const index = Number(await ask("Номер фасовки для удаления: ")) - 1;
      const pack = layer.packaging[index];
      if (pack) {
        layer.packaging.splice(index, 1);

        if (getColorModel(system) !== "value-linked") {
          for (const color of system.colors) {
            if (color.layers[layer.id]) delete color.layers[layer.id][pack];
          }
        } else {
          for (const color of editorState.colorRegistryState.items) {
            if (color.application?.[layer.id]) {
              delete color.application[layer.id][pack];
            }
          }
        }

        markDirty(editorState);
      }
    } else if (choice === "4") {
      saveEditorState(editorState);
    } else if (choice === "5") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function manageLayers(editorState) {
  const system = editorState.system;

  while (true) {
    listLayers(system);
    console.log("\n1. Добавить слой");
    console.log("2. Изменить слой");
    console.log("3. Удалить слой");
    console.log("4. Управление фасовками слоя");
    console.log("5. Material options слоя");
    console.log("6. Сохранить");
    console.log("7. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      const layer = await createLayer();
      system.layers.push(layer);

      if (getColorModel(system) !== "value-linked") {
        syncColorsWithLayers(system);
      } else {
        ensureAllRegistryColorApplications(
          system,
          editorState.colorRegistryState.items,
        );
      }

      markDirty(editorState);
    } else if (choice === "2") {
      const index = Number(await ask("Номер слоя: ")) - 1;
      const layer = system.layers[index];
      if (layer) {
        const oldId = layer.id;
        const newId = normalizeId(
          (await ask(`ID [${layer.id}]: `)).trim() || layer.id,
        );
        layer.name = normalizeText(
          (await ask(`Название [${layer.name}]: `)).trim() || layer.name,
        );

        const modeInput = normalizeText(
          await ask(
            `Режим материала [${layer.materialOptions ? "options" : "single"}] (single/options): `,
          ),
        );

        if (modeInput === "single") {
          layer.material = normalizeText(
            (await ask(`Материал [${layer.material || ""}]: `)).trim() ||
              layer.material,
          );
          layer.materialOptions = null;
        } else if (modeInput === "options") {
          if (!layer.materialOptions) {
            layer.materialOptions = {};
          }
          layer.material = "";
        } else if (!layer.materialOptions) {
          layer.material = normalizeText(
            (await ask(`Материал [${layer.material || ""}]: `)).trim() ||
              layer.material,
          );
        }

        layer.id = newId;
        normalizeLayerMaterialOptions(layer);

        if (oldId !== newId) {
          if (getColorModel(system) !== "value-linked") {
            for (const color of system.colors) {
              color.layers[newId] = color.layers[oldId] || {};
              delete color.layers[oldId];
            }
          } else {
            for (const color of editorState.colorRegistryState.items) {
              ensureColorApplication(system, color);
              color.application[newId] = color.application[oldId] || {};
              delete color.application[oldId];
            }
          }

          for (const question of system.questions) {
            if (!Array.isArray(question.options)) continue;
            for (const option of question.options) {
              if (option.binding?.layerId === oldId) {
                option.binding.layerId = newId;
              }
            }
          }
        }

        markDirty(editorState);
      }
    } else if (choice === "3") {
      const index = Number(await ask("Номер слоя для удаления: ")) - 1;
      const layer = system.layers[index];
      if (layer) {
        system.layers.splice(index, 1);

        if (getColorModel(system) !== "value-linked") {
          for (const color of system.colors) {
            delete color.layers[layer.id];
          }
        } else {
          for (const color of editorState.colorRegistryState.items) {
            delete color.application?.[layer.id];
          }
        }

        for (const question of system.questions) {
          if (!Array.isArray(question.options)) continue;
          for (const option of question.options) {
            if (option.binding?.layerId === layer.id) {
              option.binding.layerId = "";
              option.binding.materialKey = "";
              option.binding.materialQuery = "";
              option.binding.skipLayer = false;
            }
          }
        }

        markDirty(editorState);
      }
    } else if (choice === "4") {
      const index = Number(await ask("Номер слоя: ")) - 1;
      const layer = system.layers[index];
      if (layer) {
        await managePackaging(editorState, layer);
      }
    } else if (choice === "5") {
      const index = Number(await ask("Номер слоя: ")) - 1;
      const layer = system.layers[index];
      if (layer) {
        await manageLayerMaterialOptions(editorState, layer);
        markDirty(editorState);
      }
    } else if (choice === "6") {
      saveEditorState(editorState);
    } else if (choice === "7") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function manageLayerMultiCoefficients(system, color, editorState) {
  while (true) {
    console.log(
      `\nРедактирование коэффициентов цвета: ${color.name} (${color.code})`,
    );
    system.layers.forEach((layer, layerIndex) => {
      console.log(`${layerIndex + 1}. ${layer.name}`);
      (layer.packaging || []).forEach((pack, packIndex) => {
        const current = color.layers?.[layer.id]?.[pack] || {};
        console.log(
          `   ${layerIndex + 1}.${packIndex + 1} ${pack} -> ${JSON.stringify(current)}`,
        );
      });
    });
    console.log("\n1. Изменить коэффициенты");
    console.log("2. Сохранить");
    console.log("3. Назад");

    const choice = await ask("Выбор: ");
    if (choice === "1") {
      const layerIndex = Number(await ask("Номер слоя: ")) - 1;
      const layer = system.layers[layerIndex];
      if (!layer) continue;

      const packIndex = Number(await ask("Номер фасовки в этом слое: ")) - 1;
      const pack = (layer.packaging || [])[packIndex];
      if (!pack) continue;

      if (!color.layers[layer.id]) color.layers[layer.id] = {};
      color.layers[layer.id][pack] = await askMultiCoefficients(
        layer.name,
        pack,
        color.layers[layer.id][pack] || {},
      );
      markDirty(editorState);
    } else if (choice === "2") {
      saveEditorState(editorState);
    } else if (choice === "3") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function manageLayerSingleCoefficients(system, color, editorState) {
  while (true) {
    console.log(
      `\nРедактирование коэффициентов цвета: ${color.name} (${color.code})`,
    );
    system.layers.forEach((layer, layerIndex) => {
      console.log(`${layerIndex + 1}. ${layer.name}`);
      (layer.packaging || []).forEach((pack, packIndex) => {
        const current = color.layers?.[layer.id]?.[pack] ?? 0;
        console.log(
          `   ${layerIndex + 1}.${packIndex + 1} ${pack} -> ${current}`,
        );
      });
    });
    console.log("\n1. Изменить коэффициент");
    console.log("2. Сохранить");
    console.log("3. Назад");

    const choice = await ask("Выбор: ");
    if (choice === "1") {
      const layerIndex = Number(await ask("Номер слоя: ")) - 1;
      const layer = system.layers[layerIndex];
      if (!layer) continue;

      const packIndex = Number(await ask("Номер фасовки в этом слое: ")) - 1;
      const pack = (layer.packaging || [])[packIndex];
      if (!pack) continue;

      if (!color.layers[layer.id]) color.layers[layer.id] = {};
      color.layers[layer.id][pack] = await askSingleCoefficient(
        layer.name,
        pack,
        color.layers[layer.id][pack] ?? 0,
      );
      markDirty(editorState);
    } else if (choice === "2") {
      saveEditorState(editorState);
    } else if (choice === "3") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function manageValueLinkedColor(editorState, color) {
  while (true) {
    console.log(`\nРедактирование цвета: ${color.name}`);
    console.log(`ID: ${color.id}`);
    console.log(`Короткое имя: ${color.shortName || "-"}`);
    console.log(`Значение: ${color.value ?? 0}`);
    console.log(`Тип колеровки: ${color.coloringTypeId || "-"}`);
    console.log("\n1. Изменить ID");
    console.log("2. Изменить полное имя");
    console.log("3. Изменить короткое имя");
    console.log("4. Изменить значение");
    console.log("5. Изменить тип колеровки");
    console.log("6. Сохранить");
    console.log("7. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      color.id = normalizeId(
        (await ask(`ID [${color.id}]: `)).trim() || color.id,
      );
      markDirty(editorState);
    } else if (choice === "2") {
      color.name = normalizeText(
        (await ask(`Полное имя [${color.name}]: `)).trim() || color.name,
      );
      markDirty(editorState);
    } else if (choice === "3") {
      color.shortName = normalizeText(
        (await ask(`Короткое имя [${color.shortName || ""}]: `)).trim() ||
          color.shortName,
      );
      markDirty(editorState);
    } else if (choice === "4") {
      const raw = await ask(`Значение [${color.value ?? 0}]: `);
      if (normalizeText(raw)) {
        color.value = parseNumber(raw);
        markDirty(editorState);
      }
    } else if (choice === "5") {
      const type = await chooseMathType(editorState.mathTypesState);
      if (type) {
        color.coloringTypeId = type.id;
        markDirty(editorState);
      }
    } else if (choice === "6") {
      saveEditorState(editorState);
    } else if (choice === "7") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function manageValueLinkedApplication(editorState, color) {
  const system = editorState.system;
  ensureColorApplication(system, color);

  while (true) {
    console.log(`\nКоэффициенты применения цвета: ${color.name}`);
    system.layers.forEach((layer, layerIndex) => {
      console.log(`${layerIndex + 1}. ${layer.name}`);
      (layer.packaging || []).forEach((pack, packIndex) => {
        const current = color.application?.[layer.id]?.[pack] || {
          enabled: false,
          coefficient: 0,
        };
        console.log(
          `   ${layerIndex + 1}.${packIndex + 1} ${pack} -> enabled=${current.enabled}, coefficient=${current.coefficient}`,
        );
      });
    });

    console.log("\n1. Изменить применение");
    console.log("2. Сохранить");
    console.log("3. Назад");

    const choice = await ask("Выбор: ");
    if (choice === "1") {
      const layerIndex = Number(await ask("Номер слоя: ")) - 1;
      const layer = system.layers[layerIndex];
      if (!layer) continue;

      const packIndex = Number(await ask("Номер фасовки в этом слое: ")) - 1;
      const pack = (layer.packaging || [])[packIndex];
      if (!pack) continue;

      ensureColorApplication(system, color);

      const current = color.application[layer.id][pack] || {
        enabled: false,
        coefficient: 0,
      };

      const enabledInput = normalizeText(
        await ask(`Колеровать? [${current.enabled ? "да" : "нет"}]: `),
      );

      if (enabledInput) {
        current.enabled = enabledInput.startsWith("д");
      }

      if (current.enabled) {
        const coefficientInput = await ask(
          `Коэффициент [${current.coefficient}]: `,
        );
        if (normalizeText(coefficientInput)) {
          current.coefficient = parseNumber(coefficientInput);
        }
      } else {
        current.coefficient = 0;
      }

      color.application[layer.id][pack] = current;
      markDirty(editorState);
    } else if (choice === "2") {
      saveEditorState(editorState);
    } else if (choice === "3") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function manageColors(editorState) {
  const system = editorState.system;
  const model = getColorModel(system);

  while (true) {
    listColors(system, editorState.colorRegistryState);
    console.log("\n1. Добавить цвет");
    console.log("2. Изменить цвет");
    console.log("3. Изменить коэффициенты цвета");
    console.log("4. Удалить цвет");
    console.log("5. Сохранить");
    console.log("6. Назад");

    const choice = await ask("Выбор: ");

    if (model === "value-linked") {
      const registryColors = editorState.colorRegistryState.items;

      if (choice === "1") {
        registryColors.push(
          await createColor(system, editorState.mathTypesState),
        );
        markDirty(editorState);
      } else if (choice === "2") {
        const index = Number(await ask("Номер цвета: ")) - 1;
        const color = registryColors[index];
        if (color) {
          await manageValueLinkedColor(editorState, color);
        }
      } else if (choice === "3") {
        const index = Number(await ask("Номер цвета: ")) - 1;
        const color = registryColors[index];
        if (color) {
          await manageValueLinkedApplication(editorState, color);
        }
      } else if (choice === "4") {
        const index = Number(await ask("Номер цвета для удаления: ")) - 1;
        if (index >= 0 && index < registryColors.length) {
          registryColors.splice(index, 1);
          markDirty(editorState);
        }
      } else if (choice === "5") {
        saveEditorState(editorState);
      } else if (choice === "6") {
        const ok = await confirmSaveIfDirty(editorState);
        if (ok) break;
      }

      continue;
    }

    if (choice === "1") {
      system.colors.push(await createColor(system, editorState.mathTypesState));
      markDirty(editorState);
    } else if (choice === "2") {
      const index = Number(await ask("Номер цвета: ")) - 1;
      const color = system.colors[index];
      if (color) {
        color.id = normalizeId(
          (await ask(`ID [${color.id}]: `)).trim() || color.id,
        );
        color.name = normalizeText(
          (await ask(`Название [${color.name}]: `)).trim() || color.name,
        );
        color.code = normalizeText(
          (await ask(`Код [${color.code}]: `)).trim() || color.code,
        );
        markDirty(editorState);
      }
    } else if (choice === "3") {
      const index = Number(await ask("Номер цвета: ")) - 1;
      const color = system.colors[index];
      if (color) {
        if (model === "layer-coefficients-single") {
          await manageLayerSingleCoefficients(system, color, editorState);
        } else {
          await manageLayerMultiCoefficients(system, color, editorState);
        }
      }
    } else if (choice === "4") {
      const index = Number(await ask("Номер цвета для удаления: ")) - 1;
      if (index >= 0 && index < system.colors.length) {
        system.colors.splice(index, 1);
        markDirty(editorState);
      }
    } else if (choice === "5") {
      saveEditorState(editorState);
    } else if (choice === "6") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function createMathType() {
  console.log("\nСоздание типа колеровки");
  const id = normalizeId(await ask("ID типа: "));
  const name = normalizeText(await ask("Название типа: "));
  const productName = normalizeText(await ask("Товар: "));
  const productPrice = parseNumber(await ask("Цена товара: "));
  const tubeSize = parseNumber(await ask("Размер тубы: "));
  const rounding =
    normalizeText(await ask("Округление (ceil/floor/round): ")) || "ceil";
  const formula = normalizeText(await ask("Формула текстом: "));
  const description = normalizeText(await ask("Описание: "));
  const usesColorValueInput = normalizeText(
    await ask("Использует значение цвета? (да/нет): "),
  );
  const usesApplicationCoefficientsInput = normalizeText(
    await ask("Использует коэффициенты применения? (да/нет): "),
  );

  return {
    id,
    name,
    productName,
    productPrice,
    tubeSize,
    rounding,
    usesColorValue: usesColorValueInput
      ? usesColorValueInput.startsWith("д")
      : true,
    usesApplicationCoefficients: usesApplicationCoefficientsInput
      ? usesApplicationCoefficientsInput.startsWith("д")
      : true,
    formula,
    description,
  };
}

async function manageMathTypes(editorState) {
  while (true) {
    const items = listMathTypes(editorState.system, editorState.mathTypesState);
    console.log("\n1. Добавить тип колеровки");
    console.log("2. Изменить тип колеровки");
    console.log("3. Удалить тип колеровки");
    console.log("4. Сохранить");
    console.log("5. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      items.push(await createMathType());
      markDirty(editorState);
    } else if (choice === "2") {
      const index = Number(await ask("Номер типа: ")) - 1;
      const item = items[index];
      if (item) {
        item.id = normalizeId(
          (await ask(`ID [${item.id}]: `)).trim() || item.id,
        );
        item.name = normalizeText(
          (await ask(`Название [${item.name}]: `)).trim() || item.name,
        );
        item.productName = normalizeText(
          (await ask(`Товар [${item.productName || ""}]: `)).trim() ||
            item.productName,
        );

        const priceRaw = await ask(`Цена [${item.productPrice || 0}]: `);
        if (normalizeText(priceRaw)) item.productPrice = parseNumber(priceRaw);

        const tubeRaw = await ask(`Размер тубы [${item.tubeSize || 0}]: `);
        if (normalizeText(tubeRaw)) item.tubeSize = parseNumber(tubeRaw);

        item.rounding = normalizeText(
          (await ask(`Округление [${item.rounding || "ceil"}]: `)).trim() ||
            item.rounding,
        );

        item.formula = normalizeText(
          (await ask(`Формула [${item.formula || ""}]: `)).trim() ||
            item.formula,
        );

        item.description = normalizeText(
          (await ask(`Описание [${item.description || ""}]: `)).trim() ||
            item.description,
        );

        const usesColorValueRaw = await ask(
          `Использует значение цвета [${item.usesColorValue ? "да" : "нет"}]: `,
        );
        if (normalizeText(usesColorValueRaw)) {
          item.usesColorValue =
            normalizeText(usesColorValueRaw).startsWith("д");
        }

        const usesApplicationRaw = await ask(
          `Использует коэффициенты применения [${item.usesApplicationCoefficients ? "да" : "нет"}]: `,
        );
        if (normalizeText(usesApplicationRaw)) {
          item.usesApplicationCoefficients =
            normalizeText(usesApplicationRaw).startsWith("д");
        }

        markDirty(editorState);
      }
    } else if (choice === "3") {
      const index = Number(await ask("Номер типа для удаления: ")) - 1;
      if (index >= 0 && index < items.length) {
        items.splice(index, 1);
        markDirty(editorState);
      }
    } else if (choice === "4") {
      saveEditorState(editorState);
    } else if (choice === "5") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function createSystem() {
  console.log("\nСоздание новой системы колеровки");
  const name = normalizeText(await ask("Название системы: "));
  const id = normalizeId(
    (await ask("ID системы (Enter = сгенерировать): ")).trim() || name,
  );
  const description = normalizeText(await ask("Описание: "));
  const useColorConfig = normalizeText(
    await ask("Использовать отдельный реестр цветов? (да/нет): "),
  );

  const system = {
    id,
    name,
    description,
    questions: [],
    layers: [],
    colors: [],
  };

  if (useColorConfig.startsWith("д")) {
    const registryFile = normalizeText(
      await ask("Файл реестра цветов (например traverto-naturale-color.js): "),
    );
    const registryKey = normalizeText(
      await ask(
        "Имя экспорта массива цветов (например travertoNaturaleColors): ",
      ),
    );
    const colorModel =
      normalizeText(
        await ask(
          "Модель цвета (value-linked/layer-coefficients-single/layer-coefficients-multi): ",
        ),
      ) || "value-linked";
    const mathRegistryFile =
      normalizeText(
        await ask(`Файл типов колеровки [${DEFAULT_MATH_REGISTRY_FILE}]: `),
      ) || DEFAULT_MATH_REGISTRY_FILE;
    const mathRegistryExport =
      normalizeText(
        await ask(
          `Экспорт типов колеровки [${DEFAULT_MATH_REGISTRY_EXPORT}]: `,
        ),
      ) || DEFAULT_MATH_REGISTRY_EXPORT;

    system.colorConfig = {
      registryKey,
      registryFile,
      colorModel,
      mathRegistryFile,
      mathRegistryExport,
    };

    ensureFileExists(resolveLocalPath(registryFile), registryKey, []);
    ensureFileExists(
      resolveLocalPath(mathRegistryFile),
      mathRegistryExport,
      [],
    );
  }

  const qCount = Number(await ask("Сколько вопросов добавить сейчас?: ")) || 0;
  for (let i = 0; i < qCount; i++) {
    console.log(`\nВопрос ${i + 1}`);
    system.questions.push(await createQuestion(system));
  }

  const lCount = Number(await ask("Сколько слоев добавить сейчас?: ")) || 0;
  for (let i = 0; i < lCount; i++) {
    console.log(`\nСлой ${i + 1}`);
    system.layers.push(await createLayer());
  }

  ensureSystemShape(system);

  const mathTypesState = {
    items: loadMathRegistry(system),
  };

  const colorRegistryState = system.colorConfig
    ? {
        items: ensureAllRegistryColorApplications(
          system,
          loadColorRegistry(system) || [],
        ),
      }
    : null;

  const cCount = Number(await ask("Сколько цветов добавить сейчас?: ")) || 0;
  for (let i = 0; i < cCount; i++) {
    console.log(`\nЦвет ${i + 1}`);
    const color = await createColor(system, mathTypesState);
    if (getColorModel(system) === "value-linked") {
      colorRegistryState.items.push(color);
    } else {
      system.colors.push(color);
    }
  }

  return {
    registryItem: {
      id,
      name,
      file: `./${id}.js`,
      active: true,
    },
    system,
    colorRegistryState,
    mathTypesState,
  };
}

async function editSystemCard(editorState) {
  const { registry, registryItem, system } = editorState;

  console.log(`\nКарточка системы: ${registryItem.name}`);
  const newName = normalizeText(
    (await ask(`Название [${system.name}]: `)).trim() || system.name,
  );
  const newDescription = normalizeText(
    (await ask(`Описание [${system.description}]: `)).trim() ||
      system.description,
  );
  const activeInput = normalizeText(
    await ask(`Активна? [${registryItem.active ? "да" : "нет"}]: `),
  );

  system.name = newName;
  system.description = newDescription;
  registryItem.name = newName;
  if (activeInput) {
    registryItem.active = activeInput.startsWith("д");
  }

  const hasColorConfig = normalizeText(
    await ask(
      `Есть отдельный реестр цветов? [${system.colorConfig ? "да" : "нет"}]: `,
    ),
  );

  if (hasColorConfig) {
    if (hasColorConfig.startsWith("д")) {
      const current = system.colorConfig || {};
      const registryFile = normalizeText(
        (
          await ask(`Файл реестра цветов [${current.registryFile || ""}]: `)
        ).trim() || current.registryFile,
      );
      const registryKey = normalizeText(
        (
          await ask(`Имя экспорта цветов [${current.registryKey || ""}]: `)
        ).trim() || current.registryKey,
      );
      const colorModel = normalizeText(
        (
          await ask(
            `Модель цвета [${current.colorModel || "layer-coefficients-multi"}]: `,
          )
        ).trim() ||
          current.colorModel ||
          "layer-coefficients-multi",
      );
      const mathRegistryFile = normalizeText(
        (
          await ask(
            `Файл типов колеровки [${current.mathRegistryFile || DEFAULT_MATH_REGISTRY_FILE}]: `,
          )
        ).trim() ||
          current.mathRegistryFile ||
          DEFAULT_MATH_REGISTRY_FILE,
      );
      const mathRegistryExport = normalizeText(
        (
          await ask(
            `Экспорт типов колеровки [${current.mathRegistryExport || DEFAULT_MATH_REGISTRY_EXPORT}]: `,
          )
        ).trim() ||
          current.mathRegistryExport ||
          DEFAULT_MATH_REGISTRY_EXPORT,
      );

      system.colorConfig = {
        registryFile,
        registryKey,
        colorModel,
        mathRegistryFile,
        mathRegistryExport,
      };

      ensureFileExists(resolveLocalPath(registryFile), registryKey, []);
      ensureFileExists(
        resolveLocalPath(mathRegistryFile),
        mathRegistryExport,
        [],
      );

      editorState.colorRegistryState = {
        items: ensureAllRegistryColorApplications(
          system,
          loadColorRegistry(system) || [],
        ),
      };
      editorState.mathTypesState = {
        items: loadMathRegistry(system),
      };
    } else {
      system.colorConfig = null;
      editorState.colorRegistryState = null;
      editorState.mathTypesState = {
        items: loadMathRegistry(system),
      };
    }
  }

  editorState.registry = registry;
  editorState.registryDirty = true;
  markDirty(editorState);
}

async function editExistingSystem(registry, registryItem) {
  const system = ensureSystemShape(loadSystemByFile(registryItem.file));
  const editorState = {
    registry,
    registryItem,
    system,
    colorRegistryState: system.colorConfig
      ? {
          items: ensureAllRegistryColorApplications(
            system,
            loadColorRegistry(system) || [],
          ),
        }
      : null,
    mathTypesState: {
      items: loadMathRegistry(system),
    },
    dirty: false,
    registryDirty: false,
  };

  while (true) {
    console.log(
      `\nРедактирование системы: ${editorState.system.name}${editorState.dirty || editorState.registryDirty ? " *" : ""}`,
    );
    console.log("1. Карточка системы");
    console.log("2. Вопросы системы");
    console.log("3. Слои системы");
    console.log("4. Цвета и коэффициенты");
    console.log("5. Типы колеровки");
    console.log("6. Сохранить");
    console.log("7. Назад");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      await editSystemCard(editorState);
    } else if (choice === "2") {
      await manageQuestions(editorState);
    } else if (choice === "3") {
      await manageLayers(editorState);
      syncColorsWithLayers(editorState.system);
    } else if (choice === "4") {
      await manageColors(editorState);
    } else if (choice === "5") {
      await manageMathTypes(editorState);
    } else if (choice === "6") {
      saveEditorState(editorState);
    } else if (choice === "7") {
      const ok = await confirmSaveIfDirty(editorState);
      if (ok) break;
    }
  }
}

async function deleteSystem(registry) {
  const item = await chooseSystem(registry, "Номер системы для удаления: ");
  if (!item) return;

  const confirm = normalizeText(await ask(`Удалить ${item.name}? (да/нет): `));
  if (!confirm.startsWith("д")) return;

  const filePath = resolveSystemPath(item.file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  registry.registry = registry.registry.filter((x) => x.id !== item.id);
  saveRegistry(registry);
}

function ensureDefaultMathRegistry() {
  const filePath = resolveLocalPath(DEFAULT_MATH_REGISTRY_FILE);
  if (fs.existsSync(filePath)) return;

  const seed = [
    {
      id: "acs-metrico-1-color",
      name: "ACS METRICO 1 цвет",
      productName: "acs metrico 80",
      productPrice: 2200,
      tubeSize: 80,
      rounding: "ceil",
      usesColorValue: true,
      usesApplicationCoefficients: true,
      formula:
        "ceil((sum(layerBucketCount * applicationCoefficient) * colorValue) / tubeSize)",
      description:
        "Сначала берутся только те слои и фасовки, где enabled=true. Для каждой позиции считается количество упаковок, умножается на coefficient, затем суммы складываются, умножаются на значение цвета и делятся на размер тубы. Результат округляется вверх.",
    },
  ];

  writeJsExport(filePath, DEFAULT_MATH_REGISTRY_EXPORT, seed);
}

async function main() {
  ensureDefaultMathRegistry();

  while (true) {
    const registry = loadRegistry();

    console.log("\nАдминка систем колеровки");
    listSystems(registry);
    console.log("\n1. Создать новую систему");
    console.log("2. Изменить существующую систему");
    console.log("3. Удалить систему");
    console.log("4. Выход");

    const choice = await ask("Выбор: ");

    if (choice === "1") {
      const created = await createSystem();

      registry.registry.push(created.registryItem);
      saveRegistry(registry);
      saveSystemByFile(
        created.registryItem.file,
        ensureSystemShape(created.system),
      );

      if (created.colorRegistryState) {
        saveColorRegistry(created.system, created.colorRegistryState.items);
      }

      if (created.mathTypesState) {
        saveMathRegistry(created.system, created.mathTypesState.items);
      }

      console.log("Система создана.");
    } else if (choice === "2") {
      const item = await chooseSystem(
        registry,
        "Номер системы для изменения: ",
      );
      if (item) {
        await editExistingSystem(registry, item);
      }
    } else if (choice === "3") {
      await deleteSystem(registry);
      console.log("Удаление завершено.");
    } else if (choice === "4") {
      break;
    }
  }

  rl.close();
}

main();
