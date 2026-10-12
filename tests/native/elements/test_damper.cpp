// test_damper.cpp - v0.3c viscous damper.
#include <cmath>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "bodies/block.hpp"
#include "core/world.hpp"
#include "elements/damper.hpp"
#include "elements/spring.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;
using nlohmann::json;

namespace {

ms::Body block(const char* id, ms::Vec2 pos, double mass = 1.0) {
    ms::Body b;
    b.id = id;
    b.pos = pos;
    ms::initBlock(b, {{"mass", mass}, {"width", 0.2}, {"height", 0.2}});
    return b;
}

json ground(double x, double y) { return {{"body", nullptr}, {"point", {x, y}}}; }
json onBody(const char* id, double x = 0, double y = 0) { return {{"body", id}, {"point", {x, y}}}; }

json damperSpec(json a, json b, double c, const char* id = "D1") {
    return {{"id", id}, {"type", "damper"}, {"a", a}, {"b", b}, {"params", {{"c", c}}}};
}

double force(const ms::World& w, std::size_t i = 0) { return w.frame()["elements"][i]["force"].get<double>(); }

}  // namespace

TEST_CASE("a damper makes the velocity decay as exp(-c t / m)", "[damper]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("m", {1.0, 0.0}, 2.0));
    w.bodies[0].vel = {3.0, 0.0};
    w.elements.push_back(ms::makeDamper(damperSpec(ground(0, 0), onBody("m"), 4.0), w));
    w.initialize();
    for (int i = 0; i < 1000; ++i) w.step(1e-3);  // t = 1 s, c / m = 2 1/s
    REQUIRE_THAT(w.bodies[0].vel.x, WithinRel(3.0 * std::exp(-2.0), 5e-3));
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.0, 1e-12));
}

TEST_CASE("the damper force is tension (positive) while the ends move apart, compression while they approach", "[damper]") {
    for (double v : {2.0, -2.0}) {
        ms::World w;
        w.gravity = {0.0, 0.0};
        w.bodies.push_back(block("m", {1.0, 0.0}));
        w.bodies[0].vel = {v, 0.0};
        w.elements.push_back(ms::makeDamper(damperSpec(ground(0, 0), onBody("m"), 5.0), w));
        w.initialize();
        INFO(v);
        REQUIRE_THAT(force(w), WithinAbs(5.0 * v, 1e-12));  // F = c dL/dt
        // it opposes the motion: the mass slows down
        w.step(1e-3);
        REQUIRE(std::abs(w.bodies[0].vel.x) < std::abs(v));
    }
}

TEST_CASE("a damper at rest or with ends moving together exerts nothing, and stores no energy", "[damper]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("a", {0.0, 0.0}));
    w.bodies.push_back(block("b", {1.0, 0.0}));
    w.bodies[0].vel = w.bodies[1].vel = {0.0, 2.0};  // both move the same way, sideways
    w.elements.push_back(ms::makeDamper(damperSpec(onBody("a"), onBody("b"), 7.0), w));
    w.initialize();
    REQUIRE_THAT(force(w), WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(w.potentialEnergy(), WithinAbs(0.0, 1e-12));
}

TEST_CASE("a damper between two masses conserves momentum and kills the relative velocity", "[damper]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("a", {0.0, 0.0}, 1.0));
    w.bodies.push_back(block("b", {1.0, 0.0}, 3.0));
    w.bodies[0].vel = {-1.0, 0.5};
    w.bodies[1].vel = {2.0, 0.0};
    w.elements.push_back(ms::makeDamper(damperSpec(onBody("a"), onBody("b"), 6.0), w));
    w.initialize();
    const ms::Vec2 p0 = w.bodies[0].vel * 1.0 + w.bodies[1].vel * 3.0;
    for (int i = 0; i < 4000; ++i) w.step(1e-3);
    const ms::Vec2 p1 = w.bodies[0].vel * 1.0 + w.bodies[1].vel * 3.0;
    REQUIRE_THAT(p1.x, WithinAbs(p0.x, 1e-9));
    REQUIRE_THAT(p1.y, WithinAbs(p0.y, 1e-9));
    // the relative velocity along the (slowly turning) axis decays; the sideways part is not damped
    const ms::Vec2 d = w.bodies[1].pos - w.bodies[0].pos;
    const ms::Vec2 u = d / ms::length(d);
    // (a little remains: the pair rotates about its centre of mass and the centrifugal effect pumps some back)
    REQUIRE_THAT(ms::dot(u, w.bodies[1].vel - w.bodies[0].vel), WithinAbs(0.0, 2e-2));  // initially 3 m/s
}

TEST_CASE("a damper attached off the centre damps rotation through its lever arm", "[damper]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("m", {0.0, 0.0}));
    w.bodies[0].omega = 3.0;
    // damper from a ground point above the block to its upper right corner (0.1, 0.1); the axis is vertical
    w.elements.push_back(ms::makeDamper(damperSpec(ground(0.1, 1.0), onBody("m", 0.1, 0.1), 2.0), w));
    w.initialize();
    const double e0 = w.kineticEnergy();
    for (int i = 0; i < 3000; ++i) w.step(1e-3);
    REQUIRE(std::abs(w.bodies[0].omega) < 3.0);
    REQUIRE(w.kineticEnergy() < e0);
}

TEST_CASE("spring-mass-damper: damped frequency and decay envelope", "[damper]") {
    const double m = 2.0, k = 200.0, c = 8.0;  // zeta = c / (2 sqrt(k m)) = 0.2
    const double zeta = c / (2.0 * std::sqrt(k * m));
    const double w0 = std::sqrt(k / m);
    const double wd = w0 * std::sqrt(1.0 - zeta * zeta);

    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("m", {1.2, 0.0}, m));  // 0.2 m stretched
    w.elements.push_back(ms::makeSpring(
        {{"id", "k"}, {"type", "spring"}, {"a", ground(0, 0)}, {"b", onBody("m")}, {"params", {{"k", k}, {"rest_length", 1.0}}}}, w));
    w.elements.push_back(ms::makeDamper(damperSpec(ground(0, 0), onBody("m"), c), w));
    w.initialize();

    std::vector<double> peakT, peakX;
    double prev2 = 0, prev1 = 0;
    for (int i = 0; i < 4000; ++i) {
        w.step(1e-3);
        const double x = w.bodies[0].pos.x - 1.0;
        if (i >= 2 && prev1 > prev2 && prev1 > x && prev1 > 0) {
            peakT.push_back(w.time - 1e-3);
            peakX.push_back(prev1);
        }
        prev2 = prev1;
        prev1 = x;
    }
    REQUIRE(peakT.size() >= 3);
    REQUIRE_THAT(peakT[1] - peakT[0], WithinRel(2.0 * M_PI / wd, 1e-2));
    // successive peaks shrink by exp(-zeta w0 T_d)
    REQUIRE_THAT(peakX[1] / peakX[0], WithinRel(std::exp(-zeta * w0 * 2.0 * M_PI / wd), 3e-2));
}

