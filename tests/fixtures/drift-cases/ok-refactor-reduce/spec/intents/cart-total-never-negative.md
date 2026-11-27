---
id: intent-cart-total-never-negative
title: The cart total is never negative
parent: null
confidence: asserted
realized_by:
  - src/cart.ts#cartTotal
---

# The cart total is never negative

cartTotal() adds price times quantity minus discount for every line. A discount can be larger than a line, but the total shown to the customer is never below zero.
