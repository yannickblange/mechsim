// assembler.cpp - builds the global dense system M, f, G, gamma.
#include "assembler.hpp"

#include <algorithm>

#include "../core/world.hpp"

namespace ms {

void assemble(World& world, double t, System& sys) {
    const int nb = static_cast<int>(world.bodies.size());
    sys.n = 3 * nb;
    sys.m = world.constraintRows();
    sys.mass.assign(sys.n, 0.0);
    sys.f.assign(sys.n, 0.0);
    sys.G.assign(static_cast<std::size_t>(sys.m) * sys.n, 0.0);
    sys.gamma.assign(sys.m, 0.0);

    // Forces: gravity m g at the centre of mass, then every force element.
    for (auto& b : world.bodies) {
        b.clearForces();
        b.applyForce(b.mass * world.gravity);
        if (b.damping > 0.0) {
            // explicit, so alpha dt must stay below 1: a larger alpha acts as the largest stable one
            const double alpha = world.substepDt > 0.0 ? std::min(b.damping, 0.5 / world.substepDt) : b.damping;
            b.applyForce(-alpha * b.mass * b.vel);
            b.torque -= alpha * b.inertia * b.omega;
        }
    }
    for (auto& e : world.elements) e->applyForces(world, t);

    // M = diag(m, m, J, ...), f = [Fx, Fy, tau, ...] (docs/formulation.md).
    for (int i = 0; i < nb; ++i) {
        const Body& b = world.bodies[i];
        sys.mass[3 * i + 0] = b.mass;
        sys.mass[3 * i + 1] = b.mass;
        sys.mass[3 * i + 2] = b.inertia;
        sys.f[3 * i + 0] = b.force.x;
        sys.f[3 * i + 1] = b.force.y;
        sys.f[3 * i + 2] = b.torque;
    }

    int row = 0;
    for (const auto& c : world.constraints) {
        if (c->dim() == 0) continue;  // inactive rope, free-space Festlager
        c->fill(world, &sys.G[static_cast<std::size_t>(row) * sys.n], sys.n, &sys.gamma[row]);
        row += c->dim();
    }
}

}  // namespace ms
