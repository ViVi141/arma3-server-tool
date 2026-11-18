# Official Sources and Library Status

Use official Material, Android Developers, AndroidX, Angular Material, and project repositories as primary sources. Version and maintenance facts can change; refresh the linked release/status page before dependency work.

## Material 3 Specification

- [Material Design 3 home](https://m3.material.io/)
- [Get started](https://m3.material.io/get-started)
- [Color roles](https://m3.material.io/styles/color/roles)
- [Typography](https://m3.material.io/styles/typography/overview)
- [Shape overview and principles](https://m3.material.io/styles/shape/overview-principles)
- [Elevation](https://m3.material.io/styles/elevation/overview)
- [Motion](https://m3.material.io/styles/motion/overview)
- [Interaction states](https://m3.material.io/foundations/interaction/states/overview)
- [Layout overview](https://m3.material.io/foundations/layout/layout-overview/overview)
- [Canonical layout examples](https://m3.material.io/foundations/layout/canonical-examples/overview)
- [Component catalog](https://m3.material.io/components)
- [Android Material components and containment](https://developer.android.com/design/ui/mobile/guides/components/material-overview)
- [Compose cards](https://developer.android.com/develop/ui/compose/components/card)
- [Compose Material 3 `ColorScheme` surface roles](https://developer.android.com/reference/kotlin/androidx/compose/material3/ColorScheme)
- [Compose Material 3 card border defaults](https://developer.android.com/reference/kotlin/androidx/compose/material3/CardDefaults)
- [Compose Material 3 button border defaults](https://developer.android.com/reference/kotlin/androidx/compose/material3/ButtonDefaults)
- [Compose Material 3 outlined text-field defaults](https://developer.android.com/reference/kotlin/androidx/compose/material3/OutlinedTextFieldDefaults)
- [Compose Material 3 dividers](https://developer.android.com/develop/ui/compose/components/divider)

The component catalog is the authority for component purpose, anatomy, variants, behavior, accessibility, and implementation availability by platform. Check the individual page rather than assuming platform parity.

Android guidance recommends grouping related content with implicit containment such as whitespace, alignment, and typography, and using explicit containment such as cards or dividers when a visible boundary is useful. Material components use explicit containment for defined jobs, while a card represents one coherent subject and remains a smaller element within a larger layout. Surface-container color roles express component emphasis; they do not justify additional structural wrappers. Official guidance does not define a numeric container-to-content ratio or a universal nesting limit, so this skill's `1:3` budget and two-level limit are explicit production heuristics derived from those principles, not Material specification values.

Material defines `outline` as a subtle boundary role that adds accessibility contrast and `outlineVariant` as a lower-emphasis utility role for decorative boundaries. Official Compose outlined components expose version-specific border APIs, colors, widths, and state behavior; use the installed version's defaults instead of treating arbitrary borders as layout decoration. Dividers are thin lines for grouping adjacent list or layout content, not general-purpose surface frames.

## Material 3 Expressive

- [Building with Material 3 Expressive](https://m3.material.io/building-with-m3-expressive)
- [Applying Material 3 Expressive](https://m3.material.io/foundations/usability/applying-m-3-expressive)
- [Material 3 Expressive motion theming](https://m3.material.io/m3-expressive-motion-theming)
- [Material 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)
- [Compose Material 3 package reference](https://developer.android.com/reference/kotlin/androidx/compose/material3/package-summary)
- [`MaterialExpressiveTheme`](https://developer.android.com/reference/kotlin/androidx/compose/material3/MaterialExpressiveTheme.composable)
- [`MotionScheme`](https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme)
- [`MaterialShapes`](https://developer.android.com/reference/kotlin/androidx/compose/material3/MaterialShapes)
- [Split button specification and availability](https://m3.material.io/components/split-button)

The Material site currently describes Expressive through vibrant color, intuitive motion, adaptive components, flexible typography, contrasting shape, an expanded shape library, and new or updated components. Use the individual component/API page for implementation status.

## Android Compose

- [Compose Material 3 release notes](https://developer.android.com/jetpack/androidx/releases/compose-material3)
- [Compose Material 3 API reference](https://developer.android.com/reference/kotlin/androidx/compose/material3/package-summary)
- [Compose Material 3 guide](https://developer.android.com/develop/ui/compose/designsystems/material3)
- [Material 2 to Material 3 migration](https://developer.android.com/develop/ui/compose/designsystems/material2-material3)
- [Compose samples](https://github.com/android/compose-samples)
- [Material Components Android repository](https://github.com/material-components/material-components-android)
- [Material Components Android releases](https://github.com/material-components/material-components-android/releases)

Current status:

- Compose Material 3 stable: `1.4.0`, released 2025-09-24.
- Compose Material 3 alpha: `1.5.0-alpha26`, released 2026-08-12; it contains evolving Expressive APIs.
- Views-based Material Components for Android: maintenance mode; the repository directs new Material Android development toward Compose.
- Latest MDC-Android repository release observed: `1.14.0`, released 2026-05-13.
- MDC-Android 1.14 includes Expressive themes and component styles and raises the required `minSdkVersion` to 23.

Do not encode these versions into an app without checking the current release page and project compatibility.

## Android Adaptive and System UI

- [Adaptive apps hub](https://developer.android.com/develop/adaptive-apps)
- [Get started with adaptive apps](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps)
- [Window size classes](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes)
- [`currentWindowAdaptiveInfoV2`](https://developer.android.com/reference/kotlin/androidx/compose/material3/adaptive/currentWindowAdaptiveInfoV2.composable)
- [Adaptive do's and don'ts](https://developer.android.com/develop/adaptive-apps/guides/adaptive-dos-and-donts)
- [Canonical layouts](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts)
- [Adaptive navigation](https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation)
- [Compose Material 3 Adaptive release notes](https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive)
- [Edge-to-edge design](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge)
- [Android system bars](https://developer.android.com/design/ui/mobile/guides/foundations/system-bars)
- [Android 16 target behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16)
- [Android layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics)
- [Content structure](https://developer.android.com/design/ui/mobile/guides/layout-and-content/content-structure)

Current status:

- Compose Material 3 Adaptive stable: `1.3.0`, released 2026-08-12.
- Current width classes documented by Android: compact, medium, expanded, large, and extra-large.

## Android Accessibility

- [Compose accessibility](https://developer.android.com/develop/ui/compose/accessibility)
- [Compose accessibility API defaults](https://developer.android.com/develop/ui/compose/accessibility/api-defaults)
- [Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps)
- [Test accessibility in Compose](https://developer.android.com/develop/ui/compose/accessibility/testing)

Android guidance requires at least a 48dp by 48dp target for touch interaction. Standard components provide many semantics and size defaults, but custom components still require explicit verification.

## Wear OS and Widgets

- [Wear Material 3 design language](https://developer.android.com/design/ui/wear/guides/get-started/design-language)
- [Wear Compose Material 3 API](https://developer.android.com/reference/kotlin/androidx/wear/compose/material3/package-summary)
- [Wear Compose release notes](https://developer.android.com/jetpack/androidx/releases/wear-compose)
- [Glance Material 3](https://developer.android.com/reference/kotlin/androidx/glance/material3/package-summary)

## Color and Design Tools

- [Material Theme Builder](https://material-foundation.github.io/material-theme-builder/)
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities)
- [Material Symbols](https://fonts.google.com/icons)
- [Material 3 Design Kit](https://m3.material.io/get-started)

Generated palettes and design kits are starting points. Review brand, semantic status colors, contrast, localization, and component states in the actual app.

## Material Web

- [Material Web repository](https://github.com/material-components/material-web)
- [Material Web introduction](https://material-web.dev/about/intro/)
- [Material Web component documentation](https://material-web.dev/components/button/)
- [Material Web theming](https://material-web.dev/theming/material-theming/)
- [Material Web color](https://material-web.dev/theming/color/)
- [Material Web releases](https://github.com/material-components/material-web/releases)
- [Angular Material](https://material.angular.dev/)
- [Angular Material theming](https://material.angular.dev/guide/theming)

Current status:

- The `@material/web` repository identifies the project as maintenance mode pending new maintainers.
- Latest release observed: `2.5.0`, released 2026-07-14.
- Material Web implements Material 3 web components but does not have Android feature parity.
- Angular Material's current theming system is based on Material Design 3.

Legacy `material-components-web` and `material-components-web-react` repositories are archived and should not be selected for new work.

## General Web Accessibility

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- [WCAG 2.2 focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)
- [WCAG 2.2 focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [Web focus guidance](https://web.dev/articles/style-focus)
- [Reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

Use native HTML whenever it supplies the required semantics and behavior. ARIA supplements native semantics; it does not repair an inappropriate interaction model by itself.

For border-related accessibility, WCAG 2.2 AA requires at least `3:1` contrast where a visual boundary or state cue is necessary to identify a control. Visible keyboard focus is required at AA. The `2px`-perimeter area and `3:1` focused-to-unfocused change are the stricter Focus Appearance criterion at AAA; use them as a robust author-supplied focus target without mislabeling them as an AA requirement.

## Source Policy

When sources disagree:

1. Use the installed library API and its matching versioned reference for code availability.
2. Use the current Material component page for design intent and platform availability.
3. Use Android Developers for Android platform, adaptive, insets, and accessibility behavior.
4. Use the library's official repository for maintenance status.
5. Treat blog posts, demos, screenshots, community wrappers, and generated examples as secondary evidence.

Record the release channel and access date when a decision depends on experimental or maintenance status.
