// test_section.cpp - v0.4 cross sections: area, second moment of area and extents of square, L, T, H, I.
#include <cmath>
#include <vector>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "core/section.hpp"

using Catch::Matchers::ContainsSubstring;
using Catch::Matchers::WithinRel;
using nlohmann::json;

namespace {

// Independent check: a section as a union of rectangles in (z, y) (z across, y = "up"); area,
// centroid height and the second moment about the centroid by summing the pieces.
struct Rect { double z0, z1, y0, y1; };

struct Moments { double area, yc, inertia, yMin, yMax; };

Moments integrate(const std::vector<Rect>& rects) {
    double area = 0, sy = 0;
    double yMin = 1e9, yMax = -1e9;
    for (const Rect& r : rects) {
        const double a = (r.z1 - r.z0) * (r.y1 - r.y0);
        area += a;
        sy += a * 0.5 * (r.y0 + r.y1);
        yMin = std::min(yMin, r.y0);
        yMax = std::max(yMax, r.y1);
    }
    const double yc = sy / area;
    double inertia = 0;
    // integral of (y - yc)^2 over a rectangle = w ((y1 - yc)^3 - (y0 - yc)^3) / 3, evaluated exactly
    for (const Rect& r : rects) {
        inertia += (r.z1 - r.z0) * (std::pow(r.y1 - yc, 3) - std::pow(r.y0 - yc, 3)) / 3.0;
    }
    return {area, yc, inertia, yMin - yc, yMax - yc};
}

void check(const json& spec, const std::vector<Rect>& rects) {
    const ms::Section s = ms::parseSection(spec, "test");
    const Moments m = integrate(rects);
    CHECK_THAT(s.area, WithinRel(m.area, 1e-12));
    CHECK_THAT(s.inertia, WithinRel(m.inertia, 1e-10));
    CHECK_THAT(s.yBottom, WithinRel(-m.yMin, 1e-10));
    CHECK_THAT(s.yTop, WithinRel(m.yMax, 1e-10));
    CHECK_THAT(s.depth(), WithinRel(m.yMax - m.yMin, 1e-10));
}

}  // namespace

TEST_CASE("square section", "[section]") {
    const ms::Section s = ms::parseSection({{"type", "square"}, {"a", 0.05}}, "test");
    CHECK_THAT(s.area, WithinRel(0.0025, 1e-12));
    CHECK_THAT(s.inertia, WithinRel(std::pow(0.05, 4) / 12.0, 1e-12));  // a^4 / 12
    CHECK(s.yBottom == s.yTop);
    CHECK_THAT(s.depth(), WithinRel(0.05, 1e-12));
    CHECK(std::string(s.name()) == "square");
}

TEST_CASE("I section: strong axis, symmetric", "[section]") {
    // b = 100, h = 200, tf = 10, tw = 6 mm (about an IPE 200): I = 2.098e-5 m^4
    const double b = 0.1, h = 0.2, tf = 0.01, tw = 0.006;
    const json spec = {{"type", "I"}, {"b", b}, {"h", h}, {"tf", tf}, {"tw", tw}};
    // flanges (horizontal, b wide, tf tall) at the top and bottom, web (tw wide) between
    check(spec, {{-b / 2, b / 2, -h / 2, -h / 2 + tf}, {-b / 2, b / 2, h / 2 - tf, h / 2}, {-tw / 2, tw / 2, -h / 2 + tf, h / 2 - tf}});
    CHECK_THAT(ms::parseSection(spec, "t").inertia, WithinRel(2.0983e-5, 1e-3));
}

TEST_CASE("H section is the I turned by 90 degrees: weak axis", "[section]") {
    const double b = 0.1, h = 0.2, tf = 0.01, tw = 0.006;
    const json spec = {{"type", "H"}, {"b", b}, {"h", h}, {"tf", tf}, {"tw", tw}};
    // flanges vertical (b tall in y, tf wide in z) at z = +-(h/2 - tf/2), web horizontal (tw tall, h - 2 tf wide)
    check(spec, {{-h / 2, -h / 2 + tf, -b / 2, b / 2}, {h / 2 - tf, h / 2, -b / 2, b / 2}, {-h / 2 + tf, h / 2 - tf, -tw / 2, tw / 2}});
    const ms::Section H = ms::parseSection(spec, "t");
    const ms::Section I = ms::parseSection({{"type", "I"}, {"b", b}, {"h", h}, {"tf", tf}, {"tw", tw}}, "t");
    CHECK_THAT(H.area, WithinRel(I.area, 1e-12));
    CHECK(H.inertia < I.inertia / 5.0);  // much more flexible about the weak axis
    CHECK_THAT(H.depth(), WithinRel(b, 1e-12));
}

TEST_CASE("T section: the centroid is below the middle, flange on top", "[section]") {
    const double b = 0.1, h = 0.1, tf = 0.01, tw = 0.01;
    const json spec = {{"type", "T"}, {"b", b}, {"h", h}, {"tf", tf}, {"tw", tw}};
    check(spec, {{-tw / 2, tw / 2, 0, h - tf}, {-b / 2, b / 2, h - tf, h}});
    const ms::Section s = ms::parseSection(spec, "t");
    CHECK(s.yTop < s.yBottom);  // more material at the top, so the centroid is closer to the flange
    CHECK_THAT(s.yBottom + s.yTop, WithinRel(h, 1e-12));
}

TEST_CASE("L section: leg up, foot at the bottom", "[section]") {
    const double b = 0.08, h = 0.12, t = 0.01;
    const json spec = {{"type", "L"}, {"b", b}, {"h", h}, {"t", t}};
    check(spec, {{0, t, 0, h}, {t, b, 0, t}});
    const ms::Section s = ms::parseSection(spec, "t");
    CHECK_THAT(s.area, WithinRel(t * h + (b - t) * t, 1e-12));
    CHECK(s.yBottom < s.yTop);  // the leg is up
}

TEST_CASE("sections that do not fit are rejected with a message", "[section]") {
    CHECK_THROWS_WITH(ms::parseSection({{"type", "I"}, {"b", 0.1}, {"h", 0.02}, {"tf", 0.01}, {"tw", 0.005}}, "bar 'S1'"),
                      ContainsSubstring("bar 'S1'") && ContainsSubstring("flanges"));
    CHECK_THROWS_WITH(ms::parseSection({{"type", "T"}, {"b", 0.1}, {"h", 0.1}, {"tf", 0.1}, {"tw", 0.01}}, "t"), ContainsSubstring("tf"));
    CHECK_THROWS_WITH(ms::parseSection({{"type", "L"}, {"b", 0.01}, {"h", 0.1}, {"t", 0.02}}, "t"), ContainsSubstring("thickness"));
    CHECK_THROWS_WITH(ms::parseSection({{"type", "square"}}, "t"), ContainsSubstring("'a'"));
    CHECK_THROWS_WITH(ms::parseSection({{"type", "square"}, {"a", -1}}, "t"), ContainsSubstring("> 0"));
    CHECK_THROWS_WITH(ms::parseSection({{"type", "round"}, {"a", 1}}, "t"), ContainsSubstring("unknown section type"));
    CHECK_THROWS_WITH(ms::parseSection(json::array(), "t"), ContainsSubstring("section"));
}
