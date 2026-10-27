# Security Policy

## Supported versions

There are no releases yet. `main` is the only supported version; fixes land
there and nowhere else.

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting, not as a
public issue:

1. Go to the [Security tab](https://github.com/londontypescript/grand-union/security) of this repository.
2. Select **Report a vulnerability**.
3. Describe the issue, the affected package or app, and steps to reproduce.

You will get an acknowledgement, and a fix or a public explanation once the
report is triaged. There is no bug bounty; this is a community meetup project.

## Scope note: the SSH terminal target

`apps/terminal` runs an SSH server that accepts unauthenticated, read-only
sessions by design — anyone who connects gets the site rendered as text, no
credentials required. That is intentional and is not itself a vulnerability.

It is for local development: it listens on `127.0.0.1` only (tested in
`apps/terminal/src/ssh-process.test.ts`), and running it on a public
interface is unsupported. Its review found exhaustion cases that only a
public host would meet; serving the terminal publicly is a separate design,
tracked in #38. What _is_ in scope for this target:

- **Escaping the ink render session** — reaching a shell, another user's
  session, the host filesystem, or anything beyond the page the server means
  to show.
- **Resource exhaustion** — a client causing unbounded memory, CPU, disk, or
  connection growth on the host (for example: rendering payloads that don't
  bound to terminal size, connections that aren't cleaned up on disconnect,
  or amplification from a single session).
- **Host-key or transport issues** — anything that weakens the SSH host-key
  identity, transport encryption, or lets a client be pointed at content it
  didn't ask for (for example: request smuggling between sessions on the same
  connection).

The limits the server currently applies — connection, handshake,
shell-less (with a forced close after a grace), per-connection session and
concurrent shell caps, one shell per session, the idle timeout, the
terminal-size cap, the minimum packet size, and the unread-output bound on
both the channel and the connection socket (passing it ends the whole
connection) — are listed in `docs/architecture.md` and tested in
`apps/terminal/src/ssh-limits.test.ts`, `ssh-session.test.ts`,
`ssh-backpressure.test.ts` and `session.test.ts`. A way around any of them
is in scope.

Being able to _connect_ without credentials, or to _view_ the rendered page,
is expected behaviour, not a report.
