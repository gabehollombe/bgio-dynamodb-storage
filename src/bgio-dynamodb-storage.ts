import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';

class ClientAdapter {
  private opts: DynamoStorageOpts;

  constructor(opts: DynamoStorageOpts) {
    this.opts = opts;
  }

  private get documentClient() {
    return this.opts.client;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async setItem(type: string, id: string, value: any) {
    return this.documentClient
      .put({
        TableName: this.opts.tableName,
        Item: {
          id: id,
          type: type,
          value: JSON.stringify(value),
        },
      })
      .promise();
  }

  async getItem(type: string, id: string) {
    const params = {
      TableName: this.opts.tableName,
      Key: { id, type },
    };
    const result = await this.documentClient.get(params).promise();
    if (result.Item) {
      return JSON.parse(result.Item.value);
    }
    return undefined;
  }

  async removeItem(type: string, id: string) {
    const params = {
      TableName: this.opts.tableName,
      Key: { id, type },
    };
    return this.documentClient.delete(params).promise();
  }

  async clear() {
    let fetchMore = true;
    while (fetchMore) {
      // eslint-disable-next-line prefer-const
      let result = await this.documentClient
        .scan({
          TableName: this.opts.tableName,
        })
        .promise();

      if (!result.LastEvaluatedKey) {
        fetchMore = false;
      }

      // TODO: Convert this to BatchWriteItem call
      // eslint-disable-next-line prefer-const
      if (!result.Items) continue;
      const removesForId = result.Items.map((i) => [
        this.removeItem('metadata', i.id),
        this.removeItem('state', i.id),
        this.removeItem('initial', i.id),
        this.removeItem('log', i.id),
      ]);
      await Promise.all(removesForId);
    }
  }

  async keys(opts: Record<string, unknown> = {}): Promise<string[]> {
    let results: string[] = [];
    let fetchMore = true;
    while (fetchMore) {
      const result = await this.documentClient
        .scan({
          TableName: this.opts.tableName,
          FilterExpression: '#type = :state',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':state': 'state' },
          ConsistentRead: true,
        })
        .promise();

      if (result.LastEvaluatedKey === undefined) fetchMore = false;
      if (!result.Items) return [];

      let items = result.Items;
      if (opts.gameName) {
        items = items.filter((i) => i.gameName === opts.gameName);
      }

      results = results.concat(items.map((i) => i.id as string));
    }
    return results;
  }
}

export interface DynamoStorageOpts {
  client: DocumentClient;
  tableName: string;
}

export class DynamoStorage extends Async {
  private store: ClientAdapter;

  constructor(opts: DynamoStorageOpts) {
    super();
    this.store = new ClientAdapter({ ...opts });
  }

  async connect() {
    return true;
  }

  async createGame(gameID: string, opts: StorageAPI.CreateGameOpts) {
    await Promise.all([
      this.store.setItem('initial', gameID, opts.initialState),
      this.setState(gameID, opts.initialState),
      this.setMetadata(gameID, opts.metadata),
    ]);
  }

  async fetch<O extends StorageAPI.FetchOpts>(gameID: string, opts: O) {
    const result = {} as StorageAPI.FetchFields;

    await Promise.all([
      opts.state
        ? this.store.getItem('state', gameID).then((value) => {
            result.state = value as State;
          })
        : Promise.resolve(),
      opts.metadata
        ? this.store.getItem('metadata', gameID).then((value) => {
            result.metadata = value as Server.GameMetadata;
          })
        : Promise.resolve(),
      opts.log
        ? this.store.getItem('log', gameID).then((value) => {
            result.log = value as LogEntry[];
          })
        : Promise.resolve(),
      opts.initialState
        ? this.store.getItem('initial', gameID).then((value) => {
            result.initialState = value as State;
          })
        : Promise.resolve(),
    ]);

    return result as StorageAPI.FetchResult<O>;
  }

  async clear() {
    await this.store.clear();
  }

  async setState(id: string, state: State, deltalog?: LogEntry[]) {
    await Promise.all([
      this.setLog(id, deltalog),
      this.store.setItem('state', id, state),
    ]);
  }

  async setMetadata(id: string, metadata: Server.GameMetadata) {
    await this.store.setItem('metadata', id, metadata);
  }

  async wipe(id: string) {
    await Promise.all([
      this.store.removeItem('state', id),
      this.store.removeItem('initial', id),
      this.store.removeItem('metadata', id),
      this.store.removeItem('log', id),
    ]);
  }

  async listGames(opts: Record<string, unknown> = {}): Promise<string[]> {
    const keys = await this.store.keys(opts);
    return keys;
  }

  private async setLog(id: string, deltalog?: LogEntry[]) {
    if (!deltalog || !deltalog.length) {
      return;
    }

    const oldLog = (await this.store.getItem('log', id)) as LogEntry[];
    const newLog = (oldLog || []).concat(deltalog);

    await this.store.setItem('log', id, newLog);
  }
}
