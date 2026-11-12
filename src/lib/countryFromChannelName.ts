export type ChannelCountry = {
  id: string;
  name: string;
  flag: string;
};

const OTHER_COUNTRY: ChannelCountry = { id: "other", name: "Övrigt", flag: "🌐" };

const COUNTRY_BY_CODE: Record<string, ChannelCountry> = (() => {
  const entries: [string[], ChannelCountry][] = [
    [["SE", "SWE"], { id: "se", name: "Sverige", flag: "🇸🇪" }],
    [["NO", "NOR"], { id: "no", name: "Norge", flag: "🇳🇴" }],
    [["DK", "DEN"], { id: "dk", name: "Danmark", flag: "🇩🇰" }],
    [["FI", "FIN"], { id: "fi", name: "Finland", flag: "🇫🇮" }],
    [["IS", "ISL"], { id: "is", name: "Island", flag: "🇮🇸" }],
    [["UK", "GB"], { id: "uk", name: "Storbritannien", flag: "🇬🇧" }],
    [["US", "USA"], { id: "us", name: "USA", flag: "🇺🇸" }],
    [["CA"], { id: "ca", name: "Kanada", flag: "🇨🇦" }],
    [["DE", "GER"], { id: "de", name: "Tyskland", flag: "🇩🇪" }],
    [["AT"], { id: "at", name: "Österrike", flag: "🇦🇹" }],
    [["CH"], { id: "ch", name: "Schweiz", flag: "🇨🇭" }],
    [["FR"], { id: "fr", name: "Frankrike", flag: "🇫🇷" }],
    [["ES", "ESP"], { id: "es", name: "Spanien", flag: "🇪🇸" }],
    [["IT", "ITA"], { id: "it", name: "Italien", flag: "🇮🇹" }],
    [["PT", "POR"], { id: "pt", name: "Portugal", flag: "🇵🇹" }],
    [["NL"], { id: "nl", name: "Nederländerna", flag: "🇳🇱" }],
    [["BE"], { id: "be", name: "Belgien", flag: "🇧🇪" }],
    [["IE"], { id: "ie", name: "Irland", flag: "🇮🇪" }],
    [["PL"], { id: "pl", name: "Polen", flag: "🇵🇱" }],
    [["CZ"], { id: "cz", name: "Tjeckien", flag: "🇨🇿" }],
    [["SK"], { id: "sk", name: "Slovakien", flag: "🇸🇰" }],
    [["HU"], { id: "hu", name: "Ungern", flag: "🇭🇺" }],
    [["RO"], { id: "ro", name: "Rumänien", flag: "🇷🇴" }],
    [["BG"], { id: "bg", name: "Bulgarien", flag: "🇧🇬" }],
    [["GR", "GRE"], { id: "gr", name: "Grekland", flag: "🇬🇷" }],
    [["TR", "TUR"], { id: "tr", name: "Turkiet", flag: "🇹🇷" }],
    [["RU"], { id: "ru", name: "Ryssland", flag: "🇷🇺" }],
    [["UA"], { id: "ua", name: "Ukraina", flag: "🇺🇦" }],
    [["HR"], { id: "hr", name: "Kroatien", flag: "🇭🇷" }],
    [["RS"], { id: "rs", name: "Serbien", flag: "🇷🇸" }],
    [["BA"], { id: "ba", name: "Bosnien", flag: "🇧🇦" }],
    [["SI"], { id: "si", name: "Slovenien", flag: "🇸🇮" }],
    [["MK"], { id: "mk", name: "Nordmakedonien", flag: "🇲🇰" }],
    [["AL"], { id: "al", name: "Albanien", flag: "🇦🇱" }],
    [["EE"], { id: "ee", name: "Estland", flag: "🇪🇪" }],
    [["LV"], { id: "lv", name: "Lettland", flag: "🇱🇻" }],
    [["LT"], { id: "lt", name: "Litauen", flag: "🇱🇹" }],
    [["AR"], { id: "ar", name: "Argentina", flag: "🇦🇷" }],
    [["BR", "BRA"], { id: "br", name: "Brasilien", flag: "🇧🇷" }],
    [["MX"], { id: "mx", name: "Mexiko", flag: "🇲🇽" }],
    [["IN"], { id: "in", name: "Indien", flag: "🇮🇳" }],
    [["AU"], { id: "au", name: "Australien", flag: "🇦🇺" }],
  ];

  const map: Record<string, ChannelCountry> = {};
  for (const [codes, country] of entries) {
    for (const code of codes) {
      map[code] = country;
    }
  }
  return map;
})();

// De nordiska länderna sorteras alltid först i landslistan.
const COUNTRY_SORT_PRIORITY: Record<string, number> = {
  se: 0,
  no: 1,
  dk: 2,
  fi: 3,
  is: 4,
};

const prefixRegex = /^([A-Za-z]{2,3})\s*(?:[:|]|[-–—])\s*/;

export function countryFromChannelName(channelName: string): ChannelCountry {
  const match = prefixRegex.exec(channelName.trim());
  if (match) {
    const country = COUNTRY_BY_CODE[match[1].toUpperCase()];
    if (country) return country;
  }
  return OTHER_COUNTRY;
}

export function compareCountries(a: ChannelCountry, b: ChannelCountry): number {
  if (a.id === "other" && b.id !== "other") return 1;
  if (b.id === "other" && a.id !== "other") return -1;
  const prioA = COUNTRY_SORT_PRIORITY[a.id] ?? 100;
  const prioB = COUNTRY_SORT_PRIORITY[b.id] ?? 100;
  if (prioA !== prioB) return prioA - prioB;
  return a.name.localeCompare(b.name, "sv");
}
