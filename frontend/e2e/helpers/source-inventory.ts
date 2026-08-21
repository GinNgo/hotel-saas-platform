import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export interface SourceMatch {
  file: string;
  line: number;
  text: string;
}

export interface RouteLiteral extends SourceMatch {
  route: string;
}

export function frontendRoot(): string {
  return resolve(process.cwd());
}

export function sourceFiles(directory: string, extensions: ReadonlySet<string>): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path, extensions));
    else if ([...extensions].some(extension => path.endsWith(extension))) files.push(path);
  }
  return files;
}

export function sourceMatches(
  files: readonly string[],
  pattern: RegExp,
  root = frontendRoot(),
): SourceMatch[] {
  const matches: SourceMatch[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        matches.push({ file: relative(root, file).replace(/\\/g, '/'), line: index + 1, text: text.trim() });
      }
    });
  }
  return matches;
}

export function routeDeclarations(root = frontendRoot()): SourceMatch[] {
  const routeFile = join(root, 'src', 'app', 'app.routes.ts');
  return sourceMatches([routeFile], /path:\s*'[^']*'/, root);
}

export function e2eRouteLiterals(root = frontendRoot()): RouteLiteral[] {
  const files = sourceFiles(join(root, 'e2e'), new Set(['.ts']));
  const results: RouteLiteral[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      const match = text.match(/(?:page\.)?goto\(\s*['"`]([^'"`$]+)['"`]/);
      if (!match || !match[1].startsWith('/')) return;
      results.push({
        file: relative(root, file).replace(/\\/g, '/'),
        line: index + 1,
        route: match[1].split('?')[0],
        text: text.trim(),
      });
    });
  }
  return results;
}

export function placeholderHrefMatches(root = frontendRoot()): SourceMatch[] {
  const files = sourceFiles(join(root, 'src', 'app'), new Set(['.html', '.ts']));
  return sourceMatches(files, /href\s*=\s*["']#["']/, root);
}

export function unsupportedMatches(root = frontendRoot()): SourceMatch[] {
  const files = sourceFiles(join(root, 'src', 'app'), new Set(['.html', '.ts']));
  return sourceMatches(files, /chưa được hỗ trợ|chưa hỗ trợ|not implemented/i, root);
}

export function incompleteImplementationMatches(root = frontendRoot()): SourceMatch[] {
  const files = sourceFiles(join(root, 'src', 'app'), new Set(['.html', '.ts']));
  return sourceMatches(
    files,
    /console\.log\(['"]Exporting|Simulate API call|Mock data matching|Completing booking|value=["']0["']/i,
    root,
  );
}

export function comingSoonMatches(root = frontendRoot()): SourceMatch[] {
  const file = join(
    root,
    'src',
    'app',
    'features',
    'client',
    'home',
    'components',
    'search-service-tabs',
    'search-service-tabs.component.ts',
  );
  return sourceMatches([file], /disabled:\s*true|COMING_SOON/, root);
}

export function activeRouteImports(root = frontendRoot()): string {
  return readFileSync(join(root, 'src', 'app', 'app.routes.ts'), 'utf8');
}
