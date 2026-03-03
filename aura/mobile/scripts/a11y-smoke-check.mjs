#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "src"];
const VALID_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", ".expo", ".next", ".git"]);

/** @typedef {{ level: "FAIL" | "WARN", file: string, line: number, message: string }} Issue */

function buildLineStarts(content) {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function indexToLine(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid];
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.MAX_SAFE_INTEGER;

    if (index >= start && index < next) {
      return mid + 1;
    }

    if (index < start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return lineStarts.length;
}

function getLineText(content, lineStarts, lineNumber) {
  const start = lineStarts[Math.max(0, lineNumber - 1)] ?? 0;
  const end = lineNumber < lineStarts.length ? lineStarts[lineNumber] - 1 : content.length;
  return content.slice(start, end);
}

function lineHasWaiver(content, lineStarts, index, token) {
  const line = indexToLine(lineStarts, index);
  return getLineText(content, lineStarts, line).includes(token);
}

function pushIssue(issues, level, file, line, message) {
  issues.push({ level, file, line, message });
}

function findOpeningTagEnd(content, startIndex, limit = content.length) {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;
  let braceDepth = 0;

  for (let i = startIndex; i < limit; i += 1) {
    const ch = content[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && (inSingle || inDouble || inTemplate)) {
      escape = true;
      continue;
    }

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (inTemplate) {
      if (ch === "`") {
        inTemplate = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === "`") {
      inTemplate = true;
      continue;
    }

    if (ch === "{") {
      braceDepth += 1;
      continue;
    }

    if (ch === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }

    if (ch === ">" && braceDepth === 0) {
      return i;
    }
  }

  return -1;
}

function findMatchingBracket(content, startIndex, openChar, closeChar, limit = content.length) {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;
  let depth = 0;

  for (let i = startIndex; i < limit; i += 1) {
    const ch = content[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && (inSingle || inDouble || inTemplate)) {
      escape = true;
      continue;
    }

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (inTemplate) {
      if (ch === "`") {
        inTemplate = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === "`") {
      inTemplate = true;
      continue;
    }

    if (ch === openChar) {
      depth += 1;
      continue;
    }

    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function findMatchingPressableClose(content, openTagEnd) {
  let depth = 1;
  let cursor = openTagEnd + 1;

  while (cursor < content.length) {
    const nextOpen = content.indexOf("<Pressable", cursor);
    const nextClose = content.indexOf("</Pressable>", cursor);

    if (nextClose === -1) {
      return -1;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const nestedOpenEnd = findOpeningTagEnd(content, nextOpen);
      if (nestedOpenEnd === -1) {
        return -1;
      }

      const nestedTag = content.slice(nextOpen, nestedOpenEnd + 1);
      const selfClosing = /\/\s*>$/.test(nestedTag);
      if (!selfClosing) {
        depth += 1;
      }

      cursor = nestedOpenEnd + 1;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return nextClose;
    }

    cursor = nextClose + "</Pressable>".length;
  }

  return -1;
}

function extractTopLevelObjects(arrayText) {
  const results = [];
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;
  let depth = 0;
  let objectStart = -1;

  for (let i = 0; i < arrayText.length; i += 1) {
    const ch = arrayText[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && (inSingle || inDouble || inTemplate)) {
      escape = true;
      continue;
    }

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (inTemplate) {
      if (ch === "`") {
        inTemplate = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === "`") {
      inTemplate = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        objectStart = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        results.push({
          start: objectStart,
          end: i,
          text: arrayText.slice(objectStart, i + 1),
        });
        objectStart = -1;
      }
    }
  }

  return results;
}

function isObviousIconOnlyPressableContent(rawInner) {
  const inner = rawInner
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\/.*$/gm, "")
    .trim();

  if (!inner) {
    return false;
  }

  if (/^<(MaterialCommunityIcons|FontAwesome|Ionicons)\b[\s\S]*\/>$/.test(inner)) {
    return true;
  }

  if (/^\{\s*<(MaterialCommunityIcons|FontAwesome|Ionicons)\b[\s\S]*\/>\s*\}$/.test(inner)) {
    return true;
  }

  return false;
}

async function collectTargetFiles() {
  const files = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) {
          continue;
        }
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
    await walk(path.join(ROOT, target));
  }

  return files;
}

function collectPressableBlocks(content) {
  const blocks = [];
  let cursor = 0;

  while (true) {
    const openStart = content.indexOf("<Pressable", cursor);
    if (openStart === -1) {
      break;
    }

    const openEnd = findOpeningTagEnd(content, openStart);
    if (openEnd === -1) {
      break;
    }

    const openTag = content.slice(openStart, openEnd + 1);
    const selfClosing = /\/\s*>$/.test(openTag);
    if (selfClosing) {
      cursor = openEnd + 1;
      continue;
    }

    const closeStart = findMatchingPressableClose(content, openEnd);
    if (closeStart === -1) {
      cursor = openEnd + 1;
      continue;
    }

    const closeEnd = closeStart + "</Pressable>".length;
    const inner = content.slice(openEnd + 1, closeStart);
    blocks.push({ openStart, openEnd, closeStart, closeEnd, openTag, inner });
    cursor = closeEnd;
  }

  return blocks;
}

function hasButtonRole(openTag) {
  return /\baccessibilityRole\s*=\s*(\{\s*["']button["']\s*\}|["']button["'])/.test(openTag);
}

function checkIconButtonUsage(file, content, lineStarts, issues) {
  const pattern = /<IconButton\b/g;
  let match;

  while ((match = pattern.exec(content))) {
    const start = match.index;
    const line = indexToLine(lineStarts, start);

    if (lineHasWaiver(content, lineStarts, start, "a11y-ok: iconbutton")) {
      continue;
    }

    const end = findOpeningTagEnd(content, start);
    if (end === -1) {
      continue;
    }

    const openTag = content.slice(start, end + 1);
    if (!/\baccessibilityLabel\s*=/.test(openTag)) {
      pushIssue(
        issues,
        "FAIL",
        file,
        line,
        "IconButton missing accessibilityLabel prop."
      );
    }
  }
}

function checkHeroHeaderRightActions(file, content, lineStarts, issues) {
  const heroPattern = /<HeroHeader\b/g;
  let heroMatch;

  while ((heroMatch = heroPattern.exec(content))) {
    const heroStart = heroMatch.index;
    const heroEnd = findOpeningTagEnd(content, heroStart);
    if (heroEnd === -1) {
      continue;
    }

    const openTag = content.slice(heroStart, heroEnd + 1);
    const rightActionsPattern = /rightActions\s*=\s*\{\s*\[/g;
    let rightActionsMatch;

    while ((rightActionsMatch = rightActionsPattern.exec(openTag))) {
      const rightActionsStartInTag =
        rightActionsMatch.index + rightActionsMatch[0].lastIndexOf("[");
      const arrayStartGlobal = heroStart + rightActionsStartInTag;

      const arrayEndGlobal = findMatchingBracket(
        content,
        arrayStartGlobal,
        "[",
        "]",
        heroEnd + 1
      );

      if (arrayEndGlobal === -1) {
        continue;
      }

      const arrayText = content.slice(arrayStartGlobal, arrayEndGlobal + 1);
      const objects = extractTopLevelObjects(arrayText);

      for (const obj of objects) {
        const objectGlobalStart = arrayStartGlobal + obj.start;
        const objectLine = indexToLine(lineStarts, objectGlobalStart);

        if (/a11y-ok:\s*heroaction/.test(obj.text)) {
          continue;
        }

        if (lineHasWaiver(content, lineStarts, objectGlobalStart, "a11y-ok: heroaction")) {
          continue;
        }

        if (/\bicon\s*:/.test(obj.text) && !/\baccessibilityLabel\s*:/.test(obj.text)) {
          pushIssue(
            issues,
            "FAIL",
            file,
            objectLine,
            "HeroHeader rightActions object with icon is missing accessibilityLabel."
          );
        }
      }
    }
  }
}

function checkIconOnlyPressableFail(file, content, lineStarts, issues, pressableBlocks) {
  for (const block of pressableBlocks) {
    const line = indexToLine(lineStarts, block.openStart);

    if (lineHasWaiver(content, lineStarts, block.openStart, "a11y-ok: pressable-icon")) {
      continue;
    }

    if (/a11y-ok:\s*pressable-icon/.test(block.openTag)) {
      continue;
    }

    const hasLabel = /\baccessibilityLabel\s*=/.test(block.openTag);
    const hasRoleButton = hasButtonRole(block.openTag);

    if (hasLabel || hasRoleButton) {
      continue;
    }

    if (isObviousIconOnlyPressableContent(block.inner)) {
      pushIssue(
        issues,
        "FAIL",
        file,
        line,
        "Obvious icon-only Pressable missing accessibilityLabel and accessibilityRole=\"button\"."
      );
    }
  }
}

function checkSmartImageWarnings(file, content, lineStarts, issues) {
  const pattern = /<SmartImage\b/g;
  let match;

  while ((match = pattern.exec(content))) {
    const start = match.index;
    const line = indexToLine(lineStarts, start);
    const end = findOpeningTagEnd(content, start);
    if (end === -1) {
      continue;
    }

    const openTag = content.slice(start, end + 1);
    if (!/\baccessibilityLabel\s*=/.test(openTag)) {
      pushIssue(
        issues,
        "WARN",
        file,
        line,
        "SmartImage without explicit accessibilityLabel (falls back to default label)."
      );
    }
  }
}

function checkPressableContextWarnings(file, content, lineStarts, issues, pressableBlocks) {
  for (const block of pressableBlocks) {
    // DomainIcon in Pressable without nearby accessibility-hidden wrapper.
    let domainCursor = 0;
    while (true) {
      const localIndex = block.inner.indexOf("<DomainIcon", domainCursor);
      if (localIndex === -1) {
        break;
      }

      const globalIndex = block.openEnd + 1 + localIndex;
      const line = indexToLine(lineStarts, globalIndex);
      const iconTagEnd = findOpeningTagEnd(content, globalIndex, block.closeStart);
      const iconTag =
        iconTagEnd !== -1 ? content.slice(globalIndex, iconTagEnd + 1) : "<DomainIcon";

      const contextStart = Math.max(block.openEnd + 1, globalIndex - 240);
      const context = content.slice(contextStart, globalIndex);
      const wrappedAsDecorative =
        /accessible\s*=\s*\{\s*false\s*\}/.test(context) ||
        /importantForAccessibility\s*=\s*["']no-hide-descendants["']/.test(context) ||
        /accessible\s*=\s*\{\s*false\s*\}/.test(iconTag) ||
        /importantForAccessibility\s*=\s*["']no-hide-descendants["']/.test(iconTag);

      if (!wrappedAsDecorative) {
        pushIssue(
          issues,
          "WARN",
          file,
          line,
          "DomainIcon inside Pressable may be focusable; wrap in accessible={false} container if decorative."
        );
      }

      domainCursor = localIndex + "<DomainIcon".length;
    }

    // StatusPill in Pressable without explicit accessible prop.
    let statusCursor = 0;
    while (true) {
      const localIndex = block.inner.indexOf("<StatusPill", statusCursor);
      if (localIndex === -1) {
        break;
      }

      const globalIndex = block.openEnd + 1 + localIndex;
      const line = indexToLine(lineStarts, globalIndex);
      const statusTagEnd = findOpeningTagEnd(content, globalIndex, block.closeStart);
      if (statusTagEnd === -1) {
        statusCursor = localIndex + "<StatusPill".length;
        continue;
      }

      const statusTag = content.slice(globalIndex, statusTagEnd + 1);
      if (!/\baccessible\s*=/.test(statusTag)) {
        pushIssue(
          issues,
          "WARN",
          file,
          line,
          "StatusPill inside Pressable is missing explicit accessible prop."
        );
      }

      statusCursor = localIndex + "<StatusPill".length;
    }
  }
}

async function main() {
  const files = await collectTargetFiles();
  /** @type {Issue[]} */
  const issues = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const relativeFile = path.relative(ROOT, filePath);
    const lineStarts = buildLineStarts(content);

    checkIconButtonUsage(relativeFile, content, lineStarts, issues);
    checkHeroHeaderRightActions(relativeFile, content, lineStarts, issues);

    const pressableBlocks = collectPressableBlocks(content);
    checkIconOnlyPressableFail(relativeFile, content, lineStarts, issues, pressableBlocks);

    checkSmartImageWarnings(relativeFile, content, lineStarts, issues);
    checkPressableContextWarnings(relativeFile, content, lineStarts, issues, pressableBlocks);
  }

  issues.sort((a, b) => {
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.level.localeCompare(b.level);
  });

  const failCount = issues.filter((issue) => issue.level === "FAIL").length;
  const warnCount = issues.filter((issue) => issue.level === "WARN").length;

  for (const issue of issues) {
    console.log(`${issue.level} ${issue.file}:${issue.line} ${issue.message}`);
  }

  console.log(`\nFAIL: ${failCount}`);
  console.log(`WARN: ${warnCount}`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("a11y-smoke-check failed:", error);
  process.exit(1);
});
