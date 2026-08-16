const WARDROBE_DATA = {
  profile: {
    sizes: "Tops M, trousers 32/32, shoes UK 10, prefers slim-to-straight fit",
    build: "6ft, triangular build: narrow shoulders, slim arms, muscular legs",
  },
  capsules: [
    {
      name: "Weekend",
      items: [
        { name: "Arket Corduroy Overshirt, khaki green", price: 75, url: "https://www.arket.com/en-gb/product/corduroy-overshirt-khaki-green-1244163009/" },
        { name: "Arket Heavy Knit Wool Jumper, oatmeal", price: 75, url: "https://www.arket.com/en-gb/men/clothing/knitwear/crew-necks/" },
        { name: "Percival Casa Martini Knitted Polo, forest green", price: 110, url: "https://www.percivalclo.com/products/casa-martini-polo-cotton-forest" },
        { name: "Percival Straight Leg Heritage Jeans, mid wash blue", price: 120, url: "https://www.percivalclo.com/products/straight-leg-heritage-denim-jeans-cotton-mid-wash-blue" },
        { name: "Percival Straight Leg Chino, stone/ecru", price: 100, url: "https://www.percivalclo.com/products/straight-leg-chino-ecru" },
        { name: "Clarks Desert Boot, sand suede", price: 99, url: "https://www.clarks.com/en-gb/desert-boot/26155527-p" },
      ],
      outfits: [
        {
          name: "Saturday park run",
          pieces: "Overshirt (open) + plain white tee + mid-wash jeans + desert boots",
          uses: [
            "Arket Corduroy Overshirt, khaki green",
            "Plain white tee",
            "Percival Straight Leg Heritage Jeans, mid wash blue",
            "Clarks Desert Boot, sand suede",
          ],
        },
        {
          name: "Coffee & school pickup",
          pieces: "Oatmeal knit over an Oxford shirt (collar out) + stone chinos + desert boots",
          uses: [
            "Arket Heavy Knit Wool Jumper, oatmeal",
            "White Oxford shirt",
            "Percival Straight Leg Chino, stone/ecru",
            "Clarks Desert Boot, sand suede",
          ],
        },
        {
          name: "The one that fixes it",
          pieces: "Forest knitted polo tucked into stone chinos + desert boots",
          uses: [
            "Percival Casa Martini Knitted Polo, forest green",
            "Percival Straight Leg Chino, stone/ecru",
            "Clarks Desert Boot, sand suede",
          ],
        },
        {
          name: "Cooler weekend layering",
          pieces: "Overshirt over the forest polo + mid-wash jeans + desert boots",
          uses: [
            "Arket Corduroy Overshirt, khaki green",
            "Percival Casa Martini Knitted Polo, forest green",
            "Percival Straight Leg Heritage Jeans, mid wash blue",
            "Clarks Desert Boot, sand suede",
          ],
        },
      ],
    },
    {
      name: "Work",
      items: [
        { name: "Arket Cotton Hopsack Blazer", price: 109, url: "https://www.arket.com/en-gb/men/clothing/suits/" },
        { name: "Percival Blake Double Pleated Trousers, navy", price: 100, url: "https://www.percivalclo.com/collections/pleated-trousers" },
        { name: "Percival Casa Martini Knitted Polo, navy", price: 110, url: "https://www.percivalclo.com/products/casa-martini-polo-cotton-navy" },
        { name: "Kleman Padror Derby, black", price: 145, url: "https://www.percivalclo.com/products/kleman-padror-shoe-noir" },
      ],
      outfits: [
        {
          name: "Everyday office",
          pieces: "Navy knitted polo + navy trousers + Kleman derbies",
          uses: [
            "Percival Casa Martini Knitted Polo, navy",
            "Percival Blake Double Pleated Trousers, navy",
            "Kleman Padror Derby, black",
          ],
        },
        {
          name: "Casual Friday",
          pieces: "Oxford shirt untucked, sleeves rolled + black jeans + Kleman derbies",
          uses: ["White Oxford shirt", "Black jeans", "Kleman Padror Derby, black"],
        },
        {
          name: "External stakeholder day",
          pieces: "Blazer over the navy knitted polo + navy trousers + Kleman derbies",
          uses: [
            "Arket Cotton Hopsack Blazer",
            "Percival Casa Martini Knitted Polo, navy",
            "Percival Blake Double Pleated Trousers, navy",
            "Kleman Padror Derby, black",
          ],
        },
        {
          name: "Full smart-casual",
          pieces: "Blazer + white Oxford (open collar) + black jeans + Kleman derbies",
          uses: [
            "Arket Cotton Hopsack Blazer",
            "White Oxford shirt",
            "Black jeans",
            "Kleman Padror Derby, black",
          ],
        },
      ],
    },
    {
      name: "Evening",
      items: [
        { name: "Percival x Solovair Hi-Shine Tassel Loafer, black", price: 160, url: "https://www.percivalclo.com/products/solovair-hi-shine-tassle-loafer-black" },
        { name: "Arket Fine Knit Merino Turtleneck, black", price: 69, url: "https://www.arket.com/en-ww/men/clothing/knitwear/merino/" },
      ],
      outfits: [
        {
          name: "The suit, reworked",
          pieces: "Navy suit jacket + merino turtleneck (no shirt/tie) + loafers",
          uses: [
            "Navy suit jacket",
            "Arket Fine Knit Merino Turtleneck, black",
            "Percival x Solovair Hi-Shine Tassel Loafer, black",
          ],
        },
        {
          name: "Dinner without the full suit",
          pieces: "Merino turtleneck + suit trousers on their own + loafers",
          uses: [
            "Arket Fine Knit Merino Turtleneck, black",
            "Navy suit trousers",
            "Percival x Solovair Hi-Shine Tassel Loafer, black",
          ],
        },
        {
          name: "Existing winner, finished",
          pieces: "Black crew + white shirt (collar out) + suit trousers + loafers",
          uses: [
            "Black crew neck",
            "White Oxford shirt",
            "Navy suit trousers",
            "Percival x Solovair Hi-Shine Tassel Loafer, black",
          ],
        },
      ],
    },
  ],
  // Colour analysis, reduced to the three axes that actually change what
  // suits someone: the undertone of the skin, how light or deep the overall
  // colouring is, and how much contrast there is between hair, skin and eyes.
  //
  // Hex values exist so the palette can be shown as swatches rather than
  // buried in a prompt — a colour brief you can't see is one you can't correct.
  colourAnalysis: {
    undertones: [
      {
        value: "warm",
        label: "Warm — golden or peachy",
        best: [
          { name: "camel", hex: "#C19A6B" },
          { name: "cream", hex: "#F5EBD9" },
          { name: "olive green", hex: "#6B7043" },
          { name: "rust", hex: "#A8452A" },
          { name: "terracotta", hex: "#C86B4A" },
          { name: "warm brown", hex: "#6F4E37" },
          { name: "mustard", hex: "#C99A2E" },
          { name: "forest green", hex: "#2F4F3A" },
          { name: "tomato red", hex: "#C43A2E" },
          { name: "teal", hex: "#2E6E6B" },
        ],
        avoid: ["stark black", "pure brilliant white", "icy pastels", "cool blue-greys", "fuchsia"],
      },
      {
        value: "cool",
        label: "Cool — pink or blue",
        best: [
          { name: "navy", hex: "#1F2A44" },
          { name: "charcoal", hex: "#36393D" },
          { name: "true white", hex: "#FBFBFD" },
          { name: "burgundy", hex: "#6E1E3C" },
          { name: "emerald", hex: "#1E6F52" },
          { name: "cool grey", hex: "#8A8F98" },
          { name: "sky blue", hex: "#6E9BC5" },
          { name: "plum", hex: "#5A3A5A" },
          { name: "raspberry", hex: "#A62A56" },
          { name: "ice blue", hex: "#C7D8E8" },
        ],
        avoid: ["orange", "mustard", "camel", "warm golden browns", "tomato red"],
      },
      {
        value: "neutral",
        label: "Neutral — balanced",
        best: [
          { name: "soft navy", hex: "#2C3E56" },
          { name: "teal", hex: "#2E7D7B" },
          { name: "jade", hex: "#3E8E6F" },
          { name: "soft white", hex: "#F3F1EC" },
          { name: "taupe", hex: "#8B7E72" },
          { name: "mid grey", hex: "#7C7C7C" },
          { name: "dusty pink", hex: "#C9928E" },
          { name: "denim blue", hex: "#4A6C8C" },
          { name: "slate", hex: "#55606E" },
          { name: "moss", hex: "#6E7F5C" },
        ],
        avoid: ["neon brights", "very muddy shades"],
      },
      {
        value: "olive",
        label: "Olive — yellow-green",
        best: [
          { name: "olive", hex: "#6B7043" },
          { name: "cream", hex: "#F0E6D2" },
          { name: "rust", hex: "#A8452A" },
          { name: "teal", hex: "#2E6E6B" },
          { name: "terracotta", hex: "#C86B4A" },
          { name: "deep brown", hex: "#4A362A" },
          { name: "sage", hex: "#9CA98B" },
          { name: "bronze", hex: "#A97142" },
          { name: "off-white", hex: "#EFE9DC" },
          { name: "forest green", hex: "#2F4F3A" },
        ],
        avoid: ["pale icy pastels", "cool baby pink", "bright orange", "muddy yellow"],
      },
    ],
    depths: [
      { value: "light", label: "Light", note: "Keep colours in their lighter, softer register — very dark shades can overwhelm." },
      { value: "medium", label: "Medium", note: "Mid-depth colours suit best; lighter and deeper shades both work in moderation." },
      { value: "deep", label: "Deep", note: "Rich, deep versions of these colours suit best; washed-out pastels can look flat." },
    ],
    contrasts: [
      { value: "low", label: "Low", note: "Hair, skin and eyes are close in depth, so tonal outfits in adjacent shades flatter most — avoid pairing very dark with very light." },
      { value: "medium", label: "Medium", note: "Moderate contrast — both tonal and contrasting pairings work." },
      { value: "high", label: "High", note: "Marked contrast between hair and skin, so strong pairings (deep with light) suit well; head-to-toe mid-tones can look washed out." },
    ],
  },

  // Where to look for a garment the wardrobe is missing.
  //
  // These are search templates, not product links, deliberately: outfit ideas
  // describe garments freely ("straight-leg mid-wash jeans"), and no fixed
  // product list can cover that. A search always resolves, never goes out of
  // stock, and leaves size and budget to the wearer. {q} is the garment
  // description, URL-encoded.
  //
  // Editable in Settings — retailers change their search paths, and these
  // shouldn't need a code change to fix.
  defaultBrands: [
    { name: "M&S", search: "https://www.marksandspencer.com/search?q={q}" },
    { name: "Autograph", search: "https://www.marksandspencer.com/search?q=autograph+{q}" },
    { name: "H&M", search: "https://www2.hm.com/en_gb/search-results.html?q={q}" },
    { name: "Paul Smith", search: "https://www.paulsmith.com/uk/search?q={q}" },
    { name: "Arket", search: "https://www.arket.com/en-gb/search.html?q={q}" },
    { name: "Percival", search: "https://www.percivalclo.com/search?q={q}" },
    { name: "Clarks", search: "https://www.clarks.com/en-gb/search?q={q}" },
  ],

  // Pieces the original capsule plan assumes are already owned. Offered as a
  // one-tap seed on the Wardrobe tab so outfit ownership badges mean something
  // before anything has been logged by hand.
  assumedBasics: [
    { name: "Navy suit jacket", category: "Outerwear" },
    { name: "Navy suit trousers", category: "Trousers & denim" },
    { name: "White Oxford shirt", category: "Tops & shirts" },
    { name: "Plain white tee", category: "Tops & shirts" },
    { name: "Black crew neck", category: "Knitwear" },
    { name: "Black jeans", category: "Trousers & denim" },
  ],
  shoppingListPriorityOrder: [
    "Clarks Desert Boot, sand suede",
    "Arket Corduroy Overshirt, khaki green",
    "Percival Straight Leg Heritage Jeans, mid wash blue",
    "Percival Casa Martini Knitted Polo, forest green",
    "Kleman Padror Derby, black",
    "Arket Cotton Hopsack Blazer",
    "Percival Straight Leg Chino, stone/ecru",
    "Percival Blake Double Pleated Trousers, navy",
    "Percival Casa Martini Knitted Polo, navy",
    "Arket Heavy Knit Wool Jumper, oatmeal",
    "Arket Fine Knit Merino Turtleneck, black",
    "Percival x Solovair Hi-Shine Tassel Loafer, black",
  ],
};
