// ===== Flüge auf der Website eintragen, bearbeiten und löschen =====
// Speichert über die GitHub-Schnittstelle direkt in flights.js (und neue Flughäfen
// in airports.js). Dafür braucht es einen persönlichen GitHub-Schlüssel (Token).
// Er wird nur im Browser gespeichert, nie im Repo.


// ---------- Einstellungen ----------

const REPO = "MaximilianGoethel/fluege";
const BRANCH = "main";
const TOKEN_KEY = "fluege-github-token";
const PERSON_KEY = "fluege-person"; // merkt sich, wer zuletzt eingetragen hat

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


// ---------- Im Browser merken: Schlüssel und Person ----------

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (error) { return ""; }
}

function saveToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch (error) { /* ignorieren */ }
}

function forgetToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (error) { /* ignorieren */ }
}

function getLastPerson() {
  try { return localStorage.getItem(PERSON_KEY) || ""; } catch (error) { return ""; }
}

function saveLastPerson(who) {
  try { localStorage.setItem(PERSON_KEY, who); } catch (error) { /* ignorieren */ }
}


// ---------- Elemente auf der Seite ----------

const addButton = document.getElementById("btn-add");
const listButton = document.getElementById("btn-list");

// Formular (für neue und geänderte Flüge)
const modal = document.getElementById("add-modal");
const form = document.getElementById("add-form");
const formTitle = document.getElementById("f-title");
const statusText = document.getElementById("f-status");
const saveButton = document.getElementById("f-save");
const tokenWrap = document.getElementById("f-token-wrap");
const tokenInput = document.getElementById("f-token");
const dateInput = document.getElementById("f-date");
const durationInput = document.getElementById("f-duration");
const whoSelect = document.getElementById("f-who");

// Flugliste
const listModal = document.getElementById("list-modal");
const listElement = document.getElementById("flight-list");
const listStatus = document.getElementById("list-status");

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

// Auswahl "Wer?" mit allen Personen aus people.js füllen
Object.keys(PEOPLE).forEach(key => {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = PEOPLE[key].name;
  whoSelect.appendChild(option);
});

// Buttons "+ Flug" und "Liste" nur auf euren Geräten zeigen:
// wenn ein Schlüssel gespeichert ist oder die Adresse auf #neu endet
if (getToken() || location.hash === "#neu") {
  addButton.hidden = false;
  listButton.hidden = false;
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
    if (a.isNew) {
      // deutsch eingetippter Name (z. B. "Singapur") wird übernommen, sonst der aus der Datenbank
      const typed = field.input.value.trim();
      field.cityInput.value = CITY_ALIASES[typed.toLowerCase()]
        ? typed.charAt(0).toUpperCase() + typed.slice(1)
        : a.city;
    }
  } else {
    field.info.className = "hint warn";
    field.info.textContent = result.message;
    field.cityWrap.hidden = true;
  }
}


// ---------- Formular öffnen und schließen ----------

let editing = null;        // Flug, der gerade bearbeitet wird (null = neuer Flug)
let backToList = false;    // nach dem Speichern zurück zur Liste?

// Heutiges Datum (nach deiner Uhr) als "JJJJ-MM-TT"
function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Öffnet das Formular: leer für einen neuen Flug oder ausgefüllt zum Bearbeiten
function openForm(flight) {
  editing = flight || null;
  form.reset();
  Object.keys(fields).forEach(key => {
    fields[key].airport = null;
    fields[key].info.textContent = "";
    fields[key].cityWrap.hidden = true;
  });

  if (editing) {
    formTitle.textContent = "Flug bearbeiten";
    dateInput.value = editing.date;
    fields.from.input.value = editing.from;
    fields.to.input.value = editing.to;
    durationInput.value = editing.duration || "";
    whoSelect.value = personOf(editing);
  } else {
    formTitle.textContent = "Neuer Flug";
    dateInput.value = today();
    // vorauswählen: wer gerade angezeigt wird, sonst wer zuletzt eingetragen hat
    const last = getLastPerson();
    whoSelect.value = selected !== "alle" ? selected : (PEOPLE[last] ? last : DEFAULT_PERSON);
  }

  tokenWrap.hidden = Boolean(getToken());
  setStatus("Lade Flughafen-Liste …", "");
  saveButton.disabled = true;
  modal.hidden = false;

  loadAirportDb()
    .then(() => {
      setStatus("", "");
      saveButton.disabled = false;
      if (editing) {
        checkField("from");
        checkField("to");
      } else {
        fields.from.input.focus();
      }
    })
    .catch(error => setStatus(error.message, "error"));
}

function closeForm() {
  modal.hidden = true;
  if (backToList) {
    backToList = false;
    openList();
  }
}

function setStatus(text, type) {
  statusText.textContent = text;
  statusText.className = "status " + type;
}

