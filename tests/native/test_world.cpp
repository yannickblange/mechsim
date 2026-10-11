// test_world.cpp - TICKET A3.
#include <cmath>
#include <memory>
#include <stdexcept>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "core/world.hpp"

using Catch::Matchers::WithinAbs;

namespace {

const double kPi = std::acos(-1.0);

class FakeElement : public ms::Element {
public:
    const char* type() const override { return "fake"; }
    void applyForces(ms::World&, double) override {}
    double potentialEnergy(const ms::World&) const override { return 1.5; }
    void writeFrame(const ms::World&, nlohmann::json& out) const override {
        out["p1"] = {0, 0};
        out["p2"] = {0, 0};
        out["force"] = 0.0;
    }
};

class FakeConstraint : public ms::Constraint {
public:
    explicit FakeConstraint(int dim) : dim_(dim) {}
    int initCalls = 0;
    const char* type() const override { return "fake_constraint"; }
    int dim() const override { return dim_; }
    void initialize(const ms::World&) override { ++initCalls; }
    void fill(const ms::World&, double*, int, double*) const override {}
    void setMultipliers(const double*) override {}
    void writeFrame(const ms::World&, nlohmann::json& out) const override {
        out["position"] = {0, 0};
        out["reaction"] = {0, 0};
    }

private:
    int dim_;
};

ms::Body makeBody(const char* id, double mass = 1.0) {
    ms::Body b;
    b.id = id;
    b.mass = mass;
    return b;
}

}  // namespace

TEST_CASE("World::findBody", "[world]") {
    ms::World w;
    w.bodies.push_back(makeBody("a"));
    w.bodies.push_back(makeBody("b"));
    REQUIRE(w.findBody("a") == 0);
    REQUIRE(w.findBody("b") == 1);
    REQUIRE(w.findBody("nope") == ms::GROUND);
}

TEST_CASE("World::anchorWorld", "[world]") {
    ms::World w;
    ms::Body b = makeBody("a");
    b.pos = {1.0, 0.0};
    b.phi = kPi / 2;
    w.bodies.push_back(b);

    ms::Vec2 g = w.anchorWorld({ms::GROUND, {2.0, 3.0}});
    REQUIRE_THAT(g.x, WithinAbs(2.0, 1e-12));
    REQUIRE_THAT(g.y, WithinAbs(3.0, 1e-12));

    ms::Vec2 p = w.anchorWorld({0, {1.0, 0.0}});
    REQUIRE_THAT(p.x, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(p.y, WithinAbs(1.0, 1e-12));
}

TEST_CASE("World::anchorVelocity", "[world]") {
    ms::World w;
    ms::Body b = makeBody("a");
    b.vel = {0.5, -0.25};
    b.omega = 3.0;
    b.phi = 0.7;
    w.bodies.push_back(b);

    ms::Vec2 g = w.anchorVelocity({ms::GROUND, {2.0, 3.0}});
    REQUIRE_THAT(g.x, WithinAbs(0.0, 1e-12));
    REQUIRE_THAT(g.y, WithinAbs(0.0, 1e-12));

    ms::Vec2 v = w.anchorVelocity({0, {0.4, 0.1}});
    ms::Vec2 expected = w.bodies[0].velocityAt({0.4, 0.1});
    REQUIRE_THAT(v.x, WithinAbs(expected.x, 1e-12));
    REQUIRE_THAT(v.y, WithinAbs(expected.y, 1e-12));
}

TEST_CASE("World::constraintRows sums the dimensions", "[world]") {
    ms::World w;
    w.constraints.push_back(std::make_unique<FakeConstraint>(2));
    w.constraints.push_back(std::make_unique<FakeConstraint>(3));
    REQUIRE(w.constraintRows() == 5);
}

TEST_CASE("World::reset restores the initial state", "[world]") {
    ms::World w;
    ms::Body b = makeBody("a");
    b.pos = {1.0, 2.0};
    b.phi = 0.3;
    b.vel = {0.1, 0.2};
    b.omega = 0.4;
    w.bodies.push_back(b);
    auto fc = std::make_unique<FakeConstraint>(2);
    FakeConstraint* fcp = fc.get();
    w.constraints.push_back(std::move(fc));

    w.initialize();
    w.bodies[0].pos = {9.0, 9.0};
    w.bodies[0].phi = 9.0;
    w.bodies[0].vel = {9.0, 9.0};
    w.bodies[0].omega = 9.0;
    w.time = 4.2;
    w.reset();

    REQUIRE_THAT(w.bodies[0].pos.x, WithinAbs(1.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].pos.y, WithinAbs(2.0, 1e-12));
    REQUIRE_THAT(w.bodies[0].phi, WithinAbs(0.3, 1e-12));
    REQUIRE_THAT(w.bodies[0].vel.x, WithinAbs(0.1, 1e-12));
    REQUIRE_THAT(w.bodies[0].vel.y, WithinAbs(0.2, 1e-12));
    REQUIRE_THAT(w.bodies[0].omega, WithinAbs(0.4, 1e-12));
    REQUIRE(w.time == 0.0);
    REQUIRE(fcp->initCalls == 2);
}

TEST_CASE("World::potentialEnergy adds gravity and elements", "[world]") {
    ms::World w;
    w.gravity = {0.0, -9.81};
    ms::Body b = makeBody("a", 2.0);
    b.pos = {0.0, 3.0};
    w.bodies.push_back(b);
    w.elements.push_back(std::make_unique<FakeElement>());
    REQUIRE_THAT(w.potentialEnergy(), WithinAbs(2.0 * 9.81 * 3.0 + 1.5, 1e-12));
}

TEST_CASE("World::frame has the contract structure", "[world]") {
    ms::World w;
    w.bodies.push_back(makeBody("a"));
    w.bodies.push_back(makeBody("b"));
    w.elements.push_back(std::make_unique<FakeElement>());
    w.constraints.push_back(std::make_unique<FakeConstraint>(2));
    w.elements[0]->id = "e1";
    w.constraints[0]->id = "c1";

    nlohmann::json f = w.frame();
    for (const char* key : {"t", "bodies", "elements", "constraints", "energy"}) {
        REQUIRE(f.contains(key));
    }
    REQUIRE(f["bodies"].size() == 2);
    REQUIRE(f["elements"].size() == 1);
    REQUIRE(f["constraints"].size() == 1);
    REQUIRE(f["elements"][0]["type"] == "fake");
    REQUIRE(f["elements"][0]["id"] == "e1");
    REQUIRE(f["constraints"][0]["type"] == "fake_constraint");
    REQUIRE(f["energy"].contains("kinetic"));
    REQUIRE(f["energy"].contains("potential"));
}

TEST_CASE("World::frame emits arrays when empty", "[world]") {
    ms::World w;
    nlohmann::json f = w.frame();
    REQUIRE(f["bodies"].is_array());
    REQUIRE(f["elements"].is_array());
    REQUIRE(f["constraints"].is_array());
}

TEST_CASE("World::step rejects unknown integrators", "[world]") {
    ms::World w;
    w.solver.integrator = "rk99";
    REQUIRE_THROWS_AS(w.step(0.001), std::runtime_error);
}
