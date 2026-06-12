export function minorFromDecimal(args: { amount: string | number; currencyExponent: number }): number {
  const exp = args.currencyExponent;
  if (!Number.isInteger(exp) || exp < 0 || exp > 9) throw new Error("currencyExponent out of range");

  const s = String(args.amount).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error("Invalid decimal amount");
  if (s.startsWith("-")) throw new Error("Negative amounts not supported");

  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;

  if (fracRaw.length > exp) {
    const extra = fracRaw.slice(exp);
    if (!/^0*$/.test(extra)) throw new Error("Too many decimal places");
  }

  const frac = fracRaw.padEnd(exp, "0").slice(0, exp);
  const combined = `${whole}${frac}`.replace(/^0+(?=\d)/, "");
  const n = Number(combined);
  if (!Number.isSafeInteger(n)) throw new Error("Amount out of range");
  return n;
}

