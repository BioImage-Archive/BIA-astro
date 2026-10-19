# Kubernetes pull-request previews

For non-draft PRs from branches in this repository, **Build preview image** runs
the Node tests and Astro build, then publishes a Linux/amd64 image to GHCR.
It builds the PR head commit, rather than GitHub's synthetic merge commit.
Fork PRs are excluded from this initial internal preview system.

The separate private repository `BioImage-Archive/bia-astro-previews` checks for
successful builds approximately every five minutes, deploys by image digest,
and checks the homepage and live search. Its workflow summary shows deployment
health and the exact deployed commit. A successful image build alone does not
mean the deployment is ready. Up to five previews can run concurrently.

Until DNS and HTTPS are ready, use your cluster credentials:

```sh
kubectl -n bia-previews port-forward svc/astro-pr-123 4321:8080
```

Then open `http://localhost:4321/bioimage-archive/`. Keep port-forwarding running
while reviewing. The preview banner identifies the PR and commit. Search and study
data come from the live archive API. Analytics is disabled for the preview build.

Pushes update the preview; closing the PR removes its Kubernetes resources on the
next reconciliation. Container images are public and currently retained in GHCR.
Existing Netlify checks are unchanged.
