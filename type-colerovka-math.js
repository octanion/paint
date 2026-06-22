export const colorerovkaMathTypes = [
  {
    "id": "acs-metrico-1-color",
    "name": "ACS METRICO 1 цвет",
    "productName": "acs metrico 80",
    "productPrice": 2200,
    "tubeSize": 80,
    "rounding": "ceil",
    "usesColorValue": true,
    "usesApplicationCoefficients": true,
    "formula": "ceil((sum(layerBucketCount * applicationCoefficient) * colorValue) / tubeSize)",
    "description": "Сначала берутся только те слои и фасовки, где enabled=true. Для каждой позиции считается количество упаковок, умножается на coefficient, затем суммы складываются, умножаются на значение цвета и делятся на размер тубы. Результат округляется вверх."
  }
];
