#!/bin/bash
trap 'kill 0' EXIT

firebase emulators:start &
(cd functions && npm run build:watch) &
(cd app && pnpm dev) &

wait
