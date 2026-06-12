import { Cormorant_Garamond, Manrope } from "next/font/google";

export const berlinPressSerif = Cormorant_Garamond({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--berlin-press-serif",
});

export const berlinPressSans = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  style: ["normal"],
  display: "swap",
  variable: "--berlin-press-sans",
});
