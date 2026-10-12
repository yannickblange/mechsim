// test_link.cpp - v0.3 rope (tension only, infinitely strong) and rod / Stab (push and pull).
#include <cmath>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "bodies/block.hpp"
#include "constraints/link.hpp"
#include "core/world.hpp"
#include "elements/load.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;
using nlohmann::json;

namespace {

const double kG = 9.81;

ms::Body block(const char* id, ms::Vec2 pos, double mass = 1.0) {
    ms::Body b;
    b.id = id;
    b.pos = pos;
    ms::initBlock(b, {{"mass", mass}, {"width", 0.2}, {"height", 0.2}});
    return b;
}

json linkSpec(const char* type, json a, json b, json params = json::object()) {
    return {{"id", "L1"}, {"type", type}, {"a", a}, {"b", b}, {"params", params}};
}

json ground(double x, double y) { return {{"body", nullptr}, {"point", {x, y}}}; }
json onBody(const char* id, double x = 0, double y = 0) { return {{"body", id}, {"point", {x, y}}}; }

// A mass hanging from the origin by a rod or rope of the given type.
ms::World pendulum(const char* type, ms::Vec2 pos, json params = json::object()) {
    ms::World w;
    w.bodies.push_back(block("m", pos));
    w.constraints.push_back(type == std::string("rope")
                                ? ms::makeRope(linkSpec("rope", ground(0, 0), onBody("m"), params), w)
                                : ms::makeRod(linkSpec("rod", ground(0, 0), onBody("m")), w));
    w.initialize();
    return w;
}

double distance(const ms::World& w) { return ms::length(w.bodies[0].pos); }
double tension(const ms::World& w) { return w.frame()["constraints"][0]["force"].get<double>(); }

}  // namespace

TEST_CASE("rod pendulum: constant length, tension from the equations, period of the pendulum", "[link][rod]") {
    const double theta0 = 0.1;
    ms::World w = pendulum("rod", {std::sin(theta0), -std::cos(theta0)});
    REQUIRE(w.constraints[0]->dim() == 1);

    // Start at rest: tension m g cos(theta0).
    w.step(1e-3);
    REQUIRE_THAT(tension(w), WithinAbs(kG * std::cos(theta0), 5e-3));

    // Upward zero crossings of x give the period T = 2 pi sqrt(L/g) (1 + theta0^2 / 16).
    std::vector<double> crossings;
    double prev = w.bodies[0].pos.x;
    for (int i = 0; i < 8000; ++i) {
        w.step(1e-3);
        REQUIRE_THAT(distance(w), WithinAbs(1.0, 1e-4));
        const double x = w.bodies[0].pos.x;
        if (prev < 0.0 && x >= 0.0) crossings.push_back(w.time);
        prev = x;
    }
    REQUIRE(crossings.size() >= 3);
    const double period = (crossings.back() - crossings.front()) / (crossings.size() - 1);
    const double expected = 2.0 * M_PI * std::sqrt(1.0 / kG) * (1.0 + theta0 * theta0 / 16.0);
    REQUIRE_THAT(period, WithinRel(expected, 5e-3));
}

TEST_CASE("rod carries compression: a pushed mass reports a negative force", "[link][rod]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("m", {1.0, 0.0}));
    w.constraints.push_back(ms::makeRod(linkSpec("rod", ground(0, 0), onBody("m")), w));
    w.elements.push_back(ms::makeLoad({{"id", "F"}, {"body", "m"}, {"point", {0, 0}}, {"params", {{"force", {-5.0, 0.0}}}}}, w));
    w.initialize();
    for (int i = 0; i < 500; ++i) w.step(1e-3);
    REQUIRE_THAT(tension(w), WithinAbs(-5.0, 1e-6));  // compression, tension positive
    REQUIRE_THAT(w.bodies[0].pos.x, WithinAbs(1.0, 1e-6));
    const auto frame = w.frame()["constraints"][0];
    REQUIRE(frame["taut"] == true);
    REQUIRE_THAT(frame["length"].get<double>(), WithinAbs(1.0, 1e-12));
}

