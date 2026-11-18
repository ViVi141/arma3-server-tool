# Material 3 on the Web

Use this reference for HTML/CSS, web components, Angular, React, Vue, Svelte, or other browser UI. Material 3 is a design system; Android component APIs and behavior are not automatically web APIs.

## Select an Implementation

Choose based on the existing stack and current maintenance status.

| Situation | Preferred direction |
| --- | --- |
| Existing `@material/web` application | Reuse supported Material Web components and public CSS tokens; account for maintenance mode |
| New framework-agnostic web-component application | Evaluate `@material/web` maintenance, component coverage, browser support, and project longevity before adopting |
| Angular application | Prefer current Angular Material; its theming system supports Material 3 |
| Existing third-party Material library | Keep it if it meets the task, but verify whether it implements M3, M2, or only a Material-like aesthetic |
| Missing official component | Build the smallest semantic accessible control using project tokens, or choose a maintained framework component |

Do not switch frameworks or component libraries as part of an ordinary UI change. Do not call a third-party library "official Material 3" unless its current documentation supports that claim.

## Material Web Status

`@material/web` provides cross-framework web components built with Lit and themed through CSS custom properties. Its repository currently states that Material Web Components is in maintenance mode pending new maintainers. That does not make existing applications invalid, but it changes the adoption and upgrade decision.

Before using it:

1. Check the current repository status and latest release.
2. Check the official component page for availability.
3. Confirm browser, form, SSR/hydration, and framework integration requirements.
4. Import only needed components for production bundles unless the project intentionally uses the aggregate import.
5. Do not assume Android Expressive components or motion APIs exist on web.

Some Material specification pages explicitly mark Web or Web Expressive implementations unavailable. In that case, do not invent an import name. Preserve the interaction model with supported components or semantic HTML.

## Semantic HTML First

Use the native element whose behavior matches the task, whether directly or inside a library component:

- `button` for actions;
- `a` for navigation;
- labeled `input`, `textarea`, and `select` controls for data entry;
- headings in logical order;
- lists, tables, and landmarks for their actual structures;
- `dialog` or a proven accessible dialog primitive for modal behavior.

Do not make a clickable `div` imitate a button. If a custom element is necessary, ensure its role, name, value/state, keyboard behavior, form behavior, focus behavior, and disabled behavior match the native control.

## Tokens and Theming

Material Web uses CSS custom properties for supported design tokens. Prefer system roles, then component tokens for a narrowly scoped exception.

```css
:root {
  --md-sys-color-primary: #6750a4;
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-surface: #fffbfe;
  --md-sys-color-on-surface: #1d1b20;
  --md-ref-typeface-brand: "Brand Sans";
  --md-ref-typeface-plain: system-ui;
}
```

The values are illustrative. Generate and validate a complete role set; do not paste these few variables as a production theme.

- Put global role tokens at the app/theme root.
- Scope alternate themes at a deliberate container boundary.
- Use `prefers-color-scheme` only when it matches the product's theme model; preserve explicit user choice.
- Use component tokens for a real component exception, not to fork every component style.
- Do not reach into a component's private shadow DOM or internal class names.
- Material Web documentation does not expose every reference or motion token family. Verify supported tokens before using them.
- With Angular Material, use its public Sass theming APIs and component mixins. Do not depend on private DOM or CSS structure.

Material Color Utilities can generate role values from a source color when runtime color generation is actually required. Static products can generate and commit reviewed theme tokens instead.

## Layout

Material components do not provide the entire page layout automatically.

- Use CSS Grid for two-dimensional regions and Flexbox for one-dimensional groups.
- Use container queries when a reusable component should adapt to its own width; use viewport queries for true page/window changes.
- Keep content fluid between breakpoints.
- Adapt navigation and reveal supporting panes as space increases.
- Constrain prose, forms, dialogs, and controls on wide screens.
- Keep source order logical even when visual regions move.
- Account for mobile safe-area insets where full-bleed content reaches display edges.
- Avoid fixed heights for text-bearing controls and panels unless overflow behavior is intentionally defined.

Do not copy Android dp breakpoints blindly into CSS. Use content, input, and layout pressure to choose web breakpoints, while keeping compact/medium/expanded Material principles.

## Component Use

