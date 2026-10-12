// section.hpp - cross sections of bars and beams (v0.4): square, L, T, H, I.
//
// Seen along the member axis, "up" is the in-plane direction normal to the axis (the direction a
// beam deflects in) and z is the out-of-plane direction. Bending in the simulation plane is about z,
// so the stiffness uses I = integral of y^2 dA about the centroid, y measured along "up".
//
//   square  a                      solid square a x a
//   L       b, h, t                leg of height h (up) and a foot of width b (z) at the bottom, both t thick
//   T       b, h, tf, tw           flange b wide (z) and tf thick (up) on top of a stem tw wide (z), total height h
//   I       b, h, tf, tw           two flanges b wide (z), tf thick (up) at the top and bottom, web tw thick (z)
//   H       b, h, tf, tw           the I turned by 90 degrees: two flanges b tall (up), tf thick (z), h apart outside,
//                                  web tw thick (up) - bends about the weak axis of the I
//
// L and T are not symmetric: the axis of the member is the line of the centroids; the section
// reaches `yBottom` below and `yTop` above it. The product of inertia of the L is neglected (no
// unsymmetric bending).
#pragma once

#include <string>

#include <nlohmann/json.hpp>

namespace ms {

struct Section {
    enum class Type { Square, L, T, H, I };

    Type type = Type::Square;
    double a = 0, b = 0, h = 0, t = 0, tf = 0, tw = 0;  // the dimensions of the type, m

    double area = 0;     // m^2
    double inertia = 0;  // m^4, about the centroidal axis normal to the bending plane
    double yBottom = 0;  // m, extent of the section below the axis (towards -up)
    double yTop = 0;     // m, extent above the axis

    double depth() const { return yBottom + yTop; }
    const char* name() const;
};

// Section from {"type": "square" | "L" | "T" | "H" | "I", ...dimensions}. Throws std::runtime_error
// ("<what>: ...") if a dimension is missing, not > 0, or the parts do not fit (flanges thicker than
// the section, ...).
Section parseSection(const nlohmann::json& j, const std::string& what);

// The same computation for a section whose dimensions are set (area, inertia, extents are filled in).
void computeSection(Section& s, const std::string& what);

}  // namespace ms
