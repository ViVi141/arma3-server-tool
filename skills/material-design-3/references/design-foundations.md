# Material 3 Design Foundations

Use this reference when choosing the visual system, layout, or component family. Keep the product's task and existing brand ahead of novelty.

## Decision Order

Resolve design decisions in this order:

1. User goal and content priority.
2. Platform conventions and input model.
3. Information architecture and navigation.
4. Material component semantics.
5. Theme roles and adaptive layout.
6. Brand expression.
7. Decorative detail, only when it still serves the hierarchy.

A polished theme cannot rescue unclear navigation, an inappropriate component, or missing states.

## Information Hierarchy

- Make the page title identify the destination or task. Do not add an eyebrow, slogan, or explanatory banner by default.
- Keep one dominant action per task region. Two filled high-emphasis actions usually indicate unresolved priority.
- Place related controls near the content they affect. Put global controls in app bars or navigation, not inside arbitrary cards.
- Order information by task sequence or user value, not by how easily it fits into a symmetric card grid.
- Use progressive disclosure for advanced, destructive, or infrequent controls.
- Keep dense operational screens dense enough to scan. Material does not require large empty zones or marketing composition.

## Layout and Spacing

- Start from regions: system UI, primary navigation, app bar, body, supporting pane, and transient surfaces.
- Use a consistent spacing rhythm based on the existing product. An 8dp base with 4dp half-steps is a useful default, not a reason to replace an established scale.
- Use alignment and whitespace as the first grouping mechanism.
- Keep compact-window body content aligned to adaptive margins; 16dp is a common compact starting margin, not a universal fixed rule.
- Constrain long text and forms on wide windows. Do not stretch paragraphs, fields, buttons, or single-column settings across the full display.
- Let collections reflow or reveal more columns. Let list-detail and supporting content become panes. Do not merely increase padding at larger widths.
- Avoid multiple independent vertical scrollers unless the pane model clearly requires them.
- Preserve useful content during resize, rotation, fold posture changes, and IME appearance.

## Color

### Use semantic roles

Build or inherit a complete light and dark `ColorScheme`. Use role pairs rather than color names:

- `primary` / `onPrimary`: the highest-emphasis brand action or active state.
- `primaryContainer` / `onPrimaryContainer`: prominent but less forceful emphasis.
- `secondary` and `tertiary` families: supporting hierarchy and controlled contrast, not random accents.
- `surface` and `surfaceContainer*`: page and containment hierarchy.
- `onSurface` and `onSurfaceVariant`: primary and secondary content.
- `outline` and `outlineVariant`: necessary boundaries and subtle separation.
- `error` and its container roles: destructive or failed state, never general attention.

Prefer role changes over direct tone arithmetic in application code. If the project supports Android dynamic color, keep a deliberate brand fallback for unsupported devices and for contexts where brand consistency matters more.

### Avoid color noise

- Do not assign every section an accent color.
- Do not use several unrelated seed colors to manufacture variety.
- Do not use `primary` as the default color for all icons, headings, and links.
- Do not encode success, warning, selection, or error by color alone; pair color with text, iconography, shape, or state semantics.
- Do not invent low-contrast pastel-on-pastel combinations. Validate the actual foreground/background pairs in both schemes.
- Gradients are not a substitute for tonal roles. Use them only when supplied brand or content meaning calls for them.

## Typography

Material type roles express hierarchy:

- `display`: rare, large editorial or hero moments.
- `headline`: major screen or section hierarchy.
- `title`: component and subsection titles.
- `body`: reading and explanatory content.
- `label`: controls, navigation, metadata, and compact emphasis.

Choose roles by semantic level, not by the size that happens to fit. Keep the hierarchy small and repeatable. Most product screens need only a few roles.

- Use the existing brand and plain typefaces when available.
- Preserve user font scaling; do not convert scalable text to fixed pixel dimensions.
- Test long words, localization, multi-line labels, and at least 200% font scaling where the platform requires it.
- Do not force a control label to one line if truncation hides the action.
- Avoid uppercase and letter spacing as generic sophistication.
- Avoid oversized display typography inside compact panels, dialogs, cards, settings, or dashboards.
- Keep readable line length and line height; constrain text instead of shrinking it to fill a wide window.

