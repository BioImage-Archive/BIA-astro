# Kubernetes pull-request previews

Non-draft PRs targeting main from branches in `BioImage-Archive/BIA-astro` or
`bijux/bijux-bia-astro` can have previews. Other forks are excluded.
Branches need the preview Dockerfile and server-mode support from main.

1. **Build preview image** resolves the current PR head through GitHub, runs the
   tests and Astro build on a GitHub-hosted runner, and uploads a container archive.
   The job has read-only repository permissions and no registry credentials.
2. **Publish preview image** runs trusted main-branch code on a separate GitHub
   runner. It verifies the successful build, allowed repository, PR number and
   current head SHA, then publishes the image to public GHCR. It never executes
   the image or PR scripts. Registry write access exists only in this job.
3. A Kubernetes CronJob checks published images every five minutes, deploys by
   digest, and verifies the homepage, live search and PR/commit banner. Normal
   operation does not depend on GitHub's best-effort scheduled workflows.
4. The final job in **Publish preview image** waits for the `tests` job in
   **Basic website checks** and **Test preview publishing rules** for the same
   PR head to finish, excluding Netlify checks. After successful image publication,
   it creates or updates one bot comment with the preview link, commit and check
   results (including failures). It skips closed/draft PRs and superseded heads.
   It runs trusted main-branch code with PR write access and no registry write access.

The comment links to
`https://preview.bioimagearchive.org/pr-217/bioimage-archive/` (substituting the PR number).
Set the repository
Actions variable `PREVIEW_BASE_URL` to override `https://preview.bioimagearchive.org`.

Repository maintainers can build an existing eligible PR through **Build preview
image → Run workflow**, selecting main and entering its PR number. GitHub may
require maintainer approval for a fork workflow under the repository's settings.

Build/publish success does not itself mean the cluster deployment is ready.
The comment job becomes available once these changes are on main. It waits up to
20 minutes; rerun it after a timeout or later check reruns to refresh the results.
With your cluster credentials, replace 123 with the PR number:

```sh
kubectl -n bia-previews get deployment astro-pr-123
kubectl -n bia-previews port-forward svc/astro-pr-123 4322:8080
```

Open `http://localhost:4322/bioimage-archive/`, keep forwarding running, and check
the commit banner. Restart port-forwarding after a rollout if it disconnects.
Search and study data come from the live archive API. Preview builds use an empty
analytics ID. Port-forwarding remains available independently of router/DNS setup.

Pushes rebuild previews. Closed, merged or draft PR previews are removed on the
next reconciliation. Up to five previews run concurrently; existing previews
retain their slots and additional PRs wait for capacity. Images remain public in
GHCR after preview cleanup; build artifacts expire after two days.

For troubleshooting, check the source repository's build/publish Actions runs,
then `kubectl -n bia-ci get cronjobs,jobs` and the most recent reconciliation Job's
logs. The private `BioImage-Archive/bia-astro-previews` repository maintains the
controller. Its Actions reconciliation is an optional manual fallback; it shares
a lock with the CronJob. Existing Netlify checks remain separate.

## Publishing checks and recovery

The publisher validates one Linux/amd64 image tagged `preview-build:artifact`,
then loads and inspects it by that tag. Configuration hashes are not always
Docker-addressable image IDs. A fresh `docker save` must preserve the validated
configuration and any OCI provenance before publication. The final tag retains
the PR number and full SHA; Kubernetes deploys by registry digest.

The temporary tag requires isolated Docker daemons, as provided by the current
GitHub-hosted runners. Archives with provenance require a containerd image store;
failed identity or provenance checks stop publication.
