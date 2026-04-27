// FenceToken — monotonically increasing integer issued at lease acquisition
// and required on every write that wishes to apply under that lease.
// Modeled as a nominal/branded type so callers can't accidentally pass a raw number.

declare const FenceTokenBrand: unique symbol;
export type FenceToken = number & { readonly [FenceTokenBrand]: true };

export const fenceTokenOf = (n: number): FenceToken => n as FenceToken;
