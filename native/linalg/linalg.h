/*
 * linalg.h - small dense linear algebra kernels in C99 (frozen interface for v0.1).
 *
 * All matrices are ROW-MAJOR: element (r, c) of a rows x cols matrix A is A[r * cols + c].
 * No allocation happens inside these functions; the caller owns all memory.
 */
#ifndef MS_LINALG_H
#define MS_LINALG_H

#ifdef __cplusplus
extern "C" {
#endif

#define LA_OK 0
#define LA_SINGULAR (-1)
#define LA_BAD_ARG (-2)

/* LU factorisation with partial pivoting, in place.
 * A: n x n, overwritten with L (unit diagonal, below) and U (on and above diagonal).
 * piv: length n, receives the row permutation.
 * Returns LA_OK, LA_SINGULAR if a pivot magnitude is below 1e-14 * max|A|, or LA_BAD_ARG. */
int la_lu_factor(double* A, int n, int* piv);

/* Solve A x = b using the output of la_lu_factor. b (length n) is overwritten with x. */
void la_lu_solve(const double* LU, int n, const int* piv, double* b);

/* Convenience: factor + solve. A is destroyed, b is overwritten with x.
 * Uses a stack buffer for piv when n <= 64, otherwise returns LA_BAD_ARG.
 * Returns the same codes as la_lu_factor. */
int la_solve(double* A, int n, double* b);

/* y = A x, A: rows x cols, x: length cols, y: length rows. */
void la_matvec(const double* A, int rows, int cols, const double* x, double* y);

/* y = A^T x, A: rows x cols, x: length rows, y: length cols. */
void la_matvec_t(const double* A, int rows, int cols, const double* x, double* y);

#ifdef __cplusplus
}
#endif

#endif /* MS_LINALG_H */
