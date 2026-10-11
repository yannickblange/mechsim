// assembler.hpp - builds the global dense system. Interface frozen for v0.1.
#pragma once

#include <vector>

namespace ms {

class World;

struct System {
    int n = 0;                  // 3 * number of bodies
    int m = 0;                  // number of constraint rows
    std::vector<double> mass;   // diagonal of M, length n: [m0, m0, J0, m1, m1, J1, ...]
    std::vector<double> f;      // generalised forces, length n: [Fx0, Fy0, tau0, ...]
    std::vector<double> G;      // m x n, row-major
    std::vector<double> gamma;  // length m
};

// 1. clear all body force accumulators
// 2. apply gravity (m * g at the centre of mass) and every Element::applyForces(world, t)
// 3. fill sys.mass, sys.f from the bodies
// 4. zero sys.G / sys.gamma and let each constraint fill its rows (in World::constraints order)
void assemble(World& world, double t, System& sys);

}  // namespace ms
