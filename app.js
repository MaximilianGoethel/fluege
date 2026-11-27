// ===== Schritt 3: Weltkarte mit Flügen als feste Linien =====

// Das SVG-Element, in das die Karte gezeichnet wird
const svg = d3.select("#map");

// Projektion: macht aus der runden Erde eine flache Karte
const projection = d3.geoNaturalEarth1();
const path = d3.geoPath(projection);


// ---------- 1. Daten vorbereiten ----------

// Koordinaten eines Flughafens als [Länge, Breite] (so will D3 es haben)
function coords(code) {
  const airport = AIRPORTS[code];
  return [airport.lon, airport.lat];
}

// Nur Flüge behalten, deren Flughäfen in airports.js stehen
const flights = FLIGHTS
  .filter(flight => {
    const ok = AIRPORTS[flight.from] && AIRPORTS[flight.to];
    if (!ok) {
      console.warn("Flug übersprungen, Flughafen fehlt in airports.js:", flight);
    }
    return ok;
  })
  // nach Datum sortieren (ältester Flug zuerst)
  .sort((a, b) => a.date.localeCompare(b.date));

// Jeder Flug als Linie (D3 zeichnet sie automatisch als Großkreisbogen)
const flightLines = flights.map(flight => ({
  type: "Feature",
  properties: flight,
  geometry: {
    type: "LineString",
    coordinates: [coords(flight.from), coords(flight.to)],
  },
}));

// Alle Flughäfen, die in meinen Flügen vorkommen (jeder nur einmal)
const usedAirports = [...new Set(flights.flatMap(flight => [flight.from, flight.to]))];

// Länder aus world.js in zeichenbare Formen umwandeln (ohne Antarktis)
const countries = topojson
  .feature(WORLD, WORLD.objects.countries)
  .features.filter(land => land.properties.name !== "Antarctica");


// ---------- 2. Leuchteffekt für die Fluglinien ----------

const glow = svg.append("defs")
  .append("filter")
  .attr("id", "glow")
  .attr("filterUnits", "userSpaceOnUse")
  .attr("x", "-10%").attr("y", "-10%")
  .attr("width", "120%").attr("height", "120%");

glow.append("feGaussianBlur")
  .attr("stdDeviation", 2.5)
  .attr("result", "blur");

const merge = glow.append("feMerge");
merge.append("feMergeNode").attr("in", "blur");          // leuchtender Schein
merge.append("feMergeNode").attr("in", "SourceGraphic"); // scharfe Linie darüber


// ---------- 3. Ebenen der Karte (von hinten nach vorne) ----------

// Meer
const sphere = svg.append("path")
  .attr("class", "sphere")
  .datum({ type: "Sphere" });

// feines Gitter aus Längen- und Breitengraden
const graticule = svg.append("path")
  .attr("class", "graticule")
  .datum(d3.geoGraticule10());

// Länder
const land = svg.append("g")
  .selectAll("path")
  .data(countries)
  .join("path")
  .attr("class", "country");

// Fluglinien
const lines = svg.append("g")
  .attr("filter", "url(#glow)")
  .selectAll("path")
  .data(flightLines)
  .join("path")
  .attr("class", "flight");

// Punkte für die Flughäfen
const dots = svg.append("g")
  .selectAll("circle")
  .data(usedAirports)
  .join("circle")
  .attr("class", "airport")
  .attr("r", 3);


// ---------- 4. Zeichnen ----------

function draw() {
  const box = svg.node().getBoundingClientRect();
  const width = box.width;
  const height = box.height;

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Rand um die Flüge: 10 % der kürzeren Seite, mindestens 30 px
  const pad = Math.max(30, Math.min(width, height) * 0.1);

  // Ausschnitt so wählen, dass alle Flüge reinpassen
  // (gibt es noch keine Flüge: ganze Welt zeigen)
  const focus = flightLines.length > 0
    ? { type: "FeatureCollection", features: flightLines }
    : { type: "Sphere" };

  projection.fitExtent([[pad, pad], [width - pad, height - pad]], focus);

  sphere.attr("d", path);
  graticule.attr("d", path);
  land.attr("d", path);
  lines.attr("d", path);
  dots
    .attr("cx", code => projection(coords(code))[0])
    .attr("cy", code => projection(coords(code))[1]);
}

draw();

// Wenn das Fenster größer/kleiner wird: neu zeichnen
window.addEventListener("resize", draw);
