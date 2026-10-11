# A1: Linear algebra kernels (C99)

**Agent:** A  **Depends on:** nothing  **Branch:** `v0.1/A1-linalg`

## Files you own
- `native/linalg/dense.c`
- `native/linalg/lu_solve.c`
- `tests/native/test_linalg.c`

## Read only
`native/linalg/linalg.h` (the interface, frozen), `QWEN.md`.

## Task
Implement every function declared in `linalg.h`. Matrices are row-major: `A[r * cols + c]`.

1. `la_matvec`, `la_matvec_t`: straightforward loops.
2. `la_lu_factor(A, n, piv)`: Doolittle LU with partial pivoting, in place.
   - `n <= 0` or NULL pointers → `LA_BAD_ARG`.
   - Compute `amax = max |A_ij|` before factorising. If `amax == 0` → `LA_SINGULAR`.
   - For column k: pick the row p >= k with the largest `|A[p][k]|`. If that value is
     `< 1e-14 * amax` → `LA_SINGULAR`. Swap rows k and p (whole rows), store `piv[k] = p`.
   - Store multipliers in the lower triangle, U on and above the diagonal.
3. `la_lu_solve`: apply the row swaps to b in order k = 0..n-1, then forward substitution
   (unit lower), then back substitution.
4. `la_solve`: `int piv[64]`; if `n > 64` return `LA_BAD_ARG`; factor, return the error code
   if not `LA_OK`, else solve.

No `malloc` anywhere. Only `<math.h>` and `<stddef.h>` may be included.

## Tests (`tests/native/test_linalg.c`)
Plain C, a small `CHECK(cond, msg)` macro that prints and counts failures, `return failures ? 1 : 0;`
Remove the `return 77` skip. Required cases:
1. 3×3 system with known solution x = [1, -2, 3] (build b = A x first), error < 1e-12.
2. Matrix with `A[0][0] = 0` that needs pivoting, e.g. `[[0,2,1],[1,1,0],[2,0,3]]`.
3. Singular matrix `[[1,2],[2,4]]` → `LA_SINGULAR`.
4. `n = 1`.
5. `la_solve` with `n = 65` → `LA_BAD_ARG`.
6. `la_matvec` and `la_matvec_t` on a 2×3 matrix with hand-computed results.
7. 10×10 matrix from a deterministic LCG (`seed = seed * 1103515245 + 12345`), diagonally
   boosted (`A[i][i] += 10`): residual `max |A x - b| < 1e-10` (keep a copy of A).

## Acceptance
```bash
./tools/build.sh && ctest --test-dir build -R test_linalg --output-on-failure
```
`test_linalg` passes (not skipped). Build has no warnings from `native/linalg`.
