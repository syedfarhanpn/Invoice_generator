# Geist, subset for PDF rendering

Downloaded from Google Fonts (fonts.gstatic.com), the same family the app UI
uses via `next/font/google`. SIL Open Font License 1.1, which permits
redistribution.

These are committed rather than fetched at render time for two reasons: a PDF
must not depend on a network call to a third party, and the PDF built-in fonts
(Helvetica, Times, Courier) have **no rupee glyph** — amounts would render as
blank boxes.

Glyph coverage was verified before committing: U+20B9 ₹, U+24 $, U+20AC €,
U+A3 £ all present in both weights.