addButton.addEventListener("click", () => openForm(null));
document.getElementById("f-cancel").addEventListener("click", closeForm);
fields.from.input.addEventListener("change", () => checkField("from"));
fields.to.input.addEventListener("change", () => checkField("to"));


// ---------- GitHub: Dateien lesen und speichern ----------

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

// Neue Zeile vor dem Schluss-Zeichen einfügen ("};" in airports.js)
function insertLine(text, marker, line) {
  const pos = text.lastIndexOf(marker);
  if (pos === -1) throw new Error("Die Datei hat ein unerwartetes Format.");
  return text.slice(0, pos) + line + "\n" + text.slice(pos);
}

// Liest die Liste aus dem Text von flights.js bzw. airports.js
function parseList(text, name) {
  try {
    return new Function(text + `\nreturn ${name};`)();
  } catch (error) {
    throw new Error(`Die Datei mit ${name} hat einen Fehler und kann nicht gelesen werden.`);
  }
}

// Ein Flug als Zeile für flights.js
function flightLine(flight) {
  const order = ["date", "from", "to", "duration", "who", "note"];
  const keys = order.filter(k => flight[k] !== undefined && flight[k] !== "")
    .concat(Object.keys(flight).filter(k => !order.includes(k)));
  return "  { " + keys.map(k => `${k}: ${JSON.stringify(flight[k])}`).join(", ") + " },";
}

// Sind zwei Einträge derselbe Flug?
function sameFlight(a, b) {
  return a.date === b.date && a.from === b.from && a.to === b.to &&
    personOf(a) === personOf(b) && (a.duration || "") === (b.duration || "");
}

// Holt den aktuellen Stand von GitHub, wendet die Änderung an und speichert.
// change: Funktion, die die Flugliste verändert. newAirports: neue Flughäfen (oder {}).
async function saveChange(change, newAirports, message, token) {
  // 1. Flughäfen: aktuellen Stand holen, neue ergänzen
  const airportFile = await readFile("airports.js", token);
  const codes = Object.keys(newAirports);
  let freshAirports = parseList(airportFile.text, "AIRPORTS");
  if (codes.length > 0) {
    let text = airportFile.text;
    codes.forEach(code => {
      const a = newAirports[code];
      const line = `  ${code}: { city: ${JSON.stringify(a.city)}, country: ${JSON.stringify(a.country)}, lat: ${a.lat}, lon: ${a.lon} },`;
      text = insertLine(text, "};", line);
    });
    await writeFile("airports.js", text, airportFile.sha, `Neuer Flughafen: ${codes.join(", ")}`, token);
    freshAirports = { ...freshAirports, ...newAirports };
  }

  // 2. Flüge: aktuellen Stand holen, ändern, Datei neu schreiben (Kommentare oben bleiben)
  const flightFile = await readFile("flights.js", token);
  const list = parseList(flightFile.text, "FLIGHTS");
  change(list);
  const start = flightFile.text.indexOf("const FLIGHTS");
  const header = start > 0 ? flightFile.text.slice(0, start) : "";
  const text = header + "const FLIGHTS = [\n" + list.map(flightLine).join("\n") + "\n];\n";
  await writeFile("flights.js", text, flightFile.sha, message, token);

  // 3. Seite sofort auf den neuen Stand bringen
  Object.assign(AIRPORTS, freshAirports);
  FLIGHTS.splice(0, FLIGHTS.length, ...list);
}

// Fehler beim Speichern: bei falschem Schlüssel diesen vergessen
function handleSaveError(error, showMessage) {
  if (/Schlüssel/.test(error.message)) {
    forgetToken();
    tokenWrap.hidden = false;
  }
  showMessage(error.message);
}


// ---------- Speichern (neuer oder geänderter Flug) ----------

form.addEventListener("submit", async event => {
  event.preventDefault();

  // Felder prüfen
  checkField("from");
  checkField("to");
  const from = fields.from.airport;
  const to = fields.to.airport;
  const date = dateInput.value;
  const duration = durationInput.value.trim();
  const who = whoSelect.value;
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

  // Der Flug, wie er gespeichert werden soll
  const flight = { date: date, from: from.code, to: to.code };
  if (duration) flight.duration = duration;
  flight.who = who;
  const label = `(${PEOPLE[who].name}): ${shortDate(date)} ${from.code} → ${to.code}`;

  saveButton.disabled = true;
  setStatus("Speichere …", "");

  try {
    if (editing) {
      const old = editing;
      await saveChange(list => {
        const index = list.findIndex(f => sameFlight(f, old));
        if (index === -1) throw new Error("Dieser Flug wurde inzwischen geändert. Bitte Seite neu laden.");
        // Notiz o. Ä. behalten, Rest ersetzen
        const kept = { ...list[index] };
        delete kept.duration;
        list[index] = { ...kept, ...flight };
      }, newAirports, `Flug geändert ${label}`, token);
    } else {
      await saveChange(list => list.push(flight), newAirports, `Neuer Flug ${label}`, token);
    }

    // Geklappt: Schlüssel und Person merken, Karte neu zeichnen
    saveToken(token);
    saveLastPerson(who);
    listButton.hidden = false;
    if (selected !== "alle" && selected !== who) {
      selectPerson(who);   // zur Person des Flugs wechseln
    } else {
      refreshFlights();
    }

    setStatus("Gespeichert ✓ Für alle sichtbar in ca. 1–2 Minuten.", "ok");
    setTimeout(closeForm, 1500);
  } catch (error) {
    handleSaveError(error, message => setStatus(message, "error"));
    saveButton.disabled = false;
  }
});