## Shape and Containment

Shape is a hierarchy tool. It can distinguish component families, signal selection or press, connect grouped controls, and support brand character.

### Containment budget

Material guidance distinguishes implicit containment through alignment, whitespace, and typography from explicit containment through visible surfaces, cards, or dividers. Prefer implicit containment until a visible boundary communicates distinct ownership, interaction, selection, state, or scrolling behavior.

Use this skill-specific `1:3` heuristic to prevent container-heavy layouts:

- Inside a parent container or surface, use no more than one nested authored explicit container for every three meaningful content units carried by that parent. A meaningful content unit is user-relevant information, a control, or a coherent item; decorative marks and spacing do not count.
- Count a wrapper only when it adds a visible or behavioral boundary: a surface-role change, shape, outline, elevation, clipping, independent interaction, or independent scrolling. Do not count layout-only `Row`, `Column`, grid, flex, or semantic/accessibility nodes, nor the internal anatomy of a standard component.
- A child container must not repeat the same grouping, ownership, or emphasis already expressed by its parent. One boundary should carry one clear responsibility.
- If a unit genuinely needs a distinct boundary but would exceed its parent's `1:3` budget, make it a sibling standalone container or surface rather than wrapping it inside the current one. The standalone surface begins a new grouping and is not counted as a nested wrapper of the former parent.
- Keep authored explicit containment to at most two levels from the task-region surface to content. Standard component internals do not increase this depth.

The ratio is a review budget, not an official Material token or a reason to split coherent content mechanically. When the content model requires an exception, document the distinct responsibility of every retained layer and remove any layer whose responsibility can be expressed by spacing, alignment, typography, or one divider.

- Start with the theme shape scale and component defaults.
- Use stronger shape contrast for a specific prominent element, not every surface.
- Keep connected or grouped elements visually related.
- Use container boundaries only where the user needs to understand ownership or interaction.
- Do not put cards inside cards.
- Do not surround a section with both a surface change, an outline, a divider, and a shadow. Choose the least visual treatment that makes the boundary clear.
- Do not make every button, field, sheet, image, and content panel use the same pill or oversized radius.
- Clip imagery only when the container owns it; avoid decorative clipping that hides useful content.

## Elevation and Borders

Material elevation communicates relative depth. It is not a generic polish effect.

Use tonal elevation or a surface-container role for stationary hierarchy. Use shadow elevation when an element physically overlaps another surface and that overlap needs depth, such as a dialog, menu, or floating control.

### Give each stroke one job

- Component boundary: use the official outlined variant when a persistent perimeter helps identify the control or contained item.
- Group separation: use one restrained divider between adjacent groups or items; do not draw a perimeter around the whole group as well.
- State indication: use the component's focused, error, selected, pressed, and disabled tokens or state layer. Do not make one permanent border carry every state.
- Focus indication: preserve the platform or component focus indicator. A decorative outline is not a focus replacement.
- Decoration: omit the stroke unless it contributes meaning that spacing, alignment, typography, or a surface role cannot provide.

### Use roles and component defaults

- `outline` is the subtle Material color role for boundaries and adds contrast for accessibility. Use it when the boundary helps identify a component or meaningful state.
- `outlineVariant` is a lower-emphasis utility role for decorative boundaries and subtle separation. Do not use it for the only visible boundary of a control or the only focus, error, or selection cue.
- Prefer the installed version's component defaults, such as `CardDefaults.outlinedCardBorder()`, `ButtonDefaults.outlinedButtonBorder()`, and the `OutlinedTextFieldDefaults` container, colors, and thickness values, over a hard-coded stroke. Verify API availability first; defaults preserve that version's widths, colors, and enabled/disabled behavior.
- Keep the border inside the component's stable geometry so focus, validation, selection, or thickness changes do not resize content or shift neighboring elements.
- Do not combine an outline, contrasting container color, divider, and elevation to express the same boundary. Choose the smallest treatment that communicates the relationship.

