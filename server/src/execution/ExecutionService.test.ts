import { describe, expect, it } from 'vitest';
import { createRunnerFromEnv } from './ExecutionService';
import { DockerRunner } from './DockerRunner';
import { LocalRunner } from './LocalRunner';
import { PistonRunner } from './PistonRunner';

describe('createRunnerFromEnv', () => {
  it('uses the host compilers when nothing is configured', () => {
    const runner = createRunnerFromEnv({});

    expect(runner).toBeInstanceOf(LocalRunner);
    expect(runner?.name).toBe('local');
  });

  it('uses Docker when asked', () => {
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'docker' })).toBeInstanceOf(DockerRunner);
  });

  it('stays off when a deployment opts out', () => {
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'off' })).toBeNull();
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'none' })).toBeNull();
  });

  it('honours a private Piston URL', () => {
    const runner = createRunnerFromEnv({
      EXECUTION_BACKEND: 'piston',
      EXECUTION_PISTON_URL: 'https://piston.example',
    });

    expect(runner).toBeInstanceOf(PistonRunner);
  });
});
