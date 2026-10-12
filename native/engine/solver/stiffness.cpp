// stiffness.cpp - highest natural frequency of the force elements, for choosing substeps.
#include "stiffness.hpp"

#include <algorithm>
#include <cmath>
#include <vector>

#include "../core/world.hpp"

namespace ms {

namespace {

// Generalised element forces [Fx, Fy, tau, ...] in the current pose (gravity and constraints excluded).
void elementForces(World& world, std::vector<double>& f) {
    for (auto& b : world.bodies) b.clearForces();
    for (auto& e : world.elements) e->applyForces(world, world.time);
    f.resize(3 * world.bodies.size());
    for (std::size_t i = 0; i < world.bodies.size(); ++i) {
        f[3 * i + 0] = world.bodies[i].force.x;
        f[3 * i + 1] = world.bodies[i].force.y;
        f[3 * i + 2] = world.bodies[i].torque;
    }
}

double& coordinate(Body& b, int k) { return k == 0 ? b.pos.x : k == 1 ? b.pos.y : b.phi; }

}  // namespace

double estimateMaxOmega(World& world) {
    const int nb = static_cast<int>(world.bodies.size());
    const int n = 3 * nb;
    if (n == 0 || world.elements.empty()) return 0.0;

    // K by central differences: column j = -(f(q + h e_j) - f(q - h e_j)) / 2h.
    const double h = 1e-7;
    std::vector<double> K(static_cast<std::size_t>(n) * n, 0.0), fp, fm;
    for (int j = 0; j < n; ++j) {
        double& q = coordinate(world.bodies[j / 3], j % 3);
        const double q0 = q;
        q = q0 + h;
        elementForces(world, fp);
        q = q0 - h;
        elementForces(world, fm);
        q = q0;
        for (int i = 0; i < n; ++i) K[static_cast<std::size_t>(i) * n + j] = -(fp[i] - fm[i]) / (2.0 * h);
    }
    for (auto& b : world.bodies) b.clearForces();

    // S = M^-1/2 K M^-1/2 (symmetrised), largest eigenvalue by power iteration.
    std::vector<double> minv(n);
    for (int i = 0; i < nb; ++i) {
        const Body& b = world.bodies[i];
        minv[3 * i] = minv[3 * i + 1] = 1.0 / std::sqrt(b.mass);
        minv[3 * i + 2] = 1.0 / std::sqrt(b.inertia);
    }
    std::vector<double> S(static_cast<std::size_t>(n) * n);
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            S[static_cast<std::size_t>(i) * n + j] =
                0.5 * (K[static_cast<std::size_t>(i) * n + j] + K[static_cast<std::size_t>(j) * n + i]) * minv[i] * minv[j];
        }
    }
    std::vector<double> v(n), w(n);
    unsigned seed = 12345u;  // a fixed pseudo-random start vector: no direction is missed by accident
    for (int i = 0; i < n; ++i) {
        seed = seed * 1664525u + 1013904223u;
        v[i] = 0.5 + (seed >> 8) / 16777216.0;
    }
    double lambda = 0.0;
    for (int it = 0; it < 300; ++it) {
        double norm = 0.0;
        for (double x : v) norm += x * x;
        norm = std::sqrt(norm);
        if (norm == 0.0) return 0.0;
        for (double& x : v) x /= norm;
        for (int i = 0; i < n; ++i) {
            double s = 0.0;
            for (int j = 0; j < n; ++j) s += S[static_cast<std::size_t>(i) * n + j] * v[j];
            w[i] = s;
        }
        double next = 0.0;  // Rayleigh quotient
        for (int i = 0; i < n; ++i) next += v[i] * w[i];
        const bool done = std::abs(next - lambda) <= 1e-9 * std::abs(next);
        lambda = next;
        v = w;
        if (done) break;
    }
    // The power iteration finds the largest |eigenvalue| from below; add a margin.
    return lambda > 0.0 ? 1.15 * std::sqrt(lambda) : 0.0;
}

}  // namespace ms
