// material.hpp - the one material of v0.4: every bar and beam has the same Young's modulus (steel).
#pragma once

namespace ms {

constexpr double kYoungModulus = 210.0e9;  // Pa, E of every bar and beam
constexpr double kDensity = 7850.0;        // kg / m^3, default mass of a beam: rho A L

}  // namespace ms
