/* Voice-only brand aliases. Add entries here without changing the ranking logic. */
(function (root) {
  root.InventoryBrandAliases = [
    { brand: 'HARDMAN', aliases: [
      { value: 'hardman', strength: 1 },
      { value: 'hart man', strength: 0.94 },
      { value: 'hard man', strength: 0.96 },
      { value: 'hartman', strength: 0.94 }
    ] },
    { brand: 'SAPOLIO', aliases: [
      { value: 'sapolio', strength: 1 },
      { value: 'sapoleo', strength: 0.9 },
      { value: 'sapo lio', strength: 0.92 }
    ] },
    {
      brand: 'JIRPRIX',
      aliases: [
        { value: 'jirprix', strength: 1 },
        { value: 'jir prix', strength: 0.96 },
        { value: 'gir prix', strength: 0.92 },
        { value: 'jirprik', strength: 0.9 },
        { value: 'yirpriz', strength: 0.9 },
        { value: 'hill pix', strength: 0.84 },
        { value: 'prix', strength: 0.7, partial: true },
        { value: 'jir', strength: 0.68, partial: true }
      ]
    },
    {
      brand: 'DARYSA',
      aliases: [
        { value: 'darysa', strength: 1 },
        { value: 'darisa', strength: 0.9 }
      ]
    }
  ];
  if (typeof module !== 'undefined') module.exports = root.InventoryBrandAliases;
})(typeof window !== 'undefined' ? window : globalThis);
