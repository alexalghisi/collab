import { describe, expect, it } from 'vitest';
import { ExecutionService, createRunnerFromEnv } from './ExecutionService';
import { CloudRunner } from './CloudRunner';
import { DockerRunner } from './DockerRunner';
import { LocalRunner } from './LocalRunner';
import { PistonRunner } from './PistonRunner';

describe('createRunnerFromEnv', () => {
  it('uses the hosted compiler so the laptop never compiles', () => {
    const runner = createRunnerFromEnv({});

    expect(runner).toBeInstanceOf(CloudRunner);
    expect(runner?.name).toBe('cloud');
  });

  it('still uses the hosted compiler when EXECUTION_BACKEND is off', () => {
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'off' })).toBeInstanceOf(CloudRunner);
    expect(createRunnerFromEnv({ NODE_ENV: 'production' })).toBeInstanceOf(CloudRunner);
  });

  it('uses host compilers only when asked', () => {
    expect(createRunnerFromEnv({ EXECUTION_BACKEND: 'local' })).toBeInstanceOf(LocalRunner);
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
});

describe('ExecutionService on the hosted server', () => {
  it('accepts a run so the room is not told execution is disabled', () => {
    const service = new ExecutionService(createRunnerFromEnv({}));

    expect(service.enabled).toBe(true);
    expect(service.sandbox).toBe('cloud');
    expect(
      service.accept({ language: 'javascript', code: 'console.log(1)', stdin: '' }, ['room:demo']),
    ).toMatchObject({ ok: true });
  });
});
