const steps: Record<string, [string[], string[]]> = {
  oats: [
    [
      "Разогрей готовую овсянку на воде.",
      "Нарежь банан и добавь его вместе с йогуртом.",
    ],
    [
      "Warm the oats cooked in water.",
      "Slice the banana and add it with the yogurt.",
    ],
  ],
  eggs: [
    [
      "Нарежь варёный картофель и помидоры.",
      "Очисти варёные яйца, нарежь и подай с овощами.",
    ],
    [
      "Cut the boiled potatoes and tomatoes.",
      "Peel and slice the hard-boiled eggs and serve with the vegetables.",
    ],
  ],
  rice: [
    [
      "Нарежь запечённую куриную грудку.",
      "Прогрей отварные рис и брокколи. Подай с курицей и добавь масло.",
    ],
    [
      "Slice the baked chicken breast.",
      "Warm the cooked rice and broccoli. Serve with the chicken and drizzle with oil.",
    ],
  ],
  buckwheat: [
    [
      "Нарежь варёную куриную грудку и помидоры.",
      "Добавь готовую гречку и заправь маслом.",
    ],
    [
      "Slice the cooked chicken breast and tomatoes.",
      "Add cooked buckwheat and dress with oil.",
    ],
  ],
  light: [
    [
      "Нарежь варёную куриную грудку.",
      "Раздели отварную брокколи на соцветия и подай с курицей и нарезанным огурцом.",
    ],
    [
      "Slice the cooked chicken breast.",
      "Separate the cooked broccoli into florets and serve with the chicken and sliced cucumber.",
    ],
  ],
  yogurt: [
    [
      "Удали сердцевину яблока и нарежь его кубиками.",
      "Добавь яблоко в йогурт.",
    ],
    ["Core and dice the apple.", "Stir the apple into the yogurt."],
  ],
  cottage: [
    [
      "Промой ягоды и измельчи грецкие орехи.",
      "Выложи творог в миску и добавь ягоды с орехами.",
    ],
    [
      "Rinse the berries and chop the walnuts.",
      "Spoon the cottage cheese into a bowl and top with berries and nuts.",
    ],
  ],
  "avocado-toast": [
    [
      "Подсуши ржаной хлеб и разомни мякоть авокадо.",
      "Намажь авокадо на тост и выложи ломтики варёного яйца.",
    ],
    [
      "Toast the rye bread and mash the avocado.",
      "Spread it on the toast and top with sliced hard-boiled egg.",
    ],
  ],
  salmon: [
    [
      "Промой шпинат и выложи его на тарелку.",
      "Добавь готовую киноа и запечённого лосося.",
    ],
    [
      "Wash the spinach and arrange it on a plate.",
      "Add cooked quinoa and baked salmon.",
    ],
  ],
  lentils: [
    [
      "Нарежь сладкий перец.",
      "Смешай отварные чечевицу и гречку, добавь перец и заправь маслом.",
    ],
    [
      "Dice the bell pepper.",
      "Mix the cooked lentils and buckwheat, then add the pepper and oil.",
    ],
  ],
  shrimp: [
    [
      "Нарежь помидоры и смешай их с оливковым маслом.",
      "Добавь готовую пасту и варёные очищенные креветки.",
    ],
    [
      "Chop the tomatoes and toss with olive oil.",
      "Add cooked pasta and peeled cooked shrimp.",
    ],
  ],
  tofu: [
    [
      "Нарежь тофу и нашинкуй капусту.",
      "Обжарь тофу на антипригарной сковороде и подай с готовым рисом и капустой.",
    ],
    [
      "Cube the tofu and shred the cabbage.",
      "Brown the tofu in a nonstick pan and serve with cooked rice and cabbage.",
    ],
  ],
  tuna: [
    [
      "Слей жидкость с тунца и нарежь овощи.",
      "Смешай с отварным нутом и разомни крупные куски тунца вилкой.",
    ],
    [
      "Drain the tuna and chop the vegetables.",
      "Toss with cooked chickpeas and break up the large pieces of tuna with a fork.",
    ],
  ],
  beans: [
    [
      "Нарежь отварной картофель и натри морковь.",
      "Смешай с готовой фасолью и заправь маслом.",
    ],
    [
      "Dice the cooked potatoes and grate the carrot.",
      "Mix with the cooked beans and dress with oil.",
    ],
  ],
  "yogurt-pear": [
    [
      "Удали сердцевину груши и нарежь её ломтиками.",
      "Добавь йогурт и посыпь измельчёнными орехами.",
    ],
    [
      "Core and slice the pear.",
      "Add yogurt and sprinkle with chopped walnuts.",
    ],
  ],
};

export function starterMealSteps(id: string, locale: "ru" | "en"): string[] {
  return steps[id]?.[locale === "ru" ? 0 : 1] ?? [];
}
