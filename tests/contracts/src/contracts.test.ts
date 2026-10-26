import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { discoverRegistries } from './discover-registries.ts';
import { findFilesContaining, listSourceFiles } from './fs-utils.ts';
import { addExcessRegistryKey, readSource, removeRegistryKey, replaceOnce } from './mutate.ts';
import {
  createOverlayProgram,
  diagnosticsForFile,
  expectDiagnosticsWithCodes,
  expectOneDiagnostic,
  formatDiagnosticMessage,
  type Overlay,
} from './program.ts';
import { fromRoot } from './repo-paths.ts';

const VOCABULARY_SRC = fromRoot('packages/vocabulary/src');
const PAGES_SRC = fromRoot('packages/pages/src');
const VOCABULARY_FILE = fromRoot('packages/vocabulary/src/vocabulary.ts');
const VERTICAL_ALIGN_FILE = fromRoot('packages/vocabulary/src/vertical-align.ts');

const registries = discoverRegistries();
const allRootFiles = [
  ...listSourceFiles(VOCABULARY_SRC),
  ...listSourceFiles(PAGES_SRC),
  ...registries.flatMap((registry) => listSourceFiles(registry.srcDir)),
];

function program(overlay: Overlay = new Map()): ts.Program {
  return createOverlayProgram(allRootFiles, overlay);
}

describe('baseline', () => {
  it('the real sources have zero diagnostics', () => {
    const diagnostics = ts.getPreEmitDiagnostics(program());
    expect(diagnostics.map(formatDiagnosticMessage)).toEqual([]);
  });
});

describe('a missing registry key fails to compile', () => {
  for (const registry of registries) {
    it(`${registry.name}: removing DividingLine reports a diagnostic in registry.ts`, () => {
      const source = readSource(registry.registryFile);
      const mutated = removeRegistryKey(source, 'DividingLine', registry.registryFile);
      const overlay: Overlay = new Map([[registry.registryFile, mutated]]);

      const diagnostics = diagnosticsForFile(program(overlay), registry.registryFile);
      const diagnostic = expectOneDiagnostic(diagnostics, registry.registryFile);

      expect(diagnostic.code).toBe(1360);
      expect(formatDiagnosticMessage(diagnostic)).toMatchSnapshot(`${registry.name}/missing-key`);
    });
  }
});

describe('an excess registry key fails to compile', () => {
  for (const registry of registries) {
    it(`${registry.name}: a typo'd extra key reports a diagnostic in registry.ts`, () => {
      const source = readSource(registry.registryFile);
      const mutated = addExcessRegistryKey(
        source,
        'DivdingLine',
        'DividingLine',
        registry.registryFile,
      );
      const overlay: Overlay = new Map([[registry.registryFile, mutated]]);

      const diagnostics = diagnosticsForFile(program(overlay), registry.registryFile);
      const diagnostic = expectOneDiagnostic(diagnostics, registry.registryFile);

      expect(diagnostic.code).toBe(2561);
      expect(formatDiagnosticMessage(diagnostic)).toMatchSnapshot(`${registry.name}/excess-key`);
    });
  }
});

describe('a new Vocabulary member fails every registry', () => {
  it('adding ProbeComponent to Vocabulary reports a diagnostic in every discovered registry', () => {
    const source = readSource(VOCABULARY_FILE);
    const mutated = replaceOnce(
      source,
      // The interface's closing brace: the only line that is exactly `}`,
      // so this survives members being added or reordered.
      '\n}\n',
      '\n  readonly ProbeComponent: (props: ParagraphProps) => ReactNode;\n}\n',
      VOCABULARY_FILE,
    );
    const overlay: Overlay = new Map([[VOCABULARY_FILE, mutated]]);
    const compiled = program(overlay);

    for (const registry of registries) {
      const diagnostics = diagnosticsForFile(compiled, registry.registryFile);
      const diagnostic = expectOneDiagnostic(
        diagnostics,
        `${registry.name} after adding ProbeComponent to Vocabulary`,
      );
      expect(diagnostic.code).toBe(1360);
      expect(formatDiagnosticMessage(diagnostic)).toMatchSnapshot(
        `${registry.name}/new-vocabulary-member`,
      );
    }
  });
});

describe('a new VerticalAlign member fails every total map', () => {
  it("adding 'stretch' to VERTICAL_ALIGN reports a diagnostic in every total map", () => {
    const source = readSource(VERTICAL_ALIGN_FILE);
    const mutated = replaceOnce(
      source,
      "['top', 'middle', 'bottom'] as const;",
      "['top', 'middle', 'bottom', 'stretch'] as const;",
      VERTICAL_ALIGN_FILE,
    );
    const overlay: Overlay = new Map([[VERTICAL_ALIGN_FILE, mutated]]);
    const compiled = program(overlay);

    for (const registry of registries) {
      const totalMapFiles = findFilesContaining(registry.srcDir, 'satisfies Record<VerticalAlign');
      expect(
        totalMapFiles.length,
        `${registry.name} should define at least one total map`,
      ).toBeGreaterThan(0);

      for (const file of totalMapFiles) {
        const diagnostics = diagnosticsForFile(compiled, file);
        // The satisfies failure (1360) is the property under test; the index
        // expression also going implicitly-any (7053) is its expected fallout.
        const diagnostic = expectDiagnosticsWithCodes(
          diagnostics,
          { primary: 1360, allowedSecondary: [7053] },
          `${file} after adding 'stretch'`,
        );
        expect(formatDiagnosticMessage(diagnostic)).toMatchSnapshot(
          `${registry.name}/new-vertical-align-member`,
        );
      }
    }
  });
});
