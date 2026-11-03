import { Account } from '../src/flux/models/account';
import { AccountStore } from '../src/flux/stores/account-store';
import KeyManager from '../src/key-manager';
import {
  serializeAccountBackup,
  parseAccountBackup,
  importAccounts,
  AccountBackupError,
} from '../src/account-backup';

const account = () =>
  new Account({
    id: 'acct1',
    name: 'Me',
    emailAddress: 'me@example.com',
    provider: 'imap',
    label: 'Work',
    settings: { imap_host: 'imap.example.com', imap_username: 'me' },
  } as any);

describe('account backup', function () {
  beforeEach(function () {
    spyOn(KeyManager, '_getKeyHash').andReturn(
      Promise.resolve({
        'me@example.com-imap': 'imap-secret',
        'me@example.com-smtp': 'smtp-secret',
        'me@example.com-refresh-token': 'token',
      })
    );
  });

  it('round-trips accounts and credentials through the passphrase', async function () {
    const text = await serializeAccountBackup([account()], 'correct horse');
    expect(text).not.toContain('imap-secret');
    expect(text).not.toContain('me@example.com');

    const [restored] = await parseAccountBackup(text, 'correct horse');
    expect(restored instanceof Account).toBe(true);
    expect(restored.id).toEqual('acct1');
    expect(restored.label).toEqual('Work');
    expect(restored.settings.imap_host).toEqual('imap.example.com');
    expect(restored.settings.imap_password).toEqual('imap-secret');
    expect(restored.settings.smtp_password).toEqual('smtp-secret');
    expect(restored.settings.refresh_token).toEqual('token');
  });

  it('rejects a wrong passphrase', async function () {
    const text = await serializeAccountBackup([account()], 'correct horse');
    let error: Error = null;
    try {
      await parseAccountBackup(text, 'wrong horse!');
    } catch (err) {
      error = err;
    }
    expect(error instanceof AccountBackupError).toBe(true);
  });

  it('refuses a short passphrase', async function () {
    let error: Error = null;
    try {
      await serializeAccountBackup([account()], 'short');
    } catch (err) {
      error = err;
    }
    expect(error instanceof AccountBackupError).toBe(true);
  });

  it('rejects files that are not backups', async function () {
    let error: Error = null;
    try {
      await parseAccountBackup('{"hello": 1}', 'correct horse');
    } catch (err) {
      error = err;
    }
    expect(error instanceof AccountBackupError).toBe(true);
  });

  it('adds new accounts through the AccountStore', async function () {
    spyOn(AccountStore, 'accounts').andReturn([]);
    spyOn(AccountStore, 'addAccount').andCallFake((a: Account) => Promise.resolve(a));
    const result = await importAccounts([account()]);
    expect(result).toEqual({ added: 1, updated: 0 });
    expect((AccountStore.addAccount as jasmine.Spy).calls[0].args[0].emailAddress).toEqual(
      'me@example.com'
    );
  });
});
