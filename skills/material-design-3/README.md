# Material Design 3 Skill

An agent skill for designing, implementing, and reviewing Material 3 and Material 3 Expressive interfaces across Android and the web.

The skill combines official Material guidance with practical constraints for production UI: semantic tokens, correct component roles, adaptive layouts, accessibility, edge-to-edge Android behavior, restrained elevation, and selective expression. It explicitly rejects card, outline, shadow, gradient, and container noise that does not communicate hierarchy or interaction.

## Install with npm

Install directly from the `gdlbo/material-skill` GitHub repository with the npm-distributed [Skills CLI](https://github.com/vercel-labs/skills):

```shell
npx skills add gdlbo/material-skill
```

To install `material-design-3` globally for Codex without interactive prompts:

```shell
npx skills add gdlbo/material-skill --skill material-design-3 --agent codex --global --yes
```

Alternatively, install the CLI globally first:

```shell
npm install --global skills
skills add gdlbo/material-skill --skill material-design-3 --agent codex --global --yes
```

Update the globally installed skill from its recorded source:

```shell
npx skills update material-design-3 --global --yes
```

## Use

Invoke the installed skill with:

```text
$material-design-3
```

Examples:

```text
Use $material-design-3 to redesign this Compose settings screen for phone and tablet.
```

```text
Use $material-design-3 to review this Material Web implementation for hierarchy, accessibility, and component misuse.
```

## Contents

- `SKILL.md`: routing, workflow, constraints, and verification contract.
- `references/design-foundations.md`: visual system and component decisions.
- `references/android.md`: Android libraries and implementation guidance.
- `references/expressive.md`: Material 3 Expressive decision rules.
- `references/adaptive-accessibility.md`: responsive behavior and accessibility.
- `references/web.md`: Material Web and framework guidance.
- `references/sources.md`: official references and status notes.

Version-sensitive library facts in the source index are dated. Refresh them from the linked official release pages before changing dependencies