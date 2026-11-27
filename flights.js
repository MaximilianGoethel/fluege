// ===== Meine Flüge =====
// Neue Flüge einfach unten anhängen. Die Reihenfolge ist egal, die Seite sortiert nach Datum.
// Format: { date: "JJJJ-MM-TT", from: "CODE", to: "CODE" },
// Optional: duration: "11:45" (echte Flugzeit), note: "Text"
// Ein Umstieg = zwei einzelne Flüge.

const FLIGHTS = [
  { date: "2026-08-29", from: "FRA", to: "SZX" },
  { date: "2026-10-02", from: "HKG", to: "TPE" },
  { date: "2026-10-07", from: "KHH", to: "HKG" },
  { date: "2026-11-08", from: "HKG", to: "BKK" },
  { date: "2026-11-09", from: "BKK", to: "MUC" },
  { date: "2026-11-16", from: "MUC", to: "PEK" },
  { date: "2026-11-17", from: "PEK", to: "HKG" },
  { date: "2026-11-21", from: "SZX", to: "SHA" },
  { date: "2026-11-24", from: "SHA", to: "SZX" },
  { date: "2026-12-05", from: "SZX", to: "SHA", duration: "2:30" },
  { date: "2026-12-08", from: "SHA", to: "SZX", duration: "2:30" },
  { date: "2026-08-29", from: "FRA", to: "SZX", duration: "11:00", who: "yaro" },
];
