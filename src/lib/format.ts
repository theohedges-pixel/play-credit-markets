export const fmtCredits = (n: number | string) =>
  Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

export const fmtPct = (p: number) => `${Math.round(p * 100)}¢`;

export const yesPrice = (yesPool: number, noPool: number) =>
  noPool / (yesPool + noPool);

export const timeUntil = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};
