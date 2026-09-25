"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  writeTailwindConfig,
  writeGlobalCss,
  writeBabelConfig,
  writeMetroConfig,
  writeNativeWindTypes,
  writePrettierConfig,
  writeAppTsx,
  ensureComponentsDir,
  mergeTailwindPreset,
  mergeBabelConfig,
} = require("../src/configuration");
const { mkTmpDir, rmTmpDir, writeFile, listBackups, quietly } = require("./helpers");

function withTmp(fn) {
  const dir = mkTmpDir();
  try {
    return fn(dir);
  } finally {
    rmTmpDir(dir);
  }
}

const read = (p) => fs.readFileSync(p, "utf8");

// ---------------------------------------------------------------------------
// Fresh project: create everything
// ---------------------------------------------------------------------------

test("fresh dir: writes every config file", () => {
  withTmp((dir) => {
    quietly(() => {
      writeTailwindConfig(dir);
      writeGlobalCss(dir);
      writeBabelConfig(dir);
      writeMetroConfig(dir);
      writeNativeWindTypes(dir);
      writePrettierConfig(dir);
      ensureComponentsDir(dir);
    });

    const tw = read(path.join(dir, "tailwind.config.js"));
    assert.match(tw, /nativewind\/preset/);
    assert.match(tw, /module\.exports/);

    assert.match(read(path.join(dir, "global.css")), /@tailwind base/);

    const babel = read(path.join(dir, "babel.config.js"));
    assert.match(babel, /nativewind\/babel/);
    assert.match(babel, /jsxImportSource: "nativewind"/);

    const metro = read(path.join(dir, "metro.config.js"));
    assert.match(metro, /withNativeWind/);
    assert.match(metro, /global\.css/);

    assert.match(
      read(path.join(dir, "nativewind-env.d.ts")),
      /nativewind\/types/
    );
    assert.match(
      read(path.join(dir, "nativewind-env.d.ts")),
      /declare module "\*\.css"/,
      "must declare CSS modules so tsc accepts import \"./global.css\""
    );

    assert.deepStrictEqual(
      JSON.parse(read(path.join(dir, ".prettierrc"))),
      { plugins: ["prettier-plugin-tailwindcss"] }
    );

    assert.ok(fs.existsSync(path.join(dir, "components")));
  });
});

test("fresh dir: all writers are idempotent (second run changes nothing)", () => {
  withTmp((dir) => {
    const writers = [
      () => writeTailwindConfig(dir),
      () => writeGlobalCss(dir),
      () => writeBabelConfig(dir),
      () => writeMetroConfig(dir),
      () => writeNativeWindTypes(dir),
      () => writePrettierConfig(dir),
    ];
    quietly(() => writers.forEach((w) => w()));

    const snapshot = Object.fromEntries(
      [
        "tailwind.config.js",
        "global.css",
        "babel.config.js",
        "metro.config.js",
        "nativewind-env.d.ts",
        ".prettierrc",
      ].map((f) => [f, read(path.join(dir, f))])
    );

    quietly(() => writers.forEach((w) => w()));

    for (const [f, content] of Object.entries(snapshot)) {
      assert.strictEqual(read(path.join(dir, f)), content, f);
    }
    assert.strictEqual(listBackups(dir).length, 0, "no backups on re-run");
  });
});

// ---------------------------------------------------------------------------
// babel.config.js — smart merge (never loses user config)
// ---------------------------------------------------------------------------

test("babel merge: bare preset string keeps plugins, adds NativeWind", () => {
  withTmp((dir) => {
    const original = `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["module-resolver", "@babel/plugin-transform-runtime"],
  };
};
`;
    writeFile(dir, "babel.config.js", original);
    quietly(() => writeBabelConfig(dir));

    const out = read(path.join(dir, "babel.config.js"));
    assert.match(out, /nativewind\/babel/);
    assert.match(out, /jsxImportSource: "nativewind"/);
    // user config preserved
    assert.match(out, /module-resolver/);
    assert.match(out, /@babel\/plugin-transform-runtime/);
    assert.match(out, /api\.cache\(true\)/);
    // backup taken
    assert.strictEqual(listBackups(dir).length, 1);
  });
});

