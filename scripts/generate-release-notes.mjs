#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import process from "node:process";

const HELP_TEXT = `Generate release notes from git history.

Usage:
  node scripts/generate-release-notes.mjs [options]

Options:
  --from <ref>      Start ref/tag (default: auto-detect previous tag)
  --to <ref>        End ref/tag (default: HEAD)
  --version <x.y.z> Version label used in title
  --title <text>    Explicit title (default: v<version> or <to>)
  --output <path>   Write markdown to file (default: stdout)
  --dry-run         Print notes to stdout (same as default behavior)
  --help            Show this help
`;

const CATEGORY_ORDER = [
  "Features",
  "Fixes",
  "Improvements",
  "Tests",
  "Documentation",
  "Maintenance",
  "Other Changes"
];

function parseArgs(argv) {
  const args = {
    from: "",
    to: "HEAD",
    version: "",
    title: "",
    output: "",
    dryRun: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    if (!(key in args)) {
      throw new Error(`Unknown option: --${key}`);
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function runGit(args, options = {}) {
  const { allowFail = false } = options;
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    if (allowFail) {
      return "";
    }
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr || "")
        : "";
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
}

function isExistingTag(ref) {
  if (!ref) return false;
  const out = runGit(["show-ref", "--tags", "--verify", `refs/tags/${ref}`], {
    allowFail: true
  });
  return out.length > 0;
}

function inferPreviousTag(toRef) {
  const fromTagRef = isExistingTag(toRef) ? `${toRef}^` : toRef;
  return runGit(["describe", "--tags", "--abbrev=0", fromTagRef], {
    allowFail: true
  });
}

function getRootCommit(ref) {
  const output = runGit(["rev-list", "--max-parents=0", ref], { allowFail: true });
  if (!output) return "";
  return output.split("\n")[0].trim();
}

function getCompareRange(fromRef, toRef) {
  return fromRef ? `${fromRef}..${toRef}` : toRef;
}

function getCommits(range) {
  const output = runGit(
    ["log", "--no-merges", "--pretty=format:%H%x1f%s%x1f%an%x1f%cI", range],
    { allowFail: true }
  );
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [hash, subject, author, date] = line.split("\x1f");
    return { hash, subject, author, date };
  });
}

function getChangedFiles(fromRef, toRef) {
  if (fromRef) {
    const output = runGit(["diff", "--name-only", `${fromRef}..${toRef}`], {
      allowFail: true
    });
    return output ? output.split("\n").filter(Boolean) : [];
  }
  const root = getRootCommit(toRef);
  if (!root) return [];
  const output = runGit(["diff", "--name-only", `${root}..${toRef}`], {
    allowFail: true
  });
  return output ? output.split("\n").filter(Boolean) : [];
}

function cleanSubject(subject) {
  const trimmed = (subject || "").trim();
  let withoutPrefix = trimmed.replace(
    /^([a-z]+)(\([^)]+\))?!?:\s*/i,
    ""
  );
  withoutPrefix = withoutPrefix.replace(
    /\s+and\s+bump\s+version\s+to\s+\d+\.\d+\.\d+$/i,
    ""
  );
  if (!withoutPrefix) return trimmed;
  return withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1);
}

function categorizeCommit(subject) {
  const lowered = (subject || "").toLowerCase().trim();
  const match = lowered.match(/^([a-z]+)(\([^)]+\))?!?:\s*/);
  const type = match?.[1] || "";
  if (type === "feat") return "Features";
  if (type === "fix") return "Fixes";
  if (type === "refactor" || type === "perf") return "Improvements";
  if (type === "test") return "Tests";
  if (type === "docs") return "Documentation";
  if (["chore", "build", "ci", "style"].includes(type)) return "Maintenance";

  if (lowered.startsWith("fix ")) return "Fixes";
  if (lowered.startsWith("feat ")) return "Features";
  if (lowered.startsWith("refactor ")) return "Improvements";
  if (lowered.startsWith("docs ")) return "Documentation";
  if (lowered.startsWith("test ")) return "Tests";
  if (lowered.startsWith("chore ")) return "Maintenance";
  return "Other Changes";
}

function buildCategoryMap(commits) {
  const map = new Map();
  for (const category of CATEGORY_ORDER) {
    map.set(category, []);
  }
  for (const commit of commits) {
    const category = categorizeCommit(commit.subject);
    const summary = cleanSubject(commit.subject);
    if (summary) {
      map.get(category).push(summary);
    }
  }
  return map;
}

