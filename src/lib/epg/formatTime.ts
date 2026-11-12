export function formatTimeRange(startIso: string, stopIso: string): string {
  const start = new Date(startIso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const stop = new Date(stopIso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${start}-${stop}`;
}

export function formatStartTime(startIso: string): string {
  return new Date(startIso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
