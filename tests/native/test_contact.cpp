// test_contact.cpp - v0.8: blocks and discs against fixed surfaces (solver/contact.cpp).
#include <cmath>
#include <string>

#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "io/scene_loader.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;

namespace {

constexpr double kG = 9.81;

std::string sceneJson(const std::string& surfaces, const std::string& bodies, const std::string& constraints = "[]") {
    return R"({"version":"0.4","gravity":[0,-9.81],"surfaces":)" + surfaces + R"(,"bodies":)" + bodies +
           R"(,"elements":[],"constraints":)" + constraints + "}";
}

const std::string kFloor = R"([{"id":"f","p1":[-5,0],"p2":[5,0]}])";

std::string block(double x, double y, double w = 0.4, double h = 0.2, double m = 2.0, double phi = 0.0) {
    return R"({"id":"b","type":"block","position":[)" + std::to_string(x) + "," + std::to_string(y) + R"(],"angle":)" + std::to_string(phi) +
           R"(,"params":{"mass":)" + std::to_string(m) + R"(,"width":)" + std::to_string(w) + R"(,"height":)" + std::to_string(h) + "}}";
}

std::string disc(double x, double y, double r = 0.1) {
    return R"({"id":"d","type":"disc","position":[)" + std::to_string(x) + "," + std::to_string(y) +
           R"(],"params":{"mass":1,"radius":)" + std::to_string(r) + "}}";
}

void run(ms::World& w, double seconds, double dt = 1e-3) {
    for (int i = 0; i < static_cast<int>(seconds / dt); ++i) w.step(dt);
}

}  // namespace

TEST_CASE("a block dropped on a surface comes to rest on it, the normal force carries its weight", "[contact]") {
    auto w = ms::loadScene(sceneJson(kFloor, "[" + block(0.0, 0.7) + "]"));
    run(*w, 1.5);
    CHECK_THAT(w->bodies[0].pos.y, WithinAbs(0.1, 1e-4));
    CHECK_THAT(w->bodies[0].vel.y, WithinAbs(0.0, 1e-9));
    CHECK_THAT(w->bodies[0].phi, WithinAbs(0.0, 1e-9));
    const auto frame = w->frame();
    REQUIRE(frame.contains("contacts"));
    double total = 0.0;
    for (const auto& c : frame["contacts"]) total += c["normal_force"].get<double>();
    CHECK_THAT(total, WithinRel(2.0 * kG, 1e-6));
    CHECK(frame["contacts"].size() == 2);  // the two bottom corners
}

TEST_CASE("a frictionless block slides on, friction brakes it with mu g and stops it", "[contact][friction]") {
    auto frictionless = ms::loadScene(sceneJson(kFloor, R"([{"id":"b","type":"block","position":[0,0.1],"velocity":[2,0],"params":{"mass":2,"width":0.4,"height":0.2}}])"));
    run(*frictionless, 1.0);
    CHECK_THAT(frictionless->bodies[0].vel.x, WithinAbs(2.0, 1e-9));

    const double mu = 0.3;
    auto rough = ms::loadScene(sceneJson(R"([{"id":"f","p1":[-5,0],"p2":[5,0],"friction":0.3}])",
                                         R"([{"id":"b","type":"block","position":[0,0.1],"velocity":[2,0],"params":{"mass":2,"width":0.4,"height":0.2}}])"));
    run(*rough, 2.0);
    CHECK_THAT(rough->bodies[0].pos.x, WithinRel(2.0 * 2.0 / (2.0 * mu * kG), 2e-3));  // v0^2 / (2 mu g)
    CHECK_THAT(rough->bodies[0].vel.x, WithinAbs(0.0, 1e-9));
}

