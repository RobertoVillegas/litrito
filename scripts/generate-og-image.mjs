#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "public", "og-image.png");
const logoPath = join(root, "public", "litrito-logo-full-res.png");

const FONT_FAMILY = "Inter";
const FONT_WEIGHT = 700;

const FONT_CANDIDATES = [
  join(root, "node_modules", "@fontsource", "inter", "files", `inter-latin-${FONT_WEIGHT}-normal.woff`),
  join(root, "node_modules", "@fontsource-variable", "inter", "files", `inter-latin-wght-normal.woff`),
];

const ogSize = { height: 630, width: 1200 };

const loadFont = async () => {
  for (const candidate of FONT_CANDIDATES) {
    try {
      return await readFile(candidate);
    } catch {
      // try next
    }
  }
  throw new Error(
    `Could not find a local Inter font. Tried:\n${FONT_CANDIDATES.join("\n")}\n` +
      `Install @fontsource/inter or @fontsource-variable/inter as a devDependency.`,
  );
};

const render = async () => {
  const [font, logo] = await Promise.all([loadFont(), readFile(logoPath)]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  // satori accepts a JSX-like element tree directly. (Do NOT wrap this in
  // satori-html's `html()` — that parses an HTML *string*; handing it an object
  // produced an empty render, i.e. a blank PNG.)
  const markup = {
    type: "div",
    props: {
      style: {
        background: "#ffffff",
        color: "#25282b",
        display: "flex",
        flexDirection: "column",
        fontFamily: `"${FONT_FAMILY}", sans-serif`,
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        position: "relative",
        width: "100%",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              background: "#e60000",
              display: "flex",
              height: "100%",
              left: "0",
              position: "absolute",
              top: "0",
              width: "18px",
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              background: "#25282b",
              display: "flex",
              height: "100%",
              position: "absolute",
              right: "0",
              top: "0",
              width: "18px",
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              alignItems: "center",
              color: "#e60000",
              display: "flex",
              fontSize: "30px",
              fontWeight: 700,
              gap: "16px",
              justifyContent: "flex-start",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            },
            children: [
              {
                type: "img",
                props: {
                  src: logoSrc,
                  style: {
                    alignItems: "center",
                    display: "flex",
                    height: "68px",
                    justifyContent: "center",
                    position: "relative",
                    width: "68px",
                  },
                },
              },
              { type: "span", props: { children: "Litrito" } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              alignItems: "flex-start",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              maxWidth: "900px",
              paddingTop: "42px",
              textAlign: "left",
              width: "100%",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontSize: "76px",
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                  },
                  children: "Precios de gasolina en México.",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    color: "#3a3e42",
                    display: "flex",
                    fontSize: "29px",
                    fontWeight: 700,
                    lineHeight: 1.28,
                    marginTop: "28px",
                    maxWidth: "820px",
                    whiteSpace: "pre-wrap",
                  },
                  children:
                    "Compara precios por estación, municipio y estado.\nRegular, premium, diésel y duba, actualizados a diario.",
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(markup, {
    ...ogSize,
    fonts: [
      {
        data: font,
        name: FONT_FAMILY,
        style: "normal",
        weight: FONT_WEIGHT,
      },
    ],
  });

  const png = new Resvg(svg, {
    background: "#ffffff",
    fitTo: { mode: "width", value: ogSize.width },
    font: {
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng();

  await writeFile(outPath, png);
  console.log(`Wrote ${outPath} (${png.length} bytes)`);
};

render().catch((err) => {
  console.error(err);
  process.exit(1);
});