function getAreaLabel(filePath) {
  if (filePath.startsWith("src/content/")) return "Content generation flow";
  if (filePath.startsWith("src/sidepanel/")) return "Side panel task orchestration";
  if (filePath.startsWith("src/background")) return "Download and rename pipeline";
  if (filePath.startsWith("src/utils/")) return "Retry/timeout and policy utilities";
  if (filePath.startsWith("tests/")) return "Automated BDD test coverage";
  if (filePath.startsWith("docs/")) return "Technical documentation";
  if (filePath.startsWith("src/options") || filePath === "options.html")
    return "Settings and configuration UI";
  if (filePath.startsWith("src/i18n") || filePath === "README.zh-CN.md")
    return "Localization and bilingual UX";
  if (filePath === "manifest.json" || filePath === "package.json")
    return "Extension packaging and versioning";
  if (filePath === "README.md") return "Project usage documentation";
  return "General project maintenance";
}

function summarizeAreas(files) {
  const counts = new Map();
  for (const file of files) {
    const label = getAreaLabel(file);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
}

function normalizeRemoteUrl(url) {
  if (!url) return "";
  if (url.startsWith("git@github.com:")) {
    return `https://github.com/${url.slice("git@github.com:".length).replace(/\.git$/, "")}`;
  }
  if (url.startsWith("https://github.com/")) {
    return url.replace(/\.git$/, "");
  }
  return "";
}

function buildCompareLine(fromRef, toRef) {
  if (!fromRef) return "";
  const remote = normalizeRemoteUrl(
    runGit(["remote", "get-url", "origin"], { allowFail: true })
  );
  if (!remote) return `Full Changelog: ${fromRef}...${toRef}`;
  return `Full Changelog: ${remote}/compare/${fromRef}...${toRef}`;
}

function unique(values) {
  return Array.from(new Set(values));
}

function renderNotes(params) {
  const {
    title,
    fromRef,
    toRef,
    commits,
    files,
    categoryMap,
    areaSummary
  } = params;

  const lines = [];
  lines.push(`## ${title}`);
  lines.push("");
  lines.push("### Highlights");
  const highlightItems = unique([
    ...(categoryMap.get("Features") || []),
    ...(categoryMap.get("Fixes") || []),
    ...(categoryMap.get("Improvements") || [])
  ]);
  if (highlightItems.length > 0) {
    for (const item of highlightItems) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- No user-facing feature changes were detected in this range.");
  }

  lines.push("");
  lines.push("### Reliability & Quality");
  const qualityItems = unique([
    ...(categoryMap.get("Tests") || []),
    ...(categoryMap.get("Documentation") || [])
  ]);
  if (qualityItems.length > 0) {
    for (const item of qualityItems) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- Stability and internal quality checks were maintained.");
  }

  const maintenanceItems = unique([
    ...(categoryMap.get("Maintenance") || []),
    ...(categoryMap.get("Other Changes") || [])
  ]);
  if (maintenanceItems.length > 0) {
    lines.push("");
    lines.push("### Additional Changes");
    for (const item of maintenanceItems) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("### Scope");
  if (fromRef) {
    lines.push(`- ${commits.length} non-merge commits from \`${fromRef}\` to \`${toRef}\`.`);
  } else {
    lines.push(`- ${commits.length} non-merge commits up to \`${toRef}\`.`);
  }
  lines.push(`- ${files.length} files changed.`);
  if (areaSummary.length > 0) {
    lines.push("Main touched areas:");
    for (const [area, count] of areaSummary) {
      lines.push(`- ${area} (${count} files)`);
    }
  }

  const compareLine = buildCompareLine(fromRef, toRef);
  if (compareLine) {
    lines.push("");
    lines.push(compareLine);
  }

  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const toRef = args.to || "HEAD";
  const fromRef = args.from || inferPreviousTag(toRef);
  const versionLabel = args.version ? `v${args.version}` : toRef;
  const title = args.title || `${versionLabel} Release Notes`;
  const outputPath = args.output;
  const range = getCompareRange(fromRef, toRef);

  const commits = getCommits(range);
  if (commits.length === 0) {
    throw new Error(`No commits found in range: ${range}`);
  }

  const files = getChangedFiles(fromRef, toRef);
  const categoryMap = buildCategoryMap(commits);
  const areaSummary = summarizeAreas(files);
  const markdown = renderNotes({
    title,
    fromRef,
    toRef,
    commits,
    files,
    categoryMap,
    areaSummary
  });

  if (args.dryRun || !outputPath) {
    process.stdout.write(`${markdown}\n`);
    return;
  }

  writeFileSync(outputPath, markdown, "utf8");
  console.log(`Release notes written to: ${outputPath}`);
  console.log(`Range: ${range}`);
}

try {
  main();
} catch (error) {
  console.error(
    `[release-notes] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