- Keep one high-emphasis action per task region.
- Use filled, tonal, outlined, and text action variants according to priority.
- Use cards only for discrete contained items; use sections, lists, and tables for page structure and dense data.
- Keep forms visibly labeled. Placeholder text is not a label.
- Use chips for filters/selections/attributes, not decorative category spam.
- Use tabs for peer panels and implement the tab keyboard pattern.
- Use tooltips for unfamiliar icons, not for essential information that touch users cannot discover.
- Keep menus and popovers anchored, focus-managed, dismissible, and viewport-aware.
- Keep dialog focus trapped while open and restore focus to the invoker when closed.

## Progressive Loading and Forms

- Use skeletons only when the final structure is known and the wait is meaningful; otherwise use a small contextual progress indicator.
- Keep already available content visible during refresh and mark the affected region as busy.
- Use determinate progress for uploads, imports, and other measurable work.
- Respect `prefers-reduced-motion` by replacing shimmer with a static state.
- Keep async errors actionable with retry, edit, cancel, or offline recovery; do not show a generic toast and discard form data.
- Use native form elements or the library's supported form controls with real labels, descriptions, constraints, and error associations.
- Choose `autocomplete`, `inputmode`, `type`, `enterkeyhint`, and `aria-*` relationships deliberately.
- Validate locally at a helpful point in the flow and server-side rules on submit/blur as appropriate; avoid noisy per-keystroke validation.
- Keep the submit action identifiable while pending, prevent duplicates, and expose busy state without making the entire page inert unless the operation truly blocks it.
- Preserve values and focus context when helper/error text appears or the viewport changes.
- Keep forms readable on wide screens and usable with keyboard, mobile IME, zoom, screen reader, and narrow viewports.

## Visual Restraint

- Do not put the app in a giant floating rounded shell.
- Do not surround every section or list row with a border.
- Use outlined component variants for their intended emphasis, not as a generic section style. Do not add a second border around an already outlined control.
- Use `outline` for meaningful component boundaries and `outlineVariant` only for nonessential separation; required control and state cues must reach `3:1` against adjacent colors.
- Do not add a shadow to stationary content just to make it look designed.
- Do not nest card-shaped panels.
- Do not use glass, blur, gradient, glow, or hover lift as a default Material interpretation.
- Do not make the page or component palette transparent by default. Avoid `backdrop-filter`, frosted surfaces, alpha-heavy white overlays, translucent borders, and background bleed-through for routine content.
- Use opaque or high-opacity Material system roles for text, forms, navigation, menus, dialogs, and data. If a media overlay genuinely needs translucency, localize it, test against worst-case imagery, and provide a solid fallback.
- Do not make every control a pill.
- Do not use dashboard hero copy, decorative metrics, or fake charts to fill space.
- Prefer alignment, spacing, type, and surface roles over extra wrappers.

## Interaction and Motion

- Preserve native browser behaviors for links, forms, selection, context menus, and text.
- Provide visible hover and focus states without moving targets under the pointer.
- Use `:focus-visible` where appropriate; never suppress focus without replacement.
- Keep focus distinct from a persistent border. If authoring the indicator, use a stable outline or equivalent treatment with sufficient area and contrast rather than changing box dimensions.
- Keep transitions state-driven and interruptible.
- Use `prefers-reduced-motion` to remove or simplify nonessential movement.
- Avoid animating layout dimensions for repeated dense interactions when a simpler effect communicates the state.
- Do not recreate Android ripple or physics by hand when the selected component library owns interaction feedback.

## Accessibility

- Target WCAG 2.2 AA unless the product has a stricter requirement.
- Maintain logical heading, landmark, and source order.
- Associate labels, descriptions, errors, and required state with inputs.
- Support keyboard operation and visible focus for every action.
- Name icon-only controls and hide redundant decorative icons from assistive technology.
- Ensure text and meaningful non-text contrast across themes and states.
- Do not rely on color or motion alone.
- Preserve usability at 200% browser zoom and increased text size.
- Give touch users comfortable targets and spacing even when the pointer layout is dense.
- Announce asynchronous status appropriately without stealing focus.

## Web Verification

For the changed UI:

- run the project's focused typecheck, build, lint, and relevant component tests;
- inspect the exact reported viewport and affected narrow/wide breakpoints;
- inspect keyboard-only operation and focus restoration;
- inspect light/dark/high-contrast behavior supported by the product;
- inspect long content, localization, validation errors, loading, empty, and offline states;
- inspect 200% zoom and reduced motion;
- inspect touch-sized controls at a mobile viewport;
- check browser console errors and custom-element registration/import failures;
- use an automated accessibility scan as a supplement, not a replacement for keyboard and screen-reader reasoning.

Compilation cannot prove responsive layout, focus behavior, clipping, or visual hierarchy. Use browser screenshots and interaction checks when available.
