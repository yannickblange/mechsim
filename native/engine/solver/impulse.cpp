// impulse.cpp - velocity jump from impulsive loads, projected onto the constraints.
#include "impulse.hpp"

#include <algorithm>
#include <stdexcept>
#include <vector>

#include "../core/world.hpp"
#include "../elements/impulse_source.hpp"
#include "assembler.hpp"
#include "lagrange.hpp"

namespace ms {

void applyInitialImpulses(World& world) {
    const int n = 3 * static_cast<int>(world.bodies.size());
    std::vector<double> J(n, 0.0);
    for (const auto& e : world.elements) {
        if (const auto* src = dynamic_cast<const ImpulseSource*>(e.get())) src->addImpulse(world, J);
    }
    if (std::all_of(J.begin(), J.end(), [](double x) { return x == 0.0; })) return;

    System sys;
    assemble(world, world.time, sys);  // M and G in the initial pose

    // Same linear system as the accelerations: M dv = J + G^T Lambda, G dv = -G v.
    std::vector<double> v(n);
    for (std::size_t i = 0; i < world.bodies.size(); ++i) {
        const Body& b = world.bodies[i];
        v[3 * i + 0] = b.vel.x;
        v[3 * i + 1] = b.vel.y;
        v[3 * i + 2] = b.omega;
    }
    sys.f = J;
    for (int r = 0; r < sys.m; ++r) {
        double gv = 0.0;
        for (int k = 0; k < n; ++k) gv += sys.G[static_cast<std::size_t>(r) * n + k] * v[k];
        sys.gamma[r] = -gv;
    }

    std::vector<double> dv, lambda;
    if (solveAccelerations(sys, dv, lambda) != 0) {
        throw std::runtime_error("constraint system is singular while applying the impulse at t = 0");
    }
    for (std::size_t i = 0; i < world.bodies.size(); ++i) {
        Body& b = world.bodies[i];
        b.vel += Vec2{dv[3 * i], dv[3 * i + 1]};
        b.omega += dv[3 * i + 2];
    }
}

}  // namespace ms
