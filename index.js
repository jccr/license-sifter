// **license-sifter** scans a directory tree for `package.json` files,
// collects every declared dependency, then fetches and prints each one's
// license text from [unpkg.com](https://unpkg.com) along with a link to
// its home page or repository.

// ## Dependencies

// We rely on three external packages:
//
// 1. `glob` — recursively finds files matching a pattern
// 2. `fs` — reads files from disk
// 3. `cross-fetch` — provides a universal `fetch` API that works in Node.js
const glob = require("glob");
const fs = require("fs");
const fetch = require("cross-fetch");

// ## Entry Point

// Pull any command-line arguments off `process.argv`. Index 0 is `node`,
// index 1 is the script path, so the first real argument starts at index 2.
// If no directory is provided we fall back to the current working directory.
var args = process.argv.slice(2);

// ## Discovering `package.json` Files

// Kick off a recursive glob for every `package.json` under the target
// directory. We explicitly ignore `node_modules` trees at any depth so
// we only surface direct dependencies declared by the project itself,
// not the entire transitive closure.
glob(
  "**/package.json",
  {
    cwd: args[0] || process.cwd(),
    ignore: ["node_modules/**", "**/node_modules/**"],
    absolute: true
  },
  async function(err, files) {

    // ### Collecting all dependencies

    // Walk every discovered `package.json`, parse it, and append the
    // keys of its `dependencies` map to a running flat list. Files that
    // declare no `dependencies` are silently skipped.
    let allDependencies = [];
    files.forEach(file => {
      const { dependencies } = JSON.parse(fs.readFileSync(file, "utf8"));

      if (!dependencies) {
        return;
      }

      allDependencies = allDependencies.concat(Object.keys(dependencies));
    });

    // Deduplicate by passing through a `Set`, then sort alphabetically.
    // Sorting ensures the output is deterministic regardless of the order
    // packages appear across multiple `package.json` files.
    allDependencies = [...new Set(allDependencies)].sort();

    // ## Fetching License Text

    // Process each dependency in sequence. We use a `for…of` loop rather
    // than `forEach` because `await` inside `forEach` callbacks does not
    // suspend the outer function — the `for…of` form keeps network
    // requests serialized and avoids flooding unpkg with parallel calls.
    for (const dep of allDependencies) {
      let licenseText;

      // ### Probing common license filenames
      //
      // unpkg.com serves any npm package file at a predictable URL:
      // `http://unpkg.com/<package>/<file>`. We probe three conventional
      // filenames in order. Each attempt silently swallows network errors
      // and checks for unpkg's "Cannot find" error string so a missing
      // file does not count as a successful fetch. The last successful
      // probe wins, so `LICENSE.md` takes precedence if all three exist.

      try {
        const tryLicense = await (
          await fetch(`http://unpkg.com/${dep}/LICENSE`)
        ).text();
        if (!tryLicense.includes("Cannot find")) {
          licenseText = tryLicense;
        }
      } catch (_) {}

      try {
        const tryLicense = await (
          await fetch(`http://unpkg.com/${dep}/LICENSE.txt`)
        ).text();
        if (!tryLicense.includes("Cannot find")) {
          licenseText = tryLicense;
        }
      } catch (_) {}

      try {
        const tryLicense = await (
          await fetch(`http://unpkg.com/${dep}/LICENSE.md`)
        ).text();
        if (!tryLicense.includes("Cannot find")) {
          licenseText = tryLicense;
        }
      } catch (_) {}

      // ## Fetching Package Metadata

      // Fetch the package's own `package.json` from unpkg to extract
      // linking information. If this request fails entirely — for example
      // because the package has been removed or is private — we skip the
      // entry entirely with `continue` and move on.
      let pkg;
      try {
        pkg = await (
          await fetch(`http://unpkg.com/${dep}/package.json`)
        ).json();
      } catch (error) {
        continue;
      }

      // ### Resolving a canonical URL
      //
      // Packages can advertise their home page through several different
      // fields. We try them in priority order:
      //
      // 1. `url` — an explicit home page URL
      // 2. `repository` — can be either an object `{ url: "..." }` or a
      //    plain string; we normalize both forms and strip the `git:` and
      //    `git+` prefixes that npm sometimes writes so the result is a
      //    valid HTTPS link.
      // 3. `author.url` — the author's personal URL as a last resort.
      let url = pkg.url;

      let repoUrl =
        typeof pkg.repository === "object"
          ? pkg.repository.url.replace("git:", "https:").replace("git+", "")
          : typeof pkg.repository === "string"
          ? pkg.repository
          : undefined;

      let authorUrl = pkg.author ? pkg.author.url : undefined;

      // ## Output
      //
      // Print a Markdown-formatted hyperlink for the package name, then
      // a full-width rule of `=` signs, and finally the raw license text.
      // The separator is 79 characters wide — wide enough to be visually
      // distinct in a terminal but friendly to standard 80-column pagers.
      console.log(`[${dep}](${url || repoUrl || authorUrl})`);
      console.log(
        "==============================================================================="
      );
      console.log(licenseText);
    }
  }
);
