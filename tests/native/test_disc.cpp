// test_disc.cpp - v0.2 circular mass.
#include <stdexcept>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "bodies/disc.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;

TEST_CASE("initDisc sets type, mass and inertia m r^2 / 2", "[disc]") {
    ms::Body b;
    ms::initDisc(b, {{"mass", 3.0}, {"radius", 0.2}});
    REQUIRE(b.type == "disc");
    REQUIRE_THAT(b.mass, WithinAbs(3.0, 1e-15));
    REQUIRE_THAT(b.inertia, WithinAbs(0.5 * 3.0 * 0.04, 1e-15));
    REQUIRE_THAT(ms::discInertia(2.0, 0.5), WithinAbs(0.25, 1e-15));
}

TEST_CASE("initDisc rejects missing or non-positive parameters", "[disc]") {
    ms::Body b;
    REQUIRE_THROWS_WITH(ms::initDisc(b, {{"mass", 1.0}}), ContainsSubstring("radius"));
    REQUIRE_THROWS_WITH(ms::initDisc(b, {{"radius", 1.0}}), ContainsSubstring("mass"));
    REQUIRE_THROWS_AS(ms::initDisc(b, {{"mass", 1.0}, {"radius", 0.0}}), std::runtime_error);
    REQUIRE_THROWS_AS(ms::initDisc(b, {{"mass", -1.0}, {"radius", 1.0}}), std::runtime_error);
    REQUIRE_THROWS_AS(ms::initDisc(b, {{"mass", "x"}, {"radius", 1.0}}), std::runtime_error);
}
