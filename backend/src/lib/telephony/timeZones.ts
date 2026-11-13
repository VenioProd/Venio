/**
 * Fuseaux horaires possibles d'un numéro (lot P, multi-pays). `libphonenumber-js`
 * ne les donne pas : la table ci-dessous les déduit du pays, et de l'indicatif
 * régional pour le Canada et les États-Unis.
 *
 * Un numéro peut avoir plusieurs fuseaux possibles (indicatif à cheval sur deux
 * fuseaux, mobile espagnol ou portugais qu'on ne peut pas situer) : la plage
 * d'appel doit alors être respectée dans **chacun** d'eux. Aucun fuseau connu :
 * l'appel est refusé. Table à faire valider (voir le rapport du lot).
 */

const SINGLE_ZONE: Record<string, string> = {
  AT: 'Europe/Vienna',
  BE: 'Europe/Brussels',
  BG: 'Europe/Sofia',
  HR: 'Europe/Zagreb',
  CY: 'Asia/Nicosia',
  CZ: 'Europe/Prague',
  DK: 'Europe/Copenhagen',
  EE: 'Europe/Tallinn',
  FI: 'Europe/Helsinki',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  GR: 'Europe/Athens',
  HU: 'Europe/Budapest',
  IE: 'Europe/Dublin',
  IT: 'Europe/Rome',
  LV: 'Europe/Riga',
  LT: 'Europe/Vilnius',
  LU: 'Europe/Luxembourg',
  MT: 'Europe/Malta',
  NL: 'Europe/Amsterdam',
  PL: 'Europe/Warsaw',
  RO: 'Europe/Bucharest',
  SK: 'Europe/Bratislava',
  SI: 'Europe/Ljubljana',
  SE: 'Europe/Stockholm',
  GB: 'Europe/London',
}

const ET = 'America/New_York'
const CT = 'America/Chicago'
const MT = 'America/Denver'
const PT = 'America/Los_Angeles'

/** Indicatifs régionaux des États-Unis → fuseaux possibles. Les numéros non géographiques (800…) n'y sont pas. */
const US_AREA_CODES: [string, string[]][] = [
  // Est
  [
    '201 202 203 207 212 215 216 220 223 227 229 231 234 239 240 248 252 267 269 272 276 283 301 302 304 305 313 315 321 324 326 329 330 332 336 339 347 351 352 363 380 386 401 404 407 410 412 413 419 423 434 436 440 443 445 470 472 475 478 484 502 508 513 516 517 518 540 551 561 567 570 571 582 585 586 603 606 607 609 610 614 616 617 624 631 640 645 646 656 667 678 679 680 681 686 689 703 704 706 716 717 718 724 727 728 729 732 734 740 743 754 757 762 770 771 772 774 781 786 802 803 804 810 813 814 821 826 828 835 838 839 843 845 848 854 856 857 859 860 862 863 864 865 878 904 908 910 912 914 917 919 929 934 937 941 943 947 948 954 959 973 978 980 984 989',
    [ET],
  ],
  // Centre
  [
    '205 210 214 217 218 224 225 228 235 251 254 256 262 274 281 309 312 314 316 318 319 320 325 327 337 346 353 361 402 405 409 414 417 430 432 447 457 464 469 479 501 504 507 512 515 531 534 539 557 563 572 573 580 601 608 612 615 618 629 630 636 641 651 659 660 662 682 708 712 713 715 726 730 731 737 763 769 773 779 806 815 816 817 830 832 847 861 870 872 901 903 913 918 920 924 936 938 940 945 952 956 972 975 979 985',
    [CT],
  ],
  // Montagnes
  ['303 307 385 406 435 505 575 719 720 801 915 970 983', [MT]],
  // Arizona (sans heure d'été)
  ['480 520 602 623', ['America/Phoenix']],
  // Pacifique
  [
    '206 209 213 253 279 310 323 341 350 360 369 408 415 424 425 442 509 510 530 559 562 564 619 626 628 650 657 661 669 702 707 714 725 738 747 760 805 818 820 831 840 858 909 916 925 949 951',
    [PT],
  ],
  ['503 971', [PT]],
  ['907', ['America/Anchorage', 'America/Adak']],
  ['808', ['Pacific/Honolulu']],
  // Indicatifs à cheval sur deux fuseaux : la plage doit tenir dans chacun.
  ['219', [CT]],
  ['260 317 463 574 765', ['America/Indiana/Indianapolis']],
  ['812 930', ['America/Indiana/Indianapolis', CT]],
  ['270 364 931', [CT, ET]],
  ['334', [CT, ET]],
  ['448 850', [CT, ET]],
  ['906', ['America/Detroit', 'America/Menominee']],
  ['308 605 620 701 785', [CT, MT]],
  ['208 986', ['America/Boise', PT]],
  ['458 541', [PT, 'America/Boise']],
  ['775', [PT, MT]],
  ['928', ['America/Phoenix', MT]],
]

/** Indicatifs régionaux du Canada → fuseaux possibles. */
const CA_AREA_CODES: [string, string[]][] = [
  ['236 604 672 778', ['America/Vancouver']],
  ['250 257', ['America/Vancouver', 'America/Edmonton']],
  ['368 403 587 780 825', ['America/Edmonton']],
  ['306 474 639', ['America/Regina', 'America/Edmonton']],
  ['204 431 584', ['America/Winnipeg']],
  ['226 249 289 343 365 382 416 437 519 548 613 647 683 705 742 753 905 942', ['America/Toronto']],
  ['807', ['America/Toronto', 'America/Winnipeg']],
  // Québec ; le 418 (et ses chevauchements) couvre aussi des îles à l'heure de l'Atlantique.
  ['263 354 438 450 468 514 579 819 873', ['America/Toronto']],
  ['367 418 581', ['America/Toronto', 'America/Halifax']],
  ['428 506', ['America/Moncton']],
  ['782 902', ['America/Halifax']],
  ['709 879', ['America/St_Johns', 'America/Goose_Bay']],
  ['867', ['America/Whitehorse', 'America/Edmonton', 'America/Winnipeg', 'America/Toronto']],
]

const toMap = (rows: [string, string[]][]) =>
  new Map(rows.flatMap(([codes, zones]) => codes.split(/\s+/).map((code) => [code, zones] as const)))

const US_ZONES = toMap(US_AREA_CODES)
const CA_ZONES = toMap(CA_AREA_CODES)

/**
 * Fuseaux possibles d'un numéro, d'après son pays et son numéro national (sans indicatif pays).
 * Vide : fuseau inconnu, l'appel doit être refusé.
 */
export function phoneTimeZones(country: string | null | undefined, nationalNumber: string): string[] {
  if (!country) return []
  if (country === 'US') return US_ZONES.get(nationalNumber.slice(0, 3)) ?? []
  if (country === 'CA') return CA_ZONES.get(nationalNumber.slice(0, 3)) ?? []
  if (country === 'ES') {
    if (/^(822|828|922|928)/.test(nationalNumber)) return ['Atlantic/Canary']
    // Un mobile peut être aux Canaries comme sur la péninsule.
    return /^[67]/.test(nationalNumber) ? ['Europe/Madrid', 'Atlantic/Canary'] : ['Europe/Madrid']
  }
  if (country === 'PT') {
    if (/^(292|295|296)/.test(nationalNumber)) return ['Atlantic/Azores']
    return /^9/.test(nationalNumber) ? ['Europe/Lisbon', 'Atlantic/Azores'] : ['Europe/Lisbon']
  }
  const zone = SINGLE_ZONE[country]
  return zone ? [zone] : []
}
