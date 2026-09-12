# Sandbox image for Go submissions. Build before enabling EXECUTION_BACKEND=docker:
#   docker build -f server/sandbox/go.Dockerfile -t collab-sandbox-go server/sandbox
#
# `go run` compiles the standard library on first use and the container is thrown
# away after every run, so without a warm cache baked in each submission pays
# roughly a minute of compilation. The cache is mounted at runtime as an
# anonymous volume, which Docker seeds from this image, so the compiler can write
# to it while the container's root filesystem stays read-only.
FROM golang:1.23-alpine

ENV GOCACHE=/gocache
ENV GOPATH=/gopath

RUN mkdir -p /gocache /gopath \
    && go build std \
    && chmod -R a+rwX /gocache /gopath
