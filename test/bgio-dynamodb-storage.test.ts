import { State, Server, LogEntry } from 'boardgame.io';
import { DynamoStorage } from '../src/bgio-dynamodb-storage';
import emulator from 'amplify-dynamodb-simulator';
import DynamoDB, { DocumentClient } from 'aws-sdk/clients/dynamodb';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const createTableParams = (tableName: string) => {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      {
        AttributeName: 'id',
        AttributeType: 'S',
      },
      {
        AttributeName: 'type',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'id',
        KeyType: 'HASH',
      },
      {
        AttributeName: 'type',
        KeyType: 'RANGE',
      },
    ],
  };
};

describe('DynamoStorage', () => {
  let db: DynamoStorage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let emu: any;
  let documentClient: DocumentClient;

  beforeAll(async () => {
    emu = await emulator.launch();
    const dynamodb: DynamoDB = emulator.getClient(emu);
    documentClient = new DocumentClient({
      apiVersion: dynamodb.config.apiVersion,
      endpoint: dynamodb.config.endpoint,
      region: dynamodb.config.region,
      credentials: dynamodb.config.credentials,
    });

    await dynamodb.createTable(createTableParams('state')).promise();

    db = new DynamoStorage({
      client: documentClient,
      tableName: 'state',
    });
  });

  afterEach(async () => {
    await db.clear();
  });

  afterAll(async () => {
    emu.terminate();
  });

  test('returns undefined when no game exists', async () => {
    const result = await db.fetch('gameID', { state: true });
    expect(result.state).toEqual(undefined);
  });

  test('returns a created game', async () => {
    const state: unknown = { a: 1 };
    const metadata: unknown = { metadata: true };

    await db.createGame('gameID', {
      initialState: state as State,
      metadata: metadata as Server.GameMetadata,
    });

    {
      const result = await db.fetch('gameID', {
        state: true,
        metadata: true,
        initialState: true,
      });
      expect(result.state).toEqual({ a: 1 });
      expect(result.initialState).toEqual(result.state);
      expect(result.metadata).toEqual({ metadata: true });
    }
  });

  test('returns all keys', async () => {
    const state: unknown = { a: 1 };
    const metadata: unknown = { metadata: true };
    await db.createGame('gameIDX', {
      initialState: state as State,
      metadata: metadata as Server.GameMetadata,
    });

    // Sarcastic 'Thank You' to DynamoDB local for not supporting strongly consistent reads,
    // so we need to sleep here to avoid db.clear() race conditions from afterEach
    await sleep(1000);
    const keys = await db.listGames();
    expect(keys).toEqual(['gameIDX']);
  });

  test('removes a game', async () => {
    await db.wipe('gameID');
    expect(
      await db.fetch('gameID', { metadata: true, state: true, log: true })
    ).toEqual({});
  });

  test('wiping invalid game id doesnt cause error', async () => {
    const doWipeInvalid = async () => await db.wipe('gameID');
    expect(doWipeInvalid).not.toThrow();
  });

  test('clears all state', async () => {
    const state: unknown = { a: 1 };
    await db.setState('game3', state as State);
    await db.clear();

    // Same reason for sleep here as above
    await sleep(1000);
    const keys2 = await db.listGames();
    expect(keys2).toHaveLength(0);
  });

  test('log', async () => {
    const logEntry1: LogEntry = {
      _stateID: 0,
      action: {
        type: 'MAKE_MOVE',
        payload: { type: '', playerID: '0', args: [] },
      },
      turn: 0,
      phase: '',
    };

    const logEntry2: LogEntry = {
      _stateID: 1,
      action: {
        type: 'MAKE_MOVE',
        payload: { type: '', playerID: '0', args: [] },
      },
      turn: 1,
      phase: '',
    };

    await db.setState('gameIDlog', null as any, [logEntry1]); // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.setState('gameIDlog', null as any, [logEntry2]); // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await db.fetch('gameIDlog', { log: true });
    expect(result.log).toEqual([logEntry1, logEntry2]);
  });
});
