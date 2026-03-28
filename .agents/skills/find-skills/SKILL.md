---
name: find-skills
description: Discover and install relevant agent skills from the open ecosystem when users ask for new capabilities, reusable workflows, or domain-specific help.
---
# Find Skills

Use this skill when the user wants to:

- Find a skill for a task or domain
- Check whether a reusable skill already exists
- Extend the agent with a specialized workflow
- Search the open skills ecosystem before building something from scratch

## Goal

Find strong skill candidates, vet them, present the best options clearly, and install the chosen one if the user wants to proceed.

## Workflow

### 1. Identify the actual need

Before searching, extract:

- The domain: React, testing, design, deployment, docs, automation, etc.
- The task: performance review, PR review, changelog generation, accessibility audit, and so on
- Any constraints: preferred source, local vs global install, specific agent, project-only install

Turn vague requests into searchable phrases:

- "How do I speed up my React app?" -> `react performance`
- "Can you help with PR reviews?" -> `pr review`
- "I need release notes from git history" -> `release notes git`

### 2. Check high-signal sources first

Start with the public directory at `https://skills.sh/`.

Prefer popular and reputable publishers when they match the task, especially:

- `vercel-labs`
- `anthropics`
- `microsoft`

If the need is broad and common, check the leaderboard or directory before doing narrower searches.

### 3. Search for matching skills

Use the Skills CLI when available:

```bash
npx skills find <query>
```

Examples:

```bash
npx skills find react performance
npx skills find playwright e2e
npx skills find changelog
npx skills find accessibility audit
```

If the first query is weak, try 2 to 3 tighter variations instead of one broad search.

If the CLI is unavailable, blocked, or the environment cannot reach npm/GitHub, fall back to browsing `skills.sh` and the source repository directly.

### 4. Vet results before recommending them

Do not recommend a skill based on name match alone. Check:

1. Install count. Prefer skills with at least 1K installs when possible. Be cautious under 100.
2. Source reputation. Trusted publishers are safer defaults than unknown accounts.
3. Repository quality. Check GitHub stars and whether the repository looks maintained.
4. Skill fit. Read the skill summary or `SKILL.md` to confirm it actually solves the user's problem.

### 5. Present options clearly

When you find relevant skills, give the user:

1. The skill name
2. A one-line explanation of what it does
3. Why it matches their request
4. The source and any quality signals you checked
5. The install command
6. A `skills.sh` link for review

Keep the list short. Prefer one recommended option and, at most, one or two alternatives.

Example response shape:

```text
I found a good match: `react-best-practices`.
It focuses on React and Next.js performance patterns and code review guidance.
Why it fits: your request is about speeding up a React app, and this skill is from a high-signal source with strong adoption.

Install:
npx skills add <source> --skill react-best-practices

Learn more:
https://skills.sh/<owner>/<repo>/react-best-practices
```

### 6. Install when the user wants to proceed

Project-local install:

```bash
npx skills add <source> --skill <skill-name>
```

Global install:

```bash
npx skills add <source> --skill <skill-name> -g -y
```

Useful options:

- `--skill <skill-name>` installs only the selected skill
- `-g` installs globally for the current user
- `-y` skips confirmation prompts
- `-a <agent>` targets a specific agent when needed

If the user wants installation, prefer the smallest scope that fits their request: project-local first, global only when they explicitly want it across projects.

## Search Heuristics

Good search categories:

- Web: `react`, `nextjs`, `tailwind`, `typescript`
- Testing: `playwright`, `jest`, `e2e`, `qa`
- DevOps: `deploy`, `docker`, `ci`, `kubernetes`
- Docs: `readme`, `api docs`, `changelog`
- Code quality: `review`, `refactor`, `best practices`
- Design: `ui`, `ux`, `design system`, `accessibility`
- Productivity: `workflow`, `automation`, `git`

Tips:

1. Use task + domain together, not just one word.
2. Try nearby terms if the first search is sparse.
3. Favor known publishers when several options look similar.

## If Nothing Useful Exists

If you do not find a strong match:

1. Say that no good skill surfaced
2. Offer to handle the task directly
3. Suggest creating a new skill if the task is recurring

Example:

```text
I did not find a strong existing skill for that workflow.
I can still help you do it directly here.
If this is something you repeat often, we can create a dedicated skill for it.
```
