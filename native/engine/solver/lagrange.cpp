// lagrange.cpp - solves M a = f + G^T lambda, G a = gamma via the Schur complement.
#include "lagrange.hpp"

extern "C" {
#include "linalg.h"
}

namespace ms {

int solveAccelerations(const System& sys, std::vector<double>& acc, std::vector<double>& lambda) {
    const int n = sys.n;
    const int m = sys.m;
    acc.assign(n, 0.0);
    lambda.assign(m, 0.0);

    if (m == 0) {
        for (int i = 0; i < n; ++i) acc[i] = sys.f[i] / sys.mass[i];
        return 0;
    }

    // M is diagonal, so G M^-1 G^T is a plain weighted sum over the columns.
    std::vector<double> A(static_cast<std::size_t>(m) * m, 0.0);
    std::vector<double> rhs(m, 0.0);
    for (int r = 0; r < m; ++r) {
        const double* Gr = &sys.G[static_cast<std::size_t>(r) * n];
        double gf = 0.0;
        for (int k = 0; k < n; ++k) gf += Gr[k] * sys.f[k] / sys.mass[k];
        rhs[r] = sys.gamma[r] - gf;
        for (int s = 0; s < m; ++s) {
            const double* Gs = &sys.G[static_cast<std::size_t>(s) * n];
            double sum = 0.0;
            for (int k = 0; k < n; ++k) sum += Gr[k] * Gs[k] / sys.mass[k];
            A[static_cast<std::size_t>(r) * m + s] = sum;
        }
    }

    if (la_solve(A.data(), m, rhs.data()) != LA_OK) return -1;
    lambda = rhs;

    // a = M^-1 (f + G^T lambda)
    std::vector<double> g(n, 0.0);
    la_matvec_t(sys.G.data(), m, n, lambda.data(), g.data());
    for (int k = 0; k < n; ++k) acc[k] = (sys.f[k] + g[k]) / sys.mass[k];
    return 0;
}

}  // namespace ms
