// contact.cpp - mass / surface contact (see contact.hpp and docs/formulation.md).
#include "contact.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>

extern "C" {
#include "linalg.h"
}

#include "../core/world.hpp"

namespace ms {

namespace {

constexpr double kMargin = 5e-3;        // m: a feature this close (plus what the mass travels in a step) is a candidate
constexpr double kErp = 0.1;            // share of a penetration that is pushed out per step
constexpr double kMaxPush = 0.5;        // m/s: the fastest pushing out of a penetration
constexpr double kStickSpeed = 1e-4;    // m/s: a contact slower than this starts sticking
constexpr double kConvexSin = 0.0087;   // a vertex of a surface turning by less than half a degree is no corner
constexpr double kCornerTol = 2e-3;     // m: a surface vertex this close to the end of a block's edge is at its corner
constexpr double kRegularisation = 1e-9;  // of a contact row's diagonal: a redundant contact must not make the system singular
constexpr double kTolNormal = 1e-8;     // N
constexpr int kMaxFlips = 6;

struct Seg {
    Vec2 a, b, t, n;
    double len = 0.0;
    bool valid = false;
};

// A surface prepared for the search: its segments (left normals) and which vertices are corners a mass can lean on.
struct PreparedSurface {
    std::vector<Seg> segs;           // segs[i] joins points[i] and points[i + 1]
    std::vector<char> corner;        // vertex k is the end of the line or turns towards the solid side
    std::vector<char> hasPrev, hasNext;
};

PreparedSurface prepare(const Surface& s) {
    PreparedSurface p;
    const std::size_t np = s.points.size();
    p.segs.resize(np - 1);
    for (std::size_t i = 0; i + 1 < np; ++i) {
        Seg& g = p.segs[i];
        g.a = s.points[i];
        g.b = s.points[i + 1];
        const Vec2 d = g.b - g.a;
        g.len = length(d);
        if (g.len < 1e-9) continue;
        g.valid = true;
        g.t = d / g.len;
        g.n = perp(g.t);  // left: the free side
    }
    p.corner.assign(np, 0);
    p.hasPrev.assign(np, 0);
    p.hasNext.assign(np, 0);
    for (std::size_t k = 0; k < np; ++k) {
        p.hasPrev[k] = k > 0 && p.segs[k - 1].valid;
        p.hasNext[k] = k + 1 < np && p.segs[k].valid;
        if (p.hasPrev[k] && p.hasNext[k]) {
            p.corner[k] = cross(p.segs[k - 1].t, p.segs[k].t) < -kConvexSin;  // turns right: a peak seen from the free side
        } else {
            p.corner[k] = p.hasPrev[k] || p.hasNext[k];  // an end of the line
        }
    }
    return p;
}

// Fills the kinematics of a contact and decides whether it is worth keeping. n and r are set already.
bool finish(Contact& c, const Body& b, const Surface& s, double dt, double penMax) {
    c.Jn[0] = c.n.x; c.Jn[1] = c.n.y; c.Jn[2] = cross(c.r, c.n);
    const Vec2 t = perp(c.n);
    c.Jt[0] = t.x; c.Jt[1] = t.y; c.Jt[2] = cross(c.r, t);
    c.vn = c.Jn[0] * b.vel.x + c.Jn[1] * b.vel.y + c.Jn[2] * b.omega;
    c.vt = c.Jt[0] * b.vel.x + c.Jt[1] * b.vel.y + c.Jt[2] * b.omega;
    if (c.gap < -penMax || c.gap > kMargin + 2.0 * dt * std::max(0.0, -c.vn)) return false;
    c.mu = s.friction;
    c.restitution = s.restitution;
    return true;
}

// The unilateral row J_n a >= bound, from the gap and the velocity at the start of the step:
//  - the mass may arrive at the surface during the step, not cross it:  J_n v+ >= -g / dt;
//  - penetrating: it is pushed out at a share of the penetration per step (bounded);
//  - an impact (it reaches the surface in this step, faster than a resting mass falls in a step): Newton, J_n v+ >= -e J_n v.
void setBound(Contact& c, double dt, double gravity) {
    double b;
    if (c.gap >= 0.0) b = -c.gap / dt;
    else b = std::min(-kErp * c.gap / dt, kMaxPush);
    const double rest = std::max(0.05, 5.0 * gravity * dt);
    if (c.restitution > 0.0 && c.vn < -rest && c.gap + dt * c.vn <= 1e-9) b = std::max(b, -c.restitution * c.vn);
    c.bound = (b - c.vn) / dt - c.kappa;
}

struct BlockGeometry {
    Vec2 corners[4];   // local, counter-clockwise
    Vec2 normals[4];   // local outward normal of the edge corner[i] -> corner[(i + 1) % 4]
};

BlockGeometry blockGeometry(const Body& b) {
    const double w = b.halfWidth, h = b.halfHeight;
    BlockGeometry g;
    g.corners[0] = {-w, -h}; g.corners[1] = {w, -h}; g.corners[2] = {w, h}; g.corners[3] = {-w, h};
    g.normals[0] = {0, -1}; g.normals[1] = {1, 0}; g.normals[2] = {0, 1}; g.normals[3] = {-1, 0};
    return g;
}

void blockContacts(const World& world, int bi, int si, const PreparedSurface& ps, double dt, std::vector<Contact>& out) {
    const Body& b = world.bodies[bi];
    const Surface& s = world.surfaces[si];
    const BlockGeometry g = blockGeometry(b);
    const double penMax = 0.5 * std::min(b.halfWidth, b.halfHeight);
    Vec2 corner[4];
    for (int i = 0; i < 4; ++i) corner[i] = b.toWorld(g.corners[i]);

    // corners of the block on the inside of a segment
    for (std::size_t k = 0; k < ps.segs.size(); ++k) {
        const Seg& seg = ps.segs[k];
        if (!seg.valid) continue;
        for (int i = 0; i < 4; ++i) {
            const Vec2 rel = corner[i] - seg.a;
            const double u = dot(rel, seg.t);
            if (u < 0.0 || u > seg.len) continue;
            Contact c;
            c.body = bi; c.surface = si; c.kind = ContactKind::Corner; c.vertex = static_cast<int>(k); c.local = i;
            c.gap = dot(rel, seg.n);
            c.n = seg.n;
            c.r = corner[i] - b.pos;
            if (finish(c, b, s, dt, penMax)) out.push_back(c);
        }
    }

    // corners of the surface (a peak, an end of the line) against an edge of the block: the edge with the largest gap that the vertex faces
    for (std::size_t k = 0; k < s.points.size(); ++k) {
        if (!ps.corner[k]) continue;
        const Vec2 w = s.points[k];
        int best = -1;
        double bestGap = 0.0;
        Vec2 bestFoot;
        Vec2 bestN;
        for (int e = 0; e < 4; ++e) {
            const Vec2 pa = corner[e], pb = corner[(e + 1) % 4];
            const Vec2 d = pb - pa;
            const double len = length(d);
            const Vec2 te = d / len;
            const double u = dot(w - pa, te);
            // near the end of the edge the vertex is at a corner of the block, not on its face: the corner contacts cover that (and a block
            // that has sunk a few micrometres into a line must not feel the end of the line as a hit on its side)
            const double cornerTol = std::min(kCornerTol, 0.1 * len);
            if (u < cornerTol || u > len - cornerTol) continue;
            const Vec2 nb = rotate(g.normals[e], b.phi);
            const double gap = dot(w - pa, nb);
            if (best < 0 || gap > bestGap) {
                best = e; bestGap = gap; bestFoot = pa + u * te; bestN = nb;
            }
        }
        if (best < 0) continue;
        Contact c;
        c.body = bi; c.surface = si; c.kind = ContactKind::Vertex; c.vertex = static_cast<int>(k); c.local = best;
        c.gap = bestGap;
        c.n = -bestN;               // the surface pushes the body against the outward normal of its edge
        c.r = bestFoot - b.pos;     // the material point of the block that the vertex touches
        if (finish(c, b, s, dt, penMax)) out.push_back(c);
    }
}

void discContacts(const World& world, int bi, int si, const PreparedSurface& ps, double dt, std::vector<Contact>& out) {
    const Body& b = world.bodies[bi];
    const Surface& s = world.surfaces[si];
    const double R = b.radius;
    const double penMax = 0.5 * R;

    for (std::size_t k = 0; k < ps.segs.size(); ++k) {
        const Seg& seg = ps.segs[k];
        if (!seg.valid) continue;
        const Vec2 rel = b.pos - seg.a;
        const double u = dot(rel, seg.t);
        if (u < 0.0 || u > seg.len) continue;
        Contact c;
        c.body = bi; c.surface = si; c.kind = ContactKind::DiscSegment; c.vertex = static_cast<int>(k);
        c.gap = dot(rel, seg.n) - R;
        c.n = seg.n;
        c.r = -R * seg.n;
        if (finish(c, b, s, dt, penMax)) out.push_back(c);
    }

    // a vertex is the nearest feature only beyond the end of the segment before it and before the start of the one after it
    for (std::size_t k = 0; k < s.points.size(); ++k) {
        if (!ps.corner[k]) continue;
        const Vec2 d = b.pos - s.points[k];
        const double dist = length(d);
        if (dist < 1e-12) continue;
        if (ps.hasPrev[k] && dot(d, ps.segs[k - 1].t) < 0.0) continue;
        if (ps.hasNext[k] && dot(d, ps.segs[k].t) > 0.0) continue;
        Contact c;
        c.body = bi; c.surface = si; c.kind = ContactKind::DiscVertex; c.vertex = static_cast<int>(k);
        c.gap = dist - R;
        c.n = d / dist;
        c.r = -R * c.n;
        if (finish(c, b, s, dt, penMax)) out.push_back(c);
    }
}

// The gap of a contact's feature (the same corner / edge / vertex) for the mass at another pose.
double gapAt(const World& world, const Contact& c, Vec2 pos, double phi) {
    const Body& b = world.bodies[c.body];
    const Surface& s = world.surfaces[c.surface];
    switch (c.kind) {
        case ContactKind::Corner: {
            const Vec2 a = s.points[c.vertex], d = s.points[c.vertex + 1] - a;
            const Vec2 n = perp(d / length(d));
            return dot(pos + rotate(blockGeometry(b).corners[c.local], phi) - a, n);
        }
        case ContactKind::Vertex: {
            const BlockGeometry g = blockGeometry(b);
            const Vec2 pa = pos + rotate(g.corners[c.local], phi);
            return dot(s.points[c.vertex] - pa, rotate(g.normals[c.local], phi));
        }
        case ContactKind::DiscSegment: {
            const Vec2 a = s.points[c.vertex], d = s.points[c.vertex + 1] - a;
            return dot(pos - a, perp(d / length(d))) - b.radius;
        }
        case ContactKind::DiscVertex:
            return length(pos - s.points[c.vertex]) - b.radius;
    }
    return c.gap;
}

// kappa = d^2/dt^2 of the gap along q(t) = q + t qdot (no acceleration): by a central second difference of the same feature.
double curvatureTerm(const World& world, const Contact& c) {
    const Body& b = world.bodies[c.body];
    const double reach = b.shape == Body::Shape::Block ? length({b.halfWidth, b.halfHeight}) : b.radius;
    const double speed = std::max(length(b.vel), std::abs(b.omega) * reach);
    if (speed < 1e-9) return 0.0;
    const double h = std::min(1e-2, std::max(1e-6, 1e-4 / speed));
    const double plus = gapAt(world, c, b.pos + h * b.vel, b.phi + h * b.omega);
    const double minus = gapAt(world, c, b.pos - h * b.vel, b.phi - h * b.omega);
    return (plus - 2.0 * c.gap + minus) / (h * h);
}

bool excluded(const World& world, int body, int surface) {
    for (const auto& pr : world.noContact) if (pr.first == body && pr.second == surface) return true;
    return false;
}

// --- the system with the active contacts ---------------------------------------------------------------------------------------------

struct Augmented {
    System sys;
    std::vector<double> H;       // the matrix of the forces: a = M^-1 (f + H^T lambda); equal to sys.G except in sliding contacts
    std::vector<int> rowN, rowT; // per contact: the row of its normal / tangential multiplier, or -1
    int baseRows = 0;
};

void build(const System& base, const std::vector<Contact>& cs, double dt, Augmented& out) {
    const int n = base.n;
    int extra = 0;
    for (const Contact& c : cs) {
        if (!c.active) continue;
        extra += 1 + ((c.mu > 0.0 && c.friction == 0) ? 1 : 0);
    }
    out.baseRows = base.m;
    out.sys.n = n;
    out.sys.m = base.m + extra;
    out.sys.mass = base.mass;
    out.sys.f = base.f;
    out.sys.G.assign(static_cast<std::size_t>(out.sys.m) * n, 0.0);
    std::copy(base.G.begin(), base.G.end(), out.sys.G.begin());
    out.sys.gamma = base.gamma;
    out.sys.gamma.resize(out.sys.m, 0.0);
    out.rowN.assign(cs.size(), -1);
    out.rowT.assign(cs.size(), -1);

    int row = base.m;
    for (std::size_t i = 0; i < cs.size(); ++i) {
        const Contact& c = cs[i];
        if (!c.active) continue;
        double* gn = &out.sys.G[static_cast<std::size_t>(row) * n + 3 * c.body];
        for (int k = 0; k < 3; ++k) gn[k] = c.Jn[k];
        out.sys.gamma[row] = c.bound;
        out.rowN[i] = row++;
        if (c.mu > 0.0 && c.friction == 0) {
            double* gt = &out.sys.G[static_cast<std::size_t>(row) * n + 3 * c.body];
            for (int k = 0; k < 3; ++k) gt[k] = c.Jt[k];
            out.sys.gamma[row] = -c.vt / dt;  // sticking: no tangential velocity after the step
            out.rowT[i] = row++;
        }
    }
    out.H = out.sys.G;
    for (std::size_t i = 0; i < cs.size(); ++i) {
        const Contact& c = cs[i];
        if (!c.active || c.mu <= 0.0 || c.friction == 0) continue;
        double* hn = &out.H[static_cast<std::size_t>(out.rowN[i]) * n + 3 * c.body];
        for (int k = 0; k < 3; ++k) hn[k] -= c.friction * c.mu * c.Jt[k];  // the friction force opposes the sliding
    }
}

// (G M^-1 H^T) lambda = gamma - G M^-1 f,  a = M^-1 (f + H^T lambda). Rows of contacts get a tiny regularisation.
int solveH(const Augmented& A, std::vector<double>& acc, std::vector<double>& lambda) {
    const System& s = A.sys;
    const int n = s.n, m = s.m;
    acc.assign(n, 0.0);
    lambda.assign(m, 0.0);
    if (m == 0) {
        for (int i = 0; i < n; ++i) acc[i] = s.f[i] / s.mass[i];
        return 0;
    }
    std::vector<double> M(static_cast<std::size_t>(m) * m, 0.0), rhs(m, 0.0);
    for (int r = 0; r < m; ++r) {
        const double* Gr = &s.G[static_cast<std::size_t>(r) * n];
        double gf = 0.0;
        for (int k = 0; k < n; ++k) gf += Gr[k] * s.f[k] / s.mass[k];
        rhs[r] = s.gamma[r] - gf;
        for (int q = 0; q < m; ++q) {
            const double* Hq = &A.H[static_cast<std::size_t>(q) * n];
            double sum = 0.0;
            for (int k = 0; k < n; ++k) sum += Gr[k] * Hq[k] / s.mass[k];
            M[static_cast<std::size_t>(r) * m + q] = sum;
        }
    }
    for (int r = A.baseRows; r < m; ++r) {
        double& d = M[static_cast<std::size_t>(r) * m + r];
        d += kRegularisation * std::max(std::abs(d), 1e-3);
    }
    std::vector<int> piv(m);
    if (la_lu_factor(M.data(), m, piv.data()) != LA_OK) return -1;
    la_lu_solve(M.data(), m, piv.data(), rhs.data());
    lambda = rhs;
    for (int k = 0; k < n; ++k) acc[k] = s.f[k];
    for (int r = 0; r < m; ++r) {
        const double* Hr = &A.H[static_cast<std::size_t>(r) * n];
        for (int k = 0; k < n; ++k) acc[k] += Hr[k] * lambda[r];
    }
    for (int k = 0; k < n; ++k) acc[k] /= s.mass[k];
    return 0;
}

double rowDot(const double* J, const std::vector<double>& acc, int body) {
    return J[0] * acc[3 * body] + J[1] * acc[3 * body + 1] + J[2] * acc[3 * body + 2];
}

}  // namespace

std::vector<Contact> detectContacts(const World& world, double dt) {
    std::vector<Contact> all;
    if (world.surfaces.empty()) return all;
    const double g = length(world.gravity);
    for (std::size_t si = 0; si < world.surfaces.size(); ++si) {
        const PreparedSurface ps = prepare(world.surfaces[si]);
        for (std::size_t bi = 0; bi < world.bodies.size(); ++bi) {
            const Body& b = world.bodies[bi];
            if (b.shape == Body::Shape::None || excluded(world, static_cast<int>(bi), static_cast<int>(si))) continue;
            std::vector<Contact> found;
            if (b.shape == Body::Shape::Block) blockContacts(world, static_cast<int>(bi), static_cast<int>(si), ps, dt, found);
            else discContacts(world, static_cast<int>(bi), static_cast<int>(si), ps, dt, found);
            // One feature of the mass touches a given feature of the surface: where two segments of a polyline meet, a corner of a block
            // (a disc as a whole) lies over both. Both would stick and wedge the mass, so only the nearest one is kept.
            std::vector<Contact> kept;
            for (const Contact& c : found) {
                const bool single = c.kind == ContactKind::Corner || c.kind == ContactKind::DiscSegment || c.kind == ContactKind::DiscVertex;
                bool merged = false;
                if (single) {
                    for (Contact& k : kept) {
                        const bool same = b.shape == Body::Shape::Disc ? (k.kind != ContactKind::Vertex)
                                                                       : (k.kind == ContactKind::Corner && k.local == c.local);
                        if (same && k.kind != ContactKind::Vertex) {
                            if (c.gap < k.gap) k = c;
                            merged = true;
                            break;
                        }
                    }
                }
                if (!merged) kept.push_back(c);
            }
            for (Contact& c : kept) {
                c.kappa = curvatureTerm(world, c);
                setBound(c, dt, g);
                all.push_back(c);
            }
        }
    }
    return all;
}

int solveContacts(const System& base, std::vector<Contact>& cs, double dt, std::vector<double>& acc, std::vector<double>& lambda) {
    Augmented A;
    for (Contact& c : cs) { c.active = false; c.flips = 0; c.lambdaN = c.lambdaT = 0.0; }

    // 1. without contacts: which of them does the free motion violate?
    build(base, cs, dt, A);
    if (solveH(A, acc, lambda) != 0) return -1;
    for (Contact& c : cs) {
        const double an = rowDot(c.Jn, acc, c.body);
        if (an < c.bound - (1e-9 + 1e-9 * std::abs(c.bound))) {
            c.active = true;
            c.friction = (c.mu > 0.0 && std::abs(c.vt) >= kStickSpeed) ? (c.vt > 0.0 ? 1 : -1) : 0;
        }
    }

    // 2. active-set iteration
    const int maxIterations = 8 + 4 * static_cast<int>(cs.size());
    for (int it = 0; it < maxIterations; ++it) {
        build(base, cs, dt, A);
        if (solveH(A, acc, lambda) != 0) {
            for (Contact& c : cs) c.active = false;  // singular with contacts: drop them
            build(base, cs, dt, A);
            return solveH(A, acc, lambda) == 0 ? 0 : -1;
        }
        bool changed = false;
        // First the friction states: two sticking corners of a block are redundant (four rows for three degrees of freedom), and the
        // multipliers of that state are not to be trusted for the normal forces. If a contact slides or sticks differently, solve again.
        for (std::size_t i = 0; i < cs.size(); ++i) {
            Contact& c = cs[i];
            if (!c.active || c.mu <= 0.0 || c.flips >= kMaxFlips) continue;
            if (c.friction == 0) {
                const double ln = std::max(lambda[A.rowN[i]], 0.0);
                const double lt = lambda[A.rowT[i]];
                if (std::abs(lt) > c.mu * ln * (1.0 + 1e-9) + 1e-9) {
                    c.friction = lt > 0.0 ? -1 : 1;  // it would slide opposite to the force that holds it
                    c.flips++; changed = true;
                }
            } else {
                const double vt1 = c.vt + dt * rowDot(c.Jt, acc, c.body);
                if (c.friction * vt1 < -1e-10) {  // the friction has stopped it: stick
                    c.friction = 0;
                    c.flips++; changed = true;
                }
            }
        }
        if (changed) continue;
        // then the normal forces: a contact that would pull is released, one the motion violates is added
        for (std::size_t i = 0; i < cs.size(); ++i) {
            Contact& c = cs[i];
            if (c.flips >= kMaxFlips) continue;
            if (!c.active) {
                const double an = rowDot(c.Jn, acc, c.body);
                if (an < c.bound - (1e-9 + 1e-9 * std::abs(c.bound))) {
                    c.active = true; c.flips++; changed = true;
                    c.friction = (c.mu > 0.0 && std::abs(c.vt) >= kStickSpeed) ? (c.vt > 0.0 ? 1 : -1) : 0;
                }
            } else if (lambda[A.rowN[i]] < -kTolNormal) {  // it would pull: it is not in contact
                c.active = false; c.flips++; changed = true;
            }
        }
        if (!changed) break;
    }

    // 3. the multipliers of the final system
    for (std::size_t i = 0; i < cs.size(); ++i) {
        Contact& c = cs[i];
        if (!c.active) continue;
        c.lambdaN = std::max(lambda[A.rowN[i]], 0.0);
        if (c.mu <= 0.0) c.lambdaT = 0.0;
        else if (c.friction == 0) c.lambdaT = lambda[A.rowT[i]];
        else c.lambdaT = -c.friction * c.mu * c.lambdaN;
    }
    return 0;
}

void reportContacts(World& world, const std::vector<Contact>& contacts) {
    world.contacts.clear();
    for (const Contact& c : contacts) {
        if (!c.active) continue;
        ContactReport r;
        const Body& b = world.bodies[c.body];
        r.body = b.id;
        r.surface = world.surfaces[c.surface].id;
        r.point = b.pos + c.r;
        r.normal = c.n;
        r.gap = c.gap;
        r.normalForce = c.lambdaN;
        r.frictionForce = c.lambdaT;
        r.sliding = c.mu > 0.0 && c.friction != 0 && std::abs(c.vt) > 10.0 * kStickSpeed;  // at its limit but not moving: sticking
        world.contacts.push_back(std::move(r));
    }
}

}  // namespace ms
