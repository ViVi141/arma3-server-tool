# Material 3 on Android

Use this reference for Android phone, tablet, foldable, desktop-windowed, widget, or Wear UI work.

## Choose the Runtime Deliberately

### Phone and tablet

Jetpack Compose Material 3 is the primary implementation for new Android UI. Use the public `androidx.compose.material3` components and theme APIs already supported by the project.

Views-based Material Components for Android remains valid for existing View screens, but it is in maintenance mode. Do not migrate a working View flow to Compose inside a small visual fix. Do not begin a new feature in Views merely to match a legacy screen unless project constraints require it.

### Other Android surfaces

- Wear OS: use `androidx.wear.compose:compose-material3` and Wear-specific guidance. Phone Material components are not substitutes for round-screen, rotary, or edge-hugging Wear components.
- App widgets: use `androidx.glance:glance-material3` where Glance is the established widget stack. Widget capabilities are narrower than in-app Compose.
- Compose Multiplatform: inspect the project's supported Material 3 implementation and target capabilities. Do not assume every Android-only API exists on other targets.

## Library Map

Resolve versions through the project's version catalog or dependency management. Confirm current releases before adding or upgrading anything.

| Purpose | Artifact or API family | Notes |
| --- | --- | --- |
| Phone/tablet Material components | `androidx.compose.material3:material3` | Preferred implementation; stable and experimental APIs coexist |
| Window posture and adaptive info | `androidx.compose.material3.adaptive:adaptive` | Low-level adaptive primitives |
| Canonical pane layouts | `androidx.compose.material3.adaptive:adaptive-layout` | List-detail and supporting-pane scaffolds |
| Pane navigation | `androidx.compose.material3.adaptive:adaptive-navigation` | Navigators and navigable pane layouts |
| Navigation 3 adaptive integration | `androidx.compose.material3.adaptive:adaptive-navigation3` | Use only when the app already uses or adopts Navigation 3 |
| Adaptive navigation suite | `androidx.compose.material3:material3-adaptive-navigation-suite` or current successor documented for the installed release | Switches navigation UI by window configuration; verify coordinates because packaging evolves |
| Wear Material 3 | `androidx.wear.compose:compose-material3` | Wear-specific Material 3 Expressive implementation |
| Glance widget theming | `androidx.glance:glance-material3` | RemoteViews/Glance constraints apply |
| Views Material components | `com.google.android.material:material` | Maintenance mode; preserve existing View apps and plan migrations separately |
| Icons | Download Material Symbols as Vector Drawable assets | `androidx.compose.material:material-icons-extended` is no longer recommended or updated |

Material Color Utilities powers dynamic schemes. For normal Compose apps, prefer `dynamicLightColorScheme`, `dynamicDarkColorScheme`, the app's generated scheme, or Material Theme Builder output. Use lower-level color utilities only for a genuine runtime color-generation requirement.

## Dependency Gate

Before editing Gradle:

1. Inspect the version catalog, Compose BOM, Kotlin, Android Gradle Plugin, compile SDK, target SDK, minimum SDK, and existing opt-ins.
2. Find the exact API in the official reference for the installed version.
3. Prefer a stable API that meets the requirement.
4. If the design requires an alpha/experimental API, isolate it and disclose the stability cost.
5. Do not mix individually pinned Compose artifacts against a BOM without understanding the project's convention.
6. Do not add a library for a component that the existing Material artifact already provides.

## Theme Architecture

Provide the theme once near the app root and consume roles below it.

```kotlin
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && darkTheme ->
            dynamicDarkColorScheme(context)
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            dynamicLightColorScheme(context)
        darkTheme -> AppDarkColorScheme
        else -> AppLightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content,
    )
}
```

Treat this as a pattern, not a demand to rename an existing theme.

- Define complete light and dark fallbacks.
- Keep semantic status colors accessible in both dynamic and fallback schemes.
- Use `MaterialTheme.colorScheme`, `typography`, `shapes`, and supported motion APIs inside components.
- Put reusable app-specific roles in a small explicit extension rather than literal colors throughout screens.
- Do not copy generated theme files over established product tokens without reviewing the diff.
- Do not hardcode `Color.White` or `Color.Black` as foregrounds on themed containers.

## Compose Component Practice

- Prefer Material components because they carry sizing, semantics, states, and theme integration.
- Hoist state and events out of reusable visual components. Keep screen state ownership consistent with the app architecture.
- Preserve default minimum interactive size. A small icon may sit inside a 48dp or larger target.
- Use component `Defaults` factories for colors, elevation, shape, padding, and scroll behavior.
- Customize through public parameters and theme roles. Avoid copying a Material component implementation merely to alter one token.
- Use stable keys in lazy collections and keep content types stable where heterogeneous lists need them.
- Keep loading overlays, snackbars, sheets, and dialogs owned by the screen scaffold or state holder rather than buried in leaf components.
- Use `rememberSaveable` or a state holder for user-visible transient state that must survive recreation when appropriate.
- Handle predictive back and pane back behavior according to navigation ownership; do not add competing `BackHandler`s casually.

## Compose Loading and Forms

