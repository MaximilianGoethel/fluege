// ===== Weltkarte mit animierten Flügen =====


// ---------- Einstellungen ----------

const MAX_TOTAL = 25000;   // ganze Animation dauert höchstens 25 Sekunden
const GAP = 250;           // kurze Pause zwischen zwei Flügen (Millisekunden)
const START_DELAY = 600;   // kurze Pause, bevor der erste Flug startet
const EARTH_RADIUS = 6371; // Erdradius in km
const STRIPE = 7;          // Länge der Farbstreifen bei gemeinsamen Strecken (Pixel)

// CO2 pro Passagier und km (grobe Schätzung, Economy, nur CO2 ohne Kondensstreifen-Effekte,
// Größenordnung nach den britischen Umrechnungsfaktoren DESNZ/DEFRA 2024)
const CO2_SHORT = 0.11;  // kg pro km bei Flügen unter 3700 km
const CO2_LONG = 0.10;   // kg pro km bei Flügen ab 3700 km
const TREE_KG_PER_YEAR = 12.5; // so viel CO2 bindet eine Buche im Schnitt pro Jahr (Wald-Zentrum Uni Münster)

// Form des Flugzeugs (zeigt nach rechts, Mittelpunkt bei 0,0)
const PLANE_SHAPE =
  "M 10 0 L 2 -1.5 L -2 -8 L -4 -8 L -1 -1.5 L -6 -1.5 L -8 -4 L -9.5 -4 " +
  "L -8 0 L -9.5 4 L -8 4 L -6 1.5 L -1 1.5 L -4 8 L -2 8 L 2 1.5 Z";


// ---------- Hilfsfunktionen ----------

// Zu wem gehört ein Flug? (ohne Angabe: DEFAULT_PERSON aus people.js)
function personOf(flight) {
  return flight.who || DEFAULT_PERSON;
}

// Koordinaten eines Flughafens als [Länge, Breite] (so will D3 es haben)
function coords(code) {
  const airport = AIRPORTS[code];
  return [airport.lon, airport.lat];
}

// "2026-08-29" → "29.08.26"
function shortDate(date) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year.slice(2)}`;
}

// "11:45" → 705 Minuten
function parseDuration(text) {
  const [hours, minutes] = text.split(":").map(Number);
  return hours * 60 + minutes;
}

// 2240 Minuten → "37 h 20 min"
function formatTime(minutes) {
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)} h ${total % 60} min`;
}

