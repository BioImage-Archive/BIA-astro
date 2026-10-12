# Search API fixtures

These are complete public API responses captured on 5 October 2026, shared by
tests that need study or image metadata. Payload files preserve the saved JSON
without field selection, added metadata or a test-specific wrapper.

- `study-s-biad3335-response.json`: study metadata with `FBbi:00000639`.
- `image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json`: image metadata
  from EMPIAR-12104 with `obo:FBbi_00000256`.
- `study-s-biad3397-response.json`: study metadata with empty FBBI arrays.

`provenance.json` records endpoints, capture dates and SHA-256 hashes of the
response files. The S-BIAD3397 capture date has day precision; no capture time
is claimed.

Select records through `hits.hits` by accession or UUID, then read `_source`.
Study acquisitions belong to `_source.dataset[].acquisition_process`; image
acquisitions belong to `_source.creation_process.acquisition_process`.

Keep tests offline. To refresh a snapshot, replace it with a complete captured
response, update its provenance and review the affected assertions. Keep small
synthetic inputs for boundaries absent from these captures, such as malformed
identifiers and escaping; identify them as synthetic in the owning test.
