#!/bin/bash
set -e
npm run migrate up &&
exec node --trace-warnings --abort-on-uncaught-exception --unhandled-rejections=strict dist/index.js
