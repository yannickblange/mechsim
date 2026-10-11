// types.hpp - basic math types shared by the whole engine. Complete, do not change in v0.1.
#pragma once

#include <cmath>

namespace ms {

struct Vec2 {
    double x = 0.0;
    double y = 0.0;
};

inline Vec2 operator+(Vec2 a, Vec2 b) { return {a.x + b.x, a.y + b.y}; }
inline Vec2 operator-(Vec2 a, Vec2 b) { return {a.x - b.x, a.y - b.y}; }
inline Vec2 operator-(Vec2 a) { return {-a.x, -a.y}; }
inline Vec2 operator*(double s, Vec2 a) { return {s * a.x, s * a.y}; }
inline Vec2 operator*(Vec2 a, double s) { return {s * a.x, s * a.y}; }
inline Vec2 operator/(Vec2 a, double s) { return {a.x / s, a.y / s}; }
inline Vec2& operator+=(Vec2& a, Vec2 b) { a.x += b.x; a.y += b.y; return a; }
inline Vec2& operator-=(Vec2& a, Vec2 b) { a.x -= b.x; a.y -= b.y; return a; }

inline double dot(Vec2 a, Vec2 b) { return a.x * b.x + a.y * b.y; }
// Scalar (z-component) cross product a x b.
inline double cross(Vec2 a, Vec2 b) { return a.x * b.y - a.y * b.x; }
// omega x r for a scalar angular velocity omega (rotation about z).
inline Vec2 cross(double omega, Vec2 r) { return {-omega * r.y, omega * r.x}; }
// Rotate by +90 degrees.
inline Vec2 perp(Vec2 r) { return {-r.y, r.x}; }
inline double length(Vec2 a) { return std::sqrt(dot(a, a)); }
inline Vec2 rotate(Vec2 v, double phi) {
    const double c = std::cos(phi), s = std::sin(phi);
    return {c * v.x - s * v.y, s * v.x + c * v.y};
}

// Index of a body in World::bodies. GROUND means "fixed to the world".
using BodyIndex = int;
constexpr BodyIndex GROUND = -1;

// A point attached to a body (local coordinates) or to the ground (world coordinates).
struct Anchor {
    BodyIndex body = GROUND;
    Vec2 point;
};

}  // namespace ms
