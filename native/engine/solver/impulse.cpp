// impulse.cpp - velocity jump from impulsive loads, projected onto the constraints.
#include "impulse.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>

#include "../core/world.hpp"
#include "../elements/impulse_source.hpp"
#include "assembler.hpp"
#include "lagrange.hpp"

namespace ms {

void projectVelocities(World& world, const std::vector<double>& J) {
    const int n = 3 * static_cast<int>(world.bodies.size());
    System sys;
    assemble(world, world.time, sys);  // M and G in the current pose
    if (sys.m == 0 && std::all_of(J.begin(), J.end(), [](double x) { return x == 0.0; })) return;

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
        throw std::runtime_error("constraint system is singular while projecting the velocities at t = " +
                                 std::to_string(world.time));
    }
    for (std::size_t i = 0; i < world.bodies.size(); ++i) {
        Body& b = world.bodies[i];
        b.vel += Vec2{dv[3 * i], dv[3 * i + 1]};
        b.omega += dv[3 * i + 2];
    }
}

void applyInitialImpulses(World& world) {
    const int n = 3 * static_cast<int>(world.bodies.size());
    std::vector<double> J(n, 0.0);
    for (const auto& e : world.elements) {
        if (const auto* src = dynamic_cast<const ImpulseSource*>(e.get())) src->addImpulse(world, J);
    }
    if (std::all_of(J.begin(), J.end(), [](double x) { return x == 0.0; })) return;
    projectVelocities(world, J);
}

}  // namespace ms
