// test_pin_support.cpp - TICKET A5.
#include <cmath>
#include <vector>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "constraints/pin_support.hpp"
#include "core/world.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;

namespace {

const double kPi = std::acos(-1.0);

ms::Body makeBody(const char* id) {
    ms::Body b;
    b.id = id;
    b.mass = 1.0;
    b.inertia = 1.0;
    return b;
}

ms::PinSupport makePin(ms::BodyIndex body, ms::Vec2 local) {
    ms::PinSupport p;
    p.id = "A";
    p.body = body;
    p.localPoint = local;
    return p;
}

}  // namespace

TEST_CASE("PinSupport::initialize captures the world point", "[pin]") {
    ms::World w;
    ms::Body b = makeBody("b");
    b.pos = {1.0, 2.0};
    b.phi = kPi / 2;
    w.bodies.push_back(b);
    ms::PinSupport p = makePin(0, {0.5, 0.0});
    p.reaction = {7.0, 7.0};
    p.initialize(w);
    REQUIRE_THAT(p.groundPoint.x, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(p.groundPoint.y, WithinAbs(2.5, 1e-12));
    REQUIRE(p.reaction.x == 0.0);
    REQUIRE(p.reaction.y == 0.0);
}

TEST_CASE("PinSupport::fill writes the Jacobian into the body's columns", "[pin]") {
    ms::World w;
    w.bodies.push_back(makeBody("a"));
    ms::Body b = makeBody("b");
    b.phi = kPi / 2;
    w.bodies.push_back(b);
    ms::PinSupport p = makePin(1, {0.5, 0.0});  // r = (0, 0.5)
    p.initialize(w);

    std::vector<double> G(2 * 6, 0.0);
    double gamma[2] = {0.0, 0.0};
    p.fill(w, G.data(), 6, gamma);

    const double expected[2][3] = {{1.0, 0.0, -0.5}, {0.0, 1.0, 0.0}};
    for (int row = 0; row < 2; ++row) {
        for (int col = 0; col < 3; ++col) {
            REQUIRE_THAT(G[row * 6 + 0 + col], WithinAbs(0.0, 1e-12));
            REQUIRE_THAT(G[row * 6 + 3 + col], WithinAbs(expected[row][col], 1e-12));
        }
    }
}

TEST_CASE("PinSupport gamma is zero for a body at rest on the support", "[pin]") {
    ms::World w;
    ms::Body b = makeBody("b");
    b.pos = {0.3, 0.1};
    b.phi = 0.4;
    w.bodies.push_back(b);
    ms::PinSupport p = makePin(0, {0.2, -0.1});
    p.initialize(w);
    std::vector<double> G(6, 0.0);
    double gamma[2] = {1.0, 1.0};
    p.fill(w, G.data(), 3, gamma);
    REQUIRE_THAT(gamma[0], WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(gamma[1], WithinAbs(0.0, 1e-12));
}

TEST_CASE("PinSupport gamma of a spinning body is omega^2 r", "[pin]") {
    ms::World w;
    w.solver.baumgarte_alpha = 0.0;
    w.solver.baumgarte_beta = 0.0;
    ms::Body b = makeBody("b");
    b.omega = 2.0;
    w.bodies.push_back(b);
    ms::PinSupport p = makePin(0, {0.5, 0.25});
    p.initialize(w);
    std::vector<double> G(6, 0.0);
    double gamma[2] = {0.0, 0.0};
    p.fill(w, G.data(), 3, gamma);
    REQUIRE_THAT(gamma[0], WithinAbs(4.0 * 0.5, 1e-12));
    REQUIRE_THAT(gamma[1], WithinAbs(4.0 * 0.25, 1e-12));
}

TEST_CASE("PinSupport Baumgarte term pulls a displaced body back", "[pin]") {
    ms::World w;
    w.solver.baumgarte_alpha = 0.0;
    w.solver.baumgarte_beta = 5.0;
    w.bodies.push_back(makeBody("b"));
    ms::PinSupport p = makePin(0, {0.0, 0.0});
    p.initialize(w);
    w.bodies[0].pos.x += 0.01;
    std::vector<double> G(6, 0.0);
    double gamma[2] = {0.0, 0.0};
    p.fill(w, G.data(), 3, gamma);
    REQUIRE_THAT(gamma[0], WithinAbs(-25.0 * 0.01, 1e-12));
    REQUIRE_THAT(gamma[1], WithinAbs(0.0, 1e-12));
}

TEST_CASE("PinSupport multipliers show up in the frame", "[pin]") {
    ms::World w;
    w.bodies.push_back(makeBody("b"));
    ms::PinSupport p = makePin(0, {0.0, 0.0});
    p.initialize(w);
    const double lambda[2] = {3.0, 4.0};
    p.setMultipliers(lambda);
    nlohmann::json out;
    p.writeFrame(w, out);
    REQUIRE(out["reaction"][0].get<double>() == 3.0);
    REQUIRE(out["reaction"][1].get<double>() == 4.0);
    REQUIRE(out["position"].size() == 2);
}

TEST_CASE("makePinSupport reports the id for an unknown body", "[pin]") {
    ms::World w;
    w.bodies.push_back(makeBody("b"));
    nlohmann::json spec = {{"id", "A_bad"}, {"type", "pin_support"}, {"body", "ghost"}, {"point", {0, 0}}};
    REQUIRE_THROWS_WITH(ms::makePinSupport(spec, w), ContainsSubstring("A_bad"));

    spec["body"] = "b";
    auto c = ms::makePinSupport(spec, w);
    REQUIRE(c->dim() == 2);

    spec.erase("point");
    REQUIRE_THROWS_WITH(ms::makePinSupport(spec, w), ContainsSubstring("A_bad"));
}
