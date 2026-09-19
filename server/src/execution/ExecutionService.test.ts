import { describe, expect, it } from 'vitest';
import { ExecutionService, createRunnerFromEnv } from './ExecutionService';
import { DockerRunner } from './DockerRunner';
import { LocalRunner } from './LocalRunner';
import { PistonRunner } from './PistonRunner';

describe('createRunnerFromEnv', () => {
  it('does not spawn compilers on a developer machine', () => {
    expect(createRunnerFromEnv({})).toBeNull();
    expect(createRunnerFromEnv({ NODE_ENV: 'development' })).toBeNull();
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'off' })).toBeNull();
  });

  it('uses the host compilers on the hosted server', () => {
    const runner = createRunnerFromEnv({ NODE_ENV: 'production' });

    expect(runner).toBeInstanceOf(LocalRunner);
    expect(runner?.name).toBe('local');
  });

  it('uses the host compilers when a production host still has EXECUTION_BACKEND=off', () => {
    expect(
      createRunnerFromEnv({ NODE_ENV: 'production', EXECUTION_BACKEND: 'off' }),
    ).toBeInstanceOf(LocalRunner);
    expect(
      createRunnerFromEnv({ NODE_ENV: 'production', EXECUTION_BACKEND: 'none' }),
    ).toBeInstanceOf(LocalRunner);
  });

  it('uses Docker when asked', () => {
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'docker' })).toBeInstanceOf(DockerRunner);
  });

  it('uses Piston when asked, including a private URL', () => {
    const runner = createRunnerFromEnv({
      EXECUTION_BACKEND: 'piston',
      EXECUTION_PISTON_URL: 'https://piston.example',
    });

    expect(runner).toBeInstanceOf(PistonRunner);
    expect(runner?.name).toBe('piston');
  });

  it('uses the host compilers when a laptop opts in', () => {
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'local' })).toBeInstanceOf(LocalRunner);
  });
});

describe('ExecutionService on the hosted server', () => {
  it('accepts a run so the room is not told execution is disabled', () => {
    const service = new ExecutionService(createRunnerFromEnv({ NODE_ENV: 'production' }));

    expect(service.enabled).toBe(true);
    expect(service.sandbox).toBe('local');
    expect(
      service.accept({ language: 'javascript', code: 'console.log(1)', stdin: '' }, ['room:demo']),
    ).toMatchObject({ ok: true });
  });

  it('refuses a run on a laptop that never opted in', () => {
    const service = new ExecutionService(createRunnerFromEnv({}));

    expect(service.enabled).toBe(false);
    expect(service.accept({ language: 'javascript', code: '1', stdin: '' }, ['room:demo'])).toEqual(
      {
        ok: false,
        reason: 'unavailable',
      },
    );
  });
});
