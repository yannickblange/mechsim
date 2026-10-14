// integrators.cpp - time integration (semi-implicit Euler).
#include "integrators.hpp"

#include <stdexcept>
#include <string>
#include <vector>

#include "../core/world.hpp"
#include "assembler.hpp"
#include "contact.hpp"
#include "lagrange.hpp"
#include "unilateral.hpp"

namespace ms {

// docs/formulation.md: v <- v + a dt; q <- q + v_new dt; t <- t + dt.
void stepSemiImplicitEuler(World& world, double dt) {
    System sys;
    std::vector<double> acc, lambda;

    // v0.3: ropes switch on and off. Engage the taut ones (removing the velocity that would
    // stretch them), then solve; a rope whose multiplier would push is released and the system is
    // solved again (active-set iteration, at most once per constraint).
    updateUnilateral(world, dt);
    // v0.8: blocks and discs against surfaces. Without a mass near a surface this is empty and the step is the one of v0.7.
    std::vector<Contact> contacts = detectContacts(world, dt);
    const std::size_t maxIterations = world.constraints.size() + 1;
    for (std::size_t it = 0;; ++it) {
        assemble(world, world.time, sys);
        const int status = contacts.empty() ? solveAccelerations(sys, acc, lambda) : solveContacts(sys, contacts, dt, acc, lambda);
        if (status != 0) {
            throw std::runtime_error("constraint system is singular at t = " + std::to_string(world.time));
        }
        if (it >= maxIterations || !releaseViolated(world, lambda)) break;
    }

    reportContacts(world, contacts);
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
