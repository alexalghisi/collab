import { CODE_LANGUAGES, type CodeLanguage } from './languages';

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

export function isStarterCode(text: string): boolean {
  if (text.trim() === '') {
    return true;
  }
  return CODE_LANGUAGES.some((language) => STARTER_CODE[language] === text);
}
