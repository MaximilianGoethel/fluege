// ===== Neue Flüge direkt auf der Website eintragen =====
// Das Formular schreibt den Flug über die GitHub-Schnittstelle in flights.js
// (und neue Flughäfen in airports.js). Dafür braucht es einen persönlichen
// GitHub-Schlüssel (Token). Er wird nur in deinem Browser gespeichert, nie im Repo.


// ---------- Einstellungen ----------

const REPO = "MaximilianGoethel/fluege";
const BRANCH = "main";
const TOKEN_KEY = "fluege-github-token";

// Städte, die man oft auf Deutsch eintippt → englischer Name in der Datenbank
const CITY_ALIASES = {
  "peking": "beijing", "münchen": "munich", "wien": "vienna", "singapur": "singapore",
  "rom": "rome", "prag": "prague", "mailand": "milan", "zürich": "zurich", "genf": "geneva",
  "köln": "cologne", "nürnberg": "nuremberg", "lissabon": "lisbon", "athen": "athens",
  "brüssel": "brussels", "kopenhagen": "copenhagen", "warschau": "warsaw", "moskau": "moscow",
  "taipeh": "taipei", "hongkong": "hong kong", "kairo": "cairo", "neu-delhi": "new delhi",
  "seul": "seoul", "tokio": "tokyo", "kanton": "guangzhou",
};

// Ländernamen auf Deutsch (z. B. "DE" → "Deutschland")
const COUNTRY_OVERRIDES = { HK: "Hongkong", MO: "Macau", TW: "Taiwan", US: "USA" };
let countryNames = null;
try {
  countryNames = new Intl.DisplayNames(["de"], { type: "region" });
} catch (error) {
  // sehr alte Browser: dann bleibt der Ländercode stehen
}

function countryName(code) {
  if (COUNTRY_OVERRIDES[code]) return COUNTRY_OVERRIDES[code];
  return countryNames ? countryNames.of(code) : code;
}


// ---------- Schlüssel im Browser merken ----------

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (error) { return ""; }
}

function saveToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch (error) { /* ignorieren */ }
}

function forgetToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (error) { /* ignorieren */ }
}


// ---------- Elemente auf der Seite ----------

const addButton = document.getElementById("btn-add");
const modal = document.getElementById("add-modal");
const form = document.getElementById("add-form");
const statusText = document.getElementById("f-status");
const saveButton = document.getElementById("f-save");
const tokenWrap = document.getElementById("f-token-wrap");
const tokenInput = document.getElementById("f-token");
const dateInput = document.getElementById("f-date");
const durationInput = document.getElementById("f-duration");

// Für "Von" und "Nach" jeweils: Eingabefeld, Info-Zeile, Feld für den Stadtnamen
const fields = {
  from: {
    input: document.getElementById("f-from"),
    info: document.getElementById("f-from-info"),
    cityWrap: document.getElementById("f-from-city-wrap"),
    cityInput: document.getElementById("f-from-city"),
    airport: null,
  },
  to: {
    input: document.getElementById("f-to"),
    info: document.getElementById("f-to-info"),
    cityWrap: document.getElementById("f-to-city-wrap"),
    cityInput: document.getElementById("f-to-city"),
    airport: null,
  },
};

// Button "+ Flug eintragen" nur auf deinen Geräten zeigen:
// wenn ein Schlüssel gespeichert ist oder die Adresse auf #neu endet
if (getToken() || location.hash === "#neu") {
  addButton.hidden = false;
}


// ---------- Flughafen-Datenbank (wird erst beim Öffnen des Formulars geladen) ----------

let dbPromise = null;

function loadAirportDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "airports-db.js";
      script.onload = resolve;
      script.onerror = () => {
        dbPromise = null;
        reject(new Error("Flughafen-Datenbank konnte nicht geladen werden."));
      };
      document.head.appendChild(script);
    });
  }
  return dbPromise;
}

// "Shanghai (Minhang)" → "Shanghai"
function cleanCity(city) {
  return city.replace(/\s*\(.*\)\s*/g, "").trim();
}

// Name eines Flughafens für Hinweise
function airportLabel(code) {
  if (typeof AIRPORT_DB !== "undefined" && AIRPORT_DB[code]) return AIRPORT_DB[code][4];
  return AIRPORTS[code].city;
}

