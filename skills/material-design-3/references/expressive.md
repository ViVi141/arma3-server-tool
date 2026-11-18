# Material 3 Expressive

Use this reference only when Material 3 Expressive is requested, already present, or clearly improves a prominent interaction. Expressive is an expansion of Material 3 across color, shape, typography, motion, and components. It is not a separate excuse to ignore Material semantics.

## Decide Whether to Use It

Use Expressive when the product benefits from one or more of these outcomes:

- a primary action or transition needs stronger, faster recognition;
- a consumer-facing brand needs more emotional distinction;
- state change benefits from shape or spatial continuity;
- an important loading, progress, navigation, or action group has an official expressive component;
- the screen has enough visual breathing room for contrast in scale or shape.

Prefer standard Material 3 when:

- the screen is a dense admin, settings, finance, data-entry, or repeated-work surface;
- motion would slow scanning or repeated action;
- the app cannot accept an experimental dependency/API;
- the target platform does not implement the needed expressive component;
- accessibility, performance, or product tone argues for restraint.

An app may mix calm standard surfaces with a few expressive moments. Consistency means a coherent rule for emphasis, not identical intensity everywhere.

## Platform and Stability Gate

For Android phone/tablet Compose, inspect the installed `androidx.compose.material3:material3` API and current release notes. Expressive APIs have moved over time between `@ExperimentalMaterial3ExpressiveApi` and stable status. Do not infer availability from a design mockup or from this document.

Before using an expressive API:

1. Confirm the symbol exists in the installed version.
2. Confirm whether it requires an opt-in annotation.
3. Check whether the current module permits experimental APIs.
4. Check minimum SDK, platform, and Kotlin/Compose compatibility.
5. Avoid changing stable projects to alpha dependencies without explicit agreement.
6. Keep the implementation replaceable if the API is experimental.

Wear OS uses `androidx.wear.compose:compose-material3`, not the phone/tablet Material 3 artifact. The round display, edge-hugging containers, rotary input, and Wear component set require a Wear-specific design.

Material Web is not feature-equivalent to Android Expressive. Verify component availability on the official component page. If an expressive component is unavailable, preserve its task semantics with accessible HTML and supported M3 tokens rather than cloning an Android control literally.

## Theme Systems

Expressive work should remain token-based:

- `MaterialExpressiveTheme` when available and appropriate;
- `ColorScheme`, including supported expressive or dynamic schemes;
- `Typography` and flexible type treatment;
- `Shapes` and `MaterialShapes` where supported;
- `MotionScheme.standard()` for utility interactions;
- `MotionScheme.expressive()` for prominent interactions.

Do not manually copy internal component token values. Defaults and APIs change; public theme and component APIs are the compatibility boundary.

## Color

Expressive color may be more vibrant or contrasting, but it still uses semantic roles and accessible foreground/background pairs.

- Let one seed or a controlled brand palette generate a coherent scheme.
- Use dynamic color when it fits product identity and the Android version supports it; keep a complete fallback.
- Give fixed/identity-sensitive brand elements deliberate colors instead of letting wallpaper color make them unrecognizable.
- Use tertiary or container roles for controlled contrast, not a rainbow of section colors.
- Validate light, dark, dynamic, and high-contrast outcomes with real components and content.

Expressive does not mean transparent. Keep the primary content surfaces stable and semantic. Do not reinterpret Expressive as liquid glass, frosted cards, alpha-heavy gradients, blurred backgrounds, or translucent chrome. If a product needs a transparent media overlay, isolate it to that overlay and preserve a solid fallback and readable contrast.

## Shape

Expressive shape works through contrast, morphing, and families of related shapes.

- Use a distinctive shape to make an important component or state recognizable.
- Use related shapes for grouped controls and connected actions.
- Morph shape in response to a real press, selection, expansion, or transition.
- Keep text, icons, and touch targets stable and legible throughout the morph.
- Use `MaterialShapes` only where the silhouette is meaningful and supported.

Avoid:

- scattering decorative polygons behind content;
- assigning a different novelty shape to every card;
- clipping photos or text into shapes that lose important content;
- using shape morph as idle animation;
- turning all containers into oversized capsules.

## Typography

Flexible typography can change width, weight, scale, or hierarchy to reinforce emphasis.

- Reserve the largest contrast for destination identity, editorial content, or an important state.
- Keep control labels and dense data stable and easy to scan.
- Make type changes respond to available space and content length.
- Test variable font support, font fallback, localization, and large font scale.
- Never solve overflow by disabling scaling or shrinking text below a readable role.

## Motion Physics

Use Material motion schemes and component defaults instead of unrelated per-screen easing constants.

- Standard motion: frequent utility actions, repeated list operations, simple effects, and dense workflows.
- Expressive motion: major state changes, primary interactions, meaningful spatial transitions, and a small number of brand moments.
- Effects specs: color, alpha, and other changes that do not alter bounds.
- Spatial specs: position, bounds, scale, or shape changes.

Motion must be interruptible, converge on the current state, and preserve input responsiveness. Avoid chained spectacle, arbitrary delay, and concurrent animations that compete for attention. Respect system animation/reduced-motion settings and provide an understandable final state without motion.

## Expressive Components

The available catalog evolves. Prefer the exact public component supported by the installed library. Depending on release and target, the catalog can include expressive variants or APIs for:

- button sizes and animated button shapes;
- icon button widths and animated shapes;
- button groups and split buttons;
- FAB variants, toggle FABs, and FAB menus;
- horizontal and vertical floating toolbars;
- flexible app bars and navigation variants;
- loading and progress indicators;
- carousels and other emphasized content patterns.

For each use, verify the official spec's purpose, anatomy, variants, behavior, and target availability. Do not create a component solely because its demo looks distinctive.

## Intensity Budget

Before implementation, define an intensity budget:

- `quiet`: background surfaces, body copy, routine list rows, frequent utility controls;
- `clear`: navigation, selected states, section identity, secondary actions;
- `expressive`: one primary action, key transition, important progress state, or brand moment.

Most of a working screen should remain quiet. A screen where every region is expressive has no emphasis hierarchy.

## Migration Pattern

When introducing Expressive to an existing app:

1. Preserve navigation, state, and behavior.
2. Centralize theme changes before changing individual screens.
3. Migrate one component family or flow at a time.
4. Keep wrappers around experimental components only when they isolate real API churn.
5. Compare before/after screens at the same content and dimensions.
6. Confirm performance and interaction behavior, not only appearance.
7. Remove legacy overrides that fight the new public component defaults.

Do not mix old and new component families accidentally. A deliberate phased migration may mix them, but the boundary and reason should be explicit.

## Expressive Review

- Is each expressive treatment attached to a user goal or important state?
- Is the primary interaction more recognizable or usable?
- Are utility interactions calmer than prominent interactions?
- Does the screen still work with motion disabled?
- Are shapes and type legible with long localized content?
- Does the code use public theme/component APIs rather than copied token internals?
- Is every experimental dependency and annotation intentional?
- Could any morph, color, or shape be removed without losing meaning? If yes, remove it.
- Does any transparency or blur exist for a real product/system reason, or is it only imitating liquid glass? Remove the latter.
