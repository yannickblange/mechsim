// test_beam.cpp - v0.4 bendable beams: textbook deflections and frequencies, rigid-body invariance,
// attachments on nodes, frame output and the substeps that keep stiff beams stable.
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "core/material.hpp"
#include "core/section.hpp"
#include "core/world.hpp"
#include "io/scene_loader.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;
using nlohmann::json;

namespace {

const double kL = 2.0;
const double kA = 0.02;                                  // square 20 mm
const double kEI = ms::kYoungModulus * std::pow(kA, 4) / 12.0;  // 2800 N m^2

json beamBody(double angle = 0.0, json extra = json::object()) {
    json b = {{"id", "b"}, {"type", "beam"}, {"position", {0.0, 0.0}}, {"angle", angle},
              {"params", {{"length", kL}, {"section", {{"type", "square"}, {"a", kA}}}}}};
    b.update(extra);
    return b;
}

json scene(json bodies, json elements, json constraints, double gy = 0.0) {
    return {{"version", "0.4"}, {"gravity", {0.0, gy}}, {"solver", {{"dt", 0.001}}},
            {"bodies", bodies}, {"elements", elements}, {"constraints", constraints}};
}

std::unique_ptr<ms::World> load(const json& s) { return ms::loadScene(s.dump()); }

json clamp(const std::string& body, double x) {
    return {{"id", "E"}, {"type", "fixed_support"}, {"body", body}, {"point", {x, 0.0}}, {"params", {{"angle", 0.0}}}};
}

json frameBody(const ms::World& w, const std::string& id) {
    const json frame = w.frame();
    for (const auto& b : frame["bodies"]) {
        if (b["id"] == id) return b;
    }
    return json();
}

double tipY(const ms::World& w) { return w.bodies[w.beams[0].nodes.back()].pos.y; }

}  // namespace

TEST_CASE("a beam becomes hidden nodes, one body in the frame, no element of its own", "[beam]") {
    auto w = load(scene({beamBody()}, json::array(), json::array()));
    REQUIRE(w->beams.size() == 1);
    CHECK(w->beams[0].nodes.size() == 9);  // 8 segments by default
    CHECK(w->bodies.size() == 9);
    CHECK(w->findBody("b") == ms::GROUND);  // only the hidden nodes exist as bodies
    CHECK(w->findBeam("b") == 0);
    CHECK(w->bodies[w->beams[0].centre].pos.x == 0.0);

    const json f = w.get()->frame();
    REQUIRE(f["bodies"].size() == 1);
    CHECK(f["bodies"][0]["id"] == "b");
    CHECK(f["bodies"][0]["nodes"].size() == 9);
    CHECK(f["elements"].size() == 0);
    // total mass = rho A L, distributed over the nodes
    double m = 0;
    for (const auto& body : w->bodies) m += body.mass;
    CHECK_THAT(m, WithinRel(ms::kDensity * kA * kA * kL, 1e-12));
    CHECK_THAT(f["bodies"][0]["EI"].get<double>(), WithinRel(kEI, 1e-12));
}

TEST_CASE("an explicit mass and segment count are respected; odd counts are rounded up to even", "[beam]") {
    auto w = load(scene({beamBody(0.0, {{"params", {{"length", kL}, {"mass", 3.0}, {"segments", 5}, {"section", {{"type", "square"}, {"a", kA}}}}}})},
                        json::array(), json::array()));
    CHECK(w->beams[0].nodes.size() == 7);
    double m = 0;
    for (const auto& body : w->bodies) m += body.mass;
    CHECK_THAT(m, WithinRel(3.0, 1e-12));
}

TEST_CASE("cantilever: tip deflection P L^3 / 3 EI and tip rotation P L^2 / 2 EI", "[beam]") {
    // clamped at the left end, a downward force P at the right end; a damper at the tip lets it settle
    const double P = 10.0;
    json els = json::array({
        {{"id", "F"}, {"type", "load"}, {"body", "b"}, {"point", {kL / 2, 0.0}}, {"params", {{"force", {0.0, -P}}}}},
        {{"id", "c"}, {"type", "damper"}, {"a", {{"body", nullptr}, {"point", {kL / 2, -1.0}}}},
         {"b", {{"body", "b"}, {"point", {kL / 2, 0.0}}}}, {"params", {{"c", 60.0}}}},
    });
    auto w = load(scene({beamBody()}, els, json::array({clamp("b", -kL / 2)})));
    for (int i = 0; i < 10000; ++i) w->step(1e-3);
    const double delta = P * kL * kL * kL / (3.0 * kEI);
    CHECK_THAT(-tipY(*w), WithinRel(delta, 5e-3));
    const double phiTip = w->bodies[w->beams[0].nodes.back()].phi;
    CHECK_THAT(-phiTip, WithinRel(P * kL * kL / (2.0 * kEI), 5e-3));
    // the clamp holds the other end
    CHECK_THAT(w->bodies[w->beams[0].nodes.front()].pos.y, WithinAbs(0.0, 1e-9));
    // the moment at the clamp is P L (hogging: negative), the shear carried is P
    const json f = frameBody(*w, "b");
    CHECK_THAT(f["moments"][0].get<double>(), WithinRel(-P * kL, 2e-2));
    CHECK_THAT(f["moments"].back().get<double>(), WithinAbs(0.0, 0.2));
    // clamp reaction = P upwards and the moment P L
    const json whole = w->frame();
    for (const auto& c : whole["constraints"]) {
        if (c["id"] == "E") {
            CHECK_THAT(c["reaction"][1].get<double>(), WithinRel(P, 2e-2));
            CHECK_THAT(std::abs(c["reaction"][2].get<double>()), WithinRel(P * kL, 2e-2));
        }
    }
}

