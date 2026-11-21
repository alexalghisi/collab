import { afterEach, describe, expect, it } from 'vitest';
import { bindEditorRun, editorRunProgram, rememberRunLanguage, resetEditorRun } from './editorRun';

describe('editorRunProgram', () => {
  afterEach(() => {
    resetEditorRun();
  });

  it('runs the language selected in the editor, not the one still stored on the document', () => {
    rememberRunLanguage('python');
    bindEditorRun({
      language: () => 'python',
      source: () => 'print(1)\n',
    });

    expect(editorRunProgram({ language: 'cpp', source: 'int main() { return 0; }\n' })).toEqual({
      language: 'python',
      code: 'print(1)\n',
    });
  });

  it('keeps the selected language after the editor unmounts', () => {
    rememberRunLanguage('python');
    bindEditorRun(null);

    expect(editorRunProgram({ language: 'cpp', source: 'int main() { return 0; }\n' })).toEqual({
      language: 'python',
      code: 'int main() { return 0; }\n',
    });
  });

  it('uses the shared document when nothing has been selected', () => {
    expect(editorRunProgram({ language: 'cpp', source: 'int main() { return 0; }\n' })).toEqual({
      language: 'cpp',
      code: 'int main() { return 0; }\n',
    });
  });
});
