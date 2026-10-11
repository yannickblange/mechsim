/* test_linalg.c - TICKET A1. Plain C, no framework.
 * Return 0 if all checks pass, 1 on failure. */
#include <math.h>
#include <stdio.h>

#include "linalg.h"

int failures = 0;

#define CHECK(cond, msg)      \
    do {                      \
        if (!(cond)) {        \
            printf("FAIL: %s\n", msg); \
            failures++;       \
        }                     \
    } while (0)

int main(void) {
    /* Test 1: 3x3 system, known x = [1, -2, 3]. */
    {
        double A[3 * 3] = {2, -1, 1, 8, -3, 2, -4, 1, 1};
        double b[3] = {7, 20, -3}; /* b = A * [1, -2, 3] by hand */
        double x_true[3] = {1, -2, 3};
        int rc = la_solve(A, 3, b);
        CHECK(rc == LA_OK, "test1: la_solve should succeed");
        if (rc == LA_OK) {
            for (int i = 0; i < 3; i++) {
                CHECK(fabs(b[i] - x_true[i]) < 1e-12, "test1: solution component wrong");
            }
        }
    }

    /* Test 2: matrix needing pivoting, known x = [1, 1, 1]. */
    {
        double A[3 * 3] = {0, 2, 1, 1, 1, 0, 2, 0, 3};
        double b[3] = {3, 2, 5}; /* b = A * [1, 1, 1] by hand */
        double x_true[3] = {1, 1, 1};
        int rc = la_solve(A, 3, b);
        CHECK(rc == LA_OK, "test2: la_solve should succeed");
        if (rc == LA_OK) {
            for (int i = 0; i < 3; i++) {
                CHECK(fabs(b[i] - x_true[i]) < 1e-12, "test2: solution component wrong");
            }
        }
    }

    /* Test 3: singular matrix must be rejected. */
    {
        double A[2 * 2] = {1, 2, 2, 4};
        double b[2] = {1, 1};
        int rc = la_solve(A, 2, b);
        CHECK(rc == LA_SINGULAR, "test3: singular matrix should return LA_SINGULAR");
    }

    /* Test 4: 1x1 system. */
    {
        double A[1] = {4};
        double b[1] = {8};
        int rc = la_solve(A, 1, b);
        CHECK(rc == LA_OK, "test4: la_solve should succeed");
        CHECK(rc == LA_OK && fabs(b[0] - 2) < 1e-12, "test4: solution should be 2");
    }

    /* Test 5: n = 65 exceeds the stack pivot buffer -> LA_BAD_ARG. */
    {
        static double A[65 * 65];
        static double b[65];
        int rc = la_solve(A, 65, b);
        CHECK(rc == LA_BAD_ARG, "test5: n=65 should return LA_BAD_ARG");
    }

    /* Test 6: la_matvec / la_matvec_t on A = [[1,2,3],[4,5,6]] (2x3). */
    {
        double A[2 * 3] = {1, 2, 3, 4, 5, 6};
        double x[3] = {1, 1, 1};
        double y[2];
        la_matvec(A, 2, 3, x, y);
        CHECK(fabs(y[0] - 6) < 1e-12, "test6: A*x y[0] should be 6");
        CHECK(fabs(y[1] - 15) < 1e-12, "test6: A*x y[1] should be 15");

        double w[2] = {1, 1};
        double z[3];
        la_matvec_t(A, 2, 3, w, z);
        CHECK(fabs(z[0] - 5) < 1e-12, "test6: A^T*w z[0] should be 5");
        CHECK(fabs(z[1] - 7) < 1e-12, "test6: A^T*w z[1] should be 7");
        CHECK(fabs(z[2] - 9) < 1e-12, "test6: A^T*w z[2] should be 9");
    }

    /* Test 7: 10x10 LCG matrix with +10 on the diagonal; residual check. */
    {
        unsigned int seed = 1u;
        double A[10 * 10];
        for (int i = 0; i < 10 * 10; i++) {
            seed = seed * 1103515245u + 12345u;
            A[i] = (double)(seed % 1000) / 1000.0 - 0.5;
        }
        for (int i = 0; i < 10; i++) {
            A[i * 10 + i] += 10.0;
        }
        double b[10];
        for (int i = 0; i < 10; i++) {
            seed = seed * 1103515245u + 12345u;
            b[i] = (double)(seed % 1000) / 1000.0 - 0.5;
        }

        double A_copy[10 * 10];
        double b_copy[10];
        for (int i = 0; i < 10 * 10; i++) {
            A_copy[i] = A[i];
        }
        for (int i = 0; i < 10; i++) {
            b_copy[i] = b[i];
        }

        int rc = la_solve(A, 10, b); /* b comes back as x */
        CHECK(rc == LA_OK, "test7: la_solve should succeed");
        if (rc == LA_OK) {
            double maxerr = 0.0;
            for (int i = 0; i < 10; i++) {
                double s = 0.0;
                for (int j = 0; j < 10; j++) {
                    s += A_copy[i * 10 + j] * b[j];
                }
                double e = fabs(s - b_copy[i]);
                if (e > maxerr) {
                    maxerr = e;
                }
            }
            CHECK(maxerr < 1e-10, "test7: max |A*x - b| should be < 1e-10");
        }
    }

    if (failures == 0) {
        printf("test_linalg: all checks passed\n");
    }
    return failures ? 1 : 0;
}
