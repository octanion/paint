import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { materialsDB } from "./materials-db.js";

function normalize(str) {
    return String(str || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function flattenMaterials(db) {
    const items = [];

    for (const [country, materials] of Object.entries(db)) {
        for (const [name, variants] of Object.entries(materials)) {
            items.push({
                id: `${country}:${name}`,
                country,
                name,
                variants: (variants || []).map((v, index) => ({
                    id: `${country}:${name}:${index}`,
                    name,
                    packageVolume: v.variant,
                    price: Number(v.price_rub || 0),
                                                              consumption: Number(v.coverage_m2 || 0),
                })),
            });
        }
    }

    return items;
}

function searchMaterials(materials, query) {
    const q = normalize(query);
    if (!q) return [];

    return materials
    .map((m) => {
        const hay = normalize(`${m.name} ${m.country}`);
        const exact = hay === q;
        const starts = hay.startsWith(q);
        const includes = hay.includes(q);
        const score = exact ? 300 : starts ? 200 : includes ? 100 : 0;
        return { ...m, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
}

function findBestCombinationForLayer(layer, S) {
    const products = layer.products || [];

    if (!products.length || S <= 0 || !Number.isFinite(S)) {
        return {
            layerId: layer.id,
            name: layer.name,
            order: layer.order,
            used: false,
            totalCoveredArea: 0,
            totalPrice: 0,
            products: [],
        };
    }

    const maxConsumption = products.reduce(
        (max, p) => Math.max(max, p.consumption || 0),
                                           0,
    );

    if (maxConsumption <= 0) {
        return {
            layerId: layer.id,
            name: layer.name,
            order: layer.order,
            used: false,
            totalCoveredArea: 0,
            totalPrice: 0,
            products: [],
        };
    }

    const limit = Math.ceil(S + maxConsumption);

    if (!Number.isFinite(limit) || limit <= 0) {
        return {
            layerId: layer.id,
            name: layer.name,
            order: layer.order,
            used: false,
            totalCoveredArea: 0,
            totalPrice: 0,
            products: [],
        };
    }

    const normalizedProducts = products
    .map((p) => ({
        ...p,
        consumptionRaw: p.consumption || 0,
        consumption: Math.max(1, Math.round(p.consumption || 0)),
                 price: Math.round(p.price || 0),
    }))
    .filter((p) => p.consumption > 0 && p.price > 0);

    const INF = Number.MAX_SAFE_INTEGER;
    const dp = new Array(limit + 1).fill(INF);
    const prev = new Array(limit + 1).fill(null);

    dp[0] = 0;

    for (let area = 0; area <= limit; area++) {
        if (dp[area] === INF) continue;

        for (let i = 0; i < normalizedProducts.length; i++) {
            const p = normalizedProducts[i];
            const c = p.consumption || 0;
            const price = p.price || 0;

            if (c <= 0) continue;

            const nextArea = area + c;
            if (nextArea > limit) continue;

            const nextCost = dp[area] + price;

            if (nextCost < dp[nextArea]) {
                dp[nextArea] = nextCost;
                prev[nextArea] = {
                    prevArea: area,
                    productIndex: i,
                };
            }
        }
    }

    let bestArea = -1;
    let bestCost = INF;

    for (let area = Math.ceil(S); area <= limit; area++) {
        if (dp[area] < bestCost) {
            bestCost = dp[area];
            bestArea = area;
        }
    }

    if (bestArea === -1 || bestCost === INF) {
        return {
            layerId: layer.id,
            name: layer.name,
            order: layer.order,
            used: false,
            totalCoveredArea: 0,
            totalPrice: 0,
            products: [],
        };
    }

    const countByIndex = {};
    let curArea = bestArea;

    while (curArea > 0 && prev[curArea]) {
        const { prevArea, productIndex } = prev[curArea];
        countByIndex[productIndex] = (countByIndex[productIndex] || 0) + 1;
        curArea = prevArea;
    }

    const productsResult = [];
    let totalCoveredArea = 0;
    let totalPrice = 0;

    Object.entries(countByIndex).forEach(([indexStr, count]) => {
        const idx = Number(indexStr);
        const p = normalizedProducts[idx];

        const coveredArea = (p.consumptionRaw || 0) * count;
        const price = p.price || 0;
        const layerPrice = price * count;

        totalCoveredArea += coveredArea;
        totalPrice += layerPrice;

        productsResult.push({
            productId: p.id,
            name: p.name,
            packageVolume: p.packageVolume,
            price,
            consumption: p.consumptionRaw,
            count,
            coveredArea,
            totalPrice: layerPrice,
        });
    });

    productsResult.sort(
        (a, b) => a.price - b.price || a.name.localeCompare(b.name, "ru"),
    );

    return {
        layerId: layer.id,
        name: layer.name,
        order: layer.order,
        used: true,
        totalCoveredArea,
        totalPrice,
        products: productsResult,
    };
}

function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
        value,
    );
}

function printMaterial(material) {
    console.log(`\nМатериал: ${material.name} (${material.country})`);
    console.log("Доступные варианты:");
    material.variants.forEach((v, i) => {
        console.log(
            `${i + 1}. ${v.packageVolume} — ${formatNumber(v.consumption)} м² — ${formatNumber(v.price)} ₽`,
        );
    });
}

const materials = flattenMaterials(materialsDB);

async function runCli() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

    console.log("Поиск материала по materials-db.js");
    const query = await ask("Введите название материала: ");
    const found = searchMaterials(materials, query);

    if (!found.length) {
        console.log("Ничего не найдено. Проверь написание.");
        rl.close();
        return;
    }

    console.log("\nНайдено:");
    found.slice(0, 10).forEach((m, i) => {
        console.log(`${i + 1}. ${m.name} (${m.country})`);
    });

    const pickRaw = await ask("\nВыбери номер материала: ");
    const pick = Number(pickRaw);
    const material = found[pick - 1];

    if (!material) {
        console.log("Неверный номер.");
        rl.close();
        return;
    }

    printMaterial(material);

    const areaRaw = await ask("\nВведите площадь в м²: ");
    const area = Number(String(areaRaw).replace(",", "."));

    if (!Number.isFinite(area) || area <= 0) {
        console.log("Площадь должна быть больше 0.");
        rl.close();
        return;
    }

    const layer = {
        id: material.id,
        name: material.name,
        order: 1,
        products: material.variants,
    };

    const result = findBestCombinationForLayer(layer, area);

    if (!result.used || !result.products.length) {
        console.log("Не удалось подобрать комбинацию.");
        rl.close();
        return;
    }

    console.log(`\nОптимальная комбинация для ${formatNumber(area)} м²:`);
    result.products.forEach((p) => {
        console.log(
            `- ${p.name}, ${p.packageVolume}: ${p.count} шт. × ${formatNumber(p.price)} ₽ = ${formatNumber(p.totalPrice)} ₽; покрытие ${formatNumber(p.coveredArea)} м²`,
        );
    });

    console.log(`\nИтого:`);
    console.log(`- Общая стоимость: ${formatNumber(result.totalPrice)} ₽`);
    console.log(
        `- Общая покрываемая площадь: ${formatNumber(result.totalCoveredArea)} м²`,
    );
    console.log(`- Запас: ${formatNumber(result.totalCoveredArea - area)} м²`);

    rl.close();
}

export {
    normalize,
    flattenMaterials,
    searchMaterials,
    findBestCombinationForLayer,
    formatNumber,
        printMaterial,
};

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    runCli();
}
