# rn-css

> Instantly scaffold or configure React Native Expo projects with **TypeScript** and **NativeWind v4**.

---

## Usage

### Create a new project

```bash
npx rn-css MyApp
```

This will:

1. Create a new Expo project using `blank-typescript` template
2. Install NativeWind, Reanimated, and Safe Area Context
3. Install Tailwind CSS and Babel preset
4. Configure `tailwind.config.js`, `global.css`, `babel.config.js`, and `metro.config.js`
5. Create a starter `App.tsx` that uses NativeWind classes
6. Verify the entire setup

### Configure an existing Expo project

```bash
cd MyExistingApp
npx rn-css .
```

Or target a specific directory:

```bash
npx rn-css ./MyExistingApp
```

This will:

- Detect the project type and package manager
- Install NativeWind dependencies (SDK-coupled native packages via `npx expo install`)
- **Safely merge** config files — existing `babel.config.js`, `metro.config.js` and `tailwind.config.*` are merged/preserved, with a timestamped backup (`.bak.<timestamp>`) taken first
- **Never overwrite** `App.tsx`, `App.js`, `app/`, `src/`, or `components/`

> **Expo Router?** The tool prints the exact `global.css` import to add to your root layout (`app/_layout.tsx`) — it never writes inside `app/`.

---

## Options

| Flag | Description |
|---|---|
| `--force` | Skip confirmation prompts. For a **new** project, delete an existing target directory first (a directory containing a `package.json` is never deleted — that routes to the existing-project flow instead) |

---

## What gets installed

### Runtime dependencies

| Package | Version | Installed with |
|---|---|---|
| `nativewind` | `4.2.7` | package manager |
| `react-native-reanimated` | Expo SDK version | `npx expo install` |
| `react-native-safe-area-context` | Expo SDK version | `npx expo install` |
| `react-native-worklets` | Expo SDK version | `npx expo install` (only when Reanimated 4+ is present) |

### Dev dependencies

| Package | Version | Installed with |
|---|---|---|
| `tailwindcss` | `^3.4.17` | package manager |
| `prettier` | `^3.0.0` | package manager |
| `prettier-plugin-tailwindcss` | `^0.5.11` | package manager |
| `babel-preset-expo` | version required by your `expo` package | package manager |

> Native packages are resolved through the Expo CLI so they always match the
> scaffolded SDK; pinned fallbacks are used only if the Expo CLI is unavailable.

---

## What gets configured

| File | Action |
|---|---|
| `tailwind.config.*` | Created, or **merged in place** with `nativewind/preset` (never shadowed by a second config) |
| `global.css` | Created with `@tailwind` directives |
| `babel.config.js` | **Merged** with `jsxImportSource: "nativewind"` + `nativewind/babel` (existing plugins/presets kept) |
| `metro.config.js` | Existing config preserved as `metro.config.base.js`, then wrapped with `withNativeWind` |
| `nativewind-env.d.ts` | Created so `className` type-checks in TypeScript projects |
| `.prettierrc` | Created (if you have no Prettier config) so Tailwind class sorting works |
| `App.tsx` | Starter file created (**new projects only**) |
| `components/` | Created if missing |

A timestamped backup (`<file>.bak.<timestamp>`) is written before any existing
file is modified.

---

## Supported package managers

`rn-css` automatically detects your package manager using lock files:

| Lock file | Package manager |
|---|---|
| `yarn.lock` | Yarn |
| `pnpm-lock.yaml` | pnpm |
| `bun.lock` / `bun.lockb` | Bun |
| `package-lock.json` or none | npm (default) |

---

## Examples

```bash
# New app called "MyApp"
npx rn-css MyApp

# Configure the current directory
npx rn-css .

# Configure a specific directory
npx rn-css ./projects/MyExistingApp

# Force reconfigure even if NativeWind is already installed
npx rn-css . --force
```

---

## Requirements

- Node.js 18+
- npm, yarn, pnpm, or bun

---

## License

MIT © Richenfel Academy