- Keep loading state in the screen/state holder, not in a leaf composable that cannot coordinate retry, cancellation, or stale data.
- Prefer skeleton/layout placeholders that preserve final geometry when content structure is known.
- Use `CircularProgressIndicator` or `LinearProgressIndicator` for focused work; use determinate progress when the operation exposes a real fraction.
- Keep stale content visible during refresh when it remains trustworthy, with a local pending indicator.
- Use `SnackbarHost`, inline error content, or a retry action according to the scope and recoverability of the failure.
- Use `TextField`/`OutlinedTextField` semantics, `KeyboardOptions`, `KeyboardActions`, `imePadding`, and bring-into-view behavior instead of hand-built text boxes.
- Keep field values in a state holder or `rememberSaveable` as appropriate; do not lose them on recomposition or configuration change.
- Expose error, supporting text, enabled/disabled, and required semantics through the field API.
- Keep submit pending state idempotent and prevent duplicate events at the event/state boundary.
- Use `AnimatedVisibility` or size animation only when it preserves reading order and does not cause the focused field or primary action to jump unexpectedly.

## Insets and Edge to Edge

Modern Android UI should be designed edge to edge.

- Enable edge-to-edge through the app's existing Activity setup, commonly `enableEdgeToEdge()`.
- Treat edge-to-edge as a compatibility requirement: Android 15 enforces it for apps targeting API 35, and on Android 16 the opt-out is disabled for apps targeting API 36.
- Draw backgrounds and scrolling content behind system bars when appropriate.
- Inset critical text, controls, and gesture targets with the relevant `WindowInsets`.
- Keep tap and drag targets away from conflicting system gesture areas.
- Account for status bars, navigation bars, display cutouts, caption bars, fold hinges, and the IME.
- Let app bar and scaffold defaults handle insets when they already do. Avoid applying the same inset to both parent and child.
- Use `imePadding`, bring-into-view behavior, or scaffold resizing where needed so focused fields and actions remain visible.
- Keep system bar icon appearance legible against the actual background.

Review the entire modifier chain. Inset bugs often come from correct padding applied twice or consumed at the wrong level.

## Navigation and App Structure

- Keep top-level destinations stable while the visual navigation component adapts.
- Use `NavigationSuiteScaffold` when its switching model matches the app.
- Use list-detail or supporting-pane scaffolds when the information architecture fits; do not force unrelated content into panes.
- Preserve selected destination and selected detail across resize and configuration change.
- On compact screens, pane-local back should return from detail/supporting content before leaving the destination.
- On expanded screens, avoid a meaningless blank pane; provide a selection, placeholder, or useful supporting state.
- Do not stretch a compact bottom navigation bar across a tablet or desktop window.

## Material 3 Expressive in Compose

When supported by the installed release, relevant public APIs can include `MaterialExpressiveTheme`, expressive color schemes, `MotionScheme`, `MaterialShapes`, animated component shapes, button groups, split buttons, floating toolbars, FAB menus, and expressive loading/progress components.

Use the official API reference for the installed version. Some APIs may require `@OptIn(ExperimentalMaterial3ExpressiveApi::class)`; other expressive APIs may already be stable. Keep opt-in scope narrow and do not add file-wide opt-ins without need.

## Existing Views

For a Views screen:

- Keep a Material 3-compatible theme such as the appropriate `Theme.Material3.*` family.
- Use Material Components widgets and theme attributes rather than AppCompat lookalikes with manual styling.
- Resolve colors through theme attributes and use shape appearances/styles already defined by the app.
- Handle edge-to-edge with the Views insets APIs and avoid mixing manual status-bar padding with automatic inset handling.
- Preserve XML resource ownership and style inheritance.
- Treat Compose interop as an architectural boundary: set a composition strategy, provide the app theme, and keep state ownership explicit.

Because MDC-Android is in maintenance mode, do not promise new Compose-only or Expressive parity in Views. If a needed component is unavailable, choose a supported accessible composition or propose a separately scoped migration.

### Expressive Views in MDC-Android 1.14

MDC-Android 1.14 includes a defined Views-based Expressive surface. For an existing Views app on a compatible release, use the documented public resources rather than imitating Compose components:

- the `Theme.Material3Expressive.*` theme family;
- Expressive lists, button and icon-button styles, button groups, and FAB styles;
- Expressive top app bar, `BottomNavigationView`, and navigation rail styles;
- Expressive search, progress indicator, and slider styles;
- the emphasized type scale.

Check each component's official MDC documentation and catalog example because the API is style/resource based and does not mirror Compose names. Upgrading to MDC-Android 1.14 raises the required `minSdkVersion` to 23 and also changes toolchain/dependency requirements; do not take that migration as an incidental design dependency. The library is now in maintenance mode, so this existing Expressive surface is usable but no future feature parity is planned.

## Performance

- Do not create per-frame objects or perform color generation, image decoding, or text measurement in composition without caching or an appropriate API.
- Prefer lazy containers for large collections, but do not nest same-direction lazy scrolling without a defined size and interaction model.
- Keep animated shape and layout changes local. Validate on a representative device if they affect a frequently recomposed list or complex screen.
- Avoid large blurred shadows and layered translucent surfaces; they add rendering cost as well as visual noise.
- Use baseline profiles and macrobenchmarks only when the task concerns measurable startup or interaction performance. Do not add unrelated performance tests to a visual change.

## Android Verification

At minimum for affected UI, compile the changed module and then use the relevant target matrix:

- Phone/tablet: inspect compact portrait plus every affected adaptive window class; test edge-to-edge, IME, resize/rotation, and touch plus keyboard/mouse where supported.
- Wear: inspect the supported round/square sizes, edge behavior, rotary/touch input, ambient behavior where relevant, and Wear navigation.
- Widget: inspect every supported widget size and host theme, resize behavior, truncation, and Glance interaction/state limitations.
- All Android targets: inspect relevant light/dark/dynamic color behavior, font scale, long localized text, target sizes, reachable loading/error/selection/disabled/restored states, and focused accessibility behavior.

Report device/emulator observation separately from compile or screenshot-preview success.
