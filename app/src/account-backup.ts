import crypto from 'crypto';
import { promisify } from 'util';
import { Account } from './flux/models/account';
import { AccountStore } from './flux/stores/account-store';
import * as Actions from './flux/actions';
import KeyManager from './key-manager';

/**
 * Account backups hold each account's settings together with the IMAP/SMTP passwords and
 * OAuth refresh token that normally live only in the OS keyring, so the file is always
 * encrypted: AES-256-GCM under a key derived from the user's passphrase with scrypt.
 */

const FORMAT = 'bettermailspring-accounts';
const VERSION = 1;
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const MIN_PASSPHRASE_LENGTH = 8;

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

interface AccountBackupFile {
  format: typeof FORMAT;
  version: number;
  kdf: { name: 'scrypt'; salt: string; N: number; r: number; p: number };
  cipher: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

interface AccountBackupPayload {
  exportedAt: string;
  accounts: object[];
}

export class AccountBackupError extends Error {}

function deriveKey(passphrase: string, salt: Buffer, params = SCRYPT_PARAMS) {
  return scrypt(passphrase, salt, 32, { ...SCRYPT_PARAMS, ...params });
}

export async function serializeAccountBackup(accounts: Account[], passphrase: string) {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new AccountBackupError(
      `The passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long.`
    );
  }
  const keys = await KeyManager._getKeyHash();
  const withSecrets = await Promise.all(
    accounts.map((a) => KeyManager.insertAccountSecrets(a, keys))
  );
  const payload: AccountBackupPayload = {
    exportedAt: new Date().toISOString(),
    accounts: withSecrets.map((a) => {
      const json = a.toJSON();
      delete json.sync_error;
      delete json.syncError;
      return json;
    }),
  };

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);

  const file: AccountBackupFile = {
    format: FORMAT,
    version: VERSION,
    kdf: { name: 'scrypt', salt: salt.toString('base64'), N: SCRYPT_PARAMS.N, r: 8, p: 1 },
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
  return JSON.stringify(file, null, 2);
}

export async function parseAccountBackup(text: string, passphrase: string): Promise<Account[]> {
  let file: AccountBackupFile;
  try {
    file = JSON.parse(text);
  } catch (err) {
    throw new AccountBackupError('This file is not an account backup.');
  }
  if (!file || file.format !== FORMAT) {
    throw new AccountBackupError('This file is not an account backup.');
  }
  if (file.version > VERSION) {
    throw new AccountBackupError('This backup was made by a newer version and cannot be read.');
  }

  let payload: AccountBackupPayload;
  try {
    const { salt, N, r, p } = file.kdf;
    const key = await deriveKey(passphrase, Buffer.from(salt, 'base64'), {
      ...SCRYPT_PARAMS,
      N,
      r,
      p,
    });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
    const json = Buffer.concat([
      decipher.update(Buffer.from(file.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    payload = JSON.parse(json);
  } catch (err) {
    // GCM authentication fails identically for a wrong passphrase and a corrupted file.
    throw new AccountBackupError('The passphrase is incorrect, or the backup file is damaged.');
  }

  return (payload.accounts || [])
    .map((json) => new Account({}).fromJSON(json))
    .filter((a) => a.emailAddress && a.provider);
}

// Returns how many accounts were added and how many replaced an existing account.
export async function importAccounts(accounts: Account[]) {
  let added = 0;
  let updated = 0;
  for (const account of accounts) {
    const existing = AccountStore.accounts().some(
      (a) => a.id === account.id || a.emailAddress === account.emailAddress
    );
    account.syncState = Account.SYNC_STATE_OK;
    const stored = await AccountStore.addAccount(account);
    if (existing) {
      // The running sync process still holds the credentials it was started with.
      Actions.restartAccountSync(stored);
      updated += 1;
    } else {
      added += 1;
    }
  }
  return { added, updated };
}
