// test_bar.cpp - v0.4 elastic Stab (bar), node body (Knoten) and the harmonic load.
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "core/material.hpp"
#include "core/world.hpp"
#include "io/scene_loader.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;
using nlohmann::json;

namespace {

json sceneOf(json bodies, json elements, json constraints, double gy = -9.81) {
    return {{"version", "0.4"}, {"gravity", {0.0, gy}}, {"solver", {{"dt", 0.001}}},
            {"bodies", bodies}, {"elements", elements}, {"constraints", constraints}};
}

json node(const char* id, double x, double y, double mass = 1.0) {
    return {{"id", id}, {"type", "node"}, {"position", {x, y}}, {"params", {{"mass", mass}}}};
}

json ground(double x, double y) { return {{"body", nullptr}, {"point", {x, y}}}; }
json at(const char* id, double x = 0.0, double y = 0.0) { return {{"body", id}, {"point", {x, y}}}; }

// segments = 1: the pure axial bar of v0.4 (massless, no bending, cannot buckle)
json squareBar(const char* id, json a, json b, double side = 0.01, json extra = {{"segments", 1}}) {
    json params = {{"section", {{"type", "square"}, {"a", side}}}};
    params.update(extra);
    return {{"id", id}, {"type", "bar"}, {"a", a}, {"b", b}, {"params", params}};
}

json frameElement(const ms::World& w, const std::string& id) {
    const json f = w.frame();
    for (const auto& e : f["elements"]) {
        if (e["id"] == id) return e;
    }
    return json();
}

std::unique_ptr<ms::World> load(const json& s) { return ms::loadScene(s.dump()); }

}  // namespace

TEST_CASE("a node is a point mass: a pendulum on a Stab swings like a simple pendulum", "[node]") {
    const double L = 1.0, theta0 = 0.05;
    json rod = {{"id", "S"}, {"type", "rod"}, {"a", ground(0, 0)}, {"b", at("N")}, {"params", json::object()}};
    auto w = load(sceneOf({node("N", L * std::sin(theta0), -L * std::cos(theta0))}, json::array(), json::array({rod})));
    CHECK(w->bodies[0].type == "node");
    // period of a mass on a massless rod: 2 pi sqrt(L / g); measured over the zero crossings of x
    double prev = w->bodies[0].pos.x;
    std::vector<double> crossings;
    for (int i = 0; i < 12000; ++i) {
        w->step(1e-3);
        const double x = w->bodies[0].pos.x;
        if (prev > 0.0 && x <= 0.0) crossings.push_back(w->time - 1e-3 * x / (x - prev));
        prev = x;
    }
    REQUIRE(crossings.size() >= 4);
    const double T = (crossings.back() - crossings.front()) / static_cast<double>(crossings.size() - 1);
    CHECK_THAT(T, WithinRel(2.0 * 3.14159265358979 * std::sqrt(L / 9.81), 3e-3));
}

TEST_CASE("a node needs a mass > 0", "[node]") {
    json bad = {{"id", "N"}, {"type", "node"}, {"position", {0.0, 0.0}}, {"params", json::object()}};
    CHECK_THROWS_WITH(load(sceneOf({bad}, json::array(), json::array())), ContainsSubstring("mass"));
}

TEST_CASE("bar with one segment: starts unstressed, stiffness E A / L, the frame reports the stress", "[bar]") {
    // a 100 kg mass hangs on a 2 m long steel bar, 10 x 10 mm: k = E A / L = 2.1e7 N / 2 m = 1.05e7 N/m
    const double A = 1e-4, L = 2.0, m = 100.0;
    auto w = load(sceneOf({node("N", 0.0, -L, m)}, json::array({squareBar("B", ground(0, 0), at("N"))}), json::array()));
    CHECK_THAT(frameElement(*w, "B")["force"].get<double>(), WithinAbs(0.0, 1e-12));
    CHECK(frameElement(*w, "B")["type"] == "bar");

    // it oscillates about the static extension m g / k with omega = sqrt(k / m): the mean force is m g
    const double k = ms::kYoungModulus * A / L;
    double sum = 0.0;
    const int n = 4000;
    for (int i = 0; i < n; ++i) {
        w->step(1e-3);
        sum += frameElement(*w, "B")["force"].get<double>();
    }
    CHECK_THAT(sum / n, WithinRel(m * 9.81, 1e-2));
    const json e = frameElement(*w, "B");
    CHECK_THAT(e["stress"].get<double>(), WithinRel(e["force"].get<double>() / A, 1e-12));
    // the extension at the turning point is twice the static one
    double maxExt = 0.0;
    for (int i = 0; i < 100; ++i) {
        w->step(1e-3);
        maxExt = std::max(maxExt, -(w->bodies[0].pos.y) - L);
    }
    CHECK_THAT(maxExt, WithinRel(2.0 * m * 9.81 / k, 5e-2));
}

