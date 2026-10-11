/* dense.c - matrix/vector helpers. TICKET A1 implements this file. */
#include "linalg.h"

void la_matvec(const double* A, int rows, int cols, const double* x, double* y) {
    /* y = A x: y[r] = sum_c A[r*cols + c] * x[c] */
    for (int r = 0; r < rows; r++) {
        double sum = 0.0;
        const double* Ar = A + r * cols;
        for (int c = 0; c < cols; c++) {
            sum += Ar[c] * x[c];
        }
        y[r] = sum;
    }
}

void la_matvec_t(const double* A, int rows, int cols, const double* x, double* y) {
    /* y = A^T x: y[c] = sum_r A[r*cols + c] * x[r] */
    for (int c = 0; c < cols; c++) {
        double sum = 0.0;
        for (int r = 0; r < rows; r++) {
            sum += A[r * cols + c] * x[r];
        }
        y[c] = sum;
    }
}