test("babel merge: array preset entry keeps custom options", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "babel.config.js",
      `module.exports = {
  presets: [["babel-preset-expo", { allowJs: true }]],
};
`
    );
    quietly(() => writeBabelConfig(dir));

    const out = read(path.join(dir, "babel.config.js"));
    assert.match(out, /allowJs: true/);
    assert.match(out, /jsxImportSource: "nativewind"/);
    assert.match(out, /nativewind\/babel/);
  });
});

test("babel merge: existing jsxImportSource only gains nativewind/babel", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "babel.config.js",
      `module.exports = {
  presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
};
`
    );
    quietly(() => writeBabelConfig(dir));

    const out = read(path.join(dir, "babel.config.js"));
    assert.match(out, /nativewind\/babel/);
    // documented order: babel-preset-expo entry before nativewind/babel
    assert.ok(
      out.indexOf("babel-preset-expo") < out.indexOf("nativewind/babel"),
      "babel-preset-expo must come first in presets"
    );
  });
});

test("babel merge: no presets array → backup + replace with warning", () => {
  withTmp((dir) => {
    writeFile(dir, "babel.config.js", `module.exports = { customThing: true };\n`);
    quietly(() => writeBabelConfig(dir));

    const out = read(path.join(dir, "babel.config.js"));
    assert.match(out, /nativewind\/babel/);
    assert.strictEqual(listBackups(dir).length, 1);
  });
});

test("mergeBabelConfig: returns null when nothing to anchor on", () => {
  assert.strictEqual(mergeBabelConfig("const x = 1;"), null);
});

// ---------------------------------------------------------------------------
// metro.config.js — preserve as base + wrap
// ---------------------------------------------------------------------------

test("metro: existing config is preserved as metro.config.base.js and wrapped", () => {
  withTmp((dir) => {
    const original = `const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("db");
module.exports = config;
`;
    writeFile(dir, "metro.config.js", original);
    quietly(() => writeMetroConfig(dir));

    const base = path.join(dir, "metro.config.base.js");
    assert.ok(fs.existsSync(base), "base config exists");
    assert.match(read(base), /assetExts/);

    const wrapper = read(path.join(dir, "metro.config.js"));
    assert.match(wrapper, /withNativeWind/);
    assert.match(wrapper, /metro\.config\.base\.js/);

    assert.strictEqual(listBackups(dir).length, 1, "timestamped backup kept");
  });
});

test("metro: ESM config cannot be wrapped → backup + replace", () => {
  withTmp((dir) => {
    writeFile(dir, "metro.config.js", `export default { resolver: {} };\n`);
    quietly(() => writeMetroConfig(dir));

    const out = read(path.join(dir, "metro.config.js"));
    assert.match(out, /withNativeWind/);
    assert.ok(!fs.existsSync(path.join(dir, "metro.config.base.js")));
    assert.strictEqual(listBackups(dir).length, 1);
  });
});

// ---------------------------------------------------------------------------
// tailwind.config.* — merge in place, never shadow
// ---------------------------------------------------------------------------

test("tailwind: existing config is merged, not shadowed by a new file", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "tailwind.config.js",
      `module.exports = {
  content: ["./App.tsx"],
  theme: { colors: { brand: "#f00" } },
};
`
    );
    quietly(() => writeTailwindConfig(dir));

    const out = read(path.join(dir, "tailwind.config.js"));
    assert.match(out, /nativewind\/preset/);
    assert.match(out, /content: \["\.\/App\.tsx"\]/); // user content kept
    assert.strictEqual(listBackups(dir).length, 1);
    // no second config file created
    assert.ok(!fs.existsSync(path.join(dir, "tailwind.config.ts")));
  });
});

