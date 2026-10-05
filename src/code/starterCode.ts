import { CODE_LANGUAGES, type CodeLanguage } from './languages';

/**
 * What the editor holds before anybody writes anything: the smallest program in
 * each language that compiles, runs and prints something. A blank buffer gives
 * two people nothing to start from, and in C++ or Go it also hides the part
 * nobody enjoys typing from memory — the includes, the package line, the
 * signature of `main`.
 */
export const STARTER_CODE: Record<CodeLanguage, string> = {
  javascript: `function main() {
  console.log('Hello from Collab');
}

main();`,
  typescript: `function main(): void {
  console.log('Hello from Collab');
}

main();`,
  python: `def main():
    print("Hello from Collab")

main()`,
  go: `package main

import "fmt"

func main() {
  fmt.Println("Hello from Collab")
}`,
  cpp: `#include <iostream>

int main() {
  std::cout << "Hello from Collab" << std::endl;
  return 0;
}`,
};

export function starterCode(language: CodeLanguage): string {
  return STARTER_CODE[language];
}

/**
 * Whether the editor still holds something nobody chose to write: blank, or a
 * starter in one of the languages. Switching language replaces that and nothing
 * else, so a single edit — even a deleted line — is enough to keep what is on
 * screen.
 */
export function isStarterCode(text: string): boolean {
  if (text.trim() === '') {
    return true;
  }
  return CODE_LANGUAGES.some((language) => STARTER_CODE[language] === text);
}
