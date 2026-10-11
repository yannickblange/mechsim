// test_body.cpp - TICKET A2.
#include <cmath>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "core/body.hpp"

using Catch::Matchers::WithinAbs;

namespace {
const double kPi = std::acos(-1.0);
}

TEST_CASE("Body::rotated by +90 degrees", "[body]") {
    ms::Body b;
    b.phi = kPi / 2;
    ms::Vec2 r = b.rotated({1.0, 0.0});
    REQUIRE_THAT(r.x, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(r.y, WithinAbs(1.0, 1e-12));
}

TEST_CASE("Body::toWorld adds the position", "[body]") {
    ms::Body b;
    b.pos = {1.0, 2.0};
    b.phi = kPi / 2;
    ms::Vec2 p = b.toWorld({1.0, 0.0});
    REQUIRE_THAT(p.x, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(p.y, WithinAbs(3.0, 1e-12));
}

TEST_CASE("Body::velocityAt includes omega x r", "[body]") {
    ms::Body b;
    b.vel = {1.0, 0.0};
    b.omega = 2.0;
    ms::Vec2 v = b.velocityAt({1.0, 0.0});
    REQUIRE_THAT(v.x, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(v.y, WithinAbs(2.0, 1e-12));
}

TEST_CASE("Body::applyForceAt produces a CCW torque", "[body]") {
    ms::Body b;
    b.applyForceAt({0.0, 1.0}, {1.0, 0.0});
    REQUIRE_THAT(b.force.x, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(b.force.y, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(b.torque, WithinAbs(1.0, 1e-12));
}

TEST_CASE("Body::applyForceAt follows the rotation", "[body]") {
    ms::Body b;
    b.phi = kPi;
    b.applyForceAt({0.0, 1.0}, {1.0, 0.0});
    REQUIRE_THAT(b.torque, WithinAbs(-1.0, 1e-12));
}

TEST_CASE("Body::clearForces resets force and torque", "[body]") {
    ms::Body b;
    b.applyForceAt({3.0, 4.0}, {1.0, 1.0});
    b.clearForces();
    REQUIRE_THAT(b.force.x, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(b.force.y, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(b.torque, WithinAbs(0.0, 1e-12));
}

TEST_CASE("Body::kineticEnergy", "[body]") {
    ms::Body b;
    b.mass = 2.0;
    b.inertia = 3.0;
    b.vel = {1.0, 1.0};
    b.omega = 2.0;
    REQUIRE_THAT(b.kineticEnergy(), WithinAbs(8.0, 1e-12));
}

TEST_CASE("Body save and restore initial state", "[body]") {
    ms::Body b;
    b.pos = {1.0, 2.0};
    b.phi = 0.3;
    b.vel = {0.4, 0.5};
    b.omega = 0.6;
    b.saveInitialState();

    b.pos = {9.0, 9.0};
    b.phi = 9.0;
    b.vel = {9.0, 9.0};
    b.omega = 9.0;
    b.applyForce({1.0, 1.0});
    b.restoreInitialState();

    REQUIRE_THAT(b.pos.x, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(b.pos.y, WithinAbs(2.0, 1e-12));
    REQUIRE_THAT(b.phi, WithinAbs(0.3, 1e-12));
    REQUIRE_THAT(b.vel.x, WithinAbs(0.4, 1e-12));
    REQUIRE_THAT(b.vel.y, WithinAbs(0.5, 1e-12));
    REQUIRE_THAT(b.omega, WithinAbs(0.6, 1e-12));
    REQUIRE_THAT(b.force.x, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(b.force.y, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(b.torque, WithinAbs(0.0, 1e-12));
}
