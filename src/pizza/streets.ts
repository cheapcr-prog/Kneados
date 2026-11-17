/**
 * Street names a phone caller might say, so a misheard one can be put right.
 *
 * On a real call (2026-11-16) "1746 Ximeno Avenue" was heard as "1746 Eximino Avenue" and the address file had no such
 * street. When an address is not found, KneadOS looks for a real street that sounds like what was heard and checks
 * that one instead. The address file still decides whether the house exists, and the caller hears the corrected
 * address, so a wrong guess is caught.
 *
 * The names are the named streets within about 5 miles of the demo shop (the delivery area), from OpenStreetMap
 * (© OpenStreetMap contributors, ODbL), without "East/West" and without "Street/Avenue". Numbered streets are left
 * out: numbers are heard correctly. A live shop gets its own list for its own delivery area.
 */
const NAMES = 'Abbeyfield|Aceca|Adderley|Adenmoor|Adriatic|Agua|Air Force|Airport|Aivlis|Alameda|Alamitos|Alberan|Alboni|Albury|Alderwood|Alfa|Alhambra|Almada|Almond|Amebco|Amelia|American|Anaheim|Anchor|Anchorage|Ancona|Andrews|Angelo|Angler|Ann Arbor|Annandale|Annapolis|Apollo|Appian|Appleton|Aquarium|Aquarius|Arbor|Arcadia|Argonne|Argyle|Arlington|Arlotte|Armando|Armourdale|Army|Ashbrook|Atherton|Atlantic|Attica|Audra|Autrilla Scott|Avalon|Avenida Estoril|Avenida Granada|Avenida de Castillo|Avery|Avis|Azure|Azure Bay|Bacarro|Bailey|Baker|Balboa|Ballantine|Baltic|Banner|Barbanell|Barbara London|Barker|Barrios|Baskerville|Bay Shore|Bay View|Bayard|Bayer|Bayou|Bayside|Beach|Beach Comber|Beachcomber|Belen|Belice|Bellflower|Bellwood|Belmont|Benmore|Bennett|Bermuda|Berner|Beryl|Beverly|Birkdale|Bixby|Bixby Hill|Bixby Village|Blackthorne|Blinn|Blue Cavern|Blue Heron|Blume|Boathouse|Bolsa|Bomberry|Bonito|Bostonian|Bouton|Boyar|Bradbury|Bravery|Brayton|Bridgewater|Bridle|Briercrest|Brimhall|Brittain|Britton|Brizendine|Broadway|Brock|Brockwood|Brocton|Brookline|Bryant|Burlinghall|Burlington|Burnett|Burney|Burning Tree|Business|Cadiz|Calderwood|California|Calle Marseille|Cameron|Campo|Campus|Canal|Canehill|Canoe Brook|Cantel|Canton|Capri|Caravel|Carfax|Carita|Carmel|Carolyn|Carrack|Carroll Park East|Carroll Park North|Carroll Park South|Carroll Park West|Carson|Cartagena|Case|Casino|Caspian|Castana|Catalina|Cedar|Cedar Crest|Central|Centralia|Cerritos|Cervato|Cervera|Channel|Channing|Chapel|Charlemagne|Chatham|Chatwin|Chaucer|Chelsea|Cherry|Chesney|Chester|Chestnut|Chianti|China|Christy|Church|Claiborne|Claremont|Claremore|Clark|Clipper|Clubhouse|Coast Guard|Coastline|Coke|Coleridge|College|College Park|Collins|Colon|Colorado|Columbia|Compass|Conant|Conquista|Copa de Oro|Coral|Coralite|Cordoba|Cordova|Corinne|Corinthian|Corona|Coronado|Corsair|Corsica|Cortese|Corto|Costa del Rey|Costa del Sol|Cota|Cottonwood|Country Club|Courage|Cover|Covina|Cowles|Cramer|Cranston|Crescent|Crescent Heights|Crest|Creston|Crestview|Cristobal|Crystal|Cushing|Cypress|Daggett|Daisy|Dana|Danbury|Daroca|Dartmouth|Davenport|Dawson|Dayman|De Forest|De Ora|De Soto|Deborah|Deeboyar|Del Mar|Del Monte|Deleon|Delta|Denni|Denver|Descano Bay|Determination|Deukmejian|Devon|Discovery|Division|Dock|Dolphin|Don Julio|Donald Douglas|Donnie Ann|Donnis|Donovan|Dory|Double Tree|Douglas Center|Downey|Driftwood|Driscoll|Druid|Drysdale|Duchess|Dudley|Eagle|Earl|Eastern|Eastwind|Easy|Eaton|Ebbtide|Ebell|Edgeley|Edison|Edith|El Carmen|El Cedral|El Dorado|El Jardin|El Mirador|El Parque|El Paseo|El Prado|El Progreso|El Pulcro|El Roble|El Salvador|Eldridge|Electric|Eliot|Elko|Elkport|Ellis|Elm|Elmfield|Elsa|Emerald|Empire Landing|Engel|Erie|Espanita|Esperanza|Esther|Eucalyptus|Euclid|Faculty|Fairbanks|Fairbrook|Fairfield|Fairman|Fairway|Falcon|Fanwood|Farolito|Farquhar|Farragut|Fashion|Fathom|Faust|Federation|Ferro|Fidelity|Fidler|Flagstaff|Flagstone|Flangel|Fleet Haven|Flint|Florence|Florida|Florista|Foote|Foreman|Forrestal|Foster|Fountain|Foxburg|Frankel|Freckles|Freedom|Freeland|Freeman|Fresh Meadow|Gale|Galeano|Galleon|Gardena|Gardenia|Garford|Garner|Gate|Gaviota|Gaylord|Gemini|Geneva|Gertrude|Gilman|Ginevra|Giralda|Gish|Gladys|Glendora|Glenroy|Glenview|Globemaster|Gold Star|Goldcrest|Golden|Golden Rain|Golden Sands|Golden Shore|Goldfield|Gondar|Goodrich|Gossamer|Granada|Grand|Grant|Graywood|Green House|Greenbrier|Greenmeadow|Greentop|Greenway|Grenora|Gundry|Hackett|Haines|Hanan|Hanbury|Harbor|Harbor Scenic|Harco|Harrisburg|Hart|Harvard|Harvey|Hathaway|Havana|Hayes|Hayfield|Hayter|Hazelbrook|Heather|Hedwig|Heinemann|Hellman|Henderson|Henry Ford|Hermosa|Heron|Heron Bay|Heron Pointe|Hidden|Hile|Hill|Hillcrest|Hillrose|Hillside|Hoffman|Holbrook|Holly Glen|Homewood|Honor|Howard|Hughes|Hummingbird|Huntdale|Huntley|Hussey|Industry|Integrity|Interlachen|Intermodal|Inverness|Ionia|Iroquois|Island View|Island Village|Jacinto|Jackson|Jade|Jeanette|Jeans|John K|Josie|Jotham|Judson|Junipero|Kakkis|Kallin|Karen|Katella|Keel|Keever|Kelley|Kempton|Kenilworth|Kennebec|Kensington|Kenwood|Kerth|Kessler|Keynote|Kiethley|Killdee|Kilroy Airport|Kingfisher|Kingsbury|Kittrick|Kitts|Knollwood|Knoxville|La Cara|La Colmena|La Linda|La Marimba|La Pasada|La Paz|La Perla|La Verne|Ladoga|Laguna|Lakeview|Lakewood|Lampson|Lanai|Landing|Lansing|Lariat|Las Brisas|Las Lomas|Laurinda|Lausinda|Lavante|Lave|Laverne|Lee|Leeds|Lees|Legion|Leigh|Lemon|Levelside|Lew Davis|Lewis|Lexington|Liberty|Lido|Lighthouse|Lime|Linares|Lincoln|Linden|Lindero|Linsley|Litchfield|Livingston|Llewellyn|Loch Lomond|Locust|Loma|Loma Vista|Lomina|Lomita|Long|Long Beach|Lonna Linda|Loreta|Loring|Los Alamitos|Los Altos|Los Arcos|Los Cerritos Park|Los Coyotes Diagonal|Los Flores|Los Santos|Lowena|Loyalty|Loynes|Loyola|Lucia|Lucille|Lugger|Lunada|Macdonough|Maddox|Madera|Madrid|Magnolia|Mahanna|Main|Maine|Mainway|Majorca|Malaga|Malta|Manila|Manor|Mantova|Marber|Marble|Marcellus|Margo|Marina|Marina Park|Marina View|Marine|Mariner|Marion|Mariquita|Marita|Marlin|Marron|Marshall|Martha Ann|Martin Luther King Junior|Marvista|Marwick|Massachusetts|Masthead|Mauretania|Maury|Maxson|Maybank|Mayfield|McGowen|McKinney|McNab|Medal of Honor|Medford|Medinac|Medio|Mendez|Merion|Merriam|Mesa|Metz|Mezzanine|Middle|Midway|Miguel|Milton|Minerva Park|Mira Mar|Miramar|Molino|Monita|Monlaco|Monogram|Monrovia|Montair|Monte Verde|Montecito|Monterey|Moonstone|Murdock|Myrtle|Nantucket|Naples|Napoli|Nasa|Nassau|Navy|Neapolitan|Nebraska|Nelsonbark|Neptune|Netherly|Nevada|New Dock|New York|Newbury|Newport|Nicholson|Nieto|Nimitz|Nipomo|Norgrove|Norse|Northwood|Novara|Oak|Oak Grove|Oak Hills|Oak Knoll|Oak Leaf|Oakbrook|Oakmont|Obispo|Ocana|Occidental|Ocean|Ocean Manor|Ocean View|Oceangate|Ohio|Old Harbor|Old Mill|Old Ranch|Old Zaferia|Oleta|Oliva|Olive|Olympic|Opal|Opp|Orange|Orangewood|Oregon|Orizaba|Orlando|Orlena|Osler|Ostrom|Outrigger|Oxholm|Pacific|Pacific Coast|Pacifica|Pageantry|Palermo|Palm|Palo Verde|Paloma|Panama|Panorama|Paoli|Parade|Paramount|Parapet|Parima|Park|Parkcrest|Parkview|Parsons Landing|Pasadena|Paseo Bonita|Patero|Patterson|Pattiz|Pavo|Peabody|Pelham|Pelorus|Pemberton|Pennington|Pepper|Peppertree|Pepperwood|Peralta|Perugia|Petaluma|Peterson|Phillips|Pico|Piedmont|Pimenta|Pine|Pittsfield|Pixie|Pluribus|Plymouth|Pomona|Preble|Premium|Prestwick|Prince Island|Princeton|Promontory|Prospect|Provincetown|Purdue|Quail|Queens|Queensway|Quiet Sands|Quincy|Radnor|Rafael|Ramillo|Rancho|Randolph|Ransom|Ravenna|Ravia|Raymond|Reagan|Redondo|Reese|Regatta|Regway|Rendina|Rhea|Ridge Park|Ridgeview|River|Riversea|Riviera|Robidoux|Rochelle|Rodloy|Rogene|Rolanda|Roosevelt|Rosada|Rose|Rosebay|Rossmoor|Rossmoor Center|Roswell|Rowena|Roxanne|Roycroft|Russell|Rutgers|Ruth Elaine|Sacrifice|Saddle|Saint Albans|Saint Andrews|Saint Cloud|Saint Irmo|Saint John|Saint Joseph|Saint Louis|Salida|Salmon|Salt Lake|Salta Verde|Sam Johnson|Sampson|San Anseline|San Antonio|San Cataldo|San Francisco|San Gabriel|San Marco|San Remo|San Vicente|San Vincente|Sand Piper|Sandcastle|Sandpiper|Sandwood|Santa Ana|Santa Fe|Santiago|Sarah|Savona|Schaufele|Schley|Schooner|Scioto|Scrivener|Sea|Sea Breeze|Seaborn|Seabright|Seacrest|Seal Beach|Seaside|Seaview|Seawind|Sebren|Senasac|Septimo|Sepulveda|Seville|Shadypark|Shakespeare|Shaw|Shawnee|Shea|Sheri|Sherman|Shipway|Shire|Shopkeeper|Shore|Shoreline|Shoreline Village|Sicilian|Siena|Signal|Signal Pointe|Sigsbee|Silver Fox|Silver Shoals|Silvera|Silverwood|Skokie|Skyline|Sloop|Smith|Smugglers|Snark|Snowden|Somerset|Sorrento|Southerland|Southern Pacific|Southport|Southshore|Spaulding|Spinnaker|Spinnaker Bay|Spring|Springdale|Spur|Stanbridge|Stanford|Stanley|Stanton|Starlight|State University|Stearnlee|Stearns|Stevely|Stewart|Stineman|Studebaker|Summit|Sunfield|Sunningdale|Sunrise|Sunset|Sunset View|Sunshine|Surf|Surfside|Surrey|Syracuse|Talavera|Tam Oshanter|Taper|Technology|Tehachapi|Temple|Terminal Island|Termino|Terrace|Terraine|Terrylynn|Tevis|The Palms|The Toledo|Theresa|Thor|Thunderbird|Tibor Rubin|Tigertail|Tilbury|Tile|Tivoli|Toburk|Top Side|Toyon Bay|Tremont|Trident|Trimble|Tucker|Tulane|Twin Hills|Ulen|Ultimo|Umatilla|Vangold|Venetia|Vera|Vera Crest|Verde|Vermont|Vernon|Vesuvian|Via Del Rio|Via Di Roma|View|Viking|Village|Vina|Virgil|Virginia|Virginia Vista|Vista|Vista Hermosa|Vista de Ora|Volk|Vreeland|Vuelta Grande|Wainwright|Wakefield|Walker Lee|Walkerton|Wall|Wallingsford|Walnut|Walton|Wardlow|Warren|Warrior|Warwood|Washington|Waterfront|Watson|Weatherby|Webster|Wee Burn|Weeburn|Wehrle|Welcome|Wembley|Wendy|Wentworth|Werner|Wesley|Westminster|Weston|Westwind|Wetherly|Wheelhouse|Whites Landing|Whitewood|Willard|Williams|Willow|Wilma|Wilton|Wimbleton|Windjammer|Windsor|Windward|Winnipeg|Winslow|Wisconsin|Wise|Woodland|Woodruff|Woodstock|Worsham|Ximeno|Yale|Yellowtail|Young|Zandia|Zona|La Dera|La Vere';

