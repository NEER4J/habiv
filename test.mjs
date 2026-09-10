import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('style.css', 'utf8');
const robots = readFileSync('robots.txt', 'utf8');
const sitemap = readFileSync('sitemap.xml', 'utf8');

test('coming soon page carries the new tiny games positioning', () => {
  assert.match(html, /A home for<br><em>tiny games\.<\/em>/);
  assert.match(html, /marketplace for tiny AI-made games/);
  assert.match(html, /Codex, Claude Code/);
  assert.match(html, /PUBLISHED VIA MCP/);
  assert.match(html, /assets\/tiny-game-hero\.png/);
});

test('page is a single responsive glass-themed hero without a header', () => {
  assert.equal((html.match(/<section\b/gi) || []).length, 0);
  assert.equal((html.match(/<header\b/gi) || []).length, 0);
  assert.match(html, /class="hero"/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /backdrop-filter: blur/);
  assert.doesNotMatch(html, /natural rhythm|generated orbit|Find my rhythm|Prompt it/i);
  assert.equal(existsSync('assets/tiny-game-hero.png'), true);
});

test('SEO metadata points to the production site and generated social image', () => {
  assert.match(html, /rel="canonical" href="https:\/\/habiv\.vercel\.app\/"/);
  assert.match(html, /property="og:image" content="https:\/\/habiv\.vercel\.app\/assets\/tiny-game-hero\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(robots, /Sitemap: https:\/\/habiv\.vercel\.app\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/habiv\.vercel\.app\/<\/loc>/);
});
