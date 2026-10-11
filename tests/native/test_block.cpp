// test_block.cpp - TICKET A2.
#include <stdexcept>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "bodies/block.hpp"

using Catch::Matchers::WithinAbs;

TEST_CASE("blockInertia of a unit square", "[block]") {
    REQUIRE_THAT(ms::blockInertia(12.0, 1.0, 1.0), WithinAbs(2.0, 1e-12));
}

TEST_CASE("initBlock sets mass, inertia and type", "[block]") {
    ms::Body b;
    ms::initBlock(b, nlohmann::json{{"mass", 3}, {"width", 0.4}, {"height", 0.3}});
    REQUIRE_THAT(b.mass, WithinAbs(3.0, 1e-12));
    REQUIRE_THAT(b.inertia, WithinAbs(0.0625, 1e-12));
    REQUIRE(b.type == "block");
}

TEST_CASE("initBlock rejects bad parameters", "[block]") {
    ms::Body b;
    REQUIRE_THROWS_AS(ms::initBlock(b, nlohmann::json{{"mass", 3}, {"width", 0.4}}),
                      std::runtime_error);
    REQUIRE_THROWS_AS(ms::initBlock(b, nlohmann::json{{"mass", 0}, {"width", 0.4}, {"height", 0.3}}),
                      std::runtime_error);
    REQUIRE_THROWS_AS(ms::initBlock(b, nlohmann::json{{"mass", 3}, {"width", "a"}, {"height", 0.3}}),
                      std::runtime_error);
}
