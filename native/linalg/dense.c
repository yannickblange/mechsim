/*
 * dense.c - dense matrix-vector products (row-major).
 * Element (r, c) of a rows x cols matrix A is A[r * cols + c].
 */
#include "linalg.h"

void la_matvec(const double* A, int rows, int cols, const double* x, double* y) {
    for (int r = 0; r < rows; ++r) {
        const double* row = A + (long)r * cols;
        double acc = 0.0;
        for (int c = 0; c < cols; ++c) {
            acc += row[c] * x[c];
        }
        y[r] = acc;
    }
}

void la_matvec_t(const double* A, int rows, int cols, const double* x, double* y) {
    for (int c = 0; c < cols; ++c) {
        y[c] = 0.0;
    }
    for (int r = 0; r < rows; ++r) {
        const double* row = A + (long)r * cols;
        const double xr = x[r];
        for (int c = 0; c < cols; ++c) {
            y[c] += row[c] * xr;
        }
    }
}
