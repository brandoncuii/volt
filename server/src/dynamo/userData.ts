import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import type { Favorite, SavedTrip, RouteRequest } from '@volt/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

function ddbTableName(): string | undefined {
  return process.env.USER_DATA_TABLE;
}

let ddbClient: DynamoDBClient | null = null;
function getDdb(): DynamoDBClient {
  if (!ddbClient) ddbClient = new DynamoDBClient({});
  return ddbClient;
}

// ---------------------------------------------------------------------------
// Local JSON file fallback
// ---------------------------------------------------------------------------

interface LocalData {
  favorites: Record<string, Favorite[]>;
  trips: Record<string, SavedTrip[]>;
}

const LOCAL_PATH = join(__dirname, '..', 'data', 'user-data.json');

function loadLocal(): LocalData {
  if (existsSync(LOCAL_PATH)) {
    return JSON.parse(readFileSync(LOCAL_PATH, 'utf8')) as LocalData;
  }
  return { favorites: {}, trips: {} };
}

function saveLocal(data: LocalData): void {
  writeFileSync(LOCAL_PATH, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export async function getFavorites(userId: string): Promise<Favorite[]> {
  if (!ddbTableName()) {
    const data = loadLocal();
    return data.favorites[userId] ?? [];
  }

  const resp = await getDdb().send(
    new QueryCommand({
      TableName: ddbTableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': { S: userId },
        ':prefix': { S: 'FAV#' },
      },
    }),
  );

  return (resp.Items ?? []).map((item) => ({
    type: item.favType?.S as 'charger' | 'brand',
    id: item.favId?.S ?? '',
    createdAt: item.createdAt?.S ?? '',
  }));
}

export async function addFavorite(
  userId: string,
  fav: Favorite,
): Promise<void> {
  const sk = `FAV#${fav.type.toUpperCase()}#${fav.id}`;

  if (!ddbTableName()) {
    const data = loadLocal();
    if (!data.favorites[userId]) data.favorites[userId] = [];
    const existing = data.favorites[userId].findIndex(
      (f) => f.type === fav.type && f.id === fav.id,
    );
    if (existing === -1) data.favorites[userId].push(fav);
    saveLocal(data);
    return;
  }

  await getDdb().send(
    new PutItemCommand({
      TableName: ddbTableName(),
      Item: {
        pk: { S: userId },
        sk: { S: sk },
        favType: { S: fav.type },
        favId: { S: fav.id },
        createdAt: { S: fav.createdAt },
      },
    }),
  );
}

export async function removeFavorite(
  userId: string,
  type: string,
  id: string,
): Promise<void> {
  const sk = `FAV#${type.toUpperCase()}#${id}`;

  if (!ddbTableName()) {
    const data = loadLocal();
    if (data.favorites[userId]) {
      data.favorites[userId] = data.favorites[userId].filter(
        (f) => !(f.type === type && f.id === id),
      );
    }
    saveLocal(data);
    return;
  }

  await getDdb().send(
    new DeleteItemCommand({
      TableName: ddbTableName(),
      Key: { pk: { S: userId }, sk: { S: sk } },
    }),
  );
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export async function getTrips(userId: string): Promise<SavedTrip[]> {
  if (!ddbTableName()) {
    const data = loadLocal();
    return data.trips[userId] ?? [];
  }

  const resp = await getDdb().send(
    new QueryCommand({
      TableName: ddbTableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': { S: userId },
        ':prefix': { S: 'TRIP#' },
      },
    }),
  );

  return (resp.Items ?? []).map((item) => ({
    tripId: item.tripId?.S ?? '',
    name: item.tripName?.S ?? '',
    request: JSON.parse(item.request?.S ?? '{}') as RouteRequest,
    createdAt: item.createdAt?.S ?? '',
  }));
}

export async function saveTrip(
  userId: string,
  trip: SavedTrip,
): Promise<void> {
  const sk = `TRIP#${trip.tripId}`;

  if (!ddbTableName()) {
    const data = loadLocal();
    if (!data.trips[userId]) data.trips[userId] = [];
    data.trips[userId].push(trip);
    saveLocal(data);
    return;
  }

  await getDdb().send(
    new PutItemCommand({
      TableName: ddbTableName(),
      Item: {
        pk: { S: userId },
        sk: { S: sk },
        tripId: { S: trip.tripId },
        tripName: { S: trip.name },
        request: { S: JSON.stringify(trip.request) },
        createdAt: { S: trip.createdAt },
      },
    }),
  );
}

export async function deleteTrip(
  userId: string,
  tripId: string,
): Promise<void> {
  const sk = `TRIP#${tripId}`;

  if (!ddbTableName()) {
    const data = loadLocal();
    if (data.trips[userId]) {
      data.trips[userId] = data.trips[userId].filter(
        (t) => t.tripId !== tripId,
      );
    }
    saveLocal(data);
    return;
  }

  await getDdb().send(
    new DeleteItemCommand({
      TableName: ddbTableName(),
      Key: { pk: { S: userId }, sk: { S: sk } },
    }),
  );
}

export async function renameTrip(
  userId: string,
  tripId: string,
  name: string,
): Promise<void> {
  const sk = `TRIP#${tripId}`;

  if (!ddbTableName()) {
    const data = loadLocal();
    const trip = data.trips[userId]?.find((t) => t.tripId === tripId);
    if (trip) {
      trip.name = name;
      saveLocal(data);
    }
    return;
  }

  await getDdb().send(
    new UpdateItemCommand({
      TableName: ddbTableName(),
      Key: { pk: { S: userId }, sk: { S: sk } },
      UpdateExpression: 'SET tripName = :name',
      ExpressionAttributeValues: { ':name': { S: name } },
    }),
  );
}