TEST_CASE("restitution: a disc falling on a surface rebounds to e^2 of its height, e = 0 does not bounce", "[contact][restitution]") {
    const double h = 0.5, e = 0.8;
    auto w = ms::loadScene(sceneJson(R"([{"id":"f","p1":[-5,0],"p2":[5,0],"restitution":0.8}])", "[" + disc(0.0, 0.1 + h) + "]"));
    double prev = w->bodies[0].pos.y, peak = 0.0;
    bool rising = false;
    for (int i = 0; i < 2000 && peak == 0.0; ++i) {
        w->step(1e-3);
        const double y = w->bodies[0].pos.y;
        if (rising && y < prev) peak = prev;
        rising = y > prev;
        prev = y;
    }
    CHECK_THAT(peak - 0.1, WithinRel(h * e * e, 0.02));

    auto dead = ms::loadScene(sceneJson(kFloor, "[" + disc(0.0, 0.1 + h) + "]"));
    double highest = 0.0;
    for (int i = 0; i < 2000; ++i) {
        dead->step(1e-3);
        if (i > 400) highest = std::max(highest, dead->bodies[0].pos.y);
    }
    CHECK_THAT(highest, WithinAbs(0.1, 1e-3));
}

TEST_CASE("an incline: a block slides with g (sin t - mu cos t), a block with mu >= tan t sticks", "[contact][friction]") {
    const double theta = 30.0 * 3.14159265358979 / 180.0, L = 6.0;
    auto make = [&](double mu) {
        const std::string surf = R"([{"id":"s","p1":[)" + std::to_string(-L * std::cos(theta) / 2) + "," + std::to_string(-L * std::sin(theta) / 2) +
                                 R"(],"p2":[)" + std::to_string(L * std::cos(theta) / 2) + "," + std::to_string(L * std::sin(theta) / 2) +
                                 R"(],"friction":)" + std::to_string(mu) + "}]";
        const double cx = -0.5 * std::sin(theta) * 0.2, cy = 0.5 * std::cos(theta) * 0.2;
        return ms::loadScene(sceneJson(surf, "[" + block(cx, cy, 0.4, 0.2, 2.0, theta) + "]"));
    };
    auto sliding = make(0.2);
    const double cx = sliding->bodies[0].pos.x, cy = sliding->bodies[0].pos.y;
    run(*sliding, 1.0);
    const double s = (sliding->bodies[0].pos.x - cx) * std::cos(theta) + (sliding->bodies[0].pos.y - cy) * std::sin(theta);
    const double a = kG * (std::sin(theta) - 0.2 * std::cos(theta));
    CHECK_THAT(-s, WithinRel(a * 1e-6 * 1000.0 * 1001.0 / 2.0, 1e-6));  // semi-implicit Euler: a dt^2 n (n + 1) / 2

    auto sticking = make(0.7);  // tan 30 = 0.577
    run(*sticking, 1.0);
    CHECK_THAT(sticking->bodies[0].pos.x, WithinAbs(cx, 1e-6));
    CHECK_THAT(sticking->bodies[0].pos.y, WithinAbs(cy, 1e-6));
    double fn = 0.0, ft = 0.0;
    const auto stuck = sticking->frame();
    for (const auto& c : stuck["contacts"]) {
        fn += c["normal_force"].get<double>();
        ft += c["friction_force"].get<double>();
    }
    CHECK_THAT(fn, WithinRel(2.0 * kG * std::cos(theta), 1e-6));
    CHECK_THAT(std::abs(ft), WithinRel(2.0 * kG * std::sin(theta), 1e-6));
}

TEST_CASE("a disc rolls down an incline without slipping: v = omega r, a = 2/3 g sin t", "[contact][friction]") {
    const double theta = 0.5, L = 8.0, r = 0.1;
    const std::string surf = R"([{"id":"s","p1":[)" + std::to_string(-L * std::cos(theta) / 2) + "," + std::to_string(-L * std::sin(theta) / 2) +
                             R"(],"p2":[)" + std::to_string(L * std::cos(theta) / 2) + "," + std::to_string(L * std::sin(theta) / 2) + R"(],"friction":0.5}])";
    auto w = ms::loadScene(sceneJson(surf, "[" + disc(-r * std::sin(theta), r * std::cos(theta), r) + "]"));
    const ms::Vec2 start = w->bodies[0].pos;
    run(*w, 1.0);
    const ms::Vec2 d = w->bodies[0].pos - start;
    const double s = d.x * std::cos(theta) + d.y * std::sin(theta);
    CHECK_THAT(-s, WithinRel(0.5 * (2.0 / 3.0) * kG * std::sin(theta), 2e-3));
    const double v = w->bodies[0].vel.x * std::cos(theta) + w->bodies[0].vel.y * std::sin(theta);
    CHECK_THAT(w->bodies[0].omega * r, WithinRel(-v, 1e-6));  // rolling: v = -omega r (counter-clockwise omega rolls it to the left: downhill, v < 0)
}

