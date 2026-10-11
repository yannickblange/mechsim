// integrators.cpp - time integration (semi-implicit Euler).
#include "integrators.hpp"

#include <stdexcept>
#include <string>
#include <vector>

#include "../core/world.hpp"
#include "assembler.hpp"
#include "lagrange.hpp"

namespace ms {

// docs/formulation.md: v <- v + a dt; q <- q + v_new dt; t <- t + dt.
void stepSemiImplicitEuler(World& world, double dt) {
    System sys;
    std::vector<double> acc, lambda;
    assemble(world, world.time, sys);
    if (solveAccelerations(sys, acc, lambda) != 0) {
        throw std::runtime_error("constraint system is singular at t = " + std::to_string(world.time));
    }

    int row = 0;
    for (auto& c : world.constraints) {
        c->setMultipliers(lambda.data() + row);
        row += c->dim();
    }

    for (std::size_t i = 0; i < world.bodies.size(); ++i) {
        Body& b = world.bodies[i];
        b.vel += dt * Vec2{acc[3 * i], acc[3 * i + 1]};
        b.omega += dt * acc[3 * i + 2];
        b.pos += dt * b.vel;  // uses the NEW velocity
        b.phi += dt * b.omega;
    }
    world.time += dt;
}

}  // namespace ms
