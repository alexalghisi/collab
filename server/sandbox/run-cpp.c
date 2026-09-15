#include <stddef.h>
#include <unistd.h>
#include <sys/wait.h>

int main(int argc, char **argv) {
  if (argc < 2) {
    return 2;
  }

  const pid_t child = fork();
  if (child == 0) {
    char *compiler[] = {
        "g++", "-O0", "-std=c++17", "-pipe", "-o", "/tmp/main", argv[1], NULL};
    execvp("g++", compiler);
    _exit(127);
  }
  if (child < 0) {
    return 127;
  }

  int status = 0;
  if (waitpid(child, &status, 0) < 0) {
    return 127;
  }
  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
    return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
  }

  char *program[] = {"/tmp/main", NULL};
  execv(program[0], program);
  return 127;
}