// 830 → "830 kg", 3396 → "3,4 t"
function formatCO2(kg) {
  if (kg < 1000) {
    return `${Math.round(kg)} kg`;
  }
  const tonnes = (kg / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${tonnes} t`;
}


// ---------- Flüge vorbereiten ----------

let flights = [];        // aufbereitete Flüge (sortiert, mit km, Zeit, CO2)
let usedAirports = [];   // alle Flughafen-Codes, die vorkommen
let progress = [];       // Fortschritt jedes Flugs: 0 = noch nicht gestartet, 1 = angekommen
let timer = null;

// Wessen Flüge werden gezeigt? "alle" oder ein Kürzel aus people.js.
// Über die Adresse vorwählbar, z. B. …/fluege/#yaro
let selected = PEOPLE[location.hash.slice(1)] ? location.hash.slice(1) : "alle";

// Liest FLIGHTS und AIRPORTS und rechnet alles aus.
// Wird beim Start aufgerufen, beim Wechsel der Person und nach einem neuen Flug aus dem Formular.
function prepareFlights() {
  flights = FLIGHTS
    // nur Flüge, deren Flughäfen und Person es gibt
    .filter(flight => {
      if (!AIRPORTS[flight.from] || !AIRPORTS[flight.to]) {
        console.warn("Flug übersprungen, Flughafen fehlt in airports.js:", flight);
        return false;
      }
      if (!PEOPLE[personOf(flight)]) {
        console.warn("Flug übersprungen, Person fehlt in people.js:", flight);
        return false;
      }
      return true;
    })
    // nur die ausgewählte Person (oder alle)
    .filter(flight => selected === "alle" || personOf(flight) === selected)
    // nach Datum sortieren (ältester Flug zuerst)
    .sort((a, b) => a.date.localeCompare(b.date))
    // Entfernung und Flugzeit ausrechnen
    .map(flight => {
      const from = coords(flight.from);
      const to = coords(flight.to);

      // Großkreis-Entfernung (d3.geoDistance nutzt die Haversine-Formel)
      const km = Math.round(d3.geoDistance(from, to) * EARTH_RADIUS);

      // echte Flugzeit, wenn angegeben – sonst Schätzung: km / 800 km/h + 30 min
      const minutes = flight.duration
        ? parseDuration(flight.duration)
        : km / 800 * 60 + 30;

      // CO2 in kg (Kurzstrecke pro km etwas mehr, weil Start und Steigflug mehr Sprit brauchen)
      const co2 = km * (km < 3700 ? CO2_SHORT : CO2_LONG);

      return {
        ...flight,
        who: personOf(flight),
        color: PEOPLE[personOf(flight)].color, // Farbe der Person
        km: km,
        minutes: minutes,
        co2: co2,
        arc: d3.geoInterpolate(from, to), // Punkt auf dem Großkreisbogen (0 = Start, 1 = Ziel)
      };
    });

  // Zeitplan der Animation: jeder Flug 1,4 s, lange Strecken bis zu 2,6 s
  const rawDurations = flights.map(f => 1400 + Math.min(f.km, 10000) / 10000 * 1200);

  // Bei vielen Flügen alles schneller abspielen, damit es höchstens 25 s dauert
  const rawTotal = d3.sum(rawDurations) + GAP * flights.length;
  const speed = Math.min(1, MAX_TOTAL / rawTotal);

  let clock = START_DELAY;
  flights.forEach((flight, i) => {
    flight.animStart = clock;
    flight.animDuration = rawDurations[i] * speed;
    clock += (rawDurations[i] + GAP) * speed;
  });

  // Gleiche Strecke von mehreren Personen? Dann Linie gestreift in allen Farben,
  // sonst würde eine Farbe die andere verdecken. Hin- und Rückflug zählen als gleiche Strecke.
  const routePeople = {};
  flights.forEach(f => {
    const route = [f.from, f.to].sort().join("-");
    routePeople[route] = routePeople[route] || [];
    if (!routePeople[route].includes(f.who)) routePeople[route].push(f.who);
  });
  flights.forEach(f => {
    const people = routePeople[[f.from, f.to].sort().join("-")];
    f.stripeCount = people.length;          // wie viele Personen diese Strecke geflogen sind
    f.stripeIndex = people.indexOf(f.who);  // die wievielte davon diese Person ist
  });

  usedAirports = [...new Set(flights.flatMap(f => [f.from, f.to]))];
  progress = flights.map(() => 0);
}


// ---------- Karte aufbauen ----------

const svg = d3.select("#map");
const panel = document.querySelector(".panel");
const projection = d3.geoNaturalEarth1();
const path = d3.geoPath(projection);

// Länder aus world.js (ohne Antarktis)
const countries = topojson
  .feature(WORLD, WORLD.objects.countries)
  .features.filter(land => land.properties.name !== "Antarctica");

// Leuchteffekt für Linien und Flugzeug
const glow = svg.append("defs")
  .append("filter")
  .attr("id", "glow")
  .attr("filterUnits", "userSpaceOnUse")
  .attr("x", "-10%").attr("y", "-10%")
  .attr("width", "120%").attr("height", "120%");
glow.append("feGaussianBlur").attr("stdDeviation", 2.5).attr("result", "blur");
const merge = glow.append("feMerge");
merge.append("feMergeNode").attr("in", "blur");          // leuchtender Schein
merge.append("feMergeNode").attr("in", "SourceGraphic"); // scharfe Linie darüber

// Ebenen, von hinten nach vorne
const sphere = svg.append("path").attr("class", "sphere").datum({ type: "Sphere" });
const graticule = svg.append("path").attr("class", "graticule").datum(d3.geoGraticule10());

const land = svg.append("g")
  .selectAll("path")
  .data(countries)
  .join("path")
  .attr("class", "country");

const linesLayer = svg.append("g").attr("filter", "url(#glow)"); // Fluglinien
const dotsLayer = svg.append("g");                               // Flughafen-Punkte
let lines;
let dots;

// Verknüpft Linien und Punkte mit den aktuellen Flügen
function bindData() {
  lines = linesLayer
    .selectAll("path")
    .data(flights)
    .join("path")
    .attr("class", "flight")
    .style("stroke", f => f.color)
    // Streifen bei gemeinsamen Strecken: jede Person zeichnet nur jedes x-te Stück
    .style("stroke-dasharray", f => f.stripeCount > 1 ? `${STRIPE} ${STRIPE * (f.stripeCount - 1)}` : null)
    .style("stroke-dashoffset", f => f.stripeCount > 1 ? -f.stripeIndex * STRIPE : null);

  dots = dotsLayer
    .selectAll("circle")
    .data(usedAirports)
    .join("circle")
    .attr("class", "airport")
    .attr("r", 3);
}

const plane = svg.append("path")
  .attr("class", "plane")
  .attr("d", PLANE_SHAPE)
  .attr("filter", "url(#glow)")
  .style("display", "none");


// ---------- Zeichnen ----------

// Teil eines Bogens: vom Start bis zum Anteil p (0 bis 1)
function partialArc(flight, p) {
  const steps = 40;
  const points = d3.range(steps + 1).map(i => flight.arc(p * i / steps));
  return { type: "LineString", coordinates: points };
}

// Flughafen-Punkt zeigen, sobald ein Flug dort startet oder angekommen ist
function airportVisible(code) {
  return flights.some((f, i) =>
    (f.from === code && progress[i] > 0) || (f.to === code && progress[i] === 1)
  );
}

// Zeichnet Linien, Punkte, Flugzeug und Zähler passend zum aktuellen Fortschritt
function render() {
  // Linien: fertige ganz, laufende bis zum Flugzeug, kommende gar nicht
  lines.attr("d", (f, i) => progress[i] > 0 ? path(partialArc(f, progress[i])) : null);

  // Punkte (bei einer Person in ihrer Farbe, bei allen hellgrau)
  dots
    .style("display", code => airportVisible(code) ? null : "none")
    .style("fill", selected === "alle" ? null : PEOPLE[selected].color)
    .attr("cx", code => projection(coords(code))[0])
    .attr("cy", code => projection(coords(code))[1]);

  // Flugzeug beim Flug, der gerade unterwegs ist
  const active = progress.findIndex(p => p > 0 && p < 1);
  if (active === -1) {
    plane.style("display", "none");
  } else {
    const f = flights[active];
    const p = progress[active];
    const here = projection(f.arc(p));
    const ahead = projection(f.arc(Math.min(p + 0.01, 1)));
    // Winkel in Flugrichtung
    const angle = Math.atan2(ahead[1] - here[1], ahead[0] - here[0]) * 180 / Math.PI;
    plane
      .style("display", null)
      .attr("transform", `translate(${here[0]},${here[1]}) rotate(${angle}) scale(1.1)`);
  }

  // Zähler
  const km = d3.sum(flights, (f, i) => f.km * progress[i]);
  const minutes = d3.sum(flights, (f, i) => f.minutes * progress[i]);
  const landed = progress.filter(p => p === 1).length;
  const co2 = d3.sum(flights, (f, i) => f.co2 * progress[i]);
  const trees = Math.round(co2 / TREE_KG_PER_YEAR);

  d3.select("#stat-km").text(Math.round(km).toLocaleString("de-DE"));
  d3.select("#stat-time").text(formatTime(minutes));
  d3.select("#stat-flights").text(landed);
  d3.select("#stat-co2").text(formatCO2(co2));
  d3.select("#stat-trees").text(trees.toLocaleString("de-DE"));

  // Text unter der Überschrift: aktuelle Strecke bzw. Zeitraum am Ende
  const started = progress.filter(p => p > 0).length;
  let routeText = "";
  if (flights.length === 0) {
    routeText = "Noch keine Flüge";
  } else if (landed === flights.length) {
    routeText = `${shortDate(flights[0].date)} – ${shortDate(flights[flights.length - 1].date)}`;
  } else if (started > 0) {
    const f = flights[started - 1];
    // bei "Alle" steht der Name dabei, z. B. "29.08.26 · Maxi: Frankfurt → Shenzhen"
    const name = selected === "alle" ? `${PEOPLE[f.who].name}: ` : "";
    routeText = `${shortDate(f.date)} · ${name}${AIRPORTS[f.from].city} → ${AIRPORTS[f.to].city}`;
  }
  d3.select("#route").text(routeText);
}

// Karte an die Fenstergröße anpassen
function resize() {
  const box = svg.node().getBoundingClientRect();
  const width = box.width;
  const height = box.height;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Rand: 8 % der kürzeren Seite, mindestens 30 px
  const pad = Math.max(30, Math.min(width, height) * 0.08);

  // Platz für die Zähler-Box frei lassen (Computer: links, Handy: oben)
  const panelBox = panel.getBoundingClientRect();
  let left = pad;
  let top = pad;
  if (width > 700) {
    left = panelBox.right - box.left + pad * 0.5;
  } else {
    top = panelBox.bottom - box.top + pad * 0.5;
  }

  // Ausschnitt so wählen, dass alle Flüge reinpassen (ohne Flüge: ganze Welt)
  const focus = flights.length > 0
    ? { type: "FeatureCollection", features: flights.map(f => ({ type: "Feature", geometry: partialArc(f, 1) })) }
    : { type: "Sphere" };
  projection.fitExtent([[left, top], [width - pad, height - pad]], focus);

  sphere.attr("d", path);
  graticule.attr("d", path);
  land.attr("d", path);
  render();
}


// ---------- Abspielen, Überspringen ----------

// Zeigt je nach Zustand den passenden Button
function showButtons(playing) {
  d3.select("#btn-skip").style("display", playing ? null : "none");
  d3.select("#btn-replay").style("display", playing ? "none" : null);
}

function play() {
  if (timer) timer.stop();
  progress = flights.map(() => 0);
  showButtons(true);

  // d3.timer ruft diese Funktion ca. 60-mal pro Sekunde auf
  timer = d3.timer(elapsed => {
    progress = flights.map(f => {
      const raw = (elapsed - f.animStart) / f.animDuration;
      const clamped = Math.max(0, Math.min(1, raw));
      return d3.easeCubicInOut(clamped); // sanft starten und landen
    });
    render();
    if (progress.every(p => p === 1)) finish();
  });
}

// Alles sofort fertig anzeigen
function finish() {
  if (timer) timer.stop();
  timer = null;
  progress = flights.map(() => 1);
  render();
  showButtons(false);
}

d3.select("#btn-skip").on("click", finish);
d3.select("#btn-replay").on("click", play);


// ---------- Auswahl: wessen Flüge? ----------

// Buttons "Alle", "Maxi", "Emanuel", "Yaro" aus people.js erzeugen
const choices = [{ key: "alle", name: "Alle", color: null }].concat(
  Object.keys(PEOPLE).map(key => ({ key: key, name: PEOPLE[key].name, color: PEOPLE[key].color }))
);

// Punkt für "Alle": aus allen Farben zusammengesetzt
const allColors = Object.values(PEOPLE).map(p => p.color);
const allDot = "conic-gradient(" +
  allColors.map((c, i) => `${c} ${i / allColors.length * 100}% ${(i + 1) / allColors.length * 100}%`).join(", ") +
  ")";

const chips = d3.select("#people")
  .selectAll("button")
  .data(choices)
  .join("button")
  .attr("class", "chip")
  .on("click", (event, choice) => selectPerson(choice.key));

chips.append("span")
  .attr("class", "chip-dot")
  .style("background", c => c.color || allDot);

chips.append("span").text(c => c.name);

// Überschrift und aktiven Button passend zur Auswahl setzen
function updateSelection() {
  chips.classed("active", c => c.key === selected);
  d3.select("#title").text(selected === "alle" ? "Unsere Flüge" : `Flüge von ${PEOPLE[selected].name}`);
}

// Person wechseln: Karte, Zähler und Animation passen sich an
function selectPerson(key) {
  selected = key;
  // Adresse anpassen, damit man den Link teilen kann (z. B. …/fluege/#yaro)
  history.replaceState(null, "", key === "alle" ? location.pathname : "#" + key);
  updateSelection();
  refreshFlights();
}


// ---------- Start ----------

// Alles neu einlesen, zeichnen und abspielen (auch nach einem neuen Flug aus dem Formular)
function refreshFlights() {
  prepareFlights();
  bindData();
  resize();
  play();
}

updateSelection();
refreshFlights();
window.addEventListener("resize", resize);

// Wenn jemand die Adresse ändert (z. B. …#yaro), Person wechseln
window.addEventListener("hashchange", () => {
  const key = location.hash.slice(1);
  if (PEOPLE[key] && key !== selected) selectPerson(key);
});