### Preserve meaningful contrast

- On web, a boundary or state indicator required to identify a control must meet WCAG 2.2 AA non-text contrast of at least `3:1` against adjacent colors. A purely decorative border is exempt but must not become the only cue.
- Keyboard focus must remain visible. For a strong author-supplied web focus indicator, use the WCAG 2.4.13 AAA reference target: an indicator area at least equivalent to a `2px` perimeter and a `3:1` change between focused and unfocused pixels.
- Validate strokes against both adjoining surfaces in light, dark, dynamic/custom, and high-contrast modes. A token name alone does not prove rendered contrast.
- Do not rely on border color alone for error, selection, or destructive meaning; pair it with content, iconography, text, or another perceptible state cue.

- Flat page sections normally need neither outline nor shadow.
- Lists normally need spacing, alignment, or a restrained divider rather than one outlined card per row.
- Inputs can use their official filled or outlined treatment; do not add a second outer container border.
- Do not use colored shadows, glow, large blur radii, or permanent floating shells.
- Do not elevate every card. If everything floats, the depth model communicates nothing.
- On dark themes, validate actual separation; do not compensate with bright outlines around every surface.

## Transparency and Liquid Glass

Material 3 is not a liquid-glass design system. Stable semantic surfaces are the default because they preserve hierarchy, contrast, screenshots, accessibility, and predictable behavior across dynamic color and window changes.

Do not use as a generic visual language:

- transparent or semi-transparent cards and app shells;
- frosted-glass panels, `backdrop-filter: blur(...)`, or background blur behind routine content;
- translucent white overlays that wash out dynamic color roles;
- glass borders, inner highlights, specular streaks, or alpha gradients used only to look premium;
- content that intentionally bleeds through a control, form, dialog, or navigation surface;
- a transparent color palette that makes every component depend on the image behind it.

When translucency is justified by the product, treat it as a localized layer with a clear reason: an immersive media control, a system-like overlay, a scrim, or an explicitly supplied brand direction. Use a readable opaque or high-opacity fallback, validate foreground/background contrast against the worst underlying content, and ensure the surface remains understandable with dynamic color, dark theme, large text, reduced transparency, screenshots, and reduced motion. Never use transparency to avoid choosing proper Material surface roles.

## Icons and Imagery

- Use Material Symbols or the icon system already established by the project.
- Keep one symbol style and optical size within a control family.
- Use familiar symbols for familiar actions; add text or a tooltip when meaning is not obvious.
- Give meaningful non-text content an accessible description. Mark redundant decorative imagery as decorative.
- Avoid icons in decorative colored tiles unless the tile itself is an interactive component or meaningful category marker.
- Use real product or content imagery where inspection matters. Preserve subject focus across cropping and window changes.

## Component Selection

### Actions

| Need | Prefer | Avoid |
| --- | --- | --- |
| Main completion action | Filled button | Multiple filled peers |
| Important supporting action | Filled tonal button | Arbitrary accent button |
| Medium-emphasis action | Outlined button | Outlining the surrounding section too |
| Low-emphasis action | Text button | Hidden icon with unclear meaning |
| Compact familiar action | Icon button with accessible name | Tiny bare icon target |
| Frequent screen-level creation | FAB | FAB for navigation or infrequent action |
| Action plus closely related options | Split button when available | Two unrelated actions fused together |
| Related mutually useful actions | Button group when available | Decorative segmented pills |

### Selection and input

| Need | Prefer | Avoid |
| --- | --- | --- |
| Independent binary option | Checkbox | Switch when nothing takes effect immediately |
| Immediate setting on/off | Switch | Checkbox with delayed Apply semantics |
| One option from a visible small set | Radio buttons | Dropdown that hides useful comparison |
| One option from a large set | Exposed dropdown or dedicated picker | Huge radio list |
| Filter a collection | Filter chips | Chips as generic navigation |
| Enter text | Filled or outlined text field | Unlabeled custom box |
| Choose date/time | Platform Material picker | Hand-built inaccessible grid |

### Navigation and structure

