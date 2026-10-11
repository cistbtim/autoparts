// Decoy ("canary") parts — fake catalogue rows that exist only in the database.
//
// Real staff and customers never see them: src/lib/api.js leaves these ids out of every read of the parts table.
// Someone who copies the catalogue by calling the database directly gets them anyway. If one of these SKUs, OE
// numbers or names turns up on another website or price list, the catalogue was copied from here.
// (Admin → Scrapyard Match → "Decoys" lists them with ready-made Google searches.)
//
// Keep this list in sync with the rows in the parts table; do not delete or edit those rows.
export const DECOYS = [
  {
    "id": 46380,
    "sku": "BM006D-872Q2",
    "name": "BUMPER SUPPORT BRACKET LH 2FU",
    "oe": "57005483647",
    "make": "BMW",
    "model": "X3 F25 XDRIVE30D"
  },
  {
    "id": 46381,
    "sku": "BM005D-923NG",
    "name": "HEADLIGHT WASHER COVER RH 3NU",
    "oe": "63532404060",
    "make": "BMW",
    "model": "E70-2-FACELIFT X5 XDRIVE 30D/40D EXCLUSIVE/STEPTRONIC"
  },
  {
    "id": 46382,
    "sku": "VW009A-879ZT",
    "name": "FENDER LINER CLIP SET ZQ8",
    "oe": "86971086231",
    "make": "VOLKSWAGEN",
    "model": "BEETLE"
  },
  {
    "id": 46383,
    "sku": "VW020J-930W2",
    "name": "MIRROR GLASS HEATED LH VKL",
    "oe": "90928647929",
    "make": "VOLKSWAGEN",
    "model": "PASSAT B8 LUXURY"
  },
  {
    "id": 46384,
    "sku": "TY003E-902VW",
    "name": "THERMOSTAT HOUSING PU7",
    "oe": "38572408130",
    "make": "TOYOTA",
    "model": "COROLLA PRESTIGE EARLY"
  },
  {
    "id": 46385,
    "sku": "TY003D-9588F",
    "name": "WATER PUMP PULLEY 6TY",
    "oe": "28896125912",
    "make": "TOYOTA",
    "model": "COROLLA <QUEST>"
  },
  {
    "id": 46386,
    "sku": "BZ003B-89672",
    "name": "GRILLE EMBLEM FRAME 6VS",
    "oe": "49239311781",
    "make": "MERCEDES-BENZ",
    "model": "W203 C-CLASS 4 DOOR LATER"
  },
  {
    "id": 46387,
    "sku": "BZ007B-805BH",
    "name": "DOOR HANDLE COVER RH KAV",
    "oe": "99418263382",
    "make": "MERCEDES-BENZ",
    "model": "W115 1ST SERIES"
  },
  {
    "id": 46388,
    "sku": "AD003J-906LU",
    "name": "FOG LAMP BEZEL LH 4YP",
    "oe": "87748943626",
    "make": "AUDI",
    "model": "A3 SPORTBACK"
  },
  {
    "id": 46389,
    "sku": "FD006F-84522",
    "name": "BONNET HINGE RH AAM",
    "oe": "45570473169",
    "make": "FORD",
    "model": "F-SERIES"
  },
  {
    "id": 46390,
    "sku": "HY005A-902Z7",
    "name": "AIR FILTER BOX LID DK8",
    "oe": "42318212949",
    "make": "HYUNDAI",
    "model": "ATOS1"
  },
  {
    "id": 46391,
    "sku": "RV045B-858V8",
    "name": "RADIATOR SUPPORT BRACKET LH CZU",
    "oe": "57752190497",
    "make": "LAND ROVER",
    "model": "RANGE ROVER P38A"
  }
];

export const DECOY_IDS = DECOYS.map(d => d.id);
