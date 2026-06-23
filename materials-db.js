import { materialsDB as ggp } from "./ggp.js";
import { materialsDB as gruntPodlozhka } from "./grunt-podlozhka.js";
import { materialsDB as paint } from "./paint.js";
import { materialsDB as silk } from "./silk.js";
import { materialsDB as dekorShtukaturki } from "./dekor-shtukaturki.js";
import { materialsDB as finishLaki } from "./finish-laki.js";
import { materialsDB as пески } from "./пески.js";

export const materialsCategories = [
  {
    "id": "ggp",
    "name": "Грунт глубокого проникновения",
    "aliases": [
      "ггп"
    ],
    "file": "./ggp.js",
    "importName": "ggp"
  },
  {
    "id": "grunt-podlozhka",
    "name": "Грунт-подложка",
    "aliases": [
      "грунт подложка",
      "подложка"
    ],
    "file": "./grunt-podlozhka.js",
    "importName": "gruntPodlozhka"
  },
  {
    "id": "paint",
    "name": "Гладкие краски",
    "aliases": [
      "краски"
    ],
    "file": "./paint.js",
    "importName": "paint"
  },
  {
    "id": "silk",
    "name": "Шелка",
    "aliases": [
      "шелк"
    ],
    "file": "./silk.js",
    "importName": "silk"
  },
  {
    "id": "dekor-shtukaturki",
    "name": "Декоративные штукатурки",
    "aliases": [
      "штукатурки"
    ],
    "file": "./dekor-shtukaturki.js",
    "importName": "dekorShtukaturki"
  },
  {
    "id": "finish-laki",
    "name": "Защитные лаки",
    "aliases": [
      "лаки"
    ],
    "file": "./finish-laki.js",
    "importName": "finishLaki"
  },
  {
    "id": "пески",
    "name": "Пески",
    "aliases": [],
    "file": "./пески.js",
    "importName": "пески"
  }
];

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
  ggp,
  gruntPodlozhka,
  paint,
  silk,
  dekorShtukaturki,
  finishLaki,
  пески,
);
