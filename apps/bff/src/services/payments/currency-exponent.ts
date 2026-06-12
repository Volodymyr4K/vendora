const ISO_4217_EXPONENTS: Record<string, number> = {
  // exponent 2 (MVP supported)
  UAH: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  PLN: 2,
  CHF: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  CZK: 2,
  RON: 2,
  HUF: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  SGD: 2,
  HKD: 2,

  // exponent 0 (examples; MVP rejects)
  JPY: 0,
  KRW: 0,

  // exponent 3 (examples; MVP rejects)
  KWD: 3,
  BHD: 3,
};

export function currencyExponentFromIso(currency: string): number | null {
  const key = currency.trim().toUpperCase();
  const exp = ISO_4217_EXPONENTS[key];
  return typeof exp === "number" ? exp : null;
}

