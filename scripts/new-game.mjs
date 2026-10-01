#!/usr/bin/env node
// Scaffold a new game:  npm run new-game <slug> "<Title>"
// Copies src/games/_template, fills in names, and registers the game (status "hidden" until you flip it to "live").
import fs from "node:fs";
import path from "node:path";

const [slug, ...titleParts] = process.argv.slice(2);
const title = titleParts.join(" ").trim();
if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug) || !title) {
  console.error('Usage: npm run new-game <slug> "<Title>"\n  slug: lowercase letters, numbers and dashes, e.g. word-chain');
  process.exit(1);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const games = path.join(root, "src", "games");
const dest = path.join(games, slug);
if (fs.existsSync(dest)) { console.error(`src/games/${slug} already exists.`); process.exit(1); }

const camel = slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const fill = (s) => s.replaceAll("__SLUG__", slug).replaceAll("__TITLE__", title);

fs.mkdirSync(dest);
for (const f of fs.readdirSync(path.join(games, "_template"))) {
  if (f === "README.md") continue;
  fs.writeFileSync(path.join(dest, f), fill(fs.readFileSync(path.join(games, "_template", f), "utf8")));
}

function insert(file, marker, text) {
  const p = path.join(games, file);
  const src = fs.readFileSync(p, "utf8");
  const i = src.indexOf(marker);
  if (i < 0) throw new Error(`Marker "${marker}" not found in ${file}`);
  const lineStart = src.lastIndexOf("\n", i) + 1;
  fs.writeFileSync(p, src.slice(0, lineStart) + text + "\n" + src.slice(lineStart));
}

insert("registry.ts", "// @new-game:manifest", `  {
    slug: "${slug}",
    title: ${JSON.stringify(title)},
    tagline: "One line that sells the game.",
    description: "A sentence or two for search results and link previews.",
    status: "hidden", // switch to "live" to list it on the home page
    coverWorld: "abyss",
    tags: ["New"],
  },`);
insert("loaders.ts", "// @new-game:loader", `  "${slug}": () => import("./${slug}"),`);
insert("server.ts", "// @new-game:server-import", `import ${camel} from "./${slug}/server";`);
insert("server.ts", "// @new-game:server (", `  "${slug}": ${camel},`);

console.log(`Created src/games/${slug}.
Play it at http://localhost:3000/games/${slug} (run "npm run dev").
It's hidden from the home page until you set status: "live" in src/games/registry.ts.`);
