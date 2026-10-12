// test_load.cpp - v0.2 force / moment load, constant and impulse.
#include <cmath>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "bodies/block.hpp"
#include "constraints/fixed_support.hpp"
#include "constraints/pin_support.hpp"
#include "constraints/roller_support.hpp"
#include "core/world.hpp"
#include "elements/load.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;
using nlohmann::json;

namespace {

// Free block (m = 2, 1 x 0.2) in zero gravity.
ms::World freeBlock() {
    ms::World w;
    w.gravity = {0.0, 0.0};
    ms::Body b;
    b.id = "m";
    ms::initBlock(b, {{"mass", 2.0}, {"width", 1.0}, {"height", 0.2}});
    w.bodies.push_back(b);
    return w;
}

void addLoad(ms::World& w, const json& params, ms::Vec2 point = {0.0, 0.0}) {
    json spec = {{"id", "F1"}, {"type", "load"}, {"body", "m"}, {"point", {point.x, point.y}}, {"params", params}};
    w.elements.push_back(ms::makeLoad(spec, w));
}

}  // namespace

TEST_CASE("constant force at the centre of mass accelerates the body", "[load]") {
    ms::World w = freeBlock();
    addLoad(w, {{"force", {6.0, -4.0}}});
    w.initialize();
    for (int i = 0; i < 1000; ++i) w.step(1e-3);
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(3.0, 1e-9));   // F/m * t
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(-2.0, 1e-9));
    REQUIRE_THAT(w.bodies[0].omega, WithinAbs(0.0, 1e-12));
}

TEST_CASE("constant moment gives alpha = M / J, force off-centre adds cross(r, F)", "[load]") {
    const double J = 2.0 * (1.0 + 0.04) / 12.0;
    {
        ms::World w = freeBlock();
        addLoad(w, {{"moment", 0.7}});
        w.initialize();
        for (int i = 0; i < 1000; ++i) w.step(1e-3);
        REQUIRE_THAT(w.bodies[0].omega, WithinAbs(0.7 / J, 1e-9));
        REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(0.0, 1e-12));
    }
    {
        ms::World w = freeBlock();
        addLoad(w, {{"force", {0.0, 1.0}}}, {0.5, 0.0});  // tip force, lever 0.5 -> torque +0.5
        w.initialize();
        // One step only: the lever arm rotates with the body, the torque is constant just initially.
        w.step(1e-3);
        REQUIRE_THAT(w.bodies[0].omega, WithinAbs(0.5 / J * 1e-3, 1e-12));
        REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.5 * 1e-3, 1e-12));
    }
}

TEST_CASE("constant load is conservative: potential energy is -F.p - M phi", "[load]") {
    ms::World w = freeBlock();
    addLoad(w, {{"force", {3.0, 1.0}}, {"moment", 0.4}}, {0.3, 0.0});
    w.initialize();
    const double e0 = w.kineticEnergy() + w.potentialEnergy();
    REQUIRE_THAT(w.potentialEnergy(), WithinAbs(-(3.0 * 0.3), 1e-12));
    for (int i = 0; i < 2000; ++i) w.step(1e-4);
    const double e1 = w.kineticEnergy() + w.potentialEnergy();
    REQUIRE(w.kineticEnergy() > 0.1);
    REQUIRE_THAT(e1, WithinAbs(e0, 2e-3 * w.kineticEnergy()));
}

TEST_CASE("impulse sets the velocity at t = 0 and exerts no later force", "[load][impulse]") {
    ms::World w = freeBlock();
    addLoad(w, {{"force", {4.0, 0.0}}, {"mode", "impulse"}});
    w.initialize();
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(2.0, 1e-12));  // J / m
    REQUIRE_THAT(w.potentialEnergy(), WithinAbs(0.0, 1e-12));
    for (int i = 0; i < 500; ++i) w.step(1e-3);
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(2.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].pos.x, WithinAbs(1.0 + 2.0e-3 * 0.0, 1e-9));

    // reset restores the pre-impulse state and applies the impulse again, exactly once
    w.reset();
    REQUIRE(w.time == 0.0);
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(2.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].pos.x, WithinAbs(0.0, 1e-12));
}

TEST_CASE("off-centre impulse and angular impulse spin the body", "[load][impulse]") {
    const double J = 2.0 * (1.0 + 0.04) / 12.0;
    ms::World w = freeBlock();
    addLoad(w, {{"force", {0.0, 3.0}}, {"moment", 0.2}, {"mode", "impulse"}}, {0.5, 0.0});
    w.initialize();
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(1.5, 1e-12));
    REQUIRE_THAT(w.bodies[0].omega, WithinAbs((0.5 * 3.0 + 0.2) / J, 1e-12));
}

