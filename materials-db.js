import { materialsDB as ggp } from "./ggp.js";
import { materialsDB as gruntPodlozhka } from "./grunt-podlozhka.js";
import { materialsDB as paint } from "./paint.js";
import { materialsDB as silk } from "./silk.js";
import { materialsDB as dekorShtukaturki } from "./dekor-shtukaturki.js";
import { materialsDB as finishLaki } from "./finish-laki.js";

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
);
