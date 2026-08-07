// The entire UI is drawn in exactly two colours, lifted from the app icon
// (electron/build/icon.svg): one dark grey and one red.
//
// Nothing else is allowed. Every value below is either the ink, the red, or the
// red at some alpha — which is still a blend of those two and no third hue.
// Before adding a colour anywhere in the app, add it here instead; if it cannot
// be expressed as INK/RED/red(alpha), it does not belong in the app.
//
// None of these are literal hex any more. They resolve to CSS custom properties
// declared in index.css, because during a writing session the two colours SWAP:
// as the draft nears deletion the background crosses over to red and the text
// crosses over to ink, everywhere in the app at once. Anything holding a hex
// value of its own would sit out that swap and be the one element left behind,
// so keep colours going through these tokens rather than inlining them.
export const INK = "var(--ink)";
export const RED = "var(--red)";

/** Red at an alpha. Over the ink background this reads as a dimmer red. */
export const red = (alpha) => `rgb(from var(--red) r g b / ${alpha})`;

/** Ink at an alpha — only needed for the modal scrim. */
const ink = (alpha) => `rgb(from var(--ink) r g b / ${alpha})`;

export const T = {
  // Surfaces — ink, or ink tinted by a whisper of red
  bg: INK,
  surface: red(0.05),
  raised: red(0.1),
  overlay: ink(0.92),

  // Lines
  border: red(0.3),
  borderStrong: red(0.55),

  // Text: red at three weights. The faintest is still legible on ink.
  text: RED,
  textMuted: red(0.7),
  textFaint: red(0.45),

  // Sitting on a solid red fill, text goes back to ink
  onRed: INK,

  // A red glow instead of a black drop shadow — black would be a third colour
  // and is invisible against ink anyway.
  glow: `0 4px 32px ${red(0.18)}`,
  glowStrong: `0 4px 40px ${red(0.3)}`,
};
