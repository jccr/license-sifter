const glob = require("glob");
const fs = require("fs");
const fetch = require("cross-fetch");

var args = process.argv.slice(2);

glob(
  "**/package.json",
  {
    cwd: args[0] || process.cwd(),
    ignore: ["node_modules/**", "**/node_modules/**"],
    absolute: true
  },
  async function(err, files) {
    let allDependencies = [];
    files.forEach(file => {
      const { dependencies } = JSON.parse(fs.readFileSync(file, "utf8"));

      if (!dependencies) {
        return;
      }

      allDependencies = allDependencies.concat(Object.keys(dependencies));
    });

    allDependencies = [...new Set(allDependencies)].sort();

    for (const dep of allDependencies) {
      let licenseText;

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

      let pkg;
      try {
        pkg = await (
          await fetch(`http://unpkg.com/${dep}/package.json`)
        ).json();
      } catch (error) {
        continue;
      }

      let url = pkg.url;

      let repoUrl =
        typeof pkg.repository === "object"
          ? pkg.repository.url.replace("git:", "https:").replace("git+", "")
          : typeof pkg.repository === "string"
          ? pkg.repository
          : undefined;

      let authorUrl = pkg.author ? pkg.author.url : undefined;

      console.log(`[${dep}](${url || repoUrl || authorUrl})`);
      console.log(
        "==============================================================================="
      );
      console.log(licenseText);
    }
  }
);
