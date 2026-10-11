// test_integrators.cpp - TICKET A6.
#include <cmath>
#include <memory>
#include <vector>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "constraints/pin_support.hpp"
#include "core/world.hpp"

using Catch::Matchers::WithinAbs;

TEST_CASE("Free fall matches the exact semi-implicit Euler result", "[integrator]") {
    ms::World w;
    w.gravity = {0.0, -9.81};
    ms::Body b;
    b.id = "b";
    w.bodies.push_back(b);
    w.initialize();

    const double dt = 0.001;
    const int n = 1000;
    for (int i = 0; i < n; ++i) w.step(dt);

    const double expected = -9.81 * dt * dt * n * (n + 1) / 2.0;
    REQUIRE_THAT(w.bodies[0].pos.y, WithinAbs(expected, 1e-9));
    REQUIRE_THAT(w.time, WithinAbs(1.0, 1e-12));
}

TEST_CASE("Physical pendulum period and constraint drift", "[integrator]") {
    const double kPi = std::acos(-1.0);
    const double m = 2.0, width = 0.05, height = 1.0, d = 0.5;
    const double J = m * (width * width + height * height) / 12.0;

    ms::World w;
    w.gravity = {0.0, -9.81};
    ms::Body b;
    b.id = "rod";
    b.mass = m;
    b.inertia = J;
    b.phi = 0.1;
    b.pos = -ms::rotate({0.0, d}, b.phi);  // pin point sits at the origin
    w.bodies.push_back(b);

    auto pin = std::make_unique<ms::PinSupport>();
    pin->id = "A";
    pin->body = 0;
    pin->localPoint = {0.0, d};
    w.constraints.push_back(std::move(pin));
    w.initialize();

    const double dt = 0.001;
    std::vector<double> crossings;
    double phiPrev = w.bodies[0].phi;
    for (int i = 0; i < 5000; ++i) {
        w.step(dt);
        const double phi = w.bodies[0].phi;
        if (phiPrev > 0.0 && phi <= 0.0) crossings.push_back(w.time);  // downward crossing
        phiPrev = phi;
    }
    REQUIRE(crossings.size() >= 2);
    const double period = (crossings.back() - crossings.front()) / (crossings.size() - 1);

    // Small-angle physical pendulum: T = 2 pi sqrt(J_A / (m g d)), J_A = J + m d^2.
    const double JA = J + m * d * d;
    const double expected = 2.0 * kPi * std::sqrt(JA / (m * 9.81 * d));
    REQUIRE(std::abs(period - expected) / expected < 0.01);

    const ms::Vec2 drift = w.bodies[0].pos + ms::rotate({0.0, d}, w.bodies[0].phi);
    REQUIRE(ms::length(drift) < 1e-4);
}