TEST_CASE("the same cantilever turned by 30 degrees bends exactly as much", "[beam]") {
    const double P = 10.0, ang = 0.5235987755982988;
    const ms::Vec2 n = {-std::sin(ang), std::cos(ang)};  // the beam's "up"
    const ms::Vec2 tip = {std::cos(ang) * kL / 2, std::sin(ang) * kL / 2};
    json els = json::array({
        {{"id", "F"}, {"type", "load"}, {"body", "b"}, {"point", {kL / 2, 0.0}}, {"params", {{"force", {-P * n.x, -P * n.y}}}}},
        {{"id", "c"}, {"type", "damper"},
         {"a", {{"body", nullptr}, {"point", {tip.x - n.x, tip.y - n.y}}}},  // 1 m "below" the tip, along the load
         {"b", {{"body", "b"}, {"point", {kL / 2, 0.0}}}}, {"params", {{"c", 60.0}}}},
    });
    auto w = load(scene({beamBody(ang)}, els, json::array({clamp("b", -kL / 2)})));
    for (int i = 0; i < 10000; ++i) w->step(1e-3);
    const ms::Vec2 d = w->bodies[w->beams[0].nodes.back()].pos - tip;
    const double delta = P * kL * kL * kL / (3.0 * kEI);
    // the tip moves along -n by (almost, the deflection is not small) delta
    CHECK_THAT(-ms::dot(d, n), WithinRel(delta, 2e-2));
    CHECK_THAT(ms::dot(d, {std::cos(ang), std::sin(ang)}), WithinAbs(0.0, 2e-4));  // shortening is second order
}

TEST_CASE("simply supported beam under its own weight: 5 q L^4 / 384 EI at the middle", "[beam]") {
    json cons = json::array({
        {{"id", "A"}, {"type", "pin_support"}, {"body", "b"}, {"point", {-kL / 2, 0.0}}, {"params", {{"angle", 0.0}}}},
        {{"id", "B"}, {"type", "roller_support"}, {"body", "b"}, {"point", {kL / 2, 0.0}}, {"params", {{"angle", 0.0}}}},
    });
    json els = json::array({
        {{"id", "c"}, {"type", "damper"}, {"a", {{"body", nullptr}, {"point", {0.0, -1.0}}}},
         {"b", {{"body", "b"}, {"point", {0.0, 0.0}}}}, {"params", {{"c", 40.0}}}},
    });
    auto w = load(scene({beamBody()}, els, cons, -9.81));
    for (int i = 0; i < 15000; ++i) w->step(1e-3);
    const double q = ms::kDensity * kA * kA * 9.81;
    const double delta = 5.0 * q * std::pow(kL, 4) / (384.0 * kEI);
    CHECK_THAT(-w->bodies[w->beams[0].centre].pos.y, WithinRel(delta, 3e-2));
    // M_max = q L^2 / 8 at the middle
    CHECK_THAT(frameBody(*w, "b")["moments"][4].get<double>(), WithinRel(q * kL * kL / 8.0, 4e-2));
}

TEST_CASE("a beam in free fall stays straight and falls like any mass", "[beam]") {
    auto w = load(scene({beamBody(0.3)}, json::array(), json::array(), -9.81));
    const int sub = w->substepsFor(1e-3);  // a free steel beam is stepped in substeps
    for (int i = 0; i < 500; ++i) w->step(1e-3);
    const double h = 1e-3 / sub, n = 500.0 * sub;
    const double fall = 9.81 * h * h * n * (n + 1.0) / 2.0;  // exact for semi-implicit Euler: g h^2 n (n + 1) / 2
    for (std::size_t i = 0; i < w->beams[0].nodes.size(); ++i) {
        const double x = kL * (static_cast<double>(i) / 8.0 - 0.5);
        CHECK_THAT(w->bodies[w->beams[0].nodes[i]].pos.y, WithinAbs(x * std::sin(0.3) - fall, 1e-9));
    }
    CHECK(frameBody(*w, "b")["stress"].get<double>() < 1.0);  // Pa: no strain appeared
}

