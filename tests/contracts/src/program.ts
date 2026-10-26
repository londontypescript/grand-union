import ts from 'typescript';
import path from 'node:path';
import { fromRoot } from './repo-paths.ts';

/**
 * Loads `tsconfig.base.json`'s `compilerOptions` through the real compiler
 * API (rather than `JSON.parse`, which chokes on the comments the file
 * uses) so the contract tests type-check under the exact same rules as
 * every package's own `tsc -p tsconfig.json`.
 */
function loadBaseCompilerOptions(): ts.CompilerOptions {
  const configPath = fromRoot('tsconfig.base.json');
  const parseConfigHost: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(
        `Failed to parse ${configPath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
      );
    },
  };

  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, parseConfigHost);
  if (!parsed) {
    throw new Error(`Failed to parse ${configPath}`);
  }
  if (parsed.errors.length > 0) {
    const message = parsed.errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
      .join('\n');
    throw new Error(`Errors parsing ${configPath}:\n${message}`);
  }

  return parsed.options;
}

const BASE_COMPILER_OPTIONS = loadBaseCompilerOptions();

/** In-memory replacements, keyed by absolute file path, applied on top of real disk content. */
export type Overlay = ReadonlyMap<string, string>;

/**
 * Builds a `ts.Program` over the given root files, using real content from
 * disk for everything except the paths present in `overlay`. Module
 * resolution (imports, `node_modules`, `package.json` `exports`) still runs
 * against the real filesystem — only source text is swapped in memory, so a
 * single textual mutation (e.g. deleting a registry key) is enough to
 * observe the resulting diagnostics without writing to disk.
 */
export function createOverlayProgram(
  rootFileNames: readonly string[],
  overlay: Overlay,
): ts.Program {
  const options: ts.CompilerOptions = { ...BASE_COMPILER_OPTIONS };
  const host = ts.createCompilerHost(options, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const normalized = path.resolve(fileName);
    const overlaid = overlay.get(normalized);
    if (overlaid !== undefined) {
      return ts.createSourceFile(fileName, overlaid, languageVersionOrOptions, true);
    }
    return originalGetSourceFile(
      fileName,
      languageVersionOrOptions,
      onError,
      shouldCreateNewSourceFile,
    );
  };

  return ts.createProgram({ rootNames: [...rootFileNames], options, host });
}

/** Every diagnostic reported for `fileName` in `program` — semantic and syntactic. */
export function diagnosticsForFile(program: ts.Program, fileName: string): ts.Diagnostic[] {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error(`${fileName} is not part of the program`);
  }
  return [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];
}

/** Formats a diagnostic's message the way `tsc` would print it, without the file/line prefix. */
export function formatDiagnosticMessage(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

/**
 * The single diagnostic a mutation test expects, or a thrown error naming
 * `context` — used instead of `diagnostics[0]!` so a mutation that stops
 * producing any diagnostic, or starts producing extra unrelated ones, fails
 * with a clear message rather than silently passing on the first entry.
 */
export function expectOneDiagnostic(
  diagnostics: readonly ts.Diagnostic[],
  context: string,
): ts.Diagnostic {
  const [first] = diagnostics;
  if (diagnostics.length !== 1 || !first) {
    const list = diagnostics.map((d) => `- ${formatDiagnosticMessage(d)}`).join('\n');
    throw new Error(
      `Expected exactly one diagnostic for ${context}, got ${String(diagnostics.length)}.` +
        (list ? `\n${list}` : ''),
    );
  }
  return first;
}

/** Diagnostic codes a mutation is allowed to produce alongside its primary one. */
export interface ExpectedDiagnosticCodes {
  readonly primary: number;
  readonly allowedSecondary: readonly number[];
}

/**
 * Like {@link expectOneDiagnostic}, but for a mutation whose primary
 * diagnostic has known fallout (e.g. a `satisfies` failure also making an
 * indexing expression implicitly `any`). Asserts exactly one diagnostic with
 * `codes.primary` — returned for snapshotting — and that every other
 * diagnostic's code is in `codes.allowedSecondary`; anything else throws,
 * listing every diagnostic, so unrelated fallout still fails the test.
 */
export function expectDiagnosticsWithCodes(
  diagnostics: readonly ts.Diagnostic[],
  codes: ExpectedDiagnosticCodes,
  context: string,
): ts.Diagnostic {
  const primaryMatches = diagnostics.filter((d) => d.code === codes.primary);
  const [primary] = primaryMatches;
  const unexpected = diagnostics.filter(
    (d) => d.code !== codes.primary && !codes.allowedSecondary.includes(d.code),
  );

  if (primaryMatches.length !== 1 || !primary || unexpected.length > 0) {
    const list = diagnostics
      .map((d) => `- [${String(d.code)}] ${formatDiagnosticMessage(d)}`)
      .join('\n');
    throw new Error(
      `Expected exactly one diagnostic with code ${String(codes.primary)} (plus only ` +
        `codes [${codes.allowedSecondary.join(', ')}]) for ${context}, got ${String(diagnostics.length)}.` +
        (list ? `\n${list}` : ''),
    );
  }
  return primary;
}
