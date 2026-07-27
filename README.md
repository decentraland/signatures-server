# Signatures server

[![Coverage Status](https://coveralls.io/repos/github/decentraland/signatures-server/badge.svg?branch=main)](https://coveralls.io/github/decentraland/signatures-server?branch=main)

The signatures server is a REST API that provides a way to store and retrieve contract signatures.

## Getting started

1. Set up the `.env` file taking as a reference, the `.env.default` file.
2. Install the dependencies using `yarn install --frozen-lockfile`.
3. Build the project using `yarn build`.

## Testing

The integration tests run against a real postgres, started with docker compose:

```bash
docker compose up -d
yarn test
```

The connection is read from `.env.test`, which points at the database of `docker-compose.yml`. Any
`PG_COMPONENT_PSQL_CONNECTION_STRING` present in the environment takes precedence over it, which is
how CI points the suites at its own postgres service.

Each jest worker gets its own database, created and migrated by the global setup, so suites running
in parallel do not interfere with each other. The unit tests need no database.

Linting is checked in CI with `yarn lint:check`, and most findings can be applied with `yarn lint:fix`.

