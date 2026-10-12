// test_fixed_support.cpp - v0.2 fixed Lager (Einspannung).
#include <cmath>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "bodies/block.hpp"
#include "constraints/fixed_support.hpp"
#include "core/world.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;

namespace {

// Beam of length 1 whose left end (local (-0.5, 0)) is clamped at the world origin.
ms::World cantilever(double mass) {
    ms::World w;
    ms::Body b;
    b.id = "beam";
    b.pos = {0.5, 0.0};
    ms::initBlock(b, {{"mass", mass}, {"width", 1.0}, {"height", 0.1}});
    w.bodies.push_back(b);
    w.constraints.push_back(ms::makeFixedSupport(
        {{"id", "E"}, {"type", "fixed_support"}, {"body", "beam"}, {"point", {-0.5, 0.0}}}, w));
    w.initialize();
    return w;
}

}  // namespace

TEST_CASE("fixed support holds a cantilever against gravity", "[fixed]") {
    ms::World w = cantilever(2.0);
    REQUIRE(w.constraints[0]->dim() == 3);
    for (int i = 0; i < 2000; ++i) w.step(1e-3);

    const ms::Body& b = w.bodies[0];
    REQUIRE_THAT(b.pos.x, WithinAbs(0.5, 1e-6));
    REQUIRE_THAT(b.pos.y, WithinAbs(0.0, 1e-6));
    REQUIRE_THAT(b.phi, WithinAbs(0.0, 1e-6));

    // Statics: force m g up, moment m g L/2 counter-clockwise (balances the clockwise weight).
    const auto reaction = w.frame()["constraints"][0]["reaction"];
    REQUIRE(reaction.size() == 3);
    REQUIRE_THAT(reaction[0].get<double>(), WithinAbs(0.0, 1e-6));
    REQUIRE_THAT(reaction[1].get<double>(), WithinAbs(2.0 * 9.81, 1e-6));
    REQUIRE_THAT(reaction[2].get<double>(), WithinAbs(2.0 * 9.81 * 0.5, 1e-6));
}

TEST_CASE("fixed support reports its world position and resets", "[fixed]") {
    ms::World w = cantilever(1.0);
    const auto frame = w.frame()["constraints"][0];
    REQUIRE_THAT(frame["position"][0].get<double>(), WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(frame["position"][1].get<double>(), WithinAbs(0.0, 1e-12));
    for (int i = 0; i < 100; ++i) w.step(1e-3);
    w.reset();
    REQUIRE(w.time == 0.0);
    REQUIRE_THAT(w.frame()["constraints"][0]["reaction"][1].get<double>(), WithinAbs(0.0, 1e-12));
}

TEST_CASE("fixed support factory names the offending id", "[fixed]") {
    ms::World w;
    ms::Body b;
    b.id = "m";
    ms::initBlock(b, {{"mass", 1.0}, {"width", 1.0}, {"height", 1.0}});
    w.bodies.push_back(b);
    REQUIRE_THROWS_WITH(
        ms::makeFixedSupport({{"id", "E7"}, {"body", "ghost"}, {"point", {0, 0}}}, w),
        ContainsSubstring("E7"));
    REQUIRE_THROWS_WITH(ms::makeFixedSupport({{"id", "E8"}, {"body", "m"}, {"point", {0}}}, w),
                        ContainsSubstring("E8"));
}
