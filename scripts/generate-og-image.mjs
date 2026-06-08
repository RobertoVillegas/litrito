#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "public", "og-image.png");

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
  const font = await loadFont();

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
        padding: "72px",
        width: "100%",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              alignItems: "center",
              color: "#e60000",
              display: "flex",
              fontSize: "32px",
              fontWeight: 700,
              gap: "16px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            },
            children: [
              {
                type: "span",
                props: {
                  style: {
                    alignItems: "center",
                    background: "#e60000",
                    borderRadius: "8px",
                    color: "#ffffff",
                    display: "flex",
                    height: "40px",
                    justifyContent: "center",
                    position: "relative",
                    width: "40px",
                  },
                  children: [
                    {
                      type: "span",
                      props: {
                        style: {
                          background: "#ffffff",
                          borderRadius: "4px",
                          display: "flex",
                          height: "23px",
                          left: "10px",
                          position: "absolute",
                          top: "9px",
                          width: "16px",
                        },
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          background: "#e60000",
                          borderRadius: "2px",
                          display: "flex",
                          height: "7px",
                          left: "13px",
                          position: "absolute",
                          top: "12px",
                          width: "10px",
                        },
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          background: "#ffffff",
                          borderRadius: "2px",
                          display: "flex",
                          height: "4px",
                          left: "27px",
                          position: "absolute",
                          top: "15px",
                          transform: "rotate(34deg)",
                          width: "8px",
                        },
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          background: "#ffffff",
                          borderRadius: "2px",
                          display: "flex",
                          height: "13px",
                          left: "31px",
                          position: "absolute",
                          top: "18px",
                          width: "4px",
                        },
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          background: "#ffffff",
                          borderRadius: "2px",
                          display: "flex",
                          height: "4px",
                          left: "9px",
                          position: "absolute",
                          top: "31px",
                          width: "18px",
                        },
                      },
                    },
                  ],
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
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              justifyContent: "center",
              maxWidth: "980px",
              paddingTop: "48px",
              paddingBottom: "48px",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontSize: "104px",
                    fontWeight: 700,
                    letterSpacing: "-0.04em",
                    lineHeight: 1.02,
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
                    fontSize: "36px",
                    fontWeight: 700,
                    lineHeight: 1.3,
                    marginTop: "32px",
                    maxWidth: "900px",
                  },
                  children:
                    "Compara precios por estación, municipio y estado. Regular, premium, diésel y duba, actualizados a diario.",
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
