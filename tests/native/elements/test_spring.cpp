// test_spring.cpp - TICKET A4.
#include <cmath>
#include <memory>
#include <stdexcept>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "core/world.hpp"
#include "elements/spring.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;

namespace {

ms::Body makeBody(const char* id, ms::Vec2 pos) {
    ms::Body b;
    b.id = id;
    b.pos = pos;
    b.mass = 1.0;
    b.inertia = 1.0;
    return b;
}

// Ground anchor (gx, gy) to local point `local` of body 0 (at the origin).
ms::Spring groundSpring(ms::Vec2 ground, ms::Vec2 local, double k, double l0) {
    ms::Spring s;
    s.a = {ms::GROUND, ground};
    s.b = {0, local};
    s.k = k;
    s.restLength = l0;
    return s;
}

}  // namespace

TEST_CASE("Spring pulls the body towards the ground anchor", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 0.0}));
    ms::Spring s = groundSpring({0.0, 1.0}, {0.0, 0.0}, 100.0, 0.5);
    s.applyForces(w, 0.0);
    REQUIRE_THAT(w.bodies[0].force.x, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].force.y, WithinAbs(50.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].torque, WithinAbs(0.0, 1e-12));
}

TEST_CASE("Compressed spring pushes the body away", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 0.0}));
    ms::Spring s = groundSpring({0.0, 1.0}, {0.0, 0.0}, 100.0, 2.0);
    s.applyForces(w, 0.0);
    REQUIRE_THAT(w.bodies[0].force.y, WithinAbs(-100.0, 1e-12));
}

TEST_CASE("Off-centre attachment produces a torque", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 0.0}));
    ms::Spring s = groundSpring({0.1, 1.0}, {0.1, 0.0}, 100.0, 0.5);
    s.applyForces(w, 0.0);
    const ms::Vec2 f = w.bodies[0].force;
    REQUIRE_THAT(f.y, WithinAbs(50.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].torque, WithinAbs(ms::cross(ms::Vec2{0.1, 0.0}, f), 1e-12));
    REQUIRE(w.bodies[0].torque > 0.0);
}

TEST_CASE("Body-to-body spring forces are equal and opposite", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("a", {0.0, 0.0}));
    w.bodies.push_back(makeBody("b", {2.0, 1.0}));
    ms::Spring s;
    s.a = {0, {0.0, 0.0}};
    s.b = {1, {0.0, 0.0}};
    s.k = 10.0;
    s.restLength = 1.0;
    s.applyForces(w, 0.0);
    REQUIRE_THAT(w.bodies[0].force.x + w.bodies[1].force.x, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].force.y + w.bodies[1].force.y, WithinAbs(0.0, 1e-12));
    REQUIRE(w.bodies[0].force.x > 0.0);  // stretched: a is pulled towards b
}

TEST_CASE("Spring potential energy", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 0.0}));
    ms::Spring s = groundSpring({0.0, 1.0}, {0.0, 0.0}, 100.0, 0.5);
    REQUIRE_THAT(s.potentialEnergy(w), WithinAbs(0.5 * 100.0 * 0.5 * 0.5, 1e-12));
}

TEST_CASE("makeSpring defaults rest_length to the initial distance", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 0.0}));
    nlohmann::json spec = {{"id", "k1"},
                           {"type", "spring"},
                           {"a", {{"body", nullptr}, {"point", {0.0, 1.5}}}},
                           {"b", {{"body", "m"}, {"point", {0.0, 0.0}}}},
                           {"params", {{"k", 20.0}}}};
    auto e = ms::makeSpring(spec, w);
    auto* s = dynamic_cast<ms::Spring*>(e.get());
    REQUIRE(s != nullptr);
    REQUIRE(s->id == "k1");
    REQUIRE_THAT(s->restLength, WithinAbs(1.5, 1e-12));
    REQUIRE_THAT(s->axialForce(w), WithinAbs(0.0, 1e-12));
}

TEST_CASE("makeSpring reports the spring id on errors", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 0.0}));
    nlohmann::json spec = {{"id", "k_bad"},
                           {"type", "spring"},
                           {"a", {{"body", nullptr}, {"point", {0.0, 1.0}}}},
                           {"b", {{"body", "ghost"}, {"point", {0.0, 0.0}}}},
                           {"params", {{"k", 20.0}}}};
    REQUIRE_THROWS_WITH(ms::makeSpring(spec, w), ContainsSubstring("k_bad"));

    spec["b"]["body"] = "m";
    spec["params"]["k"] = -1.0;
    REQUIRE_THROWS_WITH(ms::makeSpring(spec, w), ContainsSubstring("k_bad"));

    spec["params"].erase("k");  // missing key -> nlohmann exception converted
    REQUIRE_THROWS_WITH(ms::makeSpring(spec, w), ContainsSubstring("k_bad"));
}

TEST_CASE("Zero-length spring produces no NaN", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 1.0}));
    ms::Spring s = groundSpring({0.0, 1.0}, {0.0, 0.0}, 100.0, 0.5);
    s.applyForces(w, 0.0);
    REQUIRE_FALSE(std::isnan(w.bodies[0].force.x));
    REQUIRE_FALSE(std::isnan(w.bodies[0].force.y));
    REQUIRE_FALSE(std::isnan(w.bodies[0].torque));
}

TEST_CASE("Spring::writeFrame adds p1, p2 and force", "[spring]") {
    ms::World w;
    w.bodies.push_back(makeBody("m", {0.0, 0.0}));
    ms::Spring s = groundSpring({0.0, 1.0}, {0.0, 0.0}, 100.0, 0.5);
    nlohmann::json out;
    s.writeFrame(w, out);
    REQUIRE_THAT(out["p1"][0].get<double>(), WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(out["p1"][1].get<double>(), WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(out["p2"][0].get<double>(), WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(out["p2"][1].get<double>(), WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(out["force"].get<double>(), WithinAbs(50.0, 1e-12));
}