TEST_CASE("bars with one segment: a statically indeterminate set of three has a unique solution", "[bar]") {
    // a node at the origin carries a vertical load P; three bars to the ceiling at 0 and +-30 degrees from vertical
    const double P = 3000.0, H = 1.0, ang = 3.14159265358979 / 6.0;
    auto w = load(sceneOf(
        {node("N", 0.0, 0.0, 0.5)},
        json::array({squareBar("B0", ground(0, H), at("N")),
                     squareBar("B1", ground(H * std::tan(ang), H), at("N")),
                     squareBar("B2", ground(-H * std::tan(ang), H), at("N")),
                     {{"id", "F"}, {"type", "load"}, {"body", "N"}, {"point", {0.0, 0.0}}, {"params", {{"force", {0.0, -P}}}}},
                     {{"id", "c"}, {"type", "damper"}, {"a", ground(0, -1)}, {"b", at("N")}, {"params", {{"c", 3000.0}}}}}),
        json::array(), 0.0));
    for (int i = 0; i < 6000; ++i) w->step(1e-3);
    // equal EA, lengths H and H / cos(a): force ratio  N1 / N0 = cos^2(a) * ... = (L0 / L1) cos(a) = cos^2(a)
    const double N0 = frameElement(*w, "B0")["force"].get<double>();
    const double N1 = frameElement(*w, "B1")["force"].get<double>();
    const double N2 = frameElement(*w, "B2")["force"].get<double>();
    CHECK_THAT(N1, WithinRel(N2, 1e-6));
    CHECK_THAT(N1 / N0, WithinRel(std::cos(ang) * std::cos(ang), 1e-3));
    // equilibrium of the node: N0 + 2 N1 cos(a) = P
    CHECK_THAT(N0 + 2.0 * N1 * std::cos(ang), WithinRel(P, 1e-3));
}

TEST_CASE("bar: input checks", "[bar]") {
    auto scene = [](json bar) { return sceneOf({node("N", 0.0, -1.0)}, json::array({bar}), json::array()); };
    CHECK_THROWS_WITH(load(scene(squareBar("B", ground(0, 0), ground(1, 0)))), ContainsSubstring("bar 'B'"));
    CHECK_THROWS_WITH(load(scene(squareBar("B", at("N"), at("N", 0.0, 0.0)))), ContainsSubstring("same mass"));
    json noSection = squareBar("B", ground(0, 0), at("N"));
    noSection["params"] = json::object();
    CHECK_THROWS_WITH(load(scene(noSection)), ContainsSubstring("bar 'B'"));
    json badSection = squareBar("B", ground(0, 0), at("N"));
    badSection["params"]["section"] = {{"type", "I"}, {"b", 0.1}, {"h", 0.02}, {"tf", 0.02}, {"tw", 0.01}};
    CHECK_THROWS_WITH(load(scene(badSection)), ContainsSubstring("bar 'B'") && ContainsSubstring("flanges"));
}

