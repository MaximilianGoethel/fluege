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
  { date: "2026-11-27", from: "SZX", to: "TSA", who: "yaro" },
  { date: "2024-11-19", from: "MUC", to: "SIN", who: "yaro" },
  { date: "2024-11-20", from: "SIN", to: "BKK", who: "yaro" },
  { date: "2024-12-13", from: "LPQ", to: "HAN", who: "yaro" },
  { date: "2025-09-11", from: "ZRH", to: "JFK", who: "maxi" },
  { date: "2025-09-20", from: "JFK", to: "MIA", who: "maxi" },
  { date: "2025-09-26", from: "MIA", to: "ZRH", who: "maxi" },
  { date: "2018-08-16", from: "FDH", to: "KEF", who: "maxi" },
  { date: "2026-11-27", from: "DAD", to: "SGN", who: "yaro" },
  { date: "2025-05-03", from: "MUC", to: "LPA", who: "emanuel" },
  { date: "2025-01-01", from: "HAN", to: "HUI", who: "yaro" },
  { date: "2025-04-26", from: "FMM", to: "TNG", who: "emanuel" },
  { date: "2025-02-20", from: "HKT", to: "KUL", who: "yaro" },
  { date: "2025-05-03", from: "TNG", to: "CIA", who: "emanuel" },
  { date: "2025-05-05", from: "FCO", to: "LIS", who: "emanuel" },
  { date: "2025-05-05", from: "LIS", to: "CMN", who: "emanuel" },
  { date: "2025-05-15", from: "TNG", to: "FMM", who: "emanuel" },
  { date: "2025-07-16", from: "MUC", to: "SAW", who: "emanuel" },
];
