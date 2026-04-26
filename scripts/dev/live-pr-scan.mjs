#!/usr/bin/env node
/**
 * Live-GitHub diff-rendering probe.
 *
 * Drives a headless Chromium against a locally-running MarDoc dev
 * server, boots straight into real-repo mode with your PAT, opens a
 * specific PR on mardoc-app/mardoc-app.github.io, and dumps block
 * counts + headings + a "blend smell" check (back-to-back word
 * fusion like "ValueThe reframe" that signals the DiffViewer's
 * block-pair matcher blending unrelated blocks).
 *
 * Why this exists: demo-mode fixtures can hide real rendering bugs.
 * When a user reports "the diff looks wrong" against a real repo,
 * this driver reproduces it end-to-end in ~5s.
 *
 * Requirements:
 *   - MarDoc dev server running on http://localhost:3000
 *   - GH_PAT env var with a classic token (repo scope)
 *
 * Usage:
 *   GH_PAT=ghp_... node scripts/dev/live-pr-scan.mjs [prNumber]
 *
 * Defaults to PR #74 (a known merged PR with a prose rewrite — the
 * fixture this tool was built against). Pass any open or closed PR
 * number from mardoc-app/mardoc-app.github.io to scan it instead.
 *
 * Screenshots land in /tmp/real-pr-<N>-{top,mid,low}.png.
 */
import { chromium } from '@playwright/test';

const PAT = process.env.GH_PAT;
if (!PAT) {
  console.error('GH_PAT env missing. Export a classic PAT with `repo` scope.');
  process.exit(1);
}

const REPO = process.env.MARDOC_SCAN_REPO || 'mardoc-app/mardoc-app.github.io';
const PR_NUMBER = Number(process.argv[2] || 74);
if (!Number.isInteger(PR_NUMBER) || PR_NUMBER <= 0) {
  console.error(`Bad PR number: ${process.argv[2]}`);
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.addInitScript(
  ({ pat, repo }) => {
    localStorage.setItem('mardoc_github_token', pat);
    localStorage.setItem('mardoc_current_repo', repo);
  },
  { pat: PAT, repo: REPO }
);

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Open PR list, flip the state filter to "closed" so merged PRs are
// fetched (the default is "open" which hides anything historical).
await page.getByRole('button', { name: /^PRs$/ }).first().click();
await page.waitForTimeout(500);
await page.locator('button', { hasText: /^closed$/ }).first().click();
await page.waitForTimeout(3500);

// Deep-link directly to the PR. This works only if the PR is in the
// already-loaded prList; the `closed` filter above normally surfaces
// it. If you scan a very old PR, bump pagination in github-api.ts.
await page.goto(
  `http://localhost:3000/#/${REPO}/pull/${PR_NUMBER}`,
  { waitUntil: 'networkidle' }
);
for (let i = 0; i < 30; i++) {
  if (await page.$('.diff-content')) break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const added = document.querySelectorAll('.diff-block-added').length;
  const removed = document.querySelectorAll('.diff-block-removed').length;
  const unchanged = document.querySelectorAll('.rendered-block.diff-content').length;
  const all = document.querySelectorAll('.diff-content').length;
  const modified = Math.max(0, all - added - removed - unchanged);
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')]
    .slice(0, 16).map((h) => h.textContent?.slice(0, 100));
  const blendSmell = headings.filter((h) => /[a-z][A-Z]/.test(h || ''));
  return {
    added, removed, unchanged, modified, headings, blendSmell,
    demoBadge: document.body.innerText.includes('Demo Mode'),
    url: location.href,
    descSnippet: (document.body.innerText.match(/Description[\s\S]{0,300}/)?.[0] || '').slice(0, 300),
  };
});

console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: `/tmp/real-pr-${PR_NUMBER}-top.png`, fullPage: false });
await page.evaluate(() => window.scrollTo(0, 1500));
await page.waitForTimeout(300);
await page.screenshot({ path: `/tmp/real-pr-${PR_NUMBER}-mid.png`, fullPage: false });
await page.evaluate(() => window.scrollTo(0, 3500));
await page.waitForTimeout(300);
await page.screenshot({ path: `/tmp/real-pr-${PR_NUMBER}-low.png`, fullPage: false });

await browser.close();
