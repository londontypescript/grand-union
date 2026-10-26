// The one place every dev, preview and test script gets its ports from, so
// several checkouts of this repo (one worktree per branch) can run at once
// without fighting over a port: give each its own LTS_PORT_BASE.
//
// Unset, the ports are the ones the prototype used, with web and scene on
// separate defaults since both took Vite's. Set, every port is a fixed
// offset from the base. An explicit PORT still sets the SSH server's port,
// as it always has.
//
// Run directly, it prints one port for a shell script to use:
//   node scripts/ports.ts web
// Node strips the types as it loads the file, so this file uses only syntax
// that erases to plain JavaScript (tsconfig.json's erasableSyntaxOnly).

const PORT_NAMES = ['web', 'scene', 'ssh', 'renderWeb', 'renderScene'] as const;
type PortName = (typeof PORT_NAMES)[number];
type Ports = Readonly<Record<PortName, number>>;

interface PortEnv {
  readonly LTS_PORT_BASE?: string | undefined;
  readonly PORT?: string | undefined;
}

const DEFAULTS: Ports = {
  web: 5173,
  scene: 5174,
  ssh: 2222,
  renderWeb: 4310,
  renderScene: 4320,
};

// The highest base still leaves room for the largest offset (+20) below
// 65535; the lowest keeps every port out of the range only root may bind.
const BASE_MIN = 1024;
const BASE_MAX = 65500;
const PORT_MIN = 1;
const PORT_MAX = 65535;

/** The value of `variable` as a port number, or an error naming the
 * variable. Parsed as the prototype's SSH server parsed PORT. */
function parseWhole(variable: string, raw: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `invalid ${variable} "${raw}": must be a whole number from ${String(min)} to ${String(max)}`,
    );
  }
  return value;
}

function fromBase(base: number): Ports {
  return {
    web: base,
    scene: base + 1,
    ssh: base + 2,
    renderWeb: base + 10,
    renderScene: base + 20,
  };
}

/** Every port, from LTS_PORT_BASE and PORT in `env`. Throws, naming the
 * variable, when either is set to anything but a valid port. */
export function resolvePorts(env: PortEnv): Ports {
  const ports =
    env.LTS_PORT_BASE === undefined
      ? DEFAULTS
      : fromBase(parseWhole('LTS_PORT_BASE', env.LTS_PORT_BASE, BASE_MIN, BASE_MAX));
  return env.PORT === undefined
    ? ports
    : { ...ports, ssh: parseWhole('PORT', env.PORT, PORT_MIN, PORT_MAX) };
}

function isPortName(value: string): value is PortName {
  return PORT_NAMES.some((name) => name === value);
}

const USAGE = `usage: node scripts/ports.ts <${PORT_NAMES.join('|')}>`;

function portNamed(args: readonly string[], env: PortEnv): number {
  const [name, ...rest] = args;
  if (name === undefined || rest.length > 0) {
    throw new Error(USAGE);
  }
  if (!isPortName(name)) {
    throw new Error(`unknown port "${name}"; ${USAGE}`);
  }
  return resolvePorts(env)[name];
}

// Only when Node runs this file itself, never when a test imports it.
if (import.meta.main) {
  try {
    process.stdout.write(`${String(portNamed(process.argv.slice(2), process.env))}\n`);
  } catch (error) {
    process.stderr.write(`ports: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
