"""Wait until the uniquely named Pages artifact is visible in GitHub's API."""
import json
import os
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def wait_for_artifact(fetch, expected, attempts=20, sleep=time.sleep):
    ready_id = None
    for attempt in range(attempts):
        artifacts = fetch()
        matches = [a for a in artifacts if a.get('name') == expected and not a.get('expired')]
        if len(matches) > 1:
            raise RuntimeError('The uniquely named Pages artifact has duplicates.')
        current = matches[0].get('id') if matches else None
        if current is not None and current == ready_id:
            print('Pages artifact is ready for deployment.')
            return
        ready_id = current
        if attempt + 1 < attempts:
            sleep(2)
    raise RuntimeError('Pages artifact metadata did not become available in time.')


def main():
    repository = os.environ['GITHUB_REPOSITORY']
    run = os.environ['GITHUB_RUN_ID']
    expected = os.environ['PAGES_ARTIFACT_NAME']
    token = os.environ['PAGES_ARTIFACT_TOKEN']
    if not re.fullmatch(r'[A-Za-z0-9._-]+/[A-Za-z0-9._-]+', repository) or not run.isdigit():
        raise RuntimeError('Invalid GitHub workflow context.')
    url = f'https://api.github.com/repos/{repository}/actions/runs/{run}/artifacts?per_page=100'

    def fetch():
        request = Request(url, headers={
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10',
            'User-Agent': 'xen-rebirth-pages-artifact-check',
        })
        try:
            with urlopen(request, timeout=10) as response:
                return json.load(response)['artifacts']
        except HTTPError as error:
            if error.code in {404, 429, 500, 502, 503, 504}:
                return []
            raise RuntimeError(f'Cannot read Pages artifact metadata (HTTP {error.code}).') from None
        except URLError:
            return []

    wait_for_artifact(fetch, expected)


if __name__ == '__main__':
    main()
