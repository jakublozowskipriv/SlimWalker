// Skarby: miejsca z historią, ukryte we mgle. Odsłaniają się, gdy przejdziesz w promieniu FIND_RADIUS_M.
// Współrzędne są przybliżone (~50 m) — śmiało poprawiaj i dopisuj własne.

export interface Treasure {
  id: string;
  name: string;
  ll: [number, number]; // [lon, lat]
  story: string;
  glyph: 'tower' | 'church' | 'castle' | 'tree' | 'water' | 'book' | 'cross' | 'mask' | 'star' | 'bread' | 'wheel';
}

export const FIND_RADIUS_M = 80;

export const TREASURES: Treasure[] = [
  { id: 'koziolki', name: 'Koziołki na ratuszu', ll: [16.9342, 52.4083], glyph: 'tower',
    story: 'Codziennie w samo południe na wieży ratusza trykają się dwa blaszane koziołki. Legenda mówi, że kucharz przypalił pieczeń na ucztę i chciał ją zastąpić dwoma koziołkami, ale te uciekły na wieżę.' },
  { id: 'bamberka', name: 'Bamberka', ll: [16.9330, 52.4092], glyph: 'star',
    story: 'Figurka dziewczyny z koszem przy studni na Starym Rynku upamiętnia Bambrów, czyli osadników spod Bambergu, którzy w XVIII wieku osiedlili się w podpoznańskich wsiach i szybko spolszczyli.' },
  { id: 'fara', name: 'Fara Poznańska', ll: [16.9330, 52.4067], glyph: 'church',
    story: 'Barokowa fara to dawny kościół jezuitów, który sąsiaduje z ich dawnym kolegium. Zajrzyj do środka: organy Friedricha Ladegasta należą do najcenniejszych w Polsce.' },
  { id: 'zamek-krolewski', name: 'Wzgórze Przemysła', ll: [16.9301, 52.4091], glyph: 'castle',
    story: 'Zamek Królewski na wzgórzu odbudowano w latach 2010–2013. W średniowieczu rezydowali tu książęta wielkopolscy, w tym Przemysł II, koronowany na króla w 1295 roku.' },
  { id: 'katedra', name: 'Katedra na Ostrowie Tumskim', ll: [16.9483, 52.4115], glyph: 'church',
    story: 'Najstarsza katedra w Polsce. W Złotej Kaplicy stoi pomnik-sarkofag Mieszka I i Bolesława Chrobrego, a w podziemiach można zobaczyć relikty pierwszej świątyni z X wieku.' },
  { id: 'brama-poznania', name: 'Brama Poznania', ll: [16.9532, 52.4119], glyph: 'water',
    story: 'Nowoczesna bryła po drugiej stronie Cybiny opowiada o początkach państwa. Łączy ją z Ostrowem Tumskim kładka, ta sama, którą idziesz na wyspę.' },
  { id: 'srodka', name: 'Mural na Śródce', ll: [16.9545, 52.4112], glyph: 'mask',
    story: 'Trójwymiarowy mural z 2015 roku pełen postaci z historii dzielnicy. To jedna z najczęściej fotografowanych ścian w Poznaniu. Ile szczegółów znajdziesz?' },
  { id: 'jordan', name: 'Most Jordana', ll: [16.9516, 52.4117], glyph: 'water',
    story: 'Most imienia biskupa Jordana, pierwszego biskupa Polski, spina Ostrów Tumski ze Śródką nad Cybiną. Zakochani wieszają tu kłódki.' },
  { id: 'zamek-cesarski', name: 'Zamek Cesarski', ll: [16.9187, 52.4074], glyph: 'castle',
    story: 'Zbudowany w latach 1905–1910 dla Wilhelma II. To ostatnia rezydencja wzniesiona dla monarchy w Europie. W czasie wojny przebudowano go na kwaterę Hitlera, dziś działa tu centrum kultury CK Zamek.' },
  { id: 'krzyze', name: 'Poznańskie Krzyże', ll: [16.9171, 52.4087], glyph: 'cross',
    story: 'Pomnik Poznańskiego Czerwca 1956: dwa krzyże spięte jarzmem. Upamiętnia pierwszy wielki protest robotniczy w PRL, który zaczął się od marszu z zakładów Cegielskiego.' },
  { id: 'collegium-minus', name: 'Collegium Minus', ll: [16.9177, 52.4093], glyph: 'book',
    story: 'Neorenesansowy gmach Uniwersytetu im. Adama Mickiewicza z początku XX wieku. W jego auli odbywają się koncerty i uroczystości uczelni.' },
  { id: 'teatr-polski', name: '„Naród sobie”', ll: [16.9228, 52.4079], glyph: 'mask',
    story: 'Napis „Naród sobie” na fasadzie Teatru Polskiego przypomina, że gmach z 1875 roku zbudowano ze składek Polaków w zaborze pruskim, bez pieniędzy władz.' },
  { id: 'raczynskich', name: 'Biblioteka Raczyńskich', ll: [16.9275, 52.4088], glyph: 'book',
    story: 'Jedna z najstarszych bibliotek publicznych w Polsce, ufundowana w 1829 roku przez Edwarda Raczyńskiego. Kolumnada przy placu Wolności wzorowana jest na paryskim Luwrze.' },
  { id: 'okraglak', name: 'Okrąglak', ll: [16.9227, 52.4090], glyph: 'tower',
    story: 'Okrągły dom towarowy Marka Leykama z 1955 roku, ikona poznańskiego modernizmu. Przez lata uchodził za jeden z najnowocześniejszych sklepów w kraju.' },
  { id: 'rogal', name: 'Szlak rogala', ll: [16.9235, 52.4071], glyph: 'bread',
    story: '11 listopada na ulicy Święty Marcin Poznań świętuje imieniny ulicy i zjada setki ton rogali świętomarcińskich z białym makiem. Rogal ma unijne oznaczenie geograficzne.' },
  { id: 'stary-browar', name: 'Stary Browar', ll: [16.9278, 52.4009], glyph: 'star',
    story: 'Dawny browar Huggerów, przerobiony na centrum handlu i sztuki. Zajrzyj na dziedziniec: ceglane mury, rzeźby i wystawy.' },
  { id: 'cytadela', name: 'Cytadela', ll: [16.9352, 52.4232], glyph: 'castle',
    story: 'Największy park Poznania leży na miejscu pruskiego Fortu Winiary. W 1945 roku toczyły się tu ostatnie walki o miasto. Szukaj „Nierozpoznanych”: grupy bezgłowych postaci Magdaleny Abakanowicz.' },
  { id: 'stara-rzeznia', name: 'Stara Rzeźnia', ll: [16.9390, 52.4147], glyph: 'wheel',
    story: 'Ceglane hale XIX-wiecznej rzeźni miejskiej na Garbarach. Słyną z giełdy staroci, na której da się znaleźć wszystko, od pruskich pocztówek po meble z PRL.' },
  { id: 'solacz', name: 'Park Sołacki', ll: [16.9031, 52.4220], glyph: 'tree',
    story: 'Park nad Bogdanką w sercu willowego Sołacza, zaprojektowany na początku XX wieku. Pośród starych drzew płynie strumień z mostkami.' },
  { id: 'rusalka', name: 'Jezioro Rusałka', ll: [16.8707, 52.4279], glyph: 'water',
    story: 'Jezioro powstało w czasie wojny przez spiętrzenie Bogdanki. Przy pracach zmuszano do pracy więźniów, dlatego Rusałka to miejsce zarówno wypoczynku, jak i pamięci.' },
  { id: 'palmiarnia', name: 'Park Wilsona i Palmiarnia', ll: [16.9025, 52.3990], glyph: 'tree',
    story: 'Jedna z największych palmiarni w Europie, w Parku Wilsona na Łazarzu, otwarta na początku XX wieku. W środku rosną tysiące roślin z całego świata, a w akwariach pływają ryby z tropików.' },
  { id: 'iglica', name: 'Iglica Targów', ll: [16.9118, 52.4029], glyph: 'tower',
    story: 'Iglica z 1955 roku to symbol Międzynarodowych Targów Poznańskich, które odbywają się w mieście od 1921 roku.' },
  { id: 'malta', name: 'Tor regatowy Malta', ll: [16.9806, 52.4027], glyph: 'water',
    story: 'Jezioro Maltańskie jest sztuczne, powstało w 1952 roku. Na torze regatowym odbywały się mistrzostwa świata w wioślarstwie i kajakarstwie, a zimą działa obok stok narciarski.' },
  { id: 'rynek-jezycki', name: 'Rynek Jeżycki', ll: [16.9044, 52.4119], glyph: 'bread',
    story: 'Serce Jeżyc: targowisko otoczone secesyjnymi kamienicami. To tu Małgorzata Musierowicz osadziła „Jeżycjadę”.' },
  { id: 'rynek-wildecki', name: 'Rynek Wildecki', ll: [16.9205, 52.3934], glyph: 'bread',
    story: 'Targowisko w sercu Wildy, robotniczej dzielnicy kamienic i fabryk Cegielskiego. Dookoła ciągną się ulice ceglanych kamienic.' },
  { id: 'cegielski', name: 'Zakłady Cegielskiego', ll: [16.9182, 52.3891], glyph: 'wheel',
    story: 'Stąd 28 czerwca 1956 roku wyruszył marsz robotników, od którego zaczął się Poznański Czerwiec. Hipolit Cegielski zaczynał od sklepu żelaznego, a jego firma budowała potem lokomotywy i silniki okrętowe.' },
  { id: 'stadion', name: 'Stadion przy Bułgarskiej', ll: [16.8611, 52.3966], glyph: 'star',
    story: 'Dom Lecha Poznań, jedna z aren Euro 2012. Fani Lecha rozsławili „Poznań” — taniec tyłem do boiska, który przejęli kibice w całej Europie.' },
];