TEST_CASE("total energy never increases with a damper in the system", "[damper]") {
    ms::World w;
    w.bodies.push_back(block("m", {1.3, 0.0}, 1.5));
    w.elements.push_back(ms::makeSpring(
        {{"id", "k"}, {"type", "spring"}, {"a", ground(0, 1)}, {"b", onBody("m")}, {"params", {{"k", 120.0}, {"rest_length", 0.7}}}}, w));
    w.elements.push_back(ms::makeDamper(damperSpec(ground(0, 1), onBody("m"), 3.0), w));
    w.initialize();
    double previous = w.kineticEnergy() + w.potentialEnergy();
    const double start = previous;
    for (int i = 0; i < 5000; ++i) {
        w.step(1e-3);
        const double e = w.kineticEnergy() + w.potentialEnergy();
        REQUIRE(e <= previous + 1e-3 * start);  // up to the scheme's small oscillation
        previous = e;
    }
    REQUIRE(previous < 0.5 * start);
}

TEST_CASE("damper factory validates its input", "[damper]") {
    ms::World w;
    w.bodies.push_back(block("a", {1.0, 0.0}));
    w.bodies.push_back(block("b", {2.0, 0.0}));
    REQUIRE_THROWS_WITH(ms::makeDamper(damperSpec(ground(0, 0), ground(1, 1), 1.0, "D9"), w), ContainsSubstring("at least one end"));
    REQUIRE_THROWS_WITH(ms::makeDamper(damperSpec(onBody("a"), onBody("a", 0.1, 0), 1.0), w), ContainsSubstring("same mass"));
    REQUIRE_THROWS_WITH(ms::makeDamper(damperSpec(ground(0, 0), onBody("ghost"), 1.0), w), ContainsSubstring("unknown body 'ghost'"));
    REQUIRE_THROWS_WITH(ms::makeDamper(damperSpec(ground(0, 0), onBody("a"), -1.0, "D7"), w), ContainsSubstring("'c' must be"));
    REQUIRE_THROWS_WITH(ms::makeDamper({{"id", "D8"}, {"a", ground(0, 0)}, {"b", onBody("a")}}, w), ContainsSubstring("D8"));
    REQUIRE_NOTHROW(ms::makeDamper(damperSpec(ground(0, 0), onBody("a"), 0.0), w));  // c = 0 is allowed
    REQUIRE_NOTHROW(ms::makeDamper(damperSpec(onBody("a"), onBody("b"), 5.0), w));
}

TEST_CASE("damper frame entry", "[damper]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("m", {1.0, 2.0}));
    w.bodies[0].vel = {0.0, 1.0};
    w.elements.push_back(ms::makeDamper(damperSpec(ground(1.0, 0.0), onBody("m", 0.0, -0.1), 3.0), w));
    w.initialize();
    const json f = w.frame()["elements"][0];
    REQUIRE(f["type"] == "damper");
    REQUIRE_THAT(f["p1"][1].get<double>(), WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(f["p2"][1].get<double>(), WithinAbs(1.9, 1e-12));
    REQUIRE_THAT(f["force"].get<double>(), WithinAbs(3.0, 1e-12));
}