test("tailwind: TypeScript config is merged in place (export default kept)", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "tailwind.config.ts",
      `import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./App.tsx"],
};

export default config;
`
    );
    quietly(() => writeTailwindConfig(dir));

    const out = read(path.join(dir, "tailwind.config.ts"));
    assert.match(out, /nativewind\/preset/);
    assert.match(out, /content: \["\.\/App\.tsx"\]/);
    assert.ok(!fs.existsSync(path.join(dir, "tailwind.config.js")));
  });
});

test("tailwind: existing presets array receives the nativewind preset", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "tailwind.config.js",
      `module.exports = {
  presets: [],
};
`
    );
    quietly(() => writeTailwindConfig(dir));

    const out = read(path.join(dir, "tailwind.config.js"));
    assert.match(out, /presets: \[\s*require\("nativewind\/preset"\),/);
  });
});

test("mergeTailwindPreset: returns null when there is no anchor", () => {
  assert.strictEqual(mergeTailwindPreset("just a string"), null);
});

// ---------------------------------------------------------------------------
// nativewind-env.d.ts
// ---------------------------------------------------------------------------

test("writeNativeWindTypes: upgrades an existing reference-only d.ts", () => {
  withTmp((dir) => {
    writeFile(dir, "nativewind-env.d.ts", "/// <reference types=\"nativewind/types\" />\n");
    quietly(() => writeNativeWindTypes(dir));

    const out = read(path.join(dir, "nativewind-env.d.ts"));
    assert.match(out, /declare module "\*\.css"/);
    assert.strictEqual(listBackups(dir).length, 1);
  });
});

test("writeNativeWindTypes: backs up an existing unrelated d.ts", () => {
  withTmp((dir) => {
    writeFile(dir, "nativewind-env.d.ts", "// custom types\n");
    quietly(() => writeNativeWindTypes(dir));

    assert.match(read(path.join(dir, "nativewind-env.d.ts")), /nativewind\/types/);
    assert.strictEqual(listBackups(dir).length, 1);
  });
});

// ---------------------------------------------------------------------------
// .prettierrc
// ---------------------------------------------------------------------------

test("writePrettierConfig: does not overwrite an existing prettier config", () => {
  withTmp((dir) => {
    writeFile(dir, ".prettierrc.json", `{ "semi": false }\n`);
    quietly(() => writePrettierConfig(dir));

    assert.deepStrictEqual(JSON.parse(read(path.join(dir, ".prettierrc.json"))), {
      semi: false,
    });
    assert.ok(!fs.existsSync(path.join(dir, ".prettierrc")));
  });
});

test("writePrettierConfig: honors the prettier key in package.json", () => {
  withTmp((dir) => {
    writeFile(dir, "package.json", JSON.stringify({ prettier: { semi: false } }));
    quietly(() => writePrettierConfig(dir));
    assert.ok(!fs.existsSync(path.join(dir, ".prettierrc")));
  });
});

test("writePrettierConfig: detects when the plugin is already configured", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      ".prettierrc",
      JSON.stringify({ plugins: ["prettier-plugin-tailwindcss"] })
    );
    // Must NOT be rewritten or flagged as needing manual work
    const before = read(path.join(dir, ".prettierrc"));
    quietly(() => writePrettierConfig(dir));
    assert.strictEqual(read(path.join(dir, ".prettierrc")), before);
    assert.strictEqual(listBackups(dir).length, 0);
  });
});

// ---------------------------------------------------------------------------
// App.tsx
// ---------------------------------------------------------------------------

test("writeAppTsx: backs up an existing App.tsx and never touches it twice", () => {
  withTmp((dir) => {
    writeFile(dir, "App.tsx", `export default function App() { return null; }\n`);
    quietly(() => {
      writeAppTsx(dir, "MyApp");
    });

    const out = read(path.join(dir, "App.tsx"));
    assert.match(out, /import "\.\/global\.css"/);
    assert.match(out, /MyApp/);
    assert.strictEqual(listBackups(dir).length, 1);

    // second run: file already imports global.css → untouched
    const snapshot = out;
    quietly(() => writeAppTsx(dir, "OtherName"));
    assert.strictEqual(read(path.join(dir, "App.tsx")), snapshot);
  });
});
