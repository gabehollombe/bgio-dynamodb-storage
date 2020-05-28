# bgio-dynamodb-storage

DynamoDB storage database connector for [boardgame.io](https://boardgame.io/)

This package provides a database connector that allows you to use an Amazon [DynamoDB](https://aws.amazon.com/dynamodb/) table to store boardgame.io metadata and game state.

## Installation

```sh
npm install --save bgio-dynamodb-storage
```

## Usage

1. Create a Amazon DynamoDB table with `id` and `type` attributes similar to the following. Assuming you've set up the AWS Command Line Interface, you can just run:

```bash
aws dynamodb create-table \
  --table-name MyBoardgameIOState \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=type,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH AttributeName=type,KeyType=RANGE \
  --billing-more PAY_PER_REQUEST
```

2. If the server running your code has AWS IAM privilleges to be able to operate on your table, you should be able to do something like this:

```js
const { DynamoStorage } = require('bgio-dynamodb-storage');
const { AWS } = require('aws-sdk');
const { Server } = require('boardgame.io/server');
const { MyGame } = require('./game');

const database = new DynamoStorage({
  client: new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' }),
  tableName: 'MyBoardgameIOState',
});

const server = Server({
  games: [MyGame],
  db: database,
});

server.run(8000);
```