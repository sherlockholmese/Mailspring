import fs from 'fs';
import DatabaseStore from './flux/stores/database-store';
import AttachmentStore from './flux/stores/attachment-store';
import { File } from './flux/models/file';

/**
 * Estimates the disk space an account uses: the size of its rows in the shared SQLite
 * database plus the attachments downloaded for it. SQLite page overhead, indexes and the
 * full-text search tables are not attributed to any account, so the database share is a
 * lower bound.
 */

export interface AccountStorageUsage {
  databaseBytes: number;
  attachmentBytes: number;
  totalBytes: number;
}

const TABLES_WITH_ACCOUNT_DATA = [
  'Message',
  'Thread',
  'Contact',
  'ContactGroup',
  'ContactBook',
  'Event',
  'Calendar',
  'Folder',
  'Label',
  'File',
];
const STAT_BATCH_SIZE = 200;
const CACHE_TTL_MS = 60 * 1000;

const cache = new Map<string, { at: number; promise: Promise<AccountStorageUsage> }>();

async function databaseBytesFor(accountId: string) {
  const perTable = TABLES_WITH_ACCOUNT_DATA.map(
    (table) =>
      `SELECT COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM \`${table}\` WHERE accountId = ?`
  );
  const bodies = `SELECT COALESCE(SUM(LENGTH(MessageBody.value)), 0) AS bytes FROM MessageBody
    INNER JOIN Message ON Message.id = MessageBody.id WHERE Message.accountId = ?`;
  const sql = `SELECT SUM(bytes) AS total FROM (${[...perTable, bodies].join(' UNION ALL ')})`;
  const params = new Array(perTable.length + 1).fill(accountId);
  const rows = await DatabaseStore._query(sql, params, true);
  return Number(rows[0]?.total) || 0;
}

async function attachmentBytesFor(accountId: string) {
  const files: File[] = await DatabaseStore.findAll<File>(File).where({ accountId });
  let total = 0;
  for (let i = 0; i < files.length; i += STAT_BATCH_SIZE) {
    const sizes = await Promise.all(
      files.slice(i, i + STAT_BATCH_SIZE).map(async (file) => {
        const filePath = AttachmentStore.pathForFile(file);
        if (!filePath) return 0;
        try {
          return (await fs.promises.stat(filePath)).size;
        } catch (err) {
          return 0; // not downloaded
        }
      })
    );
    total += sizes.reduce((a, b) => a + b, 0);
  }
  return total;
}

async function measure(accountId: string): Promise<AccountStorageUsage> {
  const [databaseBytes, attachmentBytes] = await Promise.all([
    databaseBytesFor(accountId),
    attachmentBytesFor(accountId),
  ]);
  return { databaseBytes, attachmentBytes, totalBytes: databaseBytes + attachmentBytes };
}

export function storageUsageForAccount(accountId: string) {
  const cached = cache.get(accountId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = measure(accountId);
  cache.set(accountId, { at: Date.now(), promise });
  promise.catch(() => cache.delete(accountId));
  return promise;
}

export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${units[unit]}`;
}
