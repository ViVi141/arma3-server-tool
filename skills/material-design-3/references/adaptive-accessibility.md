# Adaptive Layout and Accessibility

Material 3 quality depends on usable structure across windows, content, and input modes. Treat adaptive behavior and accessibility as design inputs, not cleanup.

## Design for the App Window

Use the current app window, not a device label such as "tablet," to make layout decisions. A phone can have a wide landscape window; a desktop or foldable app can be narrow in split screen.

Current Android window width classes:

| Width class | Window width |
| --- | --- |
| Compact | less than 600dp |
| Medium | 600dp to less than 840dp |
| Expanded | 840dp to less than 1200dp |
| Large | 1200dp to less than 1600dp |
| Extra-large | 1600dp or more |

Height classes:

| Height class | Window height |
| --- | --- |
| Compact | less than 480dp |
| Medium | 480dp to less than 900dp |
| Expanded | 900dp or more |

Most app structure can start from width, but compact height matters for landscape phones, tabletop posture, dialogs, sheets, media, and IME-visible states. With Material 3 Adaptive 1.3 or newer, use `currentWindowAdaptiveInfoV2()` to include Large and Extra-large width classes. The deprecated `currentWindowAdaptiveInfo()` defaults `supportLargeAndXLargeWidth` to `false`; if an older supported release requires that API, pass `supportLargeAndXLargeWidth = true`. Do not hand-read display metrics.

Do not freeze these breakpoints into a custom device taxonomy. Let layouts remain fluid within each class.

## Adaptive Strategies

Use one or more of these transformations:

- Reflow: change row/column/grid arrangement while keeping the same content.
- Reveal: show supporting information or controls when space permits.
- Hide or defer: move nonessential supporting content behind a sheet or navigation action on compact windows.
- Substitute: switch navigation bar to rail/drawer or modal surface to inline pane.
- Resize: adjust pane proportions and readable line lengths without blindly filling width.

Avoid a responsive implementation that only scales padding, stretches fields, or stacks every desktop column into an endless mobile page.

## Canonical Layouts

### Feed

Use for many peer content items. Move from a single list/column to an adaptive grid as available width grows. Keep a meaningful minimum item width and preserve reading order.

### List-detail

Use when a selected item owns a detail view. Compact/medium can show one pane at a time; expanded can show list and detail together. Preserve selection across transitions and provide correct pane-local back behavior.

### Supporting pane

Use when secondary content or tools support a dominant primary task. On wide windows, show panes side by side with the main pane dominant. On compact windows, place support below, in a sheet, or on a separately navigable pane.

Do not use a canonical layout merely because it is available. The content relationship must match.

## Navigation Adaptation

- Keep destinations and navigation state stable while the navigation component changes.
- Use a navigation bar for compact conditions when destinations fit.
- Use a navigation rail or wide rail for wider conditions when it improves reach and scan.
- Use a permanent drawer only when destination count or hierarchy justifies the space.
- Avoid bottom navigation when compact height leaves insufficient content space.
- Keep navigation order, labels, badges, and selection consistent across variants.
- Do not hide core destinations behind an overflow in one window class unless there is a deliberate information-architecture reason.

## Foldables, Posture, and Resizing

- Treat hinges and folds as occluding or separating features when reported by adaptive APIs.
- Avoid placing text, controls, or a focal image across a hinge.
- Use tabletop posture only when the task benefits from separated control/content regions.
- Do not lock orientation or aspect ratio as a layout shortcut.
- Preserve user input, scroll position where meaningful, selection, and navigation during resize or posture change.
- Support multi-window and desktop window resizing continuously, not only at startup.

## Touch and Pointer Targets

On Android, interactive elements need a touch target of at least 48dp by 48dp. The visible icon or glyph may be smaller, but neighboring expanded hit areas must not overlap ambiguously.

On web, meet WCAG 2.2 target-size requirements and prefer comfortable targets for primary touch use. Material-sized controls are usually larger than the absolute WCAG minimum. Do not shrink supported component hit areas for density without validating the input context.

- Keep adequate spacing between adjacent destructive or opposite actions.
- Do not attach click behavior to a visual container without correct role, focus, keyboard, and pressed semantics.
- Support hover as additional feedback, never as the only way to discover an action.
- Ensure drag interactions also have an accessible non-drag alternative when the action matters.

## Semantics and Labels