// Sucht einen Flughafen nach Code oder Stadt.
// Ergebnis: { airport: {...} } oder { message: "Hinweis" }
function findAirport(query) {
  // Datenbank noch nicht geladen? Dann nur bekannte Flughäfen
  const DB = typeof AIRPORT_DB !== "undefined" ? AIRPORT_DB : {};
  const text = query.trim();
  if (!text) return { message: "" };
  const code = text.toUpperCase();

  // 1. Code, der schon in airports.js steht
  if (AIRPORTS[code]) {
    return { airport: { code: code, ...AIRPORTS[code], name: airportLabel(code), isNew: false } };
  }

  // 2. Code aus der Datenbank
  if (/^[A-Z]{3}$/.test(code) && DB[code]) {
    const [city, country, lat, lon, name] = DB[code];
    return {
      airport: { code: code, city: cleanCity(city), country: countryName(country), lat: lat, lon: lon, name: name, isNew: true },
    };
  }

  // 3. Nach Stadtnamen suchen (deutsche Namen aus airports.js + Datenbank)
  const lower = text.toLowerCase();
  const search = CITY_ALIASES[lower] || lower;
  const matches = new Set();
  Object.keys(AIRPORTS).forEach(c => {
    if (AIRPORTS[c].city.toLowerCase() === lower) matches.add(c);
  });
  Object.keys(DB).forEach(c => {
    if (cleanCity(DB[c][0]).toLowerCase() === search) matches.add(c);
  });
  // nichts gefunden: im Flughafen-Namen suchen
  if (matches.size === 0 && search.length >= 4) {
    Object.keys(DB).forEach(c => {
      if (DB[c][4].toLowerCase().includes(search)) matches.add(c);
    });
  }

  const codes = [...matches];
  if (codes.length === 1) return findAirport(codes[0]);
  if (codes.length > 1) {
    const list = codes.slice(0, 6).map(c => `${c} (${airportLabel(c)})`).join(", ");
    return { message: `Mehrere Flughäfen: ${list}. Bitte den Code eingeben.` };
  }
  return { message: "Nicht gefunden. Bitte den 3-Buchstaben-Code eingeben (steht auf der Bordkarte)." };
}

// Prüft ein Feld ("from" oder "to") und zeigt das Ergebnis darunter an
function checkField(key) {
  const field = fields[key];
  const result = findAirport(field.input.value);
  field.airport = result.airport || null;

  if (field.airport) {
    const a = field.airport;
    field.info.className = "hint ok";
    field.info.textContent = a.isNew
      ? `✓ ${a.code} – ${a.name}, ${a.country} (neuer Flughafen)`
      : `✓ ${a.code} – ${a.city}, ${a.country}`;
    // Bei neuen Flughäfen kann man den Stadtnamen für die Website anpassen
    field.cityWrap.hidden = !a.isNew;
    if (a.isNew) field.cityInput.value = a.city;
  } else {
    field.info.className = "hint warn";
    field.info.textContent = result.message;
    field.cityWrap.hidden = true;
  }
}


// ---------- Formular öffnen und schließen ----------

// Heutiges Datum (nach deiner Uhr) als "JJJJ-MM-TT"
function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function openForm() {
  form.reset();
  dateInput.value = today();
  Object.keys(fields).forEach(key => {
    fields[key].airport = null;
    fields[key].info.textContent = "";
    fields[key].cityWrap.hidden = true;
  });
  tokenWrap.hidden = Boolean(getToken());
  setStatus("Lade Flughafen-Liste …", "");
  saveButton.disabled = true;
  modal.hidden = false;

  loadAirportDb()
    .then(() => {
      setStatus("", "");
      saveButton.disabled = false;
      fields.from.input.focus();
    })
    .catch(error => setStatus(error.message, "error"));
}

function closeForm() {
  modal.hidden = true;
}

function setStatus(text, type) {
  statusText.textContent = text;
  statusText.className = "status " + type;
}

addButton.addEventListener("click", openForm);
document.getElementById("f-cancel").addEventListener("click", closeForm);
fields.from.input.addEventListener("change", () => checkField("from"));
fields.to.input.addEventListener("change", () => checkField("to"));


// ---------- GitHub: Datei lesen und speichern ----------

// Text ↔ Base64 (GitHub verschickt Dateien so; mit Umlauten)
function decodeBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// Verständliche Fehlermeldungen
function githubError(status) {
  if (status === 401) return new Error("Der GitHub-Schlüssel ist ungültig oder abgelaufen.");
  if (status === 403 || status === 404) return new Error("Der Schlüssel darf das Repo „fluege“ nicht ändern (Rechte prüfen).");
  if (status === 409) return new Error("Gerade wurde gleichzeitig etwas geändert. Bitte nochmal speichern.");
  return new Error(`GitHub-Fehler (${status}). Bitte später nochmal versuchen.`);
}

