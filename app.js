// ===== Schritt 2: leere Weltkarte =====

// Das SVG-Element, in das die Karte gezeichnet wird
const svg = d3.select("#map");

// Projektion: macht aus der runden Erde eine flache Karte
const projection = d3.geoNaturalEarth1();
const path = d3.geoPath(projection);

// Länder aus world.js in zeichenbare Formen umwandeln (ohne Antarktis)
const countries = topojson
  .feature(WORLD, WORLD.objects.countries)
  .features.filter(land => land.properties.name !== "Antarctica");

// Ebenen der Karte, von hinten nach vorne:
// 1. Meer (die ganze Erdkugel)
const sphere = svg.append("path")
  .attr("class", "sphere")
  .datum({ type: "Sphere" });

// 2. feines Gitter aus Längen- und Breitengraden
const graticule = svg.append("path")
  .attr("class", "graticule")
  .datum(d3.geoGraticule10());

// 3. Länder
const land = svg.append("g")
  .selectAll("path")
  .data(countries)
  .join("path")
  .attr("class", "country");

// Karte an die aktuelle Fenstergröße anpassen und zeichnen
function draw() {
  const box = svg.node().getBoundingClientRect();
  const width = box.width;
  const height = box.height;

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Ganze Welt mit 20 px Rand einpassen
  // (ab Schritt 3: nur der Bereich, in dem Flüge sind)
  projection.fitExtent([[20, 20], [width - 20, height - 20]], { type: "Sphere" });

  sphere.attr("d", path);
  graticule.attr("d", path);
  land.attr("d", path);
}

draw();

// Wenn das Fenster größer/kleiner wird: neu zeichnen
window.addEventListener("resize", draw);
