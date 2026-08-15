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