TEST_CASE("harmonic load: force(t) = F sin(2 pi f t + phase)", "[load][harmonic]") {
    json b = {{"id", "m"}, {"type", "block"}, {"position", {0.0, 0.0}}, {"params", {{"mass", 2.0}, {"width", 0.2}, {"height", 0.2}}}};
    json F = {{"id", "F"}, {"type", "load"}, {"body", "m"}, {"point", {0.0, 0.0}},
              {"params", {{"force", {4.0, 0.0}}, {"mode", "harmonic"}, {"frequency", 0.5}, {"phase", 0.0}}}};
    auto w = load(sceneOf({b}, json::array({F}), json::array(), 0.0));
    CHECK(frameElement(*w, "F")["mode"] == "harmonic");
    CHECK_THAT(frameElement(*w, "F")["force"].get<double>(), WithinAbs(4.0, 1e-12));  // the amplitude
    for (int i = 0; i < 500; ++i) w->step(1e-3);                                      // t = 0.5 s: a quarter period
    CHECK_THAT(frameElement(*w, "F")["vector"][0].get<double>(), WithinAbs(4.0 * std::sin(2.0 * 3.14159265358979 * 0.5 * 0.5), 1e-9));
    // v(t) = F / (m 2 pi f) (1 - cos(2 pi f t)); at t = 0.5 s that is 4 / (2 * 2 pi * 0.5) = 0.6366 m/s
    CHECK_THAT(w->bodies[0].vel.x, WithinAbs(4.0 / (2.0 * 2.0 * 3.14159265358979 * 0.5), 3e-3));
    // v(t) = F / (m 2 pi f) (1 - cos(2 pi f t)) is back to zero after a full period (t = 2 s): no net work
    for (int i = 0; i < 1500; ++i) w->step(1e-3);
    CHECK_THAT(w->bodies[0].vel.x, WithinAbs(0.0, 4e-3));
}

TEST_CASE("harmonic load: a phase shifts it, the moment follows, a frequency is required", "[load][harmonic]") {
    json b = {{"id", "m"}, {"type", "block"}, {"position", {0.0, 0.0}}, {"params", {{"mass", 2.0}, {"width", 0.2}, {"height", 0.2}}}};
    auto make = [&](json params) {
        return json{{"id", "F"}, {"type", "load"}, {"body", "m"}, {"point", {0.0, 0.0}}, {"params", params}};
    };
    auto w = load(sceneOf({b}, json::array({make({{"force", {0.0, 2.0}}, {"moment", 1.0}, {"mode", "harmonic"}, {"frequency", 1.0}, {"phase", 3.14159265358979 / 2.0}})}),
                          json::array(), 0.0));
    const json e = frameElement(*w, "F");  // sin(pi/2) = 1 at t = 0
    CHECK_THAT(e["vector"][1].get<double>(), WithinAbs(2.0, 1e-12));
    CHECK_THAT(e["moment"].get<double>(), WithinAbs(1.0, 1e-12));
    CHECK_THROWS_WITH(load(sceneOf({b}, json::array({make({{"force", {0.0, 2.0}}, {"mode", "harmonic"}})}), json::array())), ContainsSubstring("frequency"));
    CHECK_THROWS_WITH(load(sceneOf({b}, json::array({make({{"mode", "sine"}})}), json::array())), ContainsSubstring("harmonic"));
}

// --- v0.4b: bending, buckling, own weight, damping of elastic Stabs -----------------------------------------

namespace {

const double kPi = 3.14159265358979;
const double kE = ms::kYoungModulus;

// A pinned column of length L (a 20 mm square steel strip): the ground at its foot, a node at its top that
// slides only vertically (a Loslager on a vertical wall) and carries the load P downwards;
// damping 8 / s lets everything settle. `extra` are bar parameters (segments, imperfection ...).
json column(double L, double P, json extra = json::object()) {
    json bar = {{"id", "B"}, {"type", "bar"}, {"a", ground(0, 0)}, {"b", at("N")},
                {"params", {{"section", {{"type", "square"}, {"a", 0.02}}}}}};
    bar["params"]["damping"] = 8.0;
    bar["params"].update(extra);
    json top = node("N", 0.0, L, 1.0);
    top["params"]["damping"] = 8.0;  // the node (and the bar's nodes, below) settle with e^(-4 t)
    json wall = {{"id", "W"}, {"type", "roller_support"}, {"body", "N"}, {"point", {0.0, 0.0}}, {"surface", nullptr},
                 {"params", {{"angle", kPi / 2.0}}}};  // locks x, slides along y
    json load = {{"id", "F"}, {"type", "load"}, {"body", "N"}, {"point", {0.0, 0.0}}, {"params", {{"force", {0.0, -P}}}}};
    return sceneOf({top}, json::array({bar, load}), json::array({wall}), 0.0);
}

// largest lateral deflection of the column (hidden nodes show in the frame's "nodes")
double deflection(const ms::World& w) {
    const json e = frameElement(w, "B");
    double d = 0;
    for (const auto& n : e["nodes"]) d = std::max(d, std::abs(n[0].get<double>()));
    return d;
}

}  // namespace