export const STREETS: string[] = NAMES.split('|');

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** The consonants of a name as they sound: "Eximino" and "Ximeno" both come out "xmn". */
export function soundOf(name: string): string {
  return letters(name)
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/[cq]/g, 'k').replace(/z/g, 's')
    .replace(/[aeiouyhw]/g, '')
    .replace(/(.)\1+/g, '$1');
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

const KEYED = STREETS.map((name) => ({ name, plain: letters(name), sound: soundOf(name) }));
const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'north', 'south', 'east', 'west']);
const TYPES = new Set(['street', 'st', 'avenue', 'ave', 'av', 'boulevard', 'blvd', 'drive', 'dr', 'road', 'rd', 'highway', 'hwy', 'way', 'place', 'pl', 'court', 'ct', 'lane', 'ln', 'walk', 'circle', 'cir', 'terrace', 'parkway', 'pkwy']);
const NOT_STREET = /\b(long beach|seal beach|signal hill|lakewood|los alamitos|california|ca|apartment|apt|unit|suite|ste)\b.*$/i;

/** How many sound-alike streets are tried when an address is not found. */
export const MAX_STREET_GUESSES = 3;

export interface StreetGuess {
  /** The street name as it was heard ("Eximino"). */
  heard: string;
  /** The real street it may be ("Ximeno"). */
  street: string;
  /** The address with the real street in place, to check against the address file. */
  address: string;
}

