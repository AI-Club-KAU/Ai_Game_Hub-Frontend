---
name: ai-club-brand
description: Apply the AI Club Games Hub visual identity to this project's Arabic booth frontend and its reusable UI components.
---

# AI Club Games Hub identity

Read the four PNG references in design-reference/ at the repository root when changing the visual direction. They are reference boards, not production assets.

- Brand colors: green #54D640, purple #7E36E3, white #FFFFFF. Use dark neutral surfaces; do not label other colors as official brand colors.
- Arabic interface with lang=ar and dir=rtl. Isolate Latin codes and numerals where necessary. Never space Arabic letters apart for decoration.
- Keep design tokens in src/app/globals.css. The current Tahoma/Arial stack is provisional; replace through --font-arabic once the official font is supplied.
- Do not redraw or crop a final logo from the boards. The current game icon is illustrative. Use original SVG/PNG assets when supplied.
- Use large booth controls (48px minimum), readable labels, visible keyboard focus and text/icon status feedback. Honor reduced motion.
- Prefer the existing shadcn-style UI components. Add React Bits only when a restrained effect improves this interface.
- Maintain green action buttons with dark text, dark surfaces and restrained purple accents. Validate contrast and responsive RTL layout after changes.

This skill specifies visual guidance only; follow the user's approved phase scope for functionality.
