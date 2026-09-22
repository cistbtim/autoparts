// Country/province reference data for dropdowns (workshop location, licence
// renewal agent roster, etc.) — picking from a fixed list instead of free
// text means "South Africa" / "Gauteng" always matches exactly, so the
// country/province agent-matching logic in App.jsx actually works.

export const COUNTRIES = [
  "South Africa","Angola","Thailand","Taiwan",
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan",
  "Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi",
  "Cambodia","Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (DRC)","Congo (Republic)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic",
  "Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia",
  "Fiji","Finland","France",
  "Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana",
  "Haiti","Honduras","Hong Kong","Hungary",
  "Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast",
  "Jamaica","Japan","Jordan",
  "Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan",
  "Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg",
  "Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
  "Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway",
  "Oman",
  "Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Puerto Rico",
  "Qatar",
  "Romania","Russia","Rwanda",
  "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria",
  "Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan",
  "Vanuatu","Vatican City","Venezuela","Vietnam",
  "Yemen",
  "Zambia","Zimbabwe",
].filter((c,i,arr)=>arr.indexOf(c)===i).sort((a,b)=>{
  // Keep the app's primary markets pinned at the top, everything else A-Z
  const pinned=["South Africa","Angola","Thailand","Taiwan"];
  const ai=pinned.indexOf(a), bi=pinned.indexOf(b);
  if(ai!==-1||bi!==-1) return (ai===-1?999:ai)-(bi===-1?999:bi);
  return a.localeCompare(b);
});

// Only the countries we actually have subdivision data for get a Province
// <select> — everywhere else falls back to a free-text input.
export const PROVINCES_BY_COUNTRY = {
  "South Africa": ["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","North West","Northern Cape","Western Cape"],
  "Angola": ["Bengo","Benguela","Bié","Cabinda","Cuando Cubango","Cuanza Norte","Cuanza Sul","Cunene","Huambo","Huíla","Luanda","Lunda Norte","Lunda Sul","Malanje","Moxico","Namibe","Uíge","Zaire"],
  "Taiwan": ["Taipei City","New Taipei City","Taoyuan City","Taichung City","Tainan City","Kaohsiung City","Keelung City","Hsinchu City","Chiayi City","Hsinchu County","Miaoli County","Changhua County","Nantou County","Yunlin County","Chiayi County","Pingtung County","Yilan County","Hualien County","Taitung County","Penghu County","Kinmen County","Lienchiang County"],
  "Thailand": ["Bangkok","Amnat Charoen","Ang Thong","Bueng Kan","Buriram","Chachoengsao","Chai Nat","Chaiyaphum","Chanthaburi","Chiang Mai","Chiang Rai","Chonburi","Chumphon","Kalasin","Kamphaeng Phet","Kanchanaburi","Khon Kaen","Krabi","Lampang","Lamphun","Loei","Lopburi","Mae Hong Son","Maha Sarakham","Mukdahan","Nakhon Nayok","Nakhon Pathom","Nakhon Phanom","Nakhon Ratchasima","Nakhon Sawan","Nakhon Si Thammarat","Nan","Narathiwat","Nong Bua Lamphu","Nong Khai","Nonthaburi","Pathum Thani","Pattani","Phang Nga","Phatthalung","Phayao","Phetchabun","Phetchaburi","Phichit","Phitsanulok","Phra Nakhon Si Ayutthaya","Phrae","Phuket","Prachinburi","Prachuap Khiri Khan","Ranong","Ratchaburi","Rayong","Roi Et","Sa Kaeo","Sakon Nakhon","Samut Prakan","Samut Sakhon","Samut Songkhram","Saraburi","Satun","Sing Buri","Sisaket","Songkhla","Sukhothai","Suphan Buri","Surat Thani","Surin","Tak","Trang","Trat","Ubon Ratchathani","Udon Thani","Uthai Thani","Uttaradit","Yala","Yasothon"],
};

export const getProvinces = (country) => PROVINCES_BY_COUNTRY[country] || [];