TEST_CASE("a taut rope behaves like the rod while it carries tension", "[link][rope]") {
    ms::World rod = pendulum("rod", {std::sin(0.3), -std::cos(0.3)});
    ms::World rope = pendulum("rope", {std::sin(0.3), -std::cos(0.3)});
    for (int i = 0; i < 3000; ++i) {
        rod.step(1e-3);
        rope.step(1e-3);
        REQUIRE_THAT(rope.bodies[0].pos.x, WithinAbs(rod.bodies[0].pos.x, 2e-3));
        REQUIRE_THAT(rope.bodies[0].pos.y, WithinAbs(rod.bodies[0].pos.y, 2e-3));
        REQUIRE(tension(rope) > 0.0);
    }
}

TEST_CASE("a slack rope exerts no force; it snaps taut inelastically and then holds the weight", "[link][rope]") {
    // Mass 0.5 m below the anchor on a 1 m rope.
    ms::World w = pendulum("rope", {0.0, -0.5}, {{"length", 1.0}});
    REQUIRE(w.constraints[0]->dim() == 0);  // starts slack

    const double dt = 1e-3;
    for (int i = 0; i < 200; ++i) w.step(dt);  // free fall
    const auto slack = w.frame()["constraints"][0];
    REQUIRE(slack["taut"] == false);
    REQUIRE_THAT(slack["force"].get<double>(), WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].pos.y, WithinAbs(-0.5 - 0.5 * kG * 0.2 * 0.2, 5e-3));
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(-kG * 0.2, 1e-9));

    // Fall time to a distance of 1 m: sqrt(2 * 0.5 / g) = 0.319 s.
    double vBefore = 0.0;
    bool snapped = false;
    for (int i = 0; i < 400 && !snapped; ++i) {
        vBefore = w.bodies[0].vel.y;
        w.step(dt);
        snapped = w.frame()["constraints"][0]["taut"].get<bool>();
    }
    REQUIRE(snapped);
    REQUIRE(vBefore < -3.0);
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.0, 1e-3));  // the outward velocity is gone

    for (int i = 0; i < 1000; ++i) w.step(dt);
    REQUIRE_THAT(tension(w), WithinAbs(kG, 5e-3));            // hangs on the rope
    REQUIRE_THAT(w.bodies[0].pos.y, WithinAbs(-1.0, 5e-3));
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.0, 1e-3));    // no bounce
}

TEST_CASE("a rope never pushes and never stretches (3 s of a mass flung around on a long rope)", "[link][rope]") {
    ms::World w = pendulum("rope", {0.6, -0.2}, {{"length", 1.0}});
    w.bodies[0].vel = {1.5, 2.5};
    w.initialize();
    bool wasTaut = false, wasSlack = false;
    for (int i = 0; i < 3000; ++i) {
        w.step(1e-3);
        const auto f = w.frame()["constraints"][0];
        (f["taut"].get<bool>() ? wasTaut : wasSlack) = true;
        REQUIRE(f["force"].get<double>() >= -1e-6);  // tension only
        REQUIRE(distance(w) <= 1.0 + 1e-2);           // infinitely strong
    }
    REQUIRE(wasTaut);
    REQUIRE(wasSlack);
}

TEST_CASE("a rope that is taut at the start removes the outward initial velocity", "[link][rope]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("m", {1.0, 0.0}));
    w.bodies[0].vel = {2.0, 1.0};
    w.constraints.push_back(ms::makeRope(linkSpec("rope", ground(0, 0), onBody("m")), w));
    w.initialize();
    w.step(1e-3);
    // The radial part is gone; what is left of vx is the centripetal acceleration v^2 / L * dt.
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(-1e-3, 1e-5));
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(1.0, 1e-3));  // the tangential part stays
}

TEST_CASE("a rope allows inward motion", "[link][rope]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("m", {1.0, 0.0}));
    w.bodies[0].vel = {-1.0, 0.0};
    w.constraints.push_back(ms::makeRope(linkSpec("rope", ground(0, 0), onBody("m")), w));
    w.initialize();
    for (int i = 0; i < 200; ++i) w.step(1e-3);
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(-1.0, 1e-9));
    REQUIRE_THAT(w.bodies[0].pos.x, WithinAbs(0.8, 1e-3));
    REQUIRE(w.frame()["constraints"][0]["taut"] == false);
}