TEST_CASE("impulse keeps the existing initial velocity", "[load][impulse]") {
    ms::World w = freeBlock();
    w.bodies[0].vel = {1.0, 0.0};
    addLoad(w, {{"force", {2.0, 0.0}}, {"mode", "impulse"}});
    w.initialize();
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(2.0, 1e-12));
    w.reset();
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(2.0, 1e-12));  // not 3: reset restores the saved state
}

TEST_CASE("impulse on a pinned rod respects the pin (angular momentum about the pivot)", "[load][impulse]") {
    // Rod 0.05 x 1.0, pinned at its top end, hanging down. Horizontal impulse 1 N s at the bottom.
    ms::World w;
    w.gravity = {0.0, 0.0};
    ms::Body b;
    b.id = "m";
    b.pos = {0.0, -0.5};
    ms::initBlock(b, {{"mass", 2.0}, {"width", 0.05}, {"height", 1.0}});
    w.bodies.push_back(b);
    w.constraints.push_back(ms::makePinSupport(
        {{"id", "A"}, {"type", "pin_support"}, {"body", "m"}, {"point", {0.0, 0.5}}}, w));
    addLoad(w, {{"force", {1.0, 0.0}}, {"mode", "impulse"}}, {0.0, -0.5});
    w.initialize();

    const double Icm = 2.0 * (0.05 * 0.05 + 1.0) / 12.0;
    const double IA = Icm + 2.0 * 0.5 * 0.5;
    const double omega = 1.0 * 1.0 / IA;  // L = cross((0,-1), (1,0)) = +1
    REQUIRE_THAT(w.bodies[0].omega, WithinAbs(omega, 1e-9));
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(0.5 * omega, 1e-9));  // v_cm = omega x r_cm
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.0, 1e-9));
}

TEST_CASE("impulse on a block in a roller loses the component along the normal", "[load][impulse]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    ms::Body b;
    b.id = "m";
    ms::initBlock(b, {{"mass", 2.0}, {"width", 0.2}, {"height", 0.2}});
    w.bodies.push_back(b);
    w.constraints.push_back(ms::makeRollerSupport(
        {{"id", "B"}, {"body", "m"}, {"point", {0, 0}}, {"params", {{"angle", 0.0}}}}, w));
    addLoad(w, {{"force", {2.0, 5.0}}, {"mode", "impulse"}});
    w.initialize();
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.0, 1e-12));
}

TEST_CASE("impulse against a fixed support is absorbed completely", "[load][impulse]") {
    ms::World w = freeBlock();
    w.constraints.push_back(ms::makeFixedSupport(
        {{"id", "E"}, {"body", "m"}, {"point", {-0.5, 0.0}}}, w));
    addLoad(w, {{"force", {3.0, 3.0}}, {"moment", 1.0}, {"mode", "impulse"}}, {0.5, 0.0});
    w.initialize();
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(0.0, 1e-9));
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.0, 1e-9));
    REQUIRE_THAT(w.bodies[0].omega, WithinAbs(0.0, 1e-9));
}

TEST_CASE("load frame entry", "[load]") {
    ms::World w = freeBlock();
    w.bodies[0].pos = {1.0, 2.0};
    addLoad(w, {{"force", {3.0, 4.0}}, {"mode", "impulse"}}, {0.5, 0.0});
    w.initialize();
    json f = w.frame()["elements"][0];
    REQUIRE(f["type"] == "load");
    REQUIRE_THAT(f["p1"][0].get<double>(), WithinAbs(1.5, 1e-12));
    REQUIRE_THAT(f["p2"][1].get<double>(), WithinAbs(2.0, 1e-12));
    REQUIRE_THAT(f["force"].get<double>(), WithinAbs(5.0, 1e-12));
    REQUIRE(f["vector"][1] == 4.0);
    REQUIRE(f["mode"] == "impulse");
    REQUIRE(f["active"] == true);
    w.step(1e-3);
    REQUIRE(w.frame()["elements"][0]["active"] == false);  // the impulse is over after t = 0
}

TEST_CASE("load factory validates its input", "[load]") {
    ms::World w = freeBlock();
    auto spec = [](json params, const char* body = "m") {
        return json{{"id", "F9"}, {"type", "load"}, {"body", body}, {"point", {0, 0}}, {"params", params}};
    };
    REQUIRE_THROWS_WITH(ms::makeLoad(spec(json::object(), "ghost"), w), ContainsSubstring("F9"));
    REQUIRE_THROWS_WITH(ms::makeLoad(spec({{"mode", "ramp"}}), w), ContainsSubstring("mode"));
    REQUIRE_THROWS_WITH(ms::makeLoad(spec({{"force", {1.0}}}), w), ContainsSubstring("force"));
    REQUIRE_THROWS_WITH(ms::makeLoad(spec({{"moment", "x"}}), w), ContainsSubstring("moment"));
    REQUIRE_NOTHROW(ms::makeLoad(spec(json::object()), w));  // all params optional
    REQUIRE_NOTHROW(ms::makeLoad(spec(json()), w));          // null params behave like {}
}
