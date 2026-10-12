// beam_element.cpp - corotational Euler-Bernoulli beam element with bowing, hinged ends, damping.
//
// Per segment a -> b: chord u = (p_b - p_a) / L, n = perp(u), chord rotation dbeta (angle from the
// undeformed chord u0 to u) and the end rotations against the chord
//   theta_a = phi_a - phi0_a - dbeta,  theta_b = phi_b - phi0_b - dbeta     (wrapped to +-pi)
// (rigid rotations of any size cost nothing). With the bowing of the curve (the chord is shorter than
// the arc that has the length L0 + e_ax; cubic displacement field)
//   bow  = (L0 / 30)(2 theta_a^2 - theta_a theta_b + 2 theta_b^2),   e_ax = (L - L0) + bow
// the strain energy is
//   U = (EA / 2 L0) e_ax^2 + (EI / L0) (2 theta_a^2 + 2 theta_a theta_b + 2 theta_b^2)
// The bow term is what makes a compressed member lose stiffness: the geometric stiffness of the
// consistent beam, so a pinned column buckles at the Euler load pi^2 E I / L^2.
// With N = (EA / L0) e_ax:
//   M_a = dU/dtheta_a = (EI / L0)(4 theta_a + 2 theta_b) + N (L0 / 30)(4 theta_a - theta_b)
//   M_b = dU/dtheta_b = (EI / L0)(2 theta_a + 4 theta_b) + N (L0 / 30)(-theta_a + 4 theta_b)
//   F_a = +N u - ((M_a + M_b) / L) n,  F_b = -F_a,  tau_a = -M_a,  tau_b = -M_b
// (-dU/dq; the shear pair comes from d dbeta / d p = -+ n / L). A hinged end has no rotation variable:
// its theta minimises U (dU/dtheta = 0, a few Newton steps from -theta_other / 2), so by the envelope
// theorem the same forces are right and no moment acts on the end.
//
// Damping is not part of the element: the nodes carry a viscous damping rate (Body::damping).
#include "beam_element.hpp"

#include <algorithm>
#include <cmath>

#include "../core/world.hpp"

