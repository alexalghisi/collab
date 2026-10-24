import { isStarterCode } from '../code/starterCode';
import type { CodeLanguage } from '../code/languages';
import type { ProblemDetail } from './types';

export function starterLanguage(language: CodeLanguage): 'cpp' | 'python' {
  return language === 'python' ? 'python' : 'cpp';
}

export function problemStarter(language: 'cpp' | 'python', title: string): string {
  if (language === 'python') {
    return `# ${title}
def main():
    # scrie soluția aici
    pass

if __name__ == "__main__":
    main()
`;
  }
  return `// ${title}
#include <iostream>
using namespace std;

int main() {
    // scrie soluția aici
    return 0;
}
`;
}

export function problemTemplates(problem: Pick<ProblemDetail, 'title'>): string[] {
  return [problemStarter('cpp', problem.title), problemStarter('python', problem.title)];
}

/** True when the editor holds something other than a blank file, a language starter, or this problem's template. */
export function shouldConfirmOverwrite(
  current: string,
  problem: Pick<ProblemDetail, 'title'>,
): boolean {
  if (isStarterCode(current)) {
    return false;
  }
  return !problemTemplates(problem).includes(current);
}

export function firstExampleInput(problem: Pick<ProblemDetail, 'examples'>): string {
  return problem.examples[0]?.input ?? '';
}
