import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { publishMergedReleases, releaseFromFiles } from '../.github/scripts/publish-release.mjs';

const readJson = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

test('manifest, package and lockfile agree on the version', () => {
  const version = readJson('package.json').version;
  const lock = readJson('package-lock.json');
  assert.equal(readJson('.release-please-manifest.json')['.'], version);
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
});

test('rejects inconsistent release versions', () => {
  assert.throws(() => releaseFromFiles('{"version":"0.2.0"}', '{".":"0.1.0"}', ''), /same stable SemVer/);
});

test('publishes the changelog from the release merge commit and retries without republishing', async () => {
  const repository = 'example/plugin';
  const branch = 'main';
  const sha = 'release-merge-sha';
  const pr = {
    number: 5,
    merged_at: '2026-11-26T00:00:00Z',
    merge_commit_sha: sha,
    base: { ref: branch },
    head: { ref: `release-please--branches--${branch}`, repo: { full_name: repository } },
    labels: [{ name: 'autorelease: pending' }],
  };
  const notes = '## [0.2.0](https://example.com/diff) (2026-11-26)\n\n* Add a feature';
  const files = new Map([
    ['package.json', '{"version":"0.2.0"}'],
    ['.release-please-manifest.json', '{".":"0.2.0"}'],
    ['CHANGELOG.md', `# Changelog\n\n${notes}\n\n## [0.1.0]\n\n* Older entry\n`],
  ]);
  let tag = null;
  let release = null;
  const writes = [];
  const api = async (method, path, data) => {
    if (method !== 'GET') writes.push([method, path, data]);
    switch (`${method} ${path}`) {
      case 'GET /pulls?state=closed&base=main&per_page=100&page=1':
        return [{ ...pr, head: { ...pr.head, repo: { full_name: 'fork/plugin' } } }, pr];
      case 'GET /git/ref/tags/v0.2.0': return tag;
      case 'GET /releases/tags/v0.2.0': return release;
      case 'POST /git/refs': return tag = { object: { type: 'commit', sha: data.sha } };
      case 'POST /releases': return release = data;
      case 'POST /issues/5/labels':
      case 'DELETE /issues/5/labels/autorelease%3A%20pending': return null;
    }
    for (const [file, content] of files) {
      if (method === 'GET' && path === `/contents/${file}?ref=${sha}`) {
        return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
      }
    }
    assert.fail(`Unexpected ${method} ${path}`);
  };

  const labelWrites = [
    ['POST', '/issues/5/labels', { labels: ['autorelease: tagged'] }],
    ['DELETE', '/issues/5/labels/autorelease%3A%20pending', undefined],
  ];
  await publishMergedReleases(api, repository, branch);
  assert.deepEqual(writes, [
    ['POST', '/git/refs', { ref: 'refs/tags/v0.2.0', sha }],
    ['POST', '/releases', {
      tag_name: 'v0.2.0', target_commitish: sha, name: 'v0.2.0', body: notes, draft: false, prerelease: false,
    }],
    ...labelWrites,
  ]);

  writes.length = 0;
  await publishMergedReleases(api, repository, branch);
  assert.deepEqual(writes, labelWrites);
});
