#!/usr/bin/env bash
# gRPC CRUD demo on ticket-service (checks G1-G8). Run demo/rest-demo.sh first.
# grpcurl is not installed on this machine, so the calls are made by a small Node script.
exec node "$(dirname "$0")/grpc-demo.js"
