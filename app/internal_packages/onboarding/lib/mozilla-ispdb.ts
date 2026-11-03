/**
 * Looks up IMAP/SMTP settings in Mozilla's ISP database, the one Thunderbird uses when a
 * domain publishes no autoconfig file of its own. Like Thunderbird, it falls back to the
 * domain of the MX server, which finds the hosting provider for custom domains.
 * Only the domain name is sent to Mozilla, never the address or password.
 * https://wiki.mozilla.org/Thunderbird:Autoconfiguration
 */

const ISPDB_URL = 'https://autoconfig.thunderbird.net/v1.1/';

type FetchAutoconfig = (url: string) => Promise<any>;

// "mx1.mail.ovh.net" -> "ovh.net". Two-label public suffixes ("co.uk") keep three labels.
export function baseDomainOfHost(host: string) {
  const labels = host.replace(/\.$/, '').toLowerCase().split('.');
  if (labels.length <= 2) return labels.join('.');
  const secondLevel = labels[labels.length - 2];
  const keep = secondLevel.length <= 3 && labels[labels.length - 1].length === 2 ? 3 : 2;
  return labels.slice(-keep).join('.');
}

export async function lookupMozillaISPDB(
  domain: string,
  fetchAutoconfig: FetchAutoconfig,
  mxRecordsForDomain: (domain: string) => Promise<string[]>
) {
  const candidates = [domain];
  const mxRecords = await mxRecordsForDomain(domain);
  for (const mx of mxRecords) {
    const base = baseDomainOfHost(mx);
    if (!candidates.includes(base)) candidates.push(base);
  }

  for (const candidate of candidates) {
    const config = await fetchAutoconfig(`${ISPDB_URL}${encodeURIComponent(candidate)}`);
    if (config && config.emailProvider) {
      console.log(`Using Mozilla ISPDB settings for ${candidate}`);
      return { config, providerDomain: candidate };
    }
  }
  return null;
}