export function treasureGlyph(g: Treasure['glyph']): string {
  const s = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  switch (g) {
    case 'tower': return `<path d="M-6 16V-6h12v22M-9-6h18M-6-6l6-10 6 10M-2 2h4v6h-4z" ${s}/>`;
    case 'church': return `<path d="M-12 16V0l12-8 12 8v16zM0-8v-9M-4-13h8M-3 16V7h6v9" ${s}/>`;
    case 'castle': return `<path d="M-14 16V-4h5v-5h5v5h8v-5h5v5h5v20zM-3 16V7h6v9" ${s}/>`;
    case 'tree': return `<path d="M0 16V2M0-15c7 0 11 6 8 11 5 2 4 9-3 9H-5c-7 0-8-7-3-9-3-5 1-11 8-11z" ${s}/>`;
    case 'water': return `<path d="M-15-4c5-4 10 4 15 0s10-4 15 0M-15 5c5-4 10 4 15 0s10-4 15 0" ${s}/>`;
    case 'book': return `<path d="M0-10v24M0-10c-4-3-10-3-14-1v24c4-2 10-2 14 1 4-3 10-3 14-1v-24c-4-2-10-2-14 1" ${s}/>`;
    case 'cross': return `<path d="M-7-15v31M7-15v31M-14-6h28M-11 0c4 4 18 4 22 0" ${s}/>`;
    case 'mask': return `<path d="M-13-10h26v8c0 10-6 16-13 16s-13-6-13-16zM-7-3h4M3-3h4M-5 6c3 3 7 3 10 0" ${s}/>`;
    case 'bread': return `<path d="M-15 6c2-12 28-12 30 0-6 6-24 6-30 0zM-8-2l2 6M0-4v7M8-2l-2 6" ${s}/>`;
    case 'wheel': return `<circle r="12" ${s}/><circle r="3" ${s}/><path d="M0-12V-3M0 3v9M-12 0h9M3 0h9" ${s}/>`;
    default: return `<path d="M0-14l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" ${s}/>`;
  }
}
