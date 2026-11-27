// ===== Weltkarte mit animierten Flügen =====


// ---------- Einstellungen ----------

const MAX_TOTAL = 25000;   // ganze Animation dauert höchstens 25 Sekunden
const GAP = 250;           // kurze Pause zwischen zwei Flügen (Millisekunden)
const START_DELAY = 600;   // kurze Pause, bevor der erste Flug startet
const EARTH_RADIUS = 6371; // Erdradius in km

// Form des Flugzeugs (zeigt nach rechts, Mittelpunkt bei 0,0)
const PLANE_SHAPE =
  "M 10 0 L 2 -1.5 L -2 -8 L -4 -8 L -1 -1.5 L -6 -1.5 L -8 -4 L -9.5 -4 " +
  "L -8 0 L -9.5 4 L -8 4 L -6 1.5 L -1 1.5 L -4 8 L -2 8 L 2 1.5 Z";


// ---------- Hilfsfunktionen ----------

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


// ---------- Flüge vorbereiten ----------

const flights = FLIGHTS
  // nur Flüge, deren Flughäfen in airports.js stehen
  .filter(flight => {
    const ok = AIRPORTS[flight.from] && AIRPORTS[flight.to];
    if (!ok) {
      console.warn("Flug übersprungen, Flughafen fehlt in airports.js:", flight);
    }
    return ok;
  })
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

    return {
      ...flight,
      km: km,
      minutes: minutes,
      arc: d3.geoInterpolate(from, to), // Punkt auf dem Großkreisbogen (0 = Start, 1 = Ziel)
    };
  });


// ---------- Zeitplan der Animation ----------

// Jeder Flug dauert 1,4 s, lange Strecken bis zu 2,6 s
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

// Fortschritt jedes Flugs: 0 = noch nicht gestartet, 1 = angekommen
let progress = flights.map(() => 0);
let timer = null;


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

const lines = svg.append("g")
  .attr("filter", "url(#glow)")
  .selectAll("path")
  .data(flights)
  .join("path")
  .attr("class", "flight");

const usedAirports = [...new Set(flights.flatMap(f => [f.from, f.to]))];
const dots = svg.append("g")
  .selectAll("circle")
  .data(usedAirports)
  .join("circle")
  .attr("class", "airport")
  .attr("r", 3);

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

  // Punkte
  dots
    .style("display", code => airportVisible(code) ? null : "none")
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

  d3.select("#stat-km").text(Math.round(km).toLocaleString("de-DE"));
  d3.select("#stat-time").text(formatTime(minutes));
  d3.select("#stat-flights").text(landed);

  // Text unter der Überschrift: aktuelle Strecke bzw. Zeitraum am Ende
  const started = progress.filter(p => p > 0).length;
  let routeText = "";
  if (flights.length > 0 && landed === flights.length) {
    routeText = `${shortDate(flights[0].date)} – ${shortDate(flights[flights.length - 1].date)}`;
  } else if (started > 0) {
    const f = flights[started - 1];
    routeText = `${shortDate(f.date)} · ${AIRPORTS[f.from].city} → ${AIRPORTS[f.to].city}`;
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


// ---------- Start ----------

resize();
play();
window.addEventListener("resize", resize);