- Use the correct native/Material control so role, state, and actions are exposed automatically.
- Give icon-only controls a localized accessible name.
- Do not repeat visible adjacent text as an image description.
- Mark decorative images and icons as decorative.
- Merge or clear descendant semantics only when the resulting reading unit is genuinely better.
- Expose selection, toggle state, progress, errors, headings, and collection structure.
- Announce important asynchronous results without moving focus unexpectedly.
- Keep error text associated with its field and provide recovery guidance.

## Focus, Keyboard, and Alternative Input

- Preserve a logical focus order that matches reading and visual order.
- Make focus visible against every surface and state.
- Keep focus inside modal dialogs/sheets on web and restore it to the trigger on close.
- Support Tab/Shift+Tab, Enter/Space, Escape, arrows, and platform conventions for the chosen component.
- Do not remove browser focus outlines without an equal or stronger replacement.
- Do not confuse a component's persistent border with keyboard focus. Focus must produce a distinguishable change in every theme and supported contrast mode without shifting layout.
- On Android large screens, support keyboard, mouse/trackpad, and stylus behavior relevant to the workflow.
- Make tooltips available to pointer/keyboard users for unfamiliar icon-only actions.

## Text and Magnification

- Use scalable text units and preserve platform font scaling.
- Reflow rather than clip at large text sizes.
- Let buttons, list items, app bars, and navigation labels grow or wrap where the component permits it.
- Do not place essential text in raster images.
- Keep reading lines constrained on wide windows.
- Test zoom and text scaling without losing controls or forcing two-dimensional scrolling for ordinary content.

## Contrast and Non-Color Cues

- Validate actual rendered role pairs, not palette swatches in isolation.
- Meet WCAG AA contrast for text and meaningful graphics unless a stricter product requirement applies.
- On web, test any boundary required to identify a control or state at `3:1` against its adjacent colors; low-emphasis decorative borders do not need that contrast but cannot carry required meaning.
- Give focus, selection, error, disabled, and pressed states more than one perceptible cue where needed.
- Do not lower disabled opacity so far that required information disappears; disabled controls still need understandable context.
- In dark mode, ensure surfaces remain distinguishable without bright boxes around everything.

## Motion and Timing

- Respect reduced-motion, animator-duration, and platform accessibility preferences.
- Do not make completion depend on watching an animation.
- Avoid flashing and rapid repeated movement.
- Keep timeouts long enough to read and act; allow extension or persistence for critical information.
- Keep progress understandable to assistive technology and provide a determinate value when known.

## State and Content Matrix

Test only reachable states, but do not omit important ones:

| Dimension | Useful cases |
| --- | --- |
| Content | short, typical, longest localized, empty, dense |
| Data | loading, partial, success, stale/offline, error |
| Interaction | default, pressed, focused, hovered, selected, disabled |
| Theme | light, dark, dynamic/custom, increased contrast if supported |
| Text | default font, large font, display zoom |
| Window | compact portrait, compact height, medium, expanded, resizable |
| System UI | gesture navigation, cutout, IME, edge-to-edge |
| Input | touch, keyboard, pointer, screen reader; stylus/rotary where relevant |

## Loading and Form Accessibility

- Expose loading, progress, success, and failure through semantics or live-region behavior appropriate to the platform.
- Do not announce every skeleton row or every small progress tick; announce meaningful transitions.
- Keep stale content available while a refresh runs when it is still safe and useful.
- Preserve field values and labels when validation or network work fails.
- Associate errors with their fields and provide a summary for multi-field submission failures.
- Move focus to the first actionable error only after submit when that improves recovery; do not steal focus during passive validation.
- Ensure the IME action, focus order, and submit action are consistent with the form's completion order.
- Test pending and disabled controls with keyboard, TalkBack/screen reader, large text, and reduced motion.

## Verification Strategy

Use checks proportional to the change:

- Theme/token change: inspect representative components in light, dark, dynamic, and state variants.
- Component change: inspect semantics, target size, all supported states, and long labels.
- Layout change: inspect the exact reported window plus boundary sizes around each affected breakpoint.
- Navigation/pane change: resize at runtime and verify continuity, selection, back, deep links, and focus.
- Motion change: inspect interrupted animations, reduced motion, and end-state correctness.
- Custom control: add focused behavior tests for role, input, semantics, and state; prefer replacing it with a standard control if those tests become extensive.

Do not create unrelated test suites. Visual acceptance requires rendered inspection; compilation and unit tests cannot prove spacing, clipping, contrast, or overlap.
