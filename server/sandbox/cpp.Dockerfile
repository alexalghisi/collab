# Sandbox image for C++ submissions. Build before enabling EXECUTION_BACKEND=docker:
#   docker build -f server/sandbox/cpp.Dockerfile -t collab-sandbox-cpp server/sandbox
#
# g++ has to compile then run, and the submission must not pass through a shell.
# This image ships a tiny wrapper that compiles /sandbox/main.cpp to /tmp/main
# (the container's exec tmpfs) and then execs it.
FROM alpine:3.21

COPY run-cpp.c /tmp/run-cpp.c
RUN apk add --no-cache g++ \
    && gcc -O2 -s -o /usr/local/bin/run-cpp /tmp/run-cpp.c \
    && rm /tmp/run-cpp.c
