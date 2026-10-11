// test_solver.cpp - TICKET A6.
#include <cmath>
#include <memory>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "constraints/pin_support.hpp"
#include "core/world.hpp"
#include "solver/assembler.hpp"
#include "solver/lagrange.hpp"

using Catch::Matchers::WithinAbs;

namespace {

ms::World makeWorld() {
    ms::World w;
    w.gravity = {0.0, -9.81};
    ms::Body b;
    b.id = "b";
    b.mass = 2.0;
    b.inertia = 0.5;
    w.bodies.push_back(b);
    return w;
}

void pin(ms::World& w, ms::Vec2 local) {
    auto p = std::make_unique<ms::PinSupport>();
    p->id = "A";
    p->body = 0;
    p->localPoint = local;
    w.constraints.push_back(std::move(p));
    w.initialize();
}

}  // namespace

TEST_CASE("Free body accelerates with gravity", "[solver]") {
    ms::World w = makeWorld();
    ms::System sys;
    ms::assemble(w, 0.0, sys);
    std::vector<double> acc, lambda;
    REQUIRE(ms::solveAccelerations(sys, acc, lambda) == 0);
    REQUIRE(lambda.empty());
    REQUIRE_THAT(acc[0], WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(acc[1], WithinAbs(-9.81, 1e-12));
    REQUIRE_THAT(acc[2], WithinAbs(0.0, 1e-12));
}

TEST_CASE("Body pinned at its centre carries its weight", "[solver]") {
    ms::World w = makeWorld();
    pin(w, {0.0, 0.0});
    ms::System sys;
    ms::assemble(w, 0.0, sys);
    std::vector<double> acc, lambda;
    REQUIRE(ms::solveAccelerations(sys, acc, lambda) == 0);
    for (double a : acc) REQUIRE_THAT(a, WithinAbs(0.0, 1e-9));
    REQUIRE(lambda.size() == 2);
    REQUIRE_THAT(lambda[0], WithinAbs(0.0, 1e-9));
    REQUIRE_THAT(lambda[1], WithinAbs(2.0 * 9.81, 1e-9));
}

TEST_CASE("Off-centre pin satisfies G a = gamma", "[solver]") {
    ms::World w = makeWorld();
    pin(w, {0.3, 0.0});
    ms::System sys;
    ms::assemble(w, 0.0, sys);
    std::vector<double> acc, lambda;
    REQUIRE(ms::solveAccelerations(sys, acc, lambda) == 0);
    for (int r = 0; r < sys.m; ++r) {
        double ga = 0.0;
        for (int k = 0; k < sys.n; ++k) ga += sys.G[r * sys.n + k] * acc[k];
        REQUIRE_THAT(ga, WithinAbs(sys.gamma[r], 1e-10));
    }
    // The body must actually swing: nonzero angular acceleration.
    REQUIRE(std::abs(acc[2]) > 1.0);
}
