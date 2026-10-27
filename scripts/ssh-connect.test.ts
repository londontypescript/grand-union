import { describe, expect, it } from 'vitest';

import { sshArgs } from './ssh-connect.ts';

const OPTIONS = [
  '-o',
  'StrictHostKeyChecking=no',
  '-o',
  'UserKnownHostsFile=/dev/null',
  '-o',
  'LogLevel=ERROR',
  'localhost',
];

describe('sshArgs', () => {
  it("connects to the prototype's port when nothing is set", () => {
    expect(sshArgs({})).toEqual(['-p', '2222', ...OPTIONS]);
  });

  it('connects to the SSH port LTS_PORT_BASE gives', () => {
    expect(sshArgs({ LTS_PORT_BASE: '6200' })).toEqual(['-p', '6202', ...OPTIONS]);
  });

  it('lets an explicit PORT win over LTS_PORT_BASE', () => {
    expect(sshArgs({ LTS_PORT_BASE: '6200', PORT: '2300' })).toEqual(['-p', '2300', ...OPTIONS]);
  });

  it('refuses an invalid port rather than connecting somewhere else', () => {
    expect(() => sshArgs({ PORT: 'abc' })).toThrow('invalid PORT "abc"');
  });
});
