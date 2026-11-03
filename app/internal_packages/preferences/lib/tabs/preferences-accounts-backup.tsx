import fs from 'fs';
import React from 'react';
import { localized, AccountStore } from 'mailspring-exports';
import {
  serializeAccountBackup,
  parseAccountBackup,
  importAccounts,
  AccountBackupError,
  MIN_PASSPHRASE_LENGTH,
} from '../../../../src/account-backup';

type Mode = 'idle' | 'export' | 'import';

interface State {
  mode: Mode;
  passphrase: string;
  confirmation: string;
  importPath: string | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
}

const INITIAL: State = {
  mode: 'idle',
  passphrase: '',
  confirmation: '',
  importPath: null,
  busy: false,
  error: null,
  notice: null,
};

/**
 * Exports every account, credentials included, to a passphrase-encrypted file and imports
 * such a file on this or another machine.
 */
export default class PreferencesAccountsBackup extends React.Component<
  Record<string, unknown>,
  State
> {
  static displayName = 'PreferencesAccountsBackup';

  state: State = INITIAL;

  _start(mode: Mode, notice: string = null) {
    this.setState({ ...INITIAL, mode, notice });
  }

  _onChooseImportFile = () => {
    AppEnv.showOpenDialog(
      {
        title: localized('Import Accounts'),
        properties: ['openFile'],
        filters: [{ name: localized('Account Backup'), extensions: ['json'] }],
      },
      (paths) => {
        if (paths && paths[0]) {
          this.setState({ ...INITIAL, mode: 'import', importPath: paths[0] });
        }
      }
    );
  };

  _onExport = () => {
    const { passphrase, confirmation } = this.state;
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      this.setState({
        error: localized(
          'The passphrase must be at least %@ characters long.',
          MIN_PASSPHRASE_LENGTH
        ),
      });
      return;
    }
    if (passphrase !== confirmation) {
      this.setState({ error: localized('The passphrases do not match.') });
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    AppEnv.showSaveDialog(
      {
        title: localized('Export Accounts'),
        defaultPath: `mailspring-accounts-${date}.json`,
        filters: [{ name: localized('Account Backup'), extensions: ['json'] }],
      },
      async (filePath) => {
        if (!filePath) return;
        this.setState({ busy: true, error: null });
        try {
          const contents = await serializeAccountBackup(AccountStore.accounts(), passphrase);
          await fs.promises.writeFile(filePath, contents, { mode: 0o600 });
          this._start(
            'idle',
            localized('Exported %@ accounts to %@.', AccountStore.accounts().length, filePath)
          );
        } catch (err) {
          this.setState({ busy: false, error: err.message });
        }
      }
    );
  };

  _onImport = async () => {
    const { importPath, passphrase } = this.state;
    this.setState({ busy: true, error: null });
    try {
      const text = await fs.promises.readFile(importPath, 'utf8');
      const accounts = await parseAccountBackup(text, passphrase);
      if (accounts.length === 0) {
        throw new AccountBackupError(localized('The backup does not contain any accounts.'));
      }
      const { added, updated } = await importAccounts(accounts);
      this._start(
        'idle',
        localized('Imported %@ new accounts and updated %@ existing accounts.', added, updated)
      );
    } catch (err) {
      if (!(err instanceof AccountBackupError)) AppEnv.reportError(err);
      this.setState({ busy: false, error: localized(err.message) });
    }
  };

  _renderPassphraseField(key: 'passphrase' | 'confirmation', label: string, onEnter: () => void) {
    return (
      <input
        type="password"
        autoFocus={key === 'passphrase'}
        aria-label={label}
        placeholder={label}
        value={this.state[key]}
        disabled={this.state.busy}
        onChange={(e) => this.setState({ [key]: e.target.value, error: null } as any)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
      />
    );
  }

  _renderForm() {
    const { mode, busy, importPath } = this.state;
    if (mode === 'export') {
      return (
        <div className="accounts-backup-form">
          <p>
            {localized(
              'The backup includes your passwords and sign-in tokens. Choose a passphrase to encrypt it; you will need it to import the file.'
            )}
          </p>
          {this._renderPassphraseField('passphrase', localized('Passphrase'), this._onExport)}
          {this._renderPassphraseField(
            'confirmation',
            localized('Confirm passphrase'),
            this._onExport
          )}
          <div className="accounts-backup-actions">
            <button className="btn btn-emphasis" disabled={busy} onClick={this._onExport}>
              {busy ? localized('Exporting…') : localized('Export…')}
            </button>
            <button className="btn" disabled={busy} onClick={() => this._start('idle')}>
              {localized('Cancel')}
            </button>
          </div>
        </div>
      );
    }
    if (mode === 'import') {
      return (
        <div className="accounts-backup-form">
          <p className="accounts-backup-path" title={importPath}>
            {importPath}
          </p>
          {this._renderPassphraseField('passphrase', localized('Passphrase'), this._onImport)}
          <div className="accounts-backup-actions">
            <button className="btn btn-emphasis" disabled={busy} onClick={this._onImport}>
              {busy ? localized('Importing…') : localized('Import')}
            </button>
            <button className="btn" disabled={busy} onClick={() => this._start('idle')}>
              {localized('Cancel')}
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  render() {
    const { mode, error, notice } = this.state;
    const hasAccounts = AccountStore.accounts().length > 0;
    return (
      <section className="accounts-backup">
        <h6>{localized('Backup')}</h6>
        {mode === 'idle' && (
          <div className="accounts-backup-actions">
            <button className="btn" disabled={!hasAccounts} onClick={() => this._start('export')}>
              {localized('Export Accounts…')}
            </button>
            <button className="btn" onClick={this._onChooseImportFile}>
              {localized('Import Accounts…')}
            </button>
          </div>
        )}
        {this._renderForm()}
        {error && <div className="accounts-backup-message error">{error}</div>}
        {notice && <div className="accounts-backup-message">{notice}</div>}
      </section>
    );
  }
}
