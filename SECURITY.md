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
What _is_ in scope for this target:

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
shell-less, per-connection session and concurrent shell caps, the idle
timeout, the terminal-size cap and the unread-output bound — are listed in
`docs/architecture.md` and tested in `apps/terminal/src/ssh-limits.test.ts`,
`ssh-session.test.ts` and `session.test.ts`. A way around any of them is in
scope.

Being able to _connect_ without credentials, or to _view_ the rendered page,
is expected behaviour, not a report.
