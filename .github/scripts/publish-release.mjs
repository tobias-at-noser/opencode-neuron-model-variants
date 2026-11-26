import { pathToFileURL } from 'node:url';

const pending = 'autorelease: pending';
const tagged = 'autorelease: tagged';

// The changelog, not an independently editable PR body, is the accepted notes.
export function releaseFromFiles(packageText, manifestText, changelog) {
  const version = JSON.parse(packageText).version;
  const manifest = JSON.parse(manifestText);
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || manifest['.'] !== version) {
    throw new Error('Package and release manifest must contain the same stable SemVer');
  }
  const headings = [...changelog.matchAll(/^#{1,2} \[([^\]]+)\](?:\([^\n]*\))?[^\n]*(?:\n|$)/gm)];
  const matching = headings.filter((heading) => heading[1] === version);
  if (matching.length !== 1) throw new Error('Expected exactly one changelog section for the package version');
  const heading = matching[0];
  const next = headings.find((candidate) => candidate.index > heading.index);
  const content = changelog.slice(heading.index + heading[0].length, next?.index ?? changelog.length).trim();
  if (!content) throw new Error('Release notes are empty');
  const notes = changelog.slice(heading.index, next?.index ?? changelog.length).trim();
  return { version, tag: `v${version}`, notes };
}

export function isReleasePullRequest(pr, repository, branch) {
  const expectedHead = `release-please--branches--${branch}`;
  return Boolean(pr.merged_at && pr.merge_commit_sha && pr.base?.ref === branch &&
    pr.head?.repo?.full_name === repository &&
    (pr.head.ref === expectedHead || pr.head.ref.startsWith(`${expectedHead}--components--`)) &&
    pr.labels?.some((label) => label.name === pending));
}

export function githubApi(repository, token, fetchImpl = fetch) {
  const root = `https://api.github.com/repos/${repository}`;
  return async (method, path, data) => {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) throw new Error(`GitHub API ${method} ${path.split('?')[0]} failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  };
}

async function tagCommit(api, tag) {
  let object = (await api('GET', `/git/ref/tags/${encodeURIComponent(tag)}`))?.object;
  if (!object) return null;
  // Dereference annotated tags, rejecting malformed or cyclic tag objects.
  const seen = new Set();
  while (object.type === 'tag') {
    if (seen.has(object.sha)) throw new Error(`Cyclic tag: ${tag}`);
    seen.add(object.sha);
    object = (await api('GET', `/git/tags/${object.sha}`))?.object;
    if (!object) throw new Error(`Cannot resolve tag: ${tag}`);
  }
  if (object.type !== 'commit') throw new Error(`Tag does not point to a commit: ${tag}`);
  return object.sha;
}

async function fileAt(api, path, sha) {
  const file = await api('GET', `/contents/${path}?ref=${encodeURIComponent(sha)}`);
  if (!file || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error(`Cannot read ${path} at merge commit`);
  }
  return Buffer.from(file.content, 'base64').toString('utf8');
}

export async function publishMergedReleases(api, repository, branch) {
  const pulls = [];
  for (let page = 1; ; page++) {
    const batch = await api('GET', `/pulls?state=closed&base=${encodeURIComponent(branch)}&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Cannot enumerate pull requests');
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  for (const pr of pulls.filter((item) => isReleasePullRequest(item, repository, branch))) {
    const sha = pr.merge_commit_sha;
    const release = releaseFromFiles(
      await fileAt(api, 'package.json', sha),
      await fileAt(api, '.release-please-manifest.json', sha),
      await fileAt(api, 'CHANGELOG.md', sha),
    );
    let commit = await tagCommit(api, release.tag);
    if (commit && commit !== sha) throw new Error(`Tag ${release.tag} points to another commit`);
    const existing = await api('GET', `/releases/tags/${encodeURIComponent(release.tag)}`);
    if (existing && (commit !== sha || existing.body !== release.notes || existing.draft || existing.prerelease)) {
      throw new Error(`Existing release ${release.tag} conflicts with merged files`);
    }
    if (!existing) {
      if (!commit) {
        await api('POST', '/git/refs', { ref: `refs/tags/${release.tag}`, sha });
        commit = await tagCommit(api, release.tag);
        if (commit !== sha) throw new Error(`Cannot verify tag ${release.tag}`);
      }
      await api('POST', '/releases', {
        tag_name: release.tag,
        target_commitish: sha,
        name: release.tag,
        body: release.notes,
        draft: false,
        prerelease: false,
      });
    }
    // Add first: an interrupted retry must still find the pending PR.
    await api('POST', `/issues/${pr.number}/labels`, { labels: [tagged] });
    await api('DELETE', `/issues/${pr.number}/labels/${encodeURIComponent(pending)}`);
  }
}

async function main() {
  const { GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token, RELEASE_BRANCH: branch } = process.env;
  if (!repository || !token || !branch) throw new Error('Missing release workflow environment');
  await publishMergedReleases(githubApi(repository, token), repository, branch);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
