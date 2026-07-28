ARG RUN

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd as builderenv

WORKDIR /app

# some packages require a build step
RUN apk update
RUN apk add --no-cache py3-setuptools python3-dev build-base

# build the app
COPY . /app
RUN yarn install --frozen-lockfile
RUN yarn build

# The test suite is not run here on purpose: the integration tests need a postgres to run
# against, which the image build has no access to. CI runs them with its own database service.

# remove devDependencies, keep only used dependencies
RUN yarn install --prod --frozen-lockfile


########################## END OF BUILD STAGE ##########################
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

RUN apk update
RUN apk add --no-cache tini

# NODE_ENV is used to configure some runtime options, like JSON logger
ENV NODE_ENV production

WORKDIR /app
COPY --from=builderenv /app /app
# Please _DO NOT_ use a custom ENTRYPOINT because it may prevent signals
# (i.e. SIGTERM) to reach the service
# Read more here: https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/
#            and: https://www.ctl.io/developers/blog/post/gracefully-stopping-docker-containers/
ENTRYPOINT ["/sbin/tini", "--"]
# Run the program under Tini
CMD [ "/usr/local/bin/node", "--trace-warnings", "--abort-on-uncaught-exception", "--unhandled-rejections=strict", "dist/index.js" ]