TEST_CASE("a mass attached to a surface by a support does not collide with it", "[contact]") {
    // a block pinned at a point of a ceiling swings under it: its upper corners would otherwise hit the ceiling as it turns
    const std::string ceiling = R"([{"id":"c","p1":[1,2],"p2":[-1,2]}])";
    const std::string pin = R"([{"id":"A1","type":"pin_support","body":"b","point":[0,0.5],"surface":"c","params":{"angle":3.14159265358979}}])";
    auto w = ms::loadScene(sceneJson(ceiling, "[" + block(0.0, 1.5, 0.2, 1.0, 1.0, 0.0) + "]", pin));
    CHECK(w->noContact.size() == 1);
    double minPhi = 0.0, maxPhi = 0.0;
    w->bodies[0].omega = 4.0;
    for (int i = 0; i < 2000; ++i) {
        w->step(1e-3);
        minPhi = std::min(minPhi, w->bodies[0].phi);
        maxPhi = std::max(maxPhi, w->bodies[0].phi);
    }
    CHECK(maxPhi > 0.3);
    CHECK(minPhi < -0.3);  // it swings to both sides, nothing stops it
}

TEST_CASE("a disc rolls through a bowl made of a polyline: the period of the pendulum", "[contact][curve]") {
    const double R = 1.0, r = 0.1, a0 = 0.15;
    const int N = 180;
    std::string pts = "[";
    for (int k = 0; k <= N; ++k) {
        const double th = 3.14159265358979 * (1.0 + static_cast<double>(k) / N);
        pts += (k ? "," : "") + std::string("[") + std::to_string(R * std::cos(th)) + "," + std::to_string(R * std::sin(th)) + "]";
    }
    pts += "]";
    const std::string surf = R"([{"id":"bowl","p1":[-1,0],"p2":[1,0],"points":)" + pts + R"(,"friction":0.0}])";
    const double c = R - r;
    auto w = ms::loadScene(sceneJson(surf, "[" + disc(-c * std::sin(a0), -c * std::cos(a0), r) + "]"));
    std::vector<double> up;  // times of the upward zero crossings of x
    double prev = w->bodies[0].pos.x;
    for (int i = 1; i < 6000; ++i) {
        w->step(1e-3);
        const double x = w->bodies[0].pos.x;
        if (prev < 0.0 && x >= 0.0) up.push_back(i * 1e-3);
        prev = x;
    }
    REQUIRE(up.size() >= 3);
    const double T = (up.back() - up.front()) / static_cast<double>(up.size() - 1);
    CHECK_THAT(T, WithinRel(2.0 * 3.14159265358979 * std::sqrt(c / kG), 0.01));  // a frictionless disc is a particle on a circle of radius R - r
}

TEST_CASE("surface input checks name the surface", "[contact][loader]") {
    auto bad = [](const std::string& surface) { return sceneJson("[" + surface + "]", "[" + block(0, 1) + "]"); };
    CHECK_THROWS_WITH(ms::loadScene(bad(R"({"id":"f","p1":[0,0],"p2":[1,0],"friction":-0.1})")), ContainsSubstring("surface 'f'") && ContainsSubstring("friction"));
    CHECK_THROWS_WITH(ms::loadScene(bad(R"({"id":"f","p1":[0,0],"p2":[1,0],"restitution":1.5})")), ContainsSubstring("restitution"));
    CHECK_THROWS_WITH(ms::loadScene(bad(R"({"id":"f","p1":[0,0],"p2":[1,0],"points":[[0,0]]})")), ContainsSubstring("points"));
    CHECK_NOTHROW(ms::loadScene(bad(R"({"id":"f","p1":[0,0],"p2":[1,0],"points":[[0,0],[0.5,0.1],[1,0]],"friction":0.2,"restitution":0.5})")));
}
