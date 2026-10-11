// lagrange.hpp - solves the constrained equations of motion. Interface frozen for v0.1.
#pragma once

#include <vector>

#include "assembler.hpp"

namespace ms {

// Solve  M a = f + G^T lambda,  G a = gamma.
// Use the Schur complement (M is diagonal):
//   (G M^-1 G^T) lambda = gamma - G M^-1 f,   a = M^-1 (f + G^T lambda)
// If sys.m == 0, a = M^-1 f and lambda is empty.
// acc is resized to n, lambda to m. Returns 0 on success, -1 if the system is singular.
int solveAccelerations(const System& sys, std::vector<double>& acc, std::vector<double>& lambda);

}  // namespace ms
