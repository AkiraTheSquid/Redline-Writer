// The entire UI is drawn in exactly two colours, lifted from the app icon
// (electron/build/icon.svg): one dark grey and one red.
//
// Nothing else is allowed. Every value below is either INK, RED, or red laid
// over ink at some alpha — which is still a blend of those two and no third
// hue. Before adding a colour anywhere in the app, add it here instead; if it
// cannot be expressed as INK/RED/red(alpha), it does not belong in the app.
export const INK = "#1E1E1E";
export const RED = "#ED0020";

/** Red at an alpha. Over the ink background this reads as a dimmer red. */
export const red = (alpha) => `rgba(237, 0, 32, ${alpha})`;

export const T = {
  // Surfaces — ink, or ink tinted by a whisper of red
  bg: INK,
  surface: red(0.05),
  raised: red(0.1),
  overlay: "rgba(30, 30, 30, 0.92)",

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