/**
 * Real streets that sound like the one in an address that was not found, best first.
 * Empty when the street said is already a real one (then the house number is the problem, and we never swap streets),
 * or when nothing is close enough.
 */
export function streetGuesses(said: string): StreetGuess[] {
  const head = said.split(',')[0].replace(NOT_STREET, '').trim();
  const words = head.split(/\s+/).filter(Boolean);
  const name = words.filter((w, i) => {
    const k = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/\d/.test(k)) return false;
    if (TYPES.has(k)) return false;
    // "East" leads a street name; it is only the name itself when nothing else is left ("East Way" does not exist here).
    return !(DIRECTIONS.has(k) && i <= 1);
  });
  if (!name.length || !/^\d/.test(words[0] ?? '') || words.some((w, i) => i > 0 && /\d/.test(w))) return [];
  const heard = name.join(' ');
  const plain = letters(heard);
  const sound = soundOf(heard);
  if (plain.length < 3 || KEYED.some((s) => s.plain === plain)) return [];

  const close = KEYED
    .map((s) => {
      const off = editDistance(plain, s.plain) / Math.max(plain.length, s.plain.length);
      const sameSound = sound.length >= 2 && sound === s.sound;
      return { street: s.name, off, sameSound };
    })
    .filter((s) => (s.sameSound ? s.off <= 0.5 : s.off <= 0.34))
    .sort((a, b) => (a.off - (a.sameSound ? 0.2 : 0)) - (b.off - (b.sameSound ? 0.2 : 0)))
    .slice(0, MAX_STREET_GUESSES);

  const pattern = new RegExp(name.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i');
  return close.map((s) => ({ heard, street: s.street, address: said.replace(pattern, s.street) }));
}
