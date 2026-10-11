// lagrange.cpp - TICKET A5 implements this file. Use linalg (la_solve) for the Schur system.
#include "lagrange.hpp"

#include <stdexcept>

extern "C" {
#include "linalg.h"
}

namespace ms {

int solveAccelerations(const System& sys, std::vector<double>& acc, std::vector<double>& lambda) {
    throw std::logic_error("TODO(A5): solveAccelerations");
}

}  // namespace ms
