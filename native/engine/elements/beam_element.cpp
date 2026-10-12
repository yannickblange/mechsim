// beam_element.cpp - corotational Euler-Bernoulli beam element.
//
// Per segment i -> j: chord u = (p_j - p_i) / L, n = perp(u). Relative to the undeformed state the
// segment has the elongation  e = L - L0  and, with the chord rotation  dbeta = angle(u0 -> u),  the end
// rotations  theta_i = phi_i - phi0_i - dbeta,  theta_j = phi_j - phi0_j - dbeta  (wrapped to +-pi, so
// rigid rotations of any size cost nothing). Strain energy (linear beam theory in the corotated frame):
//
//   U = (EA / 2 L0) e^2 + (EI / L0) (2 theta_i^2 + 2 theta_i theta_j + 2 theta_j^2)
//
// With N = (EA / L0) e,  M_i = dU/dtheta_i = (EI / L0)(4 theta_i + 2 theta_j),  M_j = (EI / L0)(2 theta_i + 4 theta_j)
// the generalised forces -dU/dq are
//
//   F_i = +N u - ((M_i + M_j) / L) n      tau_i = -M_i
//   F_j = -N u + ((M_i + M_j) / L) n      tau_j = -M_j
//
// (the shear pair comes from d dbeta / d p = +-n / L). They sum to zero force and zero moment. For
// small deformations this is the exact beam stiffness matrix: a cantilever with a load at its end
// gives P L^3 / 3 EI whatever the number of elements.
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

BeamElement::Strain BeamElement::strain(const World& world, const Segment& s) const {
    const Body& bi = world.bodies[s.i];
    const Body& bj = world.bodies[s.j];
    const Vec2 d = bj.pos - bi.pos;
    Strain st;
    st.L = std::max(length(d), 1e-12);
    st.u = d / st.L;
    st.elongation = st.L - s.L0;
    const double dbeta = std::atan2(cross(s.u0, st.u), dot(s.u0, st.u));  // chord rotation, in (-pi, pi]
    st.theta_i = wrapPi(bi.phi - s.phi0_i - dbeta);
    st.theta_j = wrapPi(bj.phi - s.phi0_j - dbeta);
    return st;
}

void BeamElement::applyForces(World& world, double /*t*/) {
    for (const Segment& s : segments) {
        const Strain st = strain(world, s);
        const double N = EA / s.L0 * st.elongation;
        const double k = EI / s.L0;
        const double Mi = k * (4.0 * st.theta_i + 2.0 * st.theta_j);
        const double Mj = k * (2.0 * st.theta_i + 4.0 * st.theta_j);
        const Vec2 n = perp(st.u);
        const Vec2 Fi = N * st.u - ((Mi + Mj) / st.L) * n;
        Body& bi = world.bodies[s.i];
        Body& bj = world.bodies[s.j];
        bi.applyForce(Fi);
        bj.applyForce(-Fi);
        bi.torque -= Mi;
        bj.torque -= Mj;
    }
}

double BeamElement::potentialEnergy(const World& world) const {
    double U = 0.0;
    for (const Segment& s : segments) {
        const Strain st = strain(world, s);
        U += 0.5 * EA / s.L0 * st.elongation * st.elongation +
             EI / s.L0 * (2.0 * st.theta_i * st.theta_i + 2.0 * st.theta_i * st.theta_j + 2.0 * st.theta_j * st.theta_j);
    }
    return U;
}

void BeamElement::writeFrame(const World& world, nlohmann::json& out) const {
    using nlohmann::json;
    const std::size_t nSeg = segments.size();
    json nodes = json::array();
    auto addNode = [&](int index) {
        const Body& b = world.bodies[index];
        nodes.push_back({b.pos.x, b.pos.y, b.phi});
    };
    for (const Segment& s : segments) addNode(s.i);
    addNode(segments.back().j);

    // Bending moment at the nodes, sagging positive: -M_i at the start of a segment, +M_j at its end
    // (they agree in the middle of a beam; at a support or a load the two sides differ and the mean is shown).
    std::vector<double> mStart(nSeg), mEnd(nSeg), axial(nSeg);
    double sigma = 0.0;
    const double ymax = std::max(section.yBottom, section.yTop);
    for (std::size_t k = 0; k < nSeg; ++k) {
        const Strain st = strain(world, segments[k]);
        const double c = EI / segments[k].L0;
        const double Mi = c * (4.0 * st.theta_i + 2.0 * st.theta_j);
        const double Mj = c * (2.0 * st.theta_i + 4.0 * st.theta_j);
        mStart[k] = -Mi;
        mEnd[k] = Mj;
        axial[k] = EA / segments[k].L0 * st.elongation;
        sigma = std::max(sigma, std::abs(axial[k]) / section.area + std::max(std::abs(Mi), std::abs(Mj)) * ymax / section.inertia);
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
