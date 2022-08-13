# DataSet NodeJS Logger

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Code Coverage][codecov-img]][codecov-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

> NodeJS DataSet Logger

## Install

```sh
npm install dataset-logger
```

```sh
yarn add dataset-logger
```

## Usage

```ts
import { DataSetEventSeverity, DataSetLogger } from 'dataset-logger';

const options = {
  // API Key is required.
  apiKey: 'YOUR DATASET WRITE LOGS API KEY',
  // SessionInfo is optional, it can be used to specify fields associated with the uploading process and
  // are appended to all of your events. These fields can then be used when querying the uploaded events.
  sessionInfo: {
    // Should generally specify at least a `serverHost` field, containing the hostname or other server
    // identifier. DataSet uses this value to organize events from different servers / sources.
    serverHost: 'front-1',
    serverType: 'frontend',
    region: 'us-east-1',
    application: 'some application name',
  },
};

const logger = new DataSetLogger(options);

// Simple events can be sent like the following:
logger.log('record retrieved');

// Or more complex events can be sent like:
logger.log({
  sev: DataSetEventSeverity.INFO,
  attrs: {
    message: 'record retrieved',
    recordId: 39217,
    latency: 19.4,
    length: 39207,
  },
});

// Once done, make sure to close the logger so any remaining events are flushed
await logger.close();
```

## API

### DataSetLogger(options?)

#### options

Type: `object`

[build-img]:https://github.com/yorch/dataset-logger/actions/workflows/release.yml/badge.svg
[build-url]:https://github.com/yorch/dataset-logger/actions/workflows/release.yml
[downloads-img]:https://img.shields.io/npm/dt/dataset-logger
[downloads-url]:https://www.npmtrends.com/dataset-logger
[npm-img]:https://img.shields.io/npm/v/dataset-logger
[npm-url]:https://www.npmjs.com/package/dataset-logger
[issues-img]:https://img.shields.io/github/issues/yorch/dataset-logger
[issues-url]:https://github.com/yorch/dataset-logger/issues
[codecov-img]:https://codecov.io/gh/yorch/dataset-logger/branch/main/graph/badge.svg
[codecov-url]:https://codecov.io/gh/yorch/dataset-logger
[semantic-release-img]:https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[semantic-release-url]:https://github.com/semantic-release/semantic-release
[commitizen-img]:https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[commitizen-url]:http://commitizen.github.io/cz-cli/