TEST_CASE("a rotated beam at rest carries no strain", "[beam]") {
    for (double angle : {0.7, 2.5, -3.0}) {
        auto w = load(scene({beamBody(angle)}, json::array(), json::array()));
        for (int i = 0; i < 100; ++i) w->step(1e-3);
        for (const auto& b : w->bodies) CHECK(ms::length(b.vel) < 1e-9);  // round-off only
        CHECK_THAT(w->potentialEnergy(), WithinAbs(0.0, 1e-12));
    }
}

TEST_CASE("a spinning free beam conserves momentum, angular momentum and energy", "[beam]") {
    json b = beamBody(0.0, {{"omega", 3.0}, {"velocity", {1.0, 0.5}}});
    auto w = load(scene({b}, json::array(), json::array()));
    auto linear = [&] { ms::Vec2 p{0, 0}; for (auto& n : w->bodies) p += n.mass * n.vel; return p; };
    auto angular = [&] {
        double L = 0;
        for (auto& n : w->bodies) L += n.mass * ms::cross(n.pos, n.vel) + n.inertia * n.omega;
        return L;
    };
    const ms::Vec2 p0 = linear();
    const double L0 = angular();
    const double E0 = w->kineticEnergy() + w->potentialEnergy();
    for (int i = 0; i < 3000; ++i) w->step(1e-3);
    CHECK_THAT(linear().x, WithinAbs(p0.x, 1e-9));
    CHECK_THAT(linear().y, WithinAbs(p0.y, 1e-9));
    CHECK_THAT(angular(), WithinRel(L0, 2e-3));
    CHECK_THAT(w->kineticEnergy() + w->potentialEnergy(), WithinRel(E0, 2e-2));
}

TEST_CASE("cantilever with a tip mass vibrates at sqrt(3 EI / L^3 (M + 33/140 m))", "[beam]") {
    const double Mtip = 5.0;
    json tipBlock = {{"id", "w"}, {"type", "block"}, {"position", {kL / 2, 0.0}}, {"params", {{"mass", Mtip}, {"width", 0.1}, {"height", 0.1}}}};
    json cons = json::array({
        clamp("b", -kL / 2),
        {{"id", "J"}, {"type", "fixed_joint"}, {"a", {{"body", "b"}, {"point", {kL / 2, 0.0}}}}, {"b", {{"body", "w"}, {"point", {0.0, 0.0}}}}},
    });
    json els = json::array({{{"id", "F"}, {"type", "load"}, {"body", "w"}, {"point", {0.0, 0.0}},
                             {"params", {{"force", {0.0, -3.0}}, {"mode", "impulse"}}}}});
    auto w = load(scene({beamBody(), tipBlock}, els, cons));
    // ascending zero crossings of the tip height give the period
    std::vector<double> crossings;
    double prev = w->bodies[w->findBody("w")].pos.y;
    for (int i = 0; i < 8000; ++i) {
        w->step(1e-3);
        const double y = w->bodies[w->findBody("w")].pos.y;
        if (prev < 0.0 && y >= 0.0) crossings.push_back(w->time - 1e-3 * y / (y - prev));
        prev = y;
    }
    REQUIRE(crossings.size() >= 8);
    const double period = (crossings.back() - crossings.front()) / static_cast<double>(crossings.size() - 1);
    const double mBeam = ms::kDensity * kA * kA * kL;
    const double omega = std::sqrt(3.0 * kEI / (kL * kL * kL * (Mtip + 33.0 / 140.0 * mBeam)));
    CHECK_THAT(period, WithinRel(2.0 * M_PI / omega, 0.03));
}

