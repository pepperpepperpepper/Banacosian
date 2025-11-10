- Buttons & selects share near-identical “pill” styling in two places: `css/components/controls.css:1-73` (`.ui-pill`, `.select-pill`) and `www/staff/font/styles.css:123-154` (`.font-select, button`). You can drop the latter in favour of the shared `.ui-pill` class (e.g., add `class="ui-pill"` in the font demo) and expose any font-demo-specific tweaks through additional modifiers instead of duplicating the base styles.

- We hard-code drag/selection guards twice. The block that sets `touch-action: none`, `-webkit-user-select: none`, and `-webkit-tap-highlight-color: transparent` lives in both `www/staff/styles.css:61-76` and `www/staff/font/styles.css:176-191`. Consider moving that into a reusable utility (e.g., `.interaction-draggable`) defined once in a shared sheet so both demos can apply it.

- Card container styling is effectively repeated: `css/layout/container.css:1-38` defines the glassmorphism card used on the home page, while `www/staff/styles.css:36-70` manually restates a very similar pattern (background, border radius, shadow, padding). You could export a generic `.card` pattern (background, border, shadow, radius) in a shared layout file and let each side extend it for their specific spacing needs.

- Legacy DOM staff rules were removed alongside the VexFlow migration (`css/components/staff.css`). Double-check for any remaining references to the old `.staff` markup so we can delete unused CSS/HTML fragments safely.

- Responsive rules for the piano keys show up in both `css/responsive.css:1-14` (main app) and `www/staff/font/styles.css:206-228` (font demo) with only minor differences. Extract a single breakpoint block (perhaps in a shared `css/responsive/piano.css`) so the keyboard height math is maintained in one place.
