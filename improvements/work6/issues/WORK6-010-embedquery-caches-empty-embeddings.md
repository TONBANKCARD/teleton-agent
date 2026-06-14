---
title: "[AUDIT/V6] embedQuery permanently caches empty embeddings on provider failure (cache poisoning)"
labels: ["bug", "audit-finding-v6", "medium", "data-integrity"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-010"
severity: "medium"
category: "data-integrity"
github-issue: "https://github.com/xlabtg/teleton-agent/issues/615"
---

## Problem Description

`CachedEmbeddingProvider.embedQuery` stores whatever the inner provider returns
into the persistent SQLite embedding cache with **no length guard**:

```ts
const embedding = await this.inner.embedQuery(text);
this.cachePut(hash, serializeEmbedding(embedding));   // caches [] on failure
```

When the inner provider degrades and returns an empty vector `[]` (transient
error, quota, model not ready), the empty result is written to
`embedding_cache` keyed by the text hash and is then served on every future call
for that text — a permanent poisoned entry. The entry's `accessed_at` is bumped
on each hit, so TTL eviction never reclaims it.

`embedBatch` already guards exactly this (`if (embedding.length > 0)` before
`cachePut`), proving the single-query path simply forgot the check.

## Location

- `src/memory/embeddings/cached.ts:85-91` — `embedQuery` caches unconditionally.
- `src/memory/embeddings/cached.ts:130-138` — `embedBatch` caches only when
  `embedding.length > 0` (the correct guard).

## How To Reproduce

1. Make `inner.embedQuery` return `[]` once (simulate provider failure).
2. Call `embedQuery("foo")` → `[]` cached.
3. Restore the provider; call `embedQuery("foo")` again → still returns `[]` from
   cache; the text is permanently unembeddable (drops out of vector search).

## Impact

Queries that briefly failed to embed become permanently empty in cache, silently
removing them from semantic/RAG retrieval with no recovery path short of manual
cache surgery.

## Proposed Fix

Mirror `embedBatch`: only cache non-empty embeddings.

```ts
const embedding = await this.inner.embedQuery(text);
if (embedding.length > 0) {
  this.cachePut(hash, serializeEmbedding(embedding));
  resourceCache?.set("embeddings", hash, this.cacheConfig(), embedding);
}
```

## Regression Test

```typescript
it("does not cache an empty embedding from a failed provider", async () => {
  inner.embedQuery = async () => [];
  await provider.embedQuery("foo");
  expect(provider.peekCache("foo")).toBeUndefined();
});
```

## Acceptance Criteria

- [ ] Empty embeddings are never written to the persistent or in-memory cache.
- [ ] A later successful call repopulates the embedding.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-010`
- Module: `src/memory/embeddings/cached.ts`
