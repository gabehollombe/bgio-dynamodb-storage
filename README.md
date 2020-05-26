# bgio-dynamodb-storage

DynamoDB storage database connector for [boardgame.io](https://boardgame.io/)

This package provides a database connector that allows you to use an Amazon [DynamoDB](https://aws.amazon.com/dynamodb/) table to store boardgame.io metadata and game state.

## Installation

```sh
npm install --save bgio-dynamodb-storage
```

## Usage

```js
const { DynamoStorage } = require('bgio-dynamodb-storage');
const { AWS } = require('aws-sdk');
const { Server } = require('boardgame.io/server');
const { MyGame } = require('./game');

const database = new DynamoStorage({
  client: new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' }),
  tableName: 'pass-an-existing-dynamodb-table-name-here-to-store-state-in',
});

const server = Server({
  games: [MyGame],
  db: database,
});

server.run(8000);
```