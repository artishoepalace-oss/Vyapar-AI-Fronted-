# Vyapar AI 20.10.2004.00028.2026

- Selected icons and labels both use the logo-arrow burgundy (#80011F), with a soft glow on every navigation destination.
- Top and bottom bars now share the same 367px width, responsive horizontal bounds, black surface and glossy inset rim.
- Top-bar logo is fitted inside a 44px circular white frame. Profile avatar uses a matching 44px outer circle with centered 36px initials.
- Navbar remains 50px high; its fixed 68×42px capsule and existing navigation behavior are preserved. Top bar keeps its 56px height.

Validation: 65 automated tests and runtime bundle checks. The release workflow additionally gates publication on Chromium checks at 320, 360, 383, 412 and 768px, covering all selected icons, matching bar edges, circular logo/avatar fit, More/back, rapid taps, resize and reduced motion. Browser checks use mocked accounts; physical Android testing is still required.
