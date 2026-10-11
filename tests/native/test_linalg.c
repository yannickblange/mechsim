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

    if (failures == 0) {
        printf("test_linalg: all checks passed\n");
    }
    return failures ? 1 : 0;
}