TEST_CASE("an elastic Stab has hidden nodes, a mass of its own and reports its Euler load", "[bar][buckling]") {
    const double L = 2.0, I = std::pow(0.02, 4) / 12.0;
    auto w = load(column(L, 0.0));
    CHECK(w->bodies.size() == 4);  // the top node and three internal nodes
    CHECK(w->sceneBodies().size() == 1);  // only the node is a body of the scene
    double m = 0;
    for (const auto& b : w->bodies) m += b.mass;
    // the top node plus the internal nodes (3 of 4 segments' worth of the bar's mass); the end halves hang as weight
    CHECK_THAT(m, WithinRel(1.0 + 0.75 * ms::kDensity * 4e-4 * L, 1e-12));
    const json e = frameElement(*w, "B");
    CHECK(e["type"] == "bar");
    CHECK(e["nodes"].size() == 5);
    CHECK_THAT(e["pcr"].get<double>(), WithinRel(kPi * kPi * kE * I / (L * L), 1e-12));
    CHECK_THAT(e["p1"][1].get<double>(), WithinAbs(0.0, 1e-12));
    CHECK_THAT(e["p2"][1].get<double>(), WithinAbs(L, 1e-12));
}

TEST_CASE("pinned column: below the Euler load the bow is magnified by 1 / (1 - P / Pcr)", "[bar][buckling]") {
    const double L = 2.0, I = std::pow(0.02, 4) / 12.0;
    const double Pcr = kPi * kPi * kE * I / (L * L);
    const double bow = 0.002 * L;  // the imperfection (a half sine, 2 mm)
    for (double ratio : {0.3, 0.6, 0.8}) {
        auto w = load(column(L, ratio * Pcr, {{"imperfection", 0.002}}));
        for (int i = 0; i < 6000; ++i) w->step(1e-3);
        // (the weight of the column adds a little compression)
        CHECK_THAT(deflection(*w), WithinRel(bow / (1.0 - ratio), 0.06));
    }
}

TEST_CASE("pinned column above the Euler load buckles; the Euler load is where it happens", "[bar][buckling]") {
    const double L = 2.0, I = std::pow(0.02, 4) / 12.0;
    const double Pcr = kPi * kPi * kE * I / (L * L);
    auto below = load(column(L, 0.9 * Pcr));
    auto above = load(column(L, 1.1 * Pcr));
    for (int i = 0; i < 8000; ++i) {
        below->step(1e-3);
        above->step(1e-3);
    }
    CHECK(deflection(*below) < 0.02 * L);   // 1 mm / (1 - 0.9) = 10 x the bow: still small
    CHECK(deflection(*above) > 0.15 * L);   // it has buckled: a large lateral deflection, held by the load
    CHECK(frameElement(*above, "B")["stress"].get<double>() > 1e8);
}

namespace {

// Complete elliptic integral of the first kind K(k) by the arithmetic-geometric mean.
double ellipticK(double k) {
    double a = 1.0, b = std::sqrt(1.0 - k * k);
    for (int i = 0; i < 40; ++i) {
        const double an = 0.5 * (a + b);
        b = std::sqrt(a * b);
        a = an;
    }
    return kPi / (2.0 * a);
}

}  // namespace

