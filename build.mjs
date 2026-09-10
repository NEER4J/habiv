import { mkdir, rm, copyFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await mkdir('dist/assets', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('style.css', 'dist/style.css');
await copyFile('robots.txt', 'dist/robots.txt');
await copyFile('sitemap.xml', 'dist/sitemap.xml');
await copyFile('assets/tiny-game-hero.png', 'dist/assets/tiny-game-hero.png');
console.log('Built Habiv coming soon site in dist/');