namespace ms {

namespace {

constexpr double kPi = 3.14159265358979323846;

double wrapPi(double a) {
    const double tau = 2.0 * kPi;
    a = std::fmod(a, tau);
    if (a > kPi) a -= tau;
    if (a <= -kPi) a += tau;
    return a;
}

}  // namespace

Vec2 BeamElement::endPoint(const World& world, const End& e) const {
    return e.body == GROUND ? e.local : world.bodies[e.body].toWorld(e.local);
}

BeamElement::Strain BeamElement::strain(const World& world, const Segment& s) const {
    const Vec2 pa = endPoint(world, s.a);
    const Vec2 pb = endPoint(world, s.b);
    const Vec2 d = pb - pa;
    Strain st;
    st.L = std::max(length(d), 1e-12);
    st.u = d / st.L;
    const double dbeta = std::atan2(cross(s.u0, st.u), dot(s.u0, st.u));  // chord rotation, in (-pi, pi]
    const bool ha = s.a.hinge, hb = s.b.hinge;
    if (!ha) st.theta_a = wrapPi(world.bodies[s.a.body].phi - s.phi0_a - dbeta);
    if (!hb) st.theta_b = wrapPi(world.bodies[s.b.body].phi - s.phi0_b - dbeta);

    const double L0 = s.L0;
    const double k = EI / L0;
    const double c = L0 / 30.0;
    auto bowOf = [&](double ta, double tb) { return c * (2.0 * ta * ta - ta * tb + 2.0 * tb * tb); };
    if (ha != hb) {
        // one hinged end: find the rotation with dU/dtheta = 0
        double& th = ha ? st.theta_a : st.theta_b;
        const double other = ha ? st.theta_b : st.theta_a;
        th = -0.5 * other;
        for (int it = 0; it < 4; ++it) {
            const double ta = ha ? th : other, tb = ha ? other : th;
            const double N = EA / L0 * ((st.L - L0) + bowOf(ta, tb));
            const double dq = ha ? 4.0 * ta + 2.0 * tb : 2.0 * ta + 4.0 * tb;                // dq/dtheta (q / 2)
            const double db = ha ? c * (4.0 * ta - tb) : c * (-ta + 4.0 * tb);               // dbow/dtheta
            const double g = k * dq + N * db;
            const double h = 4.0 * k + EA / L0 * db * db + 4.0 * c * N;
            if (!(h > 1e-12 * k)) break;
            th -= g / h;
        }
    } else if (ha && hb) {
        // both ends hinged (a single segment): no bending at all
        st.theta_a = st.theta_b = 0.0;
    }
    st.elongation = (st.L - L0) + bowOf(st.theta_a, st.theta_b);
    st.N = EA / L0 * st.elongation;
    st.Ma = k * (4.0 * st.theta_a + 2.0 * st.theta_b) + st.N * c * (4.0 * st.theta_a - st.theta_b);
    st.Mb = k * (2.0 * st.theta_a + 4.0 * st.theta_b) + st.N * c * (-st.theta_a + 4.0 * st.theta_b);
    return st;
}

void BeamElement::applyForces(World& world, double /*t*/) {
    for (const Segment& s : segments) {
        const Strain st = strain(world, s);
        const double N = st.N, Ma = st.Ma, Mb = st.Mb;

        const Vec2 n = perp(st.u);
        const Vec2 Fa = N * st.u - ((Ma + Mb) / st.L) * n;
        auto apply = [&](const End& e, Vec2 F, double moment) {
            if (e.body == GROUND) return;
            Body& b = world.bodies[e.body];
            b.applyForceAt(F, e.local);
            if (!e.hinge) b.torque += moment;
        };
        apply(s.a, Fa, -Ma);
        apply(s.b, -Fa, -Mb);
    }
    if (endWeight > 0.0) {  // the mass of the end halves of a bar hangs on its anchors
        const Vec2 w = endWeight * world.gravity;
        for (const End* e : {&segments.front().a, &segments.back().b}) {
            if (e->body != GROUND) world.bodies[e->body].applyForceAt(w, e->local);
        }
    }
}

double BeamElement::potentialEnergy(const World& world) const {
    double U = 0.0;
    for (const Segment& s : segments) {
        const Strain st = strain(world, s);
        const double k = EI / s.L0;
        U += 0.5 * EA / s.L0 * st.elongation * st.elongation +
             k * (2.0 * st.theta_a * st.theta_a + 2.0 * st.theta_a * st.theta_b + 2.0 * st.theta_b * st.theta_b);
    }
    if (endWeight > 0.0) {
        for (const End* e : {&segments.front().a, &segments.back().b}) {
            if (e->body != GROUND) U -= endWeight * dot(world.gravity, endPoint(world, *e));
        }
    }
    return U;
}

void BeamElement::writeFrame(const World& world, nlohmann::json& out) const {
    using nlohmann::json;
    const std::size_t nSeg = segments.size();
    std::vector<Strain> strains;
    strains.reserve(nSeg);
    for (const Segment& s : segments) strains.push_back(strain(world, s));

    // [x, y, phi] of every node; a hinged end has no rotation of its own: the tangent of the curve there.
    json nodes = json::array();
    for (std::size_t k = 0; k <= nSeg; ++k) {
        const bool last = k == nSeg;
        const Segment& s = segments[last ? nSeg - 1 : k];
        const End& e = last ? s.b : s.a;
        const Vec2 p = endPoint(world, e);
        double phi;
        if (!e.hinge) {
            phi = world.bodies[e.body].phi;
        } else {
            const Strain& st = strains[last ? nSeg - 1 : k];
            phi = std::atan2(st.u.y, st.u.x) + (last ? st.theta_b : st.theta_a);
        }
        nodes.push_back({p.x, p.y, phi});
    }

    std::vector<double> axial(nSeg), mStart(nSeg), mEnd(nSeg);
    double sigma = 0.0, extremeN = 0.0;  // the normal force of the segment that carries the most
    const double ymax = std::max(section.yBottom, section.yTop);
    for (std::size_t k = 0; k < nSeg; ++k) {
        const Strain& st = strains[k];
        axial[k] = st.N;
        mStart[k] = -st.Ma;
        mEnd[k] = st.Mb;
        if (std::abs(st.N) > std::abs(extremeN)) extremeN = st.N;
        sigma = std::max(sigma, std::abs(st.N) / section.area + std::max(std::abs(st.Ma), std::abs(st.Mb)) * ymax / section.inertia);
    }

    if (kind == Kind::Bar) {
        const Vec2 p1 = endPoint(world, segments.front().a), p2 = endPoint(world, segments.back().b);
        out["p1"] = {p1.x, p1.y};
        out["p2"] = {p2.x, p2.y};
        out["force"] = extremeN;
        out["stress"] = sigma;
        out["nodes"] = std::move(nodes);
        out["pcr"] = kPi * kPi * EI / (installedLength * installedLength);  // Euler load of the pinned bar
        return;
    }
    json moments = json::array();
    moments.push_back(mStart.front());
    for (std::size_t k = 1; k < nSeg; ++k) moments.push_back(0.5 * (mEnd[k - 1] + mStart[k]));
    moments.push_back(mEnd.back());
    out["nodes"] = std::move(nodes);
    out["moments"] = std::move(moments);
    out["axial"] = axial;
    out["stress"] = sigma;
    out["A"] = section.area;
    out["I"] = section.inertia;
    out["EA"] = EA;
    out["EI"] = EI;
}

}  // namespace ms
