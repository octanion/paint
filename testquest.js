import readline from "node:readline";
import { materialsDB } from "./materials-db.js";
import {
    flattenMaterials,
    searchMaterials,
    findBestCombinationForLayer,
    formatNumber,
} from "./calc-material.js";

const materials = flattenMaterials(materialsDB);
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function printSearchResults(found) {
    console.log("\nНайдено:");
    found.slice(0, 10).forEach((m, i) => {
        console.log(`${i + 1}. ${m.name} (${m.country})`);
    });
}

function printLayerResult(result, targetArea) {
    console.log(`\n${result.name}:`);
    result.products.forEach((p) => {
        console.log(
            `- ${p.packageVolume}: ${p.count} шт. × ${formatNumber(p.price)} ₽ = ${formatNumber(p.totalPrice)} ₽; покрытие ${formatNumber(p.coveredArea)} м²`,
        );
    });
    console.log(`Цена слоя: ${formatNumber(result.totalPrice)} ₽`);
    console.log(`Покрытие слоя: ${formatNumber(result.totalCoveredArea)} м²`);
    console.log(
        `Запас: ${formatNumber(result.totalCoveredArea - targetArea)} м²`,
    );
}

async function pickMaterialForStep(title) {
    while (true) {
        const query = await ask(`\n${title} (Enter = пропустить): `);

        if (!query.trim()) {
            return null;
        }

        const found = searchMaterials(materials, query);

        if (!found.length) {
            console.log("Ничего не найдено. Попробуй другое название.");
            continue;
        }

        printSearchResults(found);
        const pickRaw = await ask(
            "Выбери номер материала (Enter = заново найти): ",
        );

        if (!pickRaw.trim()) continue;

        const pick = Number(pickRaw);
        const material = found[pick - 1];

        if (!material) {
            console.log("Неверный номер.");
            continue;
        }

        return material;
    }
}

async function runCalculation() {
    console.log("\nРасчет многослойного покрытия");
    const areaRaw = await ask("Введите площадь в м²: ");
    const area = Number(String(areaRaw).replace(",", "."));

    if (!Number.isFinite(area) || area <= 0) {
        console.log("Площадь должна быть больше 0.");
        return;
    }

    const steps = [
        { key: "layer1", title: "1) Какой будет 1 слой?" },
        { key: "primer", title: "2) Какая будет грунт подложка?" },
        { key: "material", title: "3) Какой будет материал?" },
        { key: "protection", title: "4) Какая будет защита?" },
    ];

    const pickedLayers = [];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const material = await pickMaterialForStep(step.title);

        if (!material) continue;

        const result = findBestCombinationForLayer(
            {
                id: material.id,
                name: material.name,
                order: i + 1,
                products: material.variants,
            },
            area,
        );

        if (result.used && result.products.length) {
            pickedLayers.push(result);
        } else {
            console.log(`Не удалось подобрать комбинацию для: ${material.name}`);
        }
    }

    if (!pickedLayers.length) {
        console.log("\nНичего не выбрано для расчета.");
        return;
    }

    console.log(`\nРезультат для площади ${formatNumber(area)} м²:`);

    let grandTotal = 0;

    pickedLayers
    .sort((a, b) => a.order - b.order)
    .forEach((result) => {
        printLayerResult(result, area);
        grandTotal += result.totalPrice;
    });

    console.log(`\nОбщая цена: ${formatNumber(grandTotal)} ₽`);
}

async function main() {
    while (true) {
        await runCalculation();
        const again = await ask("\nСделать еще один просчет? (да/нет): ");
        const normalized = String(again || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[^a-zа-я0-9]+/gi, " ")
        .trim();

        if (!["да", "д", "yes", "y"].includes(normalized)) break;
    }

    rl.close();
}

main();