// ---------- Flugliste: ansehen, bearbeiten, löschen ----------

let listPerson = "alle";   // in der Liste gewählte Person

// Auswahl-Buttons in der Liste (wie oben in der Box)
const listChips = d3.select("#list-people")
  .selectAll("button")
  .data(choices)
  .join("button")
  .attr("type", "button")
  .attr("class", "chip")
  .on("click", (event, choice) => {
    listPerson = choice.key;
    renderList();
  });

listChips.append("span")
  .attr("class", "chip-dot")
  .style("background", c => c.color || allDot);

listChips.append("span").text(c => c.name);

function setListStatus(text, type) {
  listStatus.textContent = text;
  listStatus.className = "status " + type;
}

function openList() {
  listPerson = selected;   // startet mit der Person, die gerade auf der Karte zu sehen ist
  setListStatus("", "");
  renderList();
  listModal.hidden = false;
}

function closeList() {
  listModal.hidden = true;
}

listButton.addEventListener("click", openList);
document.getElementById("list-close").addEventListener("click", closeList);

// Name einer Stadt (falls Flughafen fehlt: Code)
function cityOf(code) {
  return AIRPORTS[code] ? AIRPORTS[code].city : code;
}

// Baut die Liste neu auf (neueste Flüge oben)
function renderList() {
  listChips.classed("active", c => c.key === listPerson);

  const items = FLIGHTS
    .filter(f => listPerson === "alle" || personOf(f) === listPerson)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  listElement.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "Noch keine Flüge.";
    listElement.appendChild(empty);
    return;
  }

  items.forEach(flight => {
    const person = PEOPLE[personOf(flight)];
    const row = document.createElement("li");
    row.className = "flight-row";

    // farbiger Punkt der Person
    const dot = document.createElement("span");
    dot.className = "chip-dot";
    dot.style.background = person ? person.color : "#888";

    // Datum, Strecke, Details
    const info = document.createElement("div");
    info.className = "row-info";
    const main = document.createElement("div");
    main.className = "row-main";
    main.textContent = `${shortDate(flight.date)} · ${flight.from} → ${flight.to}`;
    const sub = document.createElement("div");
    sub.className = "row-sub";
    let details = `${cityOf(flight.from)} → ${cityOf(flight.to)}`;
    if (listPerson === "alle" && person) details = `${person.name} · ${details}`;
    if (flight.duration) details += ` · ${flight.duration} h`;
    sub.textContent = details;
    info.append(main, sub);

    // Bearbeiten
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "icon-button";
    editButton.title = "Bearbeiten";
    editButton.textContent = "✎";
    editButton.addEventListener("click", () => {
      closeList();
      backToList = true;
      openForm(flight);
    });

    // Löschen (erst nach zweitem Klick)
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "icon-button danger";
    deleteButton.title = "Löschen";
    deleteButton.textContent = "Löschen";
    deleteButton.addEventListener("click", () => {
      if (!deleteButton.classList.contains("confirm")) {
        deleteButton.classList.add("confirm");
        deleteButton.textContent = "Sicher?";
        setTimeout(() => {
          deleteButton.classList.remove("confirm");
          deleteButton.textContent = "Löschen";
        }, 3000);
        return;
      }
      deleteFlight(flight);
    });

    row.append(dot, info, editButton, deleteButton);
    listElement.appendChild(row);
  });
}

async function deleteFlight(flight) {
  const token = getToken();
  if (!token) {
    setListStatus("Kein Schlüssel gespeichert. Bitte zuerst über „+ Flug“ den Schlüssel eingeben.", "error");
    return;
  }
  const name = PEOPLE[personOf(flight)] ? PEOPLE[personOf(flight)].name : personOf(flight);
  setListStatus("Lösche …", "");
  try {
    await saveChange(list => {
      const index = list.findIndex(f => sameFlight(f, flight));
      if (index === -1) throw new Error("Dieser Flug wurde inzwischen geändert. Bitte Seite neu laden.");
      list.splice(index, 1);
    }, {}, `Flug gelöscht (${name}): ${shortDate(flight.date)} ${flight.from} → ${flight.to}`, token);
    refreshFlights();
    renderList();
    setListStatus("Gelöscht ✓", "ok");
  } catch (error) {
    handleSaveError(error, message => setListStatus(message, "error"));
  }
}
