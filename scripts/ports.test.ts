import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolvePorts } from './ports.ts';

const DEFAULTS = { web: 5173, scene: 5174, ssh: 2222, renderWeb: 4310, renderScene: 4320 };
const FROM_6000 = { web: 6000, scene: 6001, ssh: 6002, renderWeb: 6010, renderScene: 6020 };

// Each one fails a different validation: empty, non-numeric, fractional,
// and out of range at each end.
const INVALID_BASES = ['', 'abc', '6000.5', '1023', '65501'];
const INVALID_PORTS = ['', 'abc', '2222.5', '0', '65536'];

describe('resolvePorts', () => {
  it("uses the prototype's ports when nothing is set", () => {
    expect(resolvePorts({})).toEqual(DEFAULTS);
  });

  it('puts every port at its offset from LTS_PORT_BASE', () => {
    expect(resolvePorts({ LTS_PORT_BASE: '6000' })).toEqual(FROM_6000);
  });

  it('accepts a base at each end of its range', () => {
    expect(resolvePorts({ LTS_PORT_BASE: '1024' }).web).toBe(1024);
    expect(resolvePorts({ LTS_PORT_BASE: '65500' }).renderScene).toBe(65520);
  });

  it('lets an explicit PORT set the SSH port, with or without a base', () => {
    expect(resolvePorts({ PORT: '2300' })).toEqual({ ...DEFAULTS, ssh: 2300 });
    expect(resolvePorts({ LTS_PORT_BASE: '6000', PORT: '2300' })).toEqual({
      ...FROM_6000,
      ssh: 2300,
    });
  });

  it('accepts a PORT at each end of its range', () => {
    expect(resolvePorts({ PORT: '1' }).ssh).toBe(1);
    expect(resolvePorts({ PORT: '65535' }).ssh).toBe(65535);
  });

  it.each(INVALID_BASES)('refuses LTS_PORT_BASE=%j, naming the variable', (raw) => {
    expect(() => resolvePorts({ LTS_PORT_BASE: raw })).toThrow(
      `invalid LTS_PORT_BASE "${raw}": must be a whole number from 1024 to 65500`,
    );
  });

  it.each(INVALID_PORTS)('refuses PORT=%j, naming the variable', (raw) => {
    expect(() => resolvePorts({ PORT: raw })).toThrow(
      `invalid PORT "${raw}": must be a whole number from 1 to 65535`,
    );
  });
});

// The scripts that read ports run this file with Node, so it is checked the
// same way: Node strips its types and runs it as a separate process.
describe('node scripts/ports.ts', () => {
  const script = fileURLToPath(new URL('./ports.ts', import.meta.url));

  function run(args: readonly string[], set: Readonly<Record<string, string>> = {}) {
    // The caller's own PORT or LTS_PORT_BASE must not leak into the run.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== 'PORT' && key !== 'LTS_PORT_BASE'),
    );
    const result = spawnSync(process.execPath, [script, ...args], {
      env: { ...env, ...set },
      encoding: 'utf8',
    });
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it.each(Object.entries(DEFAULTS))('prints only the %s port', (name, port) => {
    expect(run([name])).toMatchObject({ code: 0, stdout: `${String(port)}\n` });
  });

  it.each(Object.entries(FROM_6000))('prints the %s port from LTS_PORT_BASE', (name, port) => {
    expect(run([name], { LTS_PORT_BASE: '6000' })).toMatchObject({
      code: 0,
      stdout: `${String(port)}\n`,
    });
  });

  it('prints the SSH port from PORT', () => {
    expect(run(['ssh'], { PORT: '2300' })).toMatchObject({ code: 0, stdout: '2300\n' });
  });

  it('exits 1 with the usage when no name is given', () => {
    const result = run([]);
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('usage: node scripts/ports.ts <web|scene|ssh|');
  });

  it('exits 1 with the usage when given more than one name', () => {
    const result = run(['web', 'scene']);
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('usage: node scripts/ports.ts');
  });

  it('exits 1 naming an unknown port', () => {
    const result = run(['database']);
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('unknown port "database"');
  });

  it('exits 1 naming an invalid variable', () => {
    const result = run(['web'], { LTS_PORT_BASE: '80' });
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('invalid LTS_PORT_BASE "80"');
  });
});