TEST_CASE("attachments get nodes of their own or snap onto a nearby one", "[beam]") {
    // a spring end at x = 0.31 (between nodes 0.25 apart: 0.5 and 0.75 are the grid) gets a node;
    // one at x = 0.51 snaps to the node at 0.5 and keeps a lever of 0.01
    json els = json::array({
        {{"id", "k1"}, {"type", "spring"}, {"a", {{"body", nullptr}, {"point", {0.31, 1.0}}}},
         {"b", {{"body", "b"}, {"point", {0.31, 0.05}}}}, {"params", {{"k", 100.0}}}},
        {{"id", "k2"}, {"type", "spring"}, {"a", {{"body", nullptr}, {"point", {0.51, 1.0}}}},
         {"b", {{"body", "b"}, {"point", {0.51, 0.0}}}}, {"params", {{"k", 100.0}}}},
    });
    auto w = load(scene({beamBody()}, els, json::array()));
    CHECK(w->beams[0].nodes.size() == 10);  // 9 + the one at 0.31
    bool found = false;
    for (int k : w->beams[0].nodes) found = found || std::abs(w->bodies[k].pos.x - 0.31) < 1e-12;
    CHECK(found);
    // the end of k2 is where it was specified
    const json frame = w->frame();
    for (const auto& e : frame["elements"]) {
        if (e["id"] == "k1") CHECK_THAT(e["p2"][1].get<double>(), WithinAbs(0.05, 1e-12));
        if (e["id"] == "k2") CHECK_THAT(e["p2"][0].get<double>(), WithinAbs(0.51, 1e-12));
    }
}

TEST_CASE("an attachment outside the beam is refused by naming the beam", "[beam]") {
    json els = json::array({{{"id", "F"}, {"type", "load"}, {"body", "b"}, {"point", {1.5, 0.0}}, {"params", {{"force", {0.0, -1.0}}}}}});
    CHECK_THROWS_WITH(load(scene({beamBody()}, els, json::array())), ContainsSubstring("beam 'b'") && ContainsSubstring("outside"));
    CHECK_THROWS_WITH(load(scene({beamBody(0.0, {{"params", {{"length", 1.0}, {"segments", 1}, {"section", {{"type", "square"}, {"a", 0.01}}}}}})}, json::array(), json::array())),
                      ContainsSubstring("segments"));
    CHECK_THROWS_WITH(load(scene({beamBody(0.0, {{"params", {{"length", 1.0}}}})}, json::array(), json::array())), ContainsSubstring("section"));
}

TEST_CASE("steel is stiff: the engine splits a step so the scheme stays stable", "[beam][substeps]") {
    // L = 1 m, 50 mm square: 8 segments of 125 mm, the highest frequency is some 10^4 rad/s
    json b = beamBody(0.0, {{"params", {{"length", 1.0}, {"section", {{"type", "square"}, {"a", 0.05}}}}}});
    json els = json::array({{{"id", "F"}, {"type", "load"}, {"body", "b"}, {"point", {0.5, 0.0}},
                             {"params", {{"force", {0.0, -2000.0}}}}}});  // static deflection 2000 / (3 EI / L^3) = 6.1 mm
    auto w = load(scene({b}, els, json::array({clamp("b", -0.5)})));
    CHECK(w->maxOmega() > 5000.0);
    CHECK(w->substepsFor(1e-3) > 10);
    CHECK(w->substepsFor(1e-3) == w->substepsFor(1e-3));
    const double E0 = w->kineticEnergy() + w->potentialEnergy();
    double peak = 0.0;
    for (int i = 0; i < 4000; ++i) {
        w->step(1e-3);
        peak = std::max(peak, std::abs(tipY(*w)));
        REQUIRE(std::isfinite(tipY(*w)));
    }
    CHECK(peak < 0.0125);  // undamped: it swings to twice the static deflection (12 mm), not further
    // the energy scale is F * delta = 12 J: it stays within 1 % of that
    CHECK_THAT(w->kineticEnergy() + w->potentialEnergy(), WithinAbs(E0, 0.12));
    CHECK_THAT(w->time, WithinAbs(4.0, 1e-6));
}

TEST_CASE("a soft system does not use substeps", "[substeps]") {
    json b = {{"id", "m"}, {"type", "block"}, {"position", {0.0, 0.0}}, {"params", {{"mass", 1.0}, {"width", 0.2}, {"height", 0.2}}}};
    json k = {{"id", "k"}, {"type", "spring"}, {"a", {{"body", nullptr}, {"point", {0.0, 1.0}}}}, {"b", {{"body", "m"}, {"point", {0.0, 0.0}}}}, {"params", {{"k", 100.0}}}};
    auto w = load(scene({b}, json::array({k}), json::array(), -9.81));
    CHECK_THAT(w->maxOmega(), WithinRel(1.15 * 10.0, 0.02));  // sqrt(k / m)
    CHECK(w->substepsFor(1e-3) == 1);
    // ... and a very stiff spring gets some
    k["params"]["k"] = 4.0e6;
    auto stiff = load(scene({b}, json::array({k}), json::array(), -9.81));
    CHECK(stiff->substepsFor(1e-3) >= 5);
    for (int i = 0; i < 3000; ++i) stiff->step(1e-3);
    CHECK(std::abs(stiff->bodies[0].pos.y) < 1.0);
}