TEST_CASE("a rod between two masses keeps their distance and conserves momentum", "[link][rod]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(block("a", {0.0, 0.0}, 1.0));
    w.bodies.push_back(block("b", {1.0, 0.0}, 3.0));
    w.constraints.push_back(ms::makeRod(linkSpec("rod", onBody("a"), onBody("b")), w));
    w.elements.push_back(ms::makeLoad({{"id", "J"}, {"body", "a"}, {"point", {0, 0}},
                                       {"params", {{"force", {2.0, 4.0}}, {"mode", "impulse"}}}}, w));
    w.initialize();
    // The impulse is projected: the component along the rod is shared (a pushes b), the rest is a's.
    for (int i = 0; i < 2000; ++i) w.step(1e-3);
    const ms::Vec2 d = w.bodies[1].pos - w.bodies[0].pos;
    REQUIRE_THAT(ms::length(d), WithinAbs(1.0, 1e-2));  // first-order scheme, fast rotation
    const ms::Vec2 p = w.bodies[0].vel * 1.0 + w.bodies[1].vel * 3.0;
    REQUIRE_THAT(p.x, WithinAbs(2.0, 1e-6));
    REQUIRE_THAT(p.y, WithinAbs(4.0, 1e-6));
}

TEST_CASE("an impulse on a mass held by a rod loses the part that would stretch the rod", "[link][impulse]") {
    for (const char* type : {"rod", "rope"}) {
        ms::World w;
        w.gravity = {0.0, 0.0};
        w.bodies.push_back(block("m", {0.0, -1.0}, 2.0));
        w.constraints.push_back(type == std::string("rope")
                                    ? ms::makeRope(linkSpec("rope", ground(0, 0), onBody("m")), w)
                                    : ms::makeRod(linkSpec("rod", ground(0, 0), onBody("m")), w));
        w.elements.push_back(ms::makeLoad({{"id", "J"}, {"body", "m"}, {"point", {0, 0}},
                                           {"params", {{"force", {1.0, -4.0}}, {"mode", "impulse"}}}}, w));
        w.initialize();
        w.step(1e-3);
        INFO(type);
        REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(0.5, 2e-3));  // tangential: J / m
        REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.0, 2e-3));  // radial, outward: absorbed
    }
}

TEST_CASE("link factories reject bad input and name the id", "[link]") {
    ms::World w;
    w.bodies.push_back(block("a", {1.0, 0.0}));
    w.bodies.push_back(block("b", {2.0, 0.0}));
    auto make = [&](json a, json b, json params = json::object(), const char* type = "rope") {
        json spec = linkSpec(type, a, b, params);
        spec["id"] = "L9";
        return std::string(type) == "rope" ? ms::makeRope(spec, w) : ms::makeRod(spec, w);
    };
    REQUIRE_THROWS_WITH(make(ground(0, 0), ground(1, 1)), ContainsSubstring("at least one end"));
    REQUIRE_THROWS_WITH(make(onBody("a"), onBody("a", 0.1, 0)), ContainsSubstring("same mass"));
    REQUIRE_THROWS_WITH(make(ground(1, 0), onBody("a")), ContainsSubstring("coincide"));
    REQUIRE_THROWS_WITH(make(ground(0, 0), onBody("ghost")), ContainsSubstring("unknown body 'ghost'"));
    REQUIRE_THROWS_WITH(make(ground(0, 0), onBody("a"), {{"length", 0.5}}), ContainsSubstring("only 0.5"));
    REQUIRE_THROWS_WITH(make(ground(0, 0), onBody("a"), {{"length", -1}}), ContainsSubstring("length"));
    REQUIRE_NOTHROW(make(ground(0, 0), onBody("a"), json::object(), "rod"));
    REQUIRE_THROWS_WITH(make(ground(0, 0), json{{"point", {0, 0}}}), ContainsSubstring("L9"));
    REQUIRE_NOTHROW(make(ground(0, 0), onBody("a")));
    REQUIRE_NOTHROW(make(onBody("a"), onBody("b"), {{"length", 5.0}}));
}