function githubUrl(file) {
  return `https://api.github.com/repos/${REPO}/contents/${file}`;
}

function githubHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
  };
}

// Datei aus dem Repo holen: Text + "sha" (Versionskennung, braucht GitHub zum Speichern)
async function readFile(file, token) {
  const response = await fetch(`${githubUrl(file)}?ref=${BRANCH}`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw githubError(response.status);
  const data = await response.json();
  return { text: decodeBase64(data.content), sha: data.sha };
}

// Geänderte Datei ins Repo schreiben (= ein Commit)
async function writeFile(file, text, sha, message, token) {
  const response = await fetch(githubUrl(file), {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message: message, content: encodeBase64(text), sha: sha, branch: BRANCH }),
  });
  if (!response.ok) throw githubError(response.status);
}

// Neue Zeile vor dem Schluss-Zeichen einfügen ("];" bzw. "};")
function insertLine(text, marker, line) {
  const pos = text.lastIndexOf(marker);
  if (pos === -1) throw new Error("Die Datei hat ein unerwartetes Format.");
  return text.slice(0, pos) + line + "\n" + text.slice(pos);
}


// ---------- Speichern ----------

form.addEventListener("submit", async event => {
  event.preventDefault();

  // Felder prüfen
  checkField("from");
  checkField("to");
  const from = fields.from.airport;
  const to = fields.to.airport;
  const date = dateInput.value;
  const duration = durationInput.value.trim();
  const token = getToken() || tokenInput.value.trim();

  if (!date) return setStatus("Bitte ein Datum wählen.", "error");
  if (!from || !to) return setStatus("Bitte bei „Von“ und „Nach“ einen gültigen Flughafen eingeben.", "error");
  if (from.code === to.code) return setStatus("Start und Ziel sind gleich.", "error");
  if (duration && !/^\d{1,2}:\d{2}$/.test(duration)) return setStatus("Flugzeit bitte als Stunden:Minuten, z. B. 2:30.", "error");
  if (!token) return setStatus("Bitte den GitHub-Schlüssel eingeben.", "error");

  // Neue Flughäfen sammeln (mit dem eingegebenen Stadtnamen)
  const newAirports = {};
  [["from", from], ["to", to]].forEach(([key, a]) => {
    if (a.isNew) {
      const city = fields[key].cityInput.value.trim() || a.city;
      newAirports[a.code] = { city: city, country: a.country, lat: a.lat, lon: a.lon };
    }
  });

  // Zeile für flights.js
  let flightLine = `  { date: "${date}", from: "${from.code}", to: "${to.code}"`;
  if (duration) flightLine += `, duration: "${duration}"`;
  flightLine += " },";

  saveButton.disabled = true;
  setStatus("Speichere …", "");

  try {
    // 1. neue Flughäfen in airports.js
    const codes = Object.keys(newAirports);
    if (codes.length > 0) {
      const file = await readFile("airports.js", token);
      let text = file.text;
      codes.forEach(code => {
        const a = newAirports[code];
        const line = `  ${code}: { city: ${JSON.stringify(a.city)}, country: ${JSON.stringify(a.country)}, lat: ${a.lat}, lon: ${a.lon} },`;
        text = insertLine(text, "};", line);
      });
      await writeFile("airports.js", text, file.sha, `Neuer Flughafen: ${codes.join(", ")}`, token);
    }

    // 2. Flug in flights.js
    const file = await readFile("flights.js", token);
    const text = insertLine(file.text, "];", flightLine);
    await writeFile("flights.js", text, file.sha, `Neuer Flug: ${shortDate(date)} ${from.code} → ${to.code}`, token);

    // Geklappt: Schlüssel merken und den Flug sofort auf der Karte zeigen
    saveToken(token);
    Object.assign(AIRPORTS, newAirports);
    const flight = { date: date, from: from.code, to: to.code };
    if (duration) flight.duration = duration;
    FLIGHTS.push(flight);
    refreshFlights();

    setStatus("Gespeichert ✓ Für alle sichtbar in ca. 1–2 Minuten.", "ok");
    setTimeout(closeForm, 2500);
  } catch (error) {
    // Bei falschem Schlüssel: vergessen und nochmal fragen
    if (/Schlüssel/.test(error.message)) {
      forgetToken();
      tokenWrap.hidden = false;
    }
    setStatus(error.message, "error");
    saveButton.disabled = false;
  }
});
