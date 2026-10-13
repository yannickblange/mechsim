// test_joint.cpp - v0.3 pin_joint (Gelenk), fixed_joint, and the free-space Festlager.
#include <cmath>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "bodies/block.hpp"
#include "constraints/fixed_support.hpp"
#include "constraints/ground_pin.hpp"
#include "constraints/joint.hpp"
#include "constraints/link.hpp"
#include "constraints/pin_support.hpp"
#include "core/world.hpp"
#include "elements/load.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;
using nlohmann::json;

namespace {

ms::Body bar(const char* id, ms::Vec2 pos, double mass = 1.0, double w = 0.1, double h = 1.0) {
    ms::Body b;
    b.id = id;
    b.pos = pos;
    ms::initBlock(b, {{"mass", mass}, {"width", w}, {"height", h}});
    return b;
}

json joint(const char* type, const char* a, ms::Vec2 pa, const char* b, ms::Vec2 pb) {
    return {{"id", "J1"}, {"type", type},
            {"a", {{"body", a}, {"point", {pa.x, pa.y}}}}, {"b", {{"body", b}, {"point", {pb.x, pb.y}}}}};
}

// Double pendulum: bar "u" pinned at the origin (Festlager on its top end), bar "l" hinged to its
// lower end. Both are 1 m bars of 1 kg.
ms::World doublePendulum(double phi1, double phi2) {
    ms::World w;
    ms::Body u = bar("u", {0, 0});
    u.phi = phi1;
    u.pos = ms::rotate({0.0, -0.5}, phi1);
    ms::Body l = bar("l", {0, 0});
    l.phi = phi2;
    const ms::Vec2 hinge = u.toWorld({0.0, -0.5});
    l.pos = hinge + ms::rotate({0.0, -0.5}, phi2);
    w.bodies.push_back(u);
    w.bodies.push_back(l);
    w.constraints.push_back(ms::makePinSupport({{"id", "A"}, {"body", "u"}, {"point", {0.0, 0.5}}}, w));
    w.constraints.push_back(ms::makePinJoint(joint("pin_joint", "u", {0, -0.5}, "l", {0, 0.5}), w));
    w.initialize();
    return w;
}

double energy(const ms::World& w) { return w.kineticEnergy() + w.potentialEnergy(); }

}  // namespace

TEST_CASE("pin joint: a double pendulum keeps its joint closed and conserves energy", "[joint]") {
    ms::World w = doublePendulum(0.8, -0.4);
    REQUIRE(w.constraints[1]->dim() == 2);
    const double e0 = energy(w);
    double maxGap = 0.0, maxE = 0.0, peakKinetic = 0.0;
    for (int i = 0; i < 3000; ++i) {
        w.step(5e-4);
        const ms::Vec2 pu = w.bodies[0].toWorld({0, -0.5});
        const ms::Vec2 pl = w.bodies[1].toWorld({0, 0.5});
        maxGap = std::max(maxGap, ms::length(pu - pl));
        maxE = std::max(maxE, std::abs(energy(w) - e0));
        peakKinetic = std::max(peakKinetic, w.kineticEnergy());
    }
    REQUIRE(maxGap < 2e-3);
    REQUIRE(maxE / peakKinetic < 0.02);
    // the bodies really rotate against each other
    REQUIRE(std::abs(w.bodies[0].phi - w.bodies[1].phi) > 0.05);
}

TEST_CASE("pin joint: the reaction on a is minus the weight carried by b", "[joint]") {
    // a is clamped, b hangs from a's lower end: the joint carries b's weight.
    ms::World w;
    w.bodies.push_back(bar("a", {0.0, 0.0}, 2.0));
    w.bodies.push_back(bar("b", {0.0, -1.0}, 3.0));
    w.constraints.push_back(ms::makeFixedSupport({{"id", "E"}, {"body", "a"}, {"point", {0.0, 0.0}}}, w));
    w.constraints.push_back(ms::makePinJoint(joint("pin_joint", "a", {0, -0.5}, "b", {0, 0.5}), w));
    w.initialize();
    for (int i = 0; i < 500; ++i) w.step(1e-3);
    const auto r = w.frame()["constraints"][1]["reaction"];
    REQUIRE_THAT(r[0].get<double>(), WithinAbs(0.0, 1e-6));
    REQUIRE_THAT(r[1].get<double>(), WithinAbs(-3.0 * 9.81, 1e-6));
    REQUIRE_THAT(w.frame()["constraints"][1]["position"][1].get<double>(), WithinAbs(-0.5, 1e-9));
}