| Need | Prefer | Avoid |
| --- | --- | --- |
| Compact top-level destinations | Navigation bar | Tabs for app-wide navigation |
| Wider-window top-level destinations | Navigation rail, wide rail, or navigation suite | Stretched bottom bar |
| Many wide-window destinations | Permanent drawer when justified | Drawer for three simple destinations |
| Peer views within a destination | Primary or secondary tabs | Tabs for sequential steps |
| Dense homogeneous content | List or table-like composition | Card per row |
| Discrete heterogeneous items | Cards or adaptive feed | A card around the whole feed |
| Master and selected item | List-detail canonical layout | Two unrelated columns |
| Primary content plus contextual tools | Supporting-pane layout | Permanent empty side panel |

### Transient UI

- Snackbar: brief, non-blocking feedback with at most one useful action.
- Tooltip: name or explain an icon/control, especially for pointer and keyboard users.
- Menu: compact set of contextual actions or choices.
- Bottom/side sheet: contextual task or choices that benefit from retained background context.
- Dialog: short focused decision or small form that blocks the current flow.
- Full screen: complex, multi-step, or content-heavy task.

Do not use a modal merely to display decorative success copy. Do not use a snackbar for errors requiring a decision or recovery details.

## Motion and Feedback

- Animate to explain state, spatial relationship, navigation, or direct manipulation.
- Keep motion interruptible and state-driven.
- Use effects motion for color or alpha and spatial motion for position, size, or shape changes.
- Preserve continuity: the destination of a moving element should remain understandable.
- Avoid hover lift, perpetual motion, bounce, or morphing with no interaction meaning.
- Avoid animating large layout changes in a way that causes controls to move away from the pointer or touch.
- Respect the platform's reduced-motion or animation settings.

## Content

- Use direct labels that name the action or destination.
- Keep helper text local to the field or decision it supports.
- Write errors with cause and recovery where known.
- Do not add product-generic slogans, decorative status labels, or prose that explains obvious controls.
- Keep destructive and irreversible language unambiguous.
- Design loading and empty states around the next useful action, not an illustration requirement.

## Progressive Loading and Async States

Loading is part of the information architecture. Design the transition from no data to useful data, not only the final success screen.

### Choose the right pattern

| Situation | Prefer | Avoid |
| --- | --- | --- |
| Whole screen has no stable structure yet | Small, purposeful loading indicator or structural skeleton | Giant branded spinner with no context |
| Layout is known but content arrives independently | Skeletons matching final text/image geometry | Random gray bars that shift content later |
| One region refreshes while the rest remains usable | Inline progress/state layer near that region | Blocking the whole page |
| Long determinate work | Progress indicator with value, status, and cancel/retry where possible | Indeterminate spinner pretending to show progress |
| Short action confirmation | Immediate state change, ripple/state layer, or brief snackbar | Full-screen loader for a sub-second operation |
| Existing content is refreshing | Keep stale content visible with refresh affordance/status | Replacing useful content with a blank loader |
| Independent content sections | Progressive reveal by section | Waiting for the slowest request before showing anything |
| Optimistic mutation is safe and reversible | Update UI immediately, mark pending, reconcile or undo | Pretending success for irreversible work |

### Skeleton rules

- Match the final component's block sizes, alignment, and count closely enough to prevent layout jumps.
- Use a restrained tonal surface or shimmer only when motion helps communicate an active wait; do not add shimmer to every placeholder.
- Respect reduced motion by replacing shimmer with a static placeholder.
- Keep skeletons out of content that is already available.
- Do not use skeletons for a single instant operation or when they would flash for less than the meaningful loading threshold.
- Announce the loading status to assistive technology without repeatedly interrupting reading.

### Progressive reveal

- Load the primary task and critical identity first.
- Reveal supporting metadata, recommendations, and secondary panes after the main content can be used.
- Keep each revealed region in its final position; avoid reordering content unexpectedly.
- Use a clear partial/error state when one region fails while others succeed.
- Preserve scroll position, focus, and selected item while new content arrives.
- For pagination or infinite scrolling, show a local continuation indicator and a retry action; do not replace the entire list.

