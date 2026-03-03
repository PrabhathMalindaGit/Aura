#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "src"];
const VALID_EXTENSIONS = new Set([".ts", ".tsx"]);

/** @typedef {{level: "FAIL" | "WARN", file: string, line: number, message: string}} Issue */

/** @returns {Promise<string[]>} */
async function collectTargetFiles() {
  /** @type {string[]} */
  const files = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const extension = path.extname(entry.name);
      if (!VALID_EXTENSIONS.has(extension)) {
        continue;
      }
      files.push(fullPath);
    }
  }

  for (const target of TARGET_DIRS) {
    const absolute = path.join(ROOT, target);
    try {
      await walk(absolute);
    } catch {
      // Missing directory should not crash the check.
    }
  }

  return files;
}

function indexToLine(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

function getLines(content) {
  return content.split(/\r?\n/);
}

/** @param {Issue[]} issues */
function pushIssue(issues, level, file, line, message) {
  issues.push({ level, file, line, message });
}

function checkShadowProps(filePath, content, issues) {
  const pattern = /\b(shadowColor|shadowOpacity|shadowRadius|shadowOffset)\s*:/g;
  let match;
  while ((match = pattern.exec(content))) {
    const line = indexToLine(content, match.index);
    const isNativeOnly = filePath.includes(".native.");
    if (isNativeOnly) {
      pushIssue(
        issues,
        "WARN",
        filePath,
        line,
        `Native-only file uses ${match[1]} (allowed with warning).`
      );
    } else {
      pushIssue(
        issues,
        "FAIL",
        filePath,
        line,
        `Detected deprecated ${match[1]} style prop; use boxShadow for web-safe styling.`
      );
    }
  }
}

function checkOverflowShadowCombo(filePath, content, issues) {
  const lines = getLines(content);
  const overflowPattern = /overflow\s*:\s*["']hidden["']/;
  const shadowLikePattern =
    /(shadowColor|shadowOpacity|shadowRadius|shadowOffset|elevation|boxShadow)\s*:/;

  for (let i = 0; i < lines.length; i += 1) {
    if (!overflowPattern.test(lines[i])) {
      continue;
    }

    const start = Math.max(0, i - 8);
    const end = Math.min(lines.length - 1, i + 8);
    const window = lines.slice(start, end + 1).join("\n");

    if (shadowLikePattern.test(window)) {
      pushIssue(
        issues,
        "FAIL",
        filePath,
        i + 1,
        'Potential overflow:hidden + shadow/elevation/boxShadow combination in same style object window.'
      );
    }
  }
}

function checkNestedVerticalScroll(filePath, content, issues) {
  let cursor = 0;
  while (true) {
    const openIndex = content.indexOf("<Screen", cursor);
    if (openIndex === -1) {
      break;
    }

    const tagEnd = content.indexOf(">", openIndex);
    if (tagEnd === -1) {
      break;
    }

    const openTag = content.slice(openIndex, tagEnd + 1);
    const hasScrollFalse = /scroll\s*=\s*\{\s*false\s*\}/.test(openTag);

    if (!hasScrollFalse) {
      const closeIndex = content.indexOf("</Screen>", tagEnd + 1);
      const inner =
        closeIndex === -1
          ? content.slice(tagEnd + 1)
          : content.slice(tagEnd + 1, closeIndex);

      if (/<(ScrollView|FlatList)\b/.test(inner)) {
        pushIssue(
          issues,
          "FAIL",
          filePath,
          indexToLine(content, openIndex),
          "Screen without scroll={false} contains nested vertical ScrollView/FlatList."
        );
      }
    }

    cursor = tagEnd + 1;
  }
}

function checkRemountKeys(filePath, content, issues) {
  const lines = getLines(content);
  const pattern = /key\s*=\s*\{\s*(status|trust)\.kind\s*\}/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!pattern.test(line)) {
      continue;
    }

    const currentHasWaiver = line.includes("web-ok: key-remount");
    const previousHasWaiver = i > 0 && lines[i - 1].includes("web-ok: key-remount");
    if (currentHasWaiver || previousHasWaiver) {
      continue;
    }

    pushIssue(
      issues,
      "WARN",
      filePath,
      i + 1,
      "Remount key pattern detected (key={status.kind}/key={trust.kind}); prefer stable nodes."
    );
  }
}

function checkIntervalCleanup(filePath, content, issues) {
  const firstInterval = content.indexOf("setInterval(");
  if (firstInterval === -1) {
    return;
  }

  if (!content.includes("clearInterval(")) {
    pushIssue(
      issues,
      "WARN",
      filePath,
      indexToLine(content, firstInterval),
      "setInterval detected without clearInterval in file."
    );
  }
}

async function main() {
  const files = await collectTargetFiles();
  /** @type {Issue[]} */
  const issues = [];

  await Promise.all(
    files.map(async (filePath) => {
      const content = await fs.readFile(filePath, "utf8");
      const relative = path.relative(ROOT, filePath);

      checkShadowProps(relative, content, issues);
      checkOverflowShadowCombo(relative, content, issues);
      checkNestedVerticalScroll(relative, content, issues);
      checkRemountKeys(relative, content, issues);
      checkIntervalCleanup(relative, content, issues);
    })
  );

  const failIssues = issues.filter((issue) => issue.level === "FAIL");
  const warnIssues = issues.filter((issue) => issue.level === "WARN");

  for (const issue of issues) {
    console.log(`${issue.level}: ${issue.file}:${issue.line} - ${issue.message}`);
  }

  console.log(`\nFAIL: ${failIssues.length} issues`);
  console.log(`WARN: ${warnIssues.length} issues`);

  if (failIssues.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("web-stability-check failed:", error);
  process.exit(1);
});
