import dns from 'dns';
import { Account, AccountStore } from 'mailspring-exports';
import { expandAccountWithCommonSettings } from '../lib/onboarding-helpers';
import { baseDomainOfHost } from '../lib/mozilla-ispdb';

const ISPDB = 'https://autoconfig.thunderbird.net/v1.1/';

function ispdbXML(id: string, imapHost: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="${id}">
    <domain>${id}</domain>
    <incomingServer type="imap">
      <hostname>${imapHost}</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <username>%EMAILADDRESS%</username>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.${id}</hostname>
      <port>465</port>
      <socketType>SSL</socketType>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;
}

function stubFetch(responses: { [url: string]: string }) {
  spyOn(window as any, 'fetch').andCallFake((url: string) =>
    Promise.resolve(
      responses[url]
        ? { ok: true, text: () => Promise.resolve(responses[url]) }
        : { ok: false, status: 404, statusText: 'Not Found' }
    )
  );
}

const accountFor = (emailAddress: string) =>
  new Account({ name: 'Test', emailAddress, provider: 'imap', settings: {} } as any);

describe('Mozilla ISPDB lookup', function () {
  let mxRecords: string[];

  beforeEach(() => {
    mxRecords = [];
    spyOn(dns, 'resolveMx').andCallFake((domain, callback) =>
      mxRecords.length
        ? callback(
            null,
            mxRecords.map((exchange) => ({ exchange, priority: 10 }))
          )
        : callback(new Error('ENOTFOUND'))
    );
    spyOn(dns.Resolver.prototype, 'resolveSrv').andCallFake((name, callback) =>
      callback(new Error('ENOTFOUND'))
    );
    spyOn(AccountStore, 'containerFolderDefaultGetter').andReturn('');
  });

  it('uses the ISPDB entry for the email domain', async () => {
    stubFetch({
      [`${ISPDB}ispdb-only.example`]: ispdbXML('ispdb-only.example', 'mail.isp.example'),
    });
    const account = await expandAccountWithCommonSettings(accountFor('me@ispdb-only.example'));
    expect(account.settings.imap_host).toEqual('mail.isp.example');
    expect(account.settings.imap_security).toEqual('SSL / TLS');
    expect(account.settings.smtp_host).toEqual('smtp.ispdb-only.example');
  });

  it("falls back to the ISPDB entry for the MX server's domain", async () => {
    mxRecords = ['mx1.mail.hoster.example'];
    stubFetch({ [`${ISPDB}hoster.example`]: ispdbXML('hoster.example', 'imap.hoster.example') });
    const account = await expandAccountWithCommonSettings(accountFor('me@custom.example'));
    expect(account.settings.imap_host).toEqual('imap.hoster.example');
  });

  it('fills in %EMAILDOMAIN% in hostnames', async () => {
    stubFetch({ [`${ISPDB}tmpl.example`]: ispdbXML('tmpl.example', 'mail.%EMAILDOMAIN%') });
    const account = await expandAccountWithCommonSettings(accountFor('me@tmpl.example'));
    expect(account.settings.imap_host).toEqual('mail.tmpl.example');
  });

  it("prefers the domain's own autoconfig file", async () => {
    stubFetch({
      'https://autoconfig.both.example/mail/config-v1.1.xml': ispdbXML('both.example', 'own.host'),
      [`${ISPDB}both.example`]: ispdbXML('both.example', 'ispdb.host'),
    });
    const account = await expandAccountWithCommonSettings(accountFor('me@both.example'));
    expect(account.settings.imap_host).toEqual('own.host');
  });

  it('does not override a Mailspring provider template', async () => {
    stubFetch({ [`${ISPDB}proton.me`]: ispdbXML('proton.me', 'imap.proton.me') });
    const account = await expandAccountWithCommonSettings(accountFor('me@proton.me'));
    expect(account.settings.imap_host).toEqual('127.0.0.1');
  });

  it('reduces MX hosts to their registrable domain', () => {
    expect(baseDomainOfHost('mx1.mail.ovh.net')).toEqual('ovh.net');
    expect(baseDomainOfHost('mx.example.co.uk.')).toEqual('example.co.uk');
    expect(baseDomainOfHost('example.com')).toEqual('example.com');
  });
});
