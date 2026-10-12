// test_roller_support.cpp - v0.2 Loslager (frictionless sliding along a surface).
#include <cmath>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "bodies/block.hpp"
#include "constraints/roller_support.hpp"
#include "core/world.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;

namespace {

const double kPi = std::acos(-1.0);

// Block with its centre on a roller whose surface line has direction `angle`.
ms::World onSurface(double angle) {
    ms::World w;
    ms::Body b;
    b.id = "m";
    ms::initBlock(b, {{"mass", 2.0}, {"width", 0.2}, {"height", 0.2}});
    w.bodies.push_back(b);
    w.constraints.push_back(ms::makeRollerSupport({{"id", "B"},
                                                   {"type", "roller_support"},
                                                   {"body", "m"},
                                                   {"point", {0.0, 0.0}},
                                                   {"params", {{"angle", angle}}}},
                                                  w));
    w.initialize();
    return w;
}

}  // namespace

TEST_CASE("roller on a 30 degree incline: a = g sin(theta), N = m g cos(theta)", "[roller]") {
    const double theta = kPi / 6;
    const double dt = 1e-3;
    const int n = 500;
    ms::World w = onSurface(theta);
    REQUIRE(w.constraints[0]->dim() == 1);
    for (int i = 0; i < n; ++i) w.step(dt);

    const ms::Vec2 t{std::cos(theta), std::sin(theta)};
    const ms::Vec2 nrm{-std::sin(theta), std::cos(theta)};
    const ms::Body& b = w.bodies[0];

    // Semi-implicit Euler is exact for constant acceleration: s = a dt^2 n (n + 1) / 2.
    const double a = 9.81 * std::sin(theta);
    const double s = -a * dt * dt * n * (n + 1) / 2.0;  // down the slope = against t
    REQUIRE_THAT(ms::dot(b.pos, t), WithinAbs(s, 1e-6));
    REQUIRE_THAT(ms::dot(b.pos, nrm), WithinAbs(0.0, 1e-9));
    REQUIRE_THAT(b.phi, WithinAbs(0.0, 1e-9));  // roller at the centre of mass: no torque

    const auto reaction = w.frame()["constraints"][0]["reaction"];
    const ms::Vec2 R{reaction[0].get<double>(), reaction[1].get<double>()};
    REQUIRE_THAT(ms::dot(R, nrm), WithinAbs(2.0 * 9.81 * std::cos(theta), 1e-6));
    REQUIRE_THAT(ms::dot(R, t), WithinAbs(0.0, 1e-9));  // no friction
}

TEST_CASE("roller direction does not depend on the sign of the angle", "[roller]") {
    ms::World a = onSurface(0.4);
    ms::World b = onSurface(0.4 + kPi);
    for (int i = 0; i < 300; ++i) {
        a.step(1e-3);
        b.step(1e-3);
    }
    REQUIRE_THAT(a.bodies[0].pos.x, WithinAbs(b.bodies[0].pos.x, 1e-9));
    REQUIRE_THAT(a.bodies[0].pos.y, WithinAbs(b.bodies[0].pos.y, 1e-9));
}

TEST_CASE("roller on a horizontal surface carries the weight and lets the body slide", "[roller]") {
    ms::World w = onSurface(0.0);
    w.bodies[0].vel = {1.0, 0.0};
    w.initialize();
    for (int i = 0; i < 1000; ++i) w.step(1e-3);
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(1.0, 1e-9));
    REQUIRE_THAT(w.bodies[0].pos.y, WithinAbs(0.0, 1e-9));
    REQUIRE_THAT(w.frame()["constraints"][0]["reaction"][1].get<double>(), WithinAbs(2.0 * 9.81, 1e-6));
}

TEST_CASE("roller factory validates its input", "[roller]") {
    ms::World w;
    ms::Body b;
    b.id = "m";
    ms::initBlock(b, {{"mass", 1.0}, {"width", 1.0}, {"height", 1.0}});
    w.bodies.push_back(b);
    REQUIRE_THROWS_WITH(ms::makeRollerSupport({{"id", "B3"}, {"body", "x"}, {"point", {0, 0}}}, w),
                        ContainsSubstring("B3"));
    REQUIRE_THROWS_WITH(ms::makeRollerSupport({{"id", "B4"},
                                               {"body", "m"},
                                               {"point", {0, 0}},
                                               {"params", {{"angle", "steep"}}}},
                                              w),
                        ContainsSubstring("B4"));
    // angle defaults to 0
    auto c = ms::makeRollerSupport({{"id", "B5"}, {"body", "m"}, {"point", {0, 0}}}, w);
    REQUIRE(static_cast<ms::RollerSupport*>(c.get())->angle == 0.0);
}
