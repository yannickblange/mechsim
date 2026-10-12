// section.cpp - area, second moment of area and extents of the five cross sections.
#include "section.hpp"

#include <stdexcept>

namespace ms {

const char* Section::name() const {
    switch (type) {
        case Type::Square: return "square";
        case Type::L: return "L";
        case Type::T: return "T";
        case Type::H: return "H";
        case Type::I: return "I";
    }
    return "?";
}

namespace {

double dimension(const nlohmann::json& j, const char* key, const std::string& what) {
    if (!j.contains(key) || !j[key].is_number() || !(j[key].get<double>() > 0.0)) {
        throw std::runtime_error(what + ": section dimension '" + key + "' must be a number > 0");
    }
    return j[key].get<double>();
}

// Second moment about the centroid axis of a rectangle of height `ht` (up) whose centre is
// `offset` above that axis and which is `wd` wide: wd ht^3 / 12 + wd ht offset^2 (Steiner).
double rectInertia(double wd, double ht, double offset) { return wd * ht * ht * ht / 12.0 + wd * ht * offset * offset; }

}  // namespace

void computeSection(Section& s, const std::string& what) {
    switch (s.type) {
        case Section::Type::Square:
            s.area = s.a * s.a;
            s.inertia = s.a * s.a * s.a * s.a / 12.0;
            s.yBottom = s.yTop = s.a / 2.0;
            return;
        case Section::Type::I:
        case Section::Type::H: {
            if (!(2.0 * s.tf < s.h)) throw std::runtime_error(what + ": the flanges (2 tf) must be thinner than the height h");
            if (!(s.tw < s.b)) throw std::runtime_error(what + ": the web thickness tw must be smaller than the width b");
            s.area = 2.0 * s.b * s.tf + (s.h - 2.0 * s.tf) * s.tw;
            if (s.type == Section::Type::I) {
                // (b h^3 - (b - tw)(h - 2 tf)^3) / 12: the full rectangle minus the two voids beside the web.
                const double hi = s.h - 2.0 * s.tf;
                s.inertia = (s.b * s.h * s.h * s.h - (s.b - s.tw) * hi * hi * hi) / 12.0;
                s.yBottom = s.yTop = s.h / 2.0;
            } else {
                // the I rotated by 90 degrees: I_y of the I = (2 tf b^3 + (h - 2 tf) tw^3) / 12
                s.inertia = (2.0 * s.tf * s.b * s.b * s.b + (s.h - 2.0 * s.tf) * s.tw * s.tw * s.tw) / 12.0;
                s.yBottom = s.yTop = s.b / 2.0;
            }
            return;
        }
        case Section::Type::T: {
            if (!(s.tf < s.h)) throw std::runtime_error(what + ": the flange thickness tf must be smaller than the height h");
            if (!(s.tw < s.b)) throw std::runtime_error(what + ": the stem width tw must be smaller than the flange width b");
            const double stemH = s.h - s.tf;
            const double aStem = s.tw * stemH;
            const double aFlange = s.b * s.tf;
            s.area = aStem + aFlange;
            // centroid height above the bottom of the stem
            const double yc = (aStem * stemH / 2.0 + aFlange * (s.h - s.tf / 2.0)) / s.area;
            s.inertia = rectInertia(s.tw, stemH, stemH / 2.0 - yc) + rectInertia(s.b, s.tf, s.h - s.tf / 2.0 - yc);
            s.yBottom = yc;
            s.yTop = s.h - yc;
            return;
        }
        case Section::Type::L: {
            if (!(s.t < s.b)) throw std::runtime_error(what + ": the thickness t must be smaller than the foot width b");
            if (!(s.t < s.h)) throw std::runtime_error(what + ": the thickness t must be smaller than the leg height h");
            const double aLeg = s.t * s.h;
            const double aFoot = (s.b - s.t) * s.t;
            s.area = aLeg + aFoot;
            const double yc = (aLeg * s.h / 2.0 + aFoot * s.t / 2.0) / s.area;
            s.inertia = rectInertia(s.t, s.h, s.h / 2.0 - yc) + rectInertia(s.b - s.t, s.t, s.t / 2.0 - yc);
            s.yBottom = yc;
            s.yTop = s.h - yc;
            return;
        }
    }
}

Section parseSection(const nlohmann::json& j, const std::string& what) {
    if (!j.is_object() || !j.contains("type") || !j["type"].is_string()) {
        throw std::runtime_error(what + ": 'section' must be {\"type\": \"square\" | \"L\" | \"T\" | \"H\" | \"I\", ...}");
    }
    Section s;
    const std::string type = j["type"].get<std::string>();
    if (type == "square") {
        s.type = Section::Type::Square;
        s.a = dimension(j, "a", what);
    } else if (type == "L") {
        s.type = Section::Type::L;
        s.b = dimension(j, "b", what);
        s.h = dimension(j, "h", what);
        s.t = dimension(j, "t", what);
    } else if (type == "T" || type == "H" || type == "I") {
        s.type = type == "T" ? Section::Type::T : type == "H" ? Section::Type::H : Section::Type::I;
        s.b = dimension(j, "b", what);
        s.h = dimension(j, "h", what);
        s.tf = dimension(j, "tf", what);
        s.tw = dimension(j, "tw", what);
    } else {
        throw std::runtime_error(what + ": unknown section type '" + type + "' (square, L, T, H, I)");
    }
    computeSection(s, what);
    return s;
}

}  // namespace ms
