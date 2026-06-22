export const colorSystem = {
  "id": "traverto-system-colorr",
  "name": "Траверто Натурале",
  "description": "Декоративная штукатурка на основе извести для сухих помещений без контакта с водой.",
  "questions": [
    {
      "key": "includedeepprimer",
      "label": "Нужен грунт глубокого проникновения?",
      "type": "select",
      "required": true,
      "options": []
    },
    {
      "key": "color",
      "label": "Выберите цвет",
      "type": "select",
      "required": true,
      "options": []
    },
    {
      "key": "aream2",
      "label": "Введите метраж",
      "type": "number",
      "required": true
    },
    {
      "key": "laktype",
      "label": "Выберите лак",
      "type": "select",
      "required": true,
      "options": [
        {
          "value": "none",
          "label": "Без лака",
          "binding": {
            "layerId": "protectivecoat",
            "materialKey": "",
            "materialQuery": "",
            "skipLayer": true
          }
        },
        {
          "value": "matte",
          "label": "Матовый",
          "binding": {
            "layerId": "protectivecoat",
            "materialKey": "Лессирующее покрытие КРЕАТИВ матовая",
            "materialQuery": "Лессирующее покрытие КРЕАТИВ матовая",
            "skipLayer": false
          }
        },
        {
          "value": "glossy",
          "label": "Глянцевый",
          "binding": {
            "layerId": "protectivecoat",
            "materialKey": "Лессирующее покрытие КРЕАТИВ глянцевая",
            "materialQuery": "Лессирующее покрытие КРЕАТИВ глянцевая",
            "skipLayer": false
          }
        }
      ]
    }
  ],
  "layers": [
    {
      "id": "deepprimer",
      "name": "Грунт глубокого проникновения",
      "material": "Грунт ФИКС СУПЕР",
      "packaging": [
        "1л/1кг",
        "5л/5кг"
      ],
      "materialOptions": null
    },
    {
      "id": "primerbase",
      "name": "Грунт-подложка",
      "material": "Грунт ФОН",
      "packaging": [
        "1,6кг",
        "2,5л/4,1кг"
      ],
      "materialOptions": null
    },
    {
      "id": "travertonaturale",
      "name": "Декоративная штукатурка",
      "material": "Штукатурка декоративная ТРАВЕРТО натурале",
      "packaging": [
        "15кг"
      ],
      "materialOptions": null
    },
    {
      "id": "protectivecoat",
      "name": "Защитный лак",
      "material": "Лессирующее покрытие КРЕАТИВ",
      "packaging": [
        "1,0л/1кг",
        "2,5л/2,5кг"
      ],
      "materialOptions": {
        "Лессирующее покрытие КРЕАТИВ матовая": [
          {
            "variant": "2,5л/2,5кг",
            "coverage_m2": 30,
            "price_rub": 7000
          },
          {
            "variant": "1,0л/1кг",
            "coverage_m2": 12,
            "price_rub": 3000
          }
        ],
        "Лессирующее покрытие КРЕАТИВ глянцевая": [
          {
            "variant": "2,5л/2,5кг",
            "coverage_m2": 30,
            "price_rub": 7000
          },
          {
            "variant": "1,0л/1кг",
            "coverage_m2": 12,
            "price_rub": 3000
          }
        ]
      }
    }
  ],
  "colorConfig": {
    "registryKey": "travertoNaturaleColors",
    "registryFile": "traverto-naturale-color.js",
    "colorModel": "value-linked",
    "mathRegistryFile": "type-colerovka-math.js",
    "mathRegistryExport": "colorerovkaMathTypes"
  },
  "colors": []
};
