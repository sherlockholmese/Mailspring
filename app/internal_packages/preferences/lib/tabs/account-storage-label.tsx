import React from 'react';
import { localized } from 'mailspring-exports';
import {
  storageUsageForAccount,
  formatBytes,
  AccountStorageUsage,
} from '../../../../src/account-storage-usage';

interface AccountStorageLabelProps {
  accountId: string;
}

interface AccountStorageLabelState {
  usage: AccountStorageUsage | null;
  failed: boolean;
}

export default class AccountStorageLabel extends React.Component<
  AccountStorageLabelProps,
  AccountStorageLabelState
> {
  static displayName = 'AccountStorageLabel';

  state: AccountStorageLabelState = { usage: null, failed: false };
  _mounted = false;

  componentDidMount() {
    this._mounted = true;
    this._load();
  }

  componentDidUpdate(prevProps: AccountStorageLabelProps) {
    if (prevProps.accountId !== this.props.accountId) this._load();
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  async _load() {
    const { accountId } = this.props;
    try {
      const usage = await storageUsageForAccount(accountId);
      if (this._mounted && accountId === this.props.accountId) this.setState({ usage });
    } catch (err) {
      console.warn(`Could not measure storage for account ${accountId}`, err);
      if (this._mounted) this.setState({ failed: true });
    }
  }

  render() {
    const { usage, failed } = this.state;
    if (failed) return null;
    if (!usage) {
      return <div className="account-storage">{localized('Measuring storage…')}</div>;
    }
    const detail = `${localized('Messages and data')}: ${formatBytes(usage.databaseBytes)}, ${localized(
      'Attachments'
    )}: ${formatBytes(usage.attachmentBytes)}`;
    return (
      <div className="account-storage" title={detail}>
        {localized('%@ on disk', formatBytes(usage.totalBytes))}
      </div>
    );
  }
}
