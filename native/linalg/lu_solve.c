/* lu_solve.c - LU factorisation with partial pivoting. TICKET A1 implements this file. */
#include "linalg.h"

#include <math.h>

int la_lu_factor(double* A, int n, int* piv) {
    if (n <= 0 || A == 0 || piv == 0) {
        return LA_BAD_ARG;
    }

    double amax = 0.0;
    for (int i = 0; i < n * n; i++) {
        double a = fabs(A[i]);
        if (a > amax) {
            amax = a;
        }
    }
    if (amax == 0.0) {
        return LA_SINGULAR;
    }
    const double tol = 1e-14 * amax;

    for (int k = 0; k < n; k++) {
        /* Partial pivoting: largest |A[p][k]| in rows p >= k. */
        int p = k;
        double best = fabs(A[k * n + k]);
        for (int i = k + 1; i < n; i++) {
            double a = fabs(A[i * n + k]);
            if (a > best) {
                best = a;
                p = i;
            }
        }
        if (best < tol) {
            return LA_SINGULAR;
        }

        if (p != k) {
            for (int j = 0; j < n; j++) {
                double t = A[k * n + j];
                A[k * n + j] = A[p * n + j];
                A[p * n + j] = t;
            }
        }
        piv[k] = p;

        /* Doolittle step: L column k, then eliminate trailing submatrix. */
        for (int i = k + 1; i < n; i++) {
            A[i * n + k] /= A[k * n + k];
            for (int j = k + 1; j < n; j++) {
                A[i * n + j] -= A[i * n + k] * A[k * n + j];
            }
        }
    }
    return LA_OK;
}

void la_lu_solve(const double* LU, int n, const int* piv, double* b) {
    for (int k = 0; k < n; k++) {
        double t = b[k];
        b[k] = b[piv[k]];
        b[piv[k]] = t;
    }

    /* Forward substitution; L is unit lower triangular. */
    for (int i = 1; i < n; i++) {
        double s = b[i];
        for (int j = 0; j < i; j++) {
            s -= LU[i * n + j] * b[j];
        }
        b[i] = s;
    }

    /* Back substitution with U. */
    for (int i = n - 1; i >= 0; i--) {
        double s = b[i];
        for (int j = i + 1; j < n; j++) {
            s -= LU[i * n + j] * b[j];
        }
        b[i] = s / LU[i * n + i];
    }
}

int la_solve(double* A, int n, double* b) {
    if (n > 64) {
        return LA_BAD_ARG;
    }
    int piv[64];
    int code = la_lu_factor(A, n, piv);
    if (code != LA_OK) {
        return code;
    }
    la_lu_solve(A, n, piv, b);
    return LA_OK;
}