### Async action states

Every asynchronous action should have a state model appropriate to the operation:

`idle -> pending -> success | recoverable error | blocked error`

- Pending: show what is working and prevent duplicate submission without trapping the user.
- Success: confirm the result at the affected content, not only in a transient message.
- Recoverable error: preserve entered data and provide retry/edit/cancel.
- Blocked error: explain the reason and the next available path.
- Offline/stale: distinguish local pending work from server-confirmed data.
- Cancellation: make it available for long work and return the UI to a coherent state.

## Forms

Forms are task flows, not collections of decorated inputs.

### Structure

- Start with a short, descriptive title and a sentence of context only when it changes the user's decision.
- Group fields by the user's mental model or completion order.
- Keep one primary submit action and a clear secondary cancel/back action.
- Put labels above or inside the platform's supported field component; never rely on placeholder text as the only label.
- Keep help text local to the field or group it explains.
- Use the narrowest readable form width on large windows; do not stretch fields across a desktop window.
- Preserve a predictable vertical rhythm. Do not put unrelated fields into a decorative card grid.
- Use sections, dividers, or surface roles sparingly to separate genuinely different tasks.

### Field semantics

- Choose the input type that matches the data: email, phone, password, numeric, date, time, search, multiline, or selection.
- Use the correct keyboard/IME options, autofill hints, content descriptions, and input transformation.
- Mark required and optional fields consistently. Do not make users infer required state from color or an asterisk with no explanation.
- Keep supporting text and error text associated with the field in the accessibility tree.
- Use input masks only when they reduce errors and do not prevent paste, selection, or international formats.
- Preserve user input on validation failure, rotation, resize, process recreation, and recoverable network errors.
- Do not clear a password, long form, or uploaded file merely because one field failed.

### Validation timing

- Validate constraints as early as they help the user, but do not show errors before the user has had a fair chance to provide a value.
- Use inline validation for local format/constraint errors.
- Validate server-side rules on submit or blur as appropriate and identify which field or group is affected.
- Avoid validating every keystroke when it causes noise, expensive requests, or unstable layout.
- Keep error text specific: state what is wrong and how to fix it.
- When multiple fields fail, summarize the problem and move focus predictably to the first actionable error without hiding the rest.

### Submit and autosave

- Change the primary action to a clear pending state while submission is in progress.
- Prevent duplicate submits while allowing cancellation or navigation when safe.
- Do not replace the button label with an unexplained spinner; retain the action identity when possible.
- For autosave, show saved/saving/failed status near the edited content and preserve a manual retry path.
- Distinguish local draft state from server-confirmed state.
- For destructive or irreversible submits, use explicit confirmation only when the consequence is not otherwise clear and recovery is difficult.
- After success, show the resulting record/state or a reliable route to it.

### Form accessibility and input

- Keep focus visible and move it only for a clear reason, such as focusing the first invalid field after submit.
- Support keyboard navigation, IME actions, mouse/pointer, paste, and screen readers.
- Ensure the keyboard does not cover the focused field or primary submit action.
- Provide a non-drag, non-color-only alternative for every required interaction.
- Keep controls at least 48dp on Android and comfortable touch size on web.
- Test long labels, error text, localization, large font scale, dark theme, and narrow windows.

### Form review

- Can the user tell what to enter, why it is needed, and what happens on submit?
- Can they recover from a field, network, permission, or server error without losing work?
- Is the primary action still obvious in idle, pending, and invalid states?
- Does the layout remain stable when helper and error text appear?
- Does the form remain usable with keyboard, screen reader, large text, and IME visible?

## Foundation Review

Before accepting a design, ask:

- Can hierarchy be understood in grayscale and without shadows?
- Can any card, outline, divider, or surface be removed without losing meaning?
- Is the primary action obvious without coloring every action?
- Does each component match its semantic job?
- Does the layout become more useful, not merely wider, as space increases?
- Is expression concentrated on meaningful moments?
- Are the theme roles, states, and type roles reusable rather than one-off values?