TEST_CASE("the buckled column follows the elastica: delta = k L / K(k) with 2 K(k) / pi = sqrt(P / Pcr)", "[bar][buckling]") {
    const double L = 2.0, I = std::pow(0.02, 4) / 12.0;
    const double Pcr = kPi * kPi * kE * I / (L * L);
    for (double ratio : {1.05, 1.1, 1.2}) {
        // the exact post-buckling shape of a pinned column under a dead load (Euler's elastica)
        double lo = 1e-6, hi = 0.99;
        for (int i = 0; i < 80; ++i) {
            const double k = 0.5 * (lo + hi);
            (2.0 * ellipticK(k) / kPi > std::sqrt(ratio) ? hi : lo) = k;
        }
        const double k = 0.5 * (lo + hi);
        const double expected = k * L / ellipticK(k);
        auto w = load(column(L, ratio * Pcr, {{"segments", 8}, {"imperfection", 0.0005}}));
        for (int i = 0; i < 12000; ++i) w->step(1e-3);
        // (the column's own weight adds ~2 % of Pcr to the load: allow for it)
        CHECK_THAT(deflection(*w), WithinRel(expected, 0.07));
    }
}

TEST_CASE("a single-segment bar cannot bend: it never buckles", "[bar][buckling]") {
    const double L = 2.0, I = std::pow(0.02, 4) / 12.0;
    const double Pcr = kPi * kPi * kE * I / (L * L);
    auto w = load(column(L, 3.0 * Pcr, {{"segments", 1}}));
    for (int i = 0; i < 3000; ++i) w->step(1e-3);
    CHECK_THAT(frameElement(*w, "B")["p2"][0].get<double>(), WithinAbs(0.0, 1e-9));
    CHECK(frameElement(*w, "B")["nodes"].size() == 2);
}

TEST_CASE("a bar between two supports sags under its own weight: 5 q L^4 / 384 E I", "[bar][bending]") {
    const double L = 2.0, I = std::pow(0.02, 4) / 12.0;
    json bar = {{"id", "B"}, {"type", "bar"}, {"a", at("A")}, {"b", at("C")},
                {"params", {{"section", {{"type", "square"}, {"a", 0.02}}}, {"segments", 8}, {"imperfection", 0.0}, {"damping", 8.0}}}};
    json cons = json::array({
        {{"id", "pa"}, {"type", "pin_support"}, {"body", "A"}, {"point", {0.0, 0.0}}, {"surface", nullptr}, {"params", {{"angle", 0.0}}}},
        {{"id", "pc"}, {"type", "roller_support"}, {"body", "C"}, {"point", {0.0, 0.0}}, {"surface", nullptr}, {"params", {{"angle", 0.0}}}},
    });
    auto w = load(sceneOf({node("A", 0.0, 0.0, 0.5), node("C", L, 0.0, 0.5)}, json::array({bar}), cons));
    for (int i = 0; i < 10000; ++i) w->step(1e-3);
    const double q = ms::kDensity * 4e-4 * 9.81;
    const double expected = 5.0 * q * std::pow(L, 4) / (384.0 * kE * I);
    const json nodes = frameElement(*w, "B")["nodes"];
    CHECK_THAT(-nodes[4][1].get<double>(), WithinRel(expected, 0.04));
    // the axial force of a sagging bar between a pin and a roller is ~ 0
    CHECK_THAT(frameElement(*w, "B")["force"].get<double>(), WithinAbs(0.0, 1.0));
}

TEST_CASE("bar input checks: segments, damping, imperfection, mass", "[bar]") {
    auto scene = [](json params) {
        json bar = {{"id", "B"}, {"type", "bar"}, {"a", ground(0, 0)}, {"b", at("N")}, {"params", params}};
        return sceneOf({node("N", 0.0, -1.0)}, json::array({bar}), json::array());
    };
    const json sec = {{"type", "square"}, {"a", 0.01}};
    CHECK_THROWS_WITH(load(scene({{"section", sec}, {"segments", 0}})), ContainsSubstring("segments"));
    CHECK_THROWS_WITH(load(scene({{"section", sec}, {"segments", 17}})), ContainsSubstring("segments"));
    CHECK_THROWS_WITH(load(scene({{"section", sec}, {"damping", -1.0}})), ContainsSubstring("damping"));
    CHECK_THROWS_WITH(load(scene({{"section", sec}, {"imperfection", -0.1}})), ContainsSubstring("imperfection"));
    CHECK_THROWS_WITH(load(scene({{"section", sec}, {"mass", 0.0}})), ContainsSubstring("mass"));
    CHECK_THROWS_WITH(load(scene(json::object())), ContainsSubstring("bar 'B'") && ContainsSubstring("section"));
}
