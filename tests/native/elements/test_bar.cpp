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

json squareBar(const char* id, json a, json b, double side = 0.01) {
    return {{"id", id}, {"type", "bar"}, {"a", a}, {"b", b}, {"params", {{"section", {{"type", "square"}, {"a", side}}}}}};
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

TEST_CASE("bar: starts unstressed, stiffness E A / L, the frame reports the stress", "[bar]") {
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

TEST_CASE("bar: a statically indeterminate set of three bars has a unique solution", "[bar]") {
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