TEST_CASE("fixed joint: two bars move as one rigid body", "[joint]") {
    ms::World w;
    w.gravity = {0.0, 0.0};
    w.bodies.push_back(bar("a", {0.0, 0.0}, 1.0, 1.0, 0.1));
    w.bodies.push_back(bar("b", {1.0, 0.0}, 1.0, 1.0, 0.1));
    w.bodies[0].vel = {0.5, 0.2};
    w.bodies[0].omega = 1.0;
    w.bodies[1].vel = {0.5, 1.2};  // rigid rotation: v_b = v_a + omega x (1, 0)
    w.bodies[1].omega = 1.0;
    w.constraints.push_back(ms::makeFixedJoint(joint("fixed_joint", "a", {0.5, 0}, "b", {-0.5, 0}), w));
    w.initialize();
    REQUIRE(w.constraints[0]->dim() == 3);
    for (int i = 0; i < 2000; ++i) w.step(5e-4);
    REQUIRE_THAT(w.bodies[0].phi - w.bodies[1].phi, WithinAbs(0.0, 1e-3));
    const ms::Vec2 pa = w.bodies[0].toWorld({0.5, 0});
    const ms::Vec2 pb = w.bodies[1].toWorld({-0.5, 0});
    REQUIRE(ms::length(pa - pb) < 2e-3);
    // a rigid pair: omega is shared
    REQUIRE_THAT(w.bodies[0].omega, WithinAbs(w.bodies[1].omega, 1e-3));
    REQUIRE(w.frame()["constraints"][0]["reaction"].size() == 3);
}

TEST_CASE("a pin joint lets the bodies rotate against each other, a fixed joint does not", "[joint]") {
    for (bool fixed : {false, true}) {
        ms::World w;
        w.gravity = {0.0, 0.0};
        w.bodies.push_back(bar("a", {0.0, 0.0}, 1.0, 1.0, 0.1));
        w.bodies.push_back(bar("b", {1.0, 0.0}, 1.0, 1.0, 0.1));
        w.constraints.push_back(fixed
            ? ms::makeFixedJoint(joint("fixed_joint", "a", {0.5, 0}, "b", {-0.5, 0}), w)
            : ms::makePinJoint(joint("pin_joint", "a", {0.5, 0}, "b", {-0.5, 0}), w));
        // a moment on b only
        w.elements.push_back(ms::makeLoad({{"id", "M"}, {"body", "b"}, {"point", {0, 0}}, {"params", {{"moment", 1.0}}}}, w));
        w.initialize();
        for (int i = 0; i < 300; ++i) w.step(1e-3);
        const double rel = std::abs(w.bodies[0].phi - w.bodies[1].phi);
        INFO((fixed ? "fixed" : "pin"));
        if (fixed) {
            REQUIRE(rel < 1e-3);
        } else {
            REQUIRE(rel > 0.2);
        }
    }
}

TEST_CASE("joint factories validate their input", "[joint]") {
    ms::World w;
    w.bodies.push_back(bar("a", {0, 0}));
    w.bodies.push_back(bar("b", {1, 0}));
    json same = joint("pin_joint", "a", {0, 0}, "a", {0.1, 0});
    REQUIRE_THROWS_WITH(ms::makePinJoint(same, w), ContainsSubstring("two different masses"));
    json ghost = joint("pin_joint", "a", {0, 0}, "ghost", {0, 0});
    REQUIRE_THROWS_WITH(ms::makePinJoint(ghost, w), ContainsSubstring("unknown body 'ghost'"));
    json toGround = {{"id", "J1"}, {"a", {{"body", "a"}, {"point", {0, 0}}}}, {"b", {{"body", nullptr}, {"point", {0, 0}}}}};
    REQUIRE_THROWS_WITH(ms::makePinJoint(toGround, w), ContainsSubstring("both ends must be on masses"));
    REQUIRE_THROWS_WITH(ms::makePinJoint({{"id", "J2"}}, w), ContainsSubstring("J2"));
}

TEST_CASE("free-space Festlager: no constraint, reports its point, rod hangs from it", "[pin][ground]") {
    ms::World w;
    w.bodies.push_back(bar("m", {0.3, -0.9}));
    // body: null routes to the ground pin
    auto pin = ms::makePinSupport({{"id", "P"}, {"type", "pin_support"}, {"body", nullptr}, {"point", {1.0, 2.0}}}, w);
    REQUIRE(std::string(pin->type()) == "pin_support");
    REQUIRE(pin->dim() == 0);
    w.constraints.push_back(std::move(pin));
    w.constraints.push_back(ms::makeRod({{"id", "R"}, {"type", "rod"},
                                         {"a", {{"body", nullptr}, {"point", {1.0, 2.0}}}},
                                         {"b", {{"body", "m"}, {"point", {0, 0.5}}}}, {"params", {{"hinged_b", true}}}}, w));
    w.initialize();
    REQUIRE(w.constraintRows() == 1);
    for (int i = 0; i < 500; ++i) w.step(1e-3);
    const auto frame = w.frame();
    REQUIRE_THAT(frame["constraints"][0]["position"][0].get<double>(), WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(frame["constraints"][0]["position"][1].get<double>(), WithinAbs(2.0, 1e-12));
    REQUIRE(frame["constraints"][0]["reaction"].size() == 2);
    const ms::Vec2 top = w.bodies[0].toWorld({0, 0.5});
    REQUIRE_THAT(ms::length(top - ms::Vec2{1.0, 2.0}), WithinAbs(ms::length(ms::Vec2{0.3, -0.4} - ms::Vec2{1.0, 2.0}), 1e-3));
    REQUIRE_THROWS_WITH(ms::makeGroundPin({{"id", "P2"}, {"point", {1.0}}}, w), ContainsSubstring("P2"));
}
