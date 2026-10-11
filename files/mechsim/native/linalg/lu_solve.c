/* lu_solve.c - LU factorisation with partial pivoting. TICKET A1 implements this file. */
#include "linalg.h"

int la_lu_factor(double* A, int n, int* piv) {
    /* TODO(A1) */
    (void)A; (void)n; (void)piv;
    return LA_BAD_ARG;
}

void la_lu_solve(const double* LU, int n, const int* piv, double* b) {
    /* TODO(A1) */
    (void)LU; (void)n; (void)piv; (void)b;
}

int la_solve(double* A, int n, double* b) {
    /* TODO(A1) */
    (void)A; (void)n; (void)b;
    return LA_BAD_ARG;
}
