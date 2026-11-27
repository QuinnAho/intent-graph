---
id: intent-upload-retries-are-bounded
title: A failed upload is retried at most three times
parent: null
confidence: asserted
realized_by:
  - src/upload.ts#uploadWithRetry
---

# A failed upload is retried at most three times

A failed upload is retried, but at most three attempts are made in total. If all of them fail, the caller gets an error that says so. A failure is never swallowed.
