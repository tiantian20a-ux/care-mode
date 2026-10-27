export function shQuote(s: string): string {
  if (/[\n\r\0]/.test(s)) throw new Error("参数里有非法字符");
  return /^[\w.:\-/=]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}
