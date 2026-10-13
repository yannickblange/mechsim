# Equations of motion (v0.1, extended in v0.2, v0.3, v0.4 and v0.4b)

## Coordinates

Each body i has `q_i = [x_i, y_i, φ_i]` (centre of mass and rotation). The global vector stacks
them: `q = [q_0, q_1, …]`, size `n = 3 N`. Mass matrix (diagonal):
`M = diag(m_0, m_0, J_0, m_1, m_1, J_1, …)`.

Block inertia about the centre of mass: `J = m (w² + h²) / 12`.

## Forces

Generalised force per body: `f_i = [F_x, F_y, τ]`, accumulated from gravity `m g` (at the centre
of mass) and force elements. A force `F` at body-local point `p` adds `F` to the force and
`cross(R(φ) p, F)` to the torque.

Linear spring between anchors a and b: `d = p_b − p_a`, `L = |d|`, `u = d / L`,
`F = k (L − L0)` (tension positive). Force on a: `+F u`, on b: `−F u`. Potential: `½ k (L − L0)²`.

## Constraints (Lagrange multipliers)

```
M q̈ = f + Gᵀ λ
G q̈ = γ
```

λ is the force the constraints exert on the bodies, so the Lagerreaktionen are read directly
from λ.

### Festlager (pin_support), body i, local point p, fixed world point p₀

With `r = R(φ_i) p`:

```
C  = x_i + r − p₀                       (2 equations)
Ċ  = v_i + ω_i perp(r)                  perp(r) = [−r_y, r_x]
C̈  = a_i + α_i perp(r) − ω_i² r
```

Rows of G (columns of body i: x, y, φ):

```
[ 1  0  −r_y ]
[ 0  1   r_x ]
```

`γ₀ = ω_i² r`. Baumgarte stabilisation (drift correction):
`γ = γ₀ − 2 α Ċ − β² C`, with α, β from `solver.baumgarte_alpha/beta` (default 5).

### Fixed Lager / Einspannung (fixed_support), v0.2

Festlager rows plus the angle: `C = [x_i + r - p0, phi_i - phi0]` (3 equations).

```
G = [ 1  0  −r_y ]      γ = [ ω² r − 2 α Ċ_xy − β² C_xy ]
    [ 0  1   r_x ]          [ −2 α ω − β² (phi − phi0)  ]
    [ 0  0   1   ]
```

λ = [Fx, Fy, M]: the force and moment the support exerts on the body (the moment acts about the
support point, because the force acts at it).

### Loslager (roller_support), v0.2

The body point may only move along the surface line through `p0` with direction `t = (cos a, sin a)`;
`n = (−sin a, cos a)` is the normal. One equation, no friction:

```
C  = n · (x_i + r − p0)
Ċ  = n · (v_i + ω_i perp(r))
G  = [ n_x  n_y  n · perp(r) ]       γ₀ = ω² n · r      γ = γ₀ − 2 α Ċ − β² C
```

The reaction is `λ n`. The supported point slides, so the rotation of the body is free; a body with a
single Loslager can tip over. Two Loslager on the same surface keep it from tipping.

### Damper (damper), v0.3c

Viscous element between two anchors, `u = (p_b − p_a)/|p_b − p_a|`, anchor velocities `v_a`, `v_b`:

```
F = c u · (v_b − v_a)          force on a: +F u at the anchor point, on b: −F u   (c ≥ 0, tension positive)
```

Dissipated power `c (dL/dt)²`, no potential energy. The velocities at the start of the step are used (explicit
damping), so the semi-implicit Euler scheme stays stable while `c dt / m_eff < 2` (at dt = 1 ms: `c / m < 2000 1/s`); beyond that
the damping overshoots and the motion oscillates numerically.

### Stab and rope (rod, rope), v0.3

Two anchors, world positions `p_a`, `p_b`, anchor velocities `v_a`, `v_b`, `d = p_b − p_a`, `u = d/|d|`,
`v_r = v_b − v_a`. One equation with the multiplier equal to the axial force (tension positive):

```
C  = L − |d|
Ċ  = −u · v_r
C̈  = −u · (a_b − a_a) − (|v_r|² − (u · v_r)²) / |d|        a_p = a_i + α perp(r) − ω² r
G  = +u on body a, −u on body b  (columns x, y, φ: [u, u · perp(r)])
γ₀ = −u · (ω_b² r_b − ω_a² r_a) + (|v_r|² − (u · v_r)²) / |d|        γ = γ₀ − 2 α Ċ − β² C
```

`G^T λ` pulls both ends together for λ > 0. The **rod** is always active. The **rope** is active only while
taut:

- at the start of a step it is engaged if `|d| + max(0, u·v_r) dt ≥ L` (taut now or within this step);
  an engaging rope whose ends move apart (`u·v_r > 0`) first gets the outward velocity removed by the
  velocity projection (below): an **inelastic snap**, no bounce;
- after the solve a rope with λ < 0 (it would push) is released and the system is solved again
  (active-set iteration, at most once per constraint per step);
- its Baumgarte term only corrects a stretched rope (C < 0), never pushes a slack-by-a-few-mm one outward.

**Velocity projection**: `M Δv = Gᵀ Λ, G (v + Δv) = 0`, the same system as an impulse with `J = 0`
(`projectVelocities`).

### Stab clamped to a mass (rod), v0.7b

A rod whose end is on a **block or a disc** is clamped there (an Einspannung: the Stab keeps its angle to the mass), unless `params.hinged_a` /
`hinged_b` is true. The rigid Stab is then a rigid arm of the mass M, and the other end F (a node, the ground, another mass) sticks to the arm's tip:
the tip is the point of M where F started, `q = R(-phi_M0)(p_F0 - x_M0)`, and the constraint is the pin joint between M (lever `q`) and F

```
C = (x_M + R(phi_M) q) - p_F          rows [ I  perp(r_M) | -I  -perp(r_F) ]      gamma_0 = w_M^2 r_M - w_F^2 r_F
```

(2 equations instead of the one of the distance constraint; `gamma = gamma_0 - 2 alpha Cdot - beta^2 C` as always). Clamped at both ends (two masses) it is a weld:
the third equation is the joint's `phi_M - phi_F - dphi_0`. The multiplier is the force on M; the frame reports the part along the rod as `force`
(tension positive) and the force on end b as `reaction`. A Stab between the ground and a block is then a Festlager at a point of the (extended)
block; **two clamped rods from the ground to one block over-determine it** (it cannot move at all): the engine reports a singular system, and
`hinged_*` is the way to hang a block from two Stabs. Ends on nodes, beams and the ground stay pins (a node with an Einspannung clamps an elastic Stab, v0.7).
An elastic Stab on a block or disc is clamped in the same way: its section there has the rotation of the mass, and the Euler load uses `K = 0.699 / 0.5`.
*On a node with an Einspannung (v0.7c).* A rod end on a **node that has a `fixed_support`** is clamped the same way, rigid Stabs too (the elastic ones have been since v0.7): the rod is
a rigid arm of the node, whose rotation the support holds, so the far end is held at its lever: **a rigid cantilever** (the far end does not move, the support carries `F` and the moment `F L`; to see
it bend, make the Stab elastic). The loader sets the internal `params.node_clamped_a / _b` of the rod from the scene, so saved scenes need nothing new; `hinged_*` does not apply to nodes (take the
Einspannung off the node: the editor's *Gelenk* turns it into a Festlager). A Festlager on the node leaves the rod a pin. Checked: `tests/validation/test_v07b_physics.py` (`mast`).

Checked: `tests/native/constraints/test_link.cpp` (physical pendulum on a clamped rod, the weld, hinged unchanged),
`tests/validation/test_v07b_physics.py` (Kreis Feder).

### Gelenk and rigid joint (pin_joint, fixed_joint), v0.3

Between bodies a and b with local points `p_a`, `p_b`, `r = R(φ) p`:

```
C = (x_a + r_a) − (x_b + r_b)            rows [ I  perp(r_a) | −I  −perp(r_b) ]
γ₀ = ω_a² r_a − ω_b² r_b                 γ = γ₀ − 2 α Ċ − β² C
```

`fixed_joint` adds `C₃ = φ_a − φ_b − Δφ₀` with row `[0 0 1 | 0 0 −1]` and
`γ₃ = −2 α (ω_a − ω_b) − β² C₃`. λ is the force (and moment) on body a; body b gets the opposite.

### Loads, v0.2

A constant force `F` at body-local point `p` and a couple `M` add `F` to the force and
`cross(R(φ) p, F) + M` to the torque. Potential: `V = −F · (x_i + R(φ) p) − M φ`.

### Impulses at t = 0, v0.2

An impulse `J` (generalised: `[Jx, Jy, cross(r, J) + L]`) is a velocity jump that respects the constraints:

```
M Δv = J + Gᵀ Λ,        G (v + Δv) = 0      →   (G M⁻¹ Gᵀ) Λ = −G (v + M⁻¹ J)
```

This is the same Schur complement as the accelerations (`solveAccelerations` with `f = J`,
`γ = −G v`). Example: a horizontal impulse `J` at the lower end of a rod pinned at its top end gives
`ω = J h / I_A` and `v_cm = ω × r_cm`, not the free-body result `v = J / m`. The initial state saved for
`reset()` is the state **before** the impulse; the impulse is applied again after every reset.

### Harmonic load, v0.4

`F(t) = F sin(2 pi f t + phi)` (and the same factor on the moment), evaluated at the time of the start of the step. It is
not conservative (no potential). Forced vibration of a mass, spring and damper: the steady state of
`m x'' + c x' + k x = F0 sin(Omega t)` is `x = X sin(Omega t - delta)` with

```
X = F0 / sqrt((k - m Omega^2)^2 + (c Omega)^2) = (F0 / k) / sqrt((1 - eta^2)^2 + (2 zeta eta)^2),
tan(delta) = 2 zeta eta / (1 - eta^2),    eta = Omega / omega0,   zeta = c / (2 sqrt(k m))
```

(`tests/validation/test_v04_physics.py` checks amplitude, frequency and phase). Free vibration: `omega0 = sqrt(k/m)`,
damped `omega_d = omega0 sqrt(1 - zeta^2)`, successive peaks fall by `exp(-2 pi zeta / sqrt(1 - zeta^2))`.

### Elastic bar, v0.4 and v0.4b

*One element* (`segments = 1`): an axial spring `k = E A / L0` between two anchors (rest length = installed length `L0`), force
`k (L - L0)`, tension positive, potential `1/2 k (L - L0)^2`; massless, cannot bend or buckle (the bar of v0.4).

*The elastic Stab proper* (v0.4b, default 4 elements) is a **beam-column**: a chain of the corotational beam elements below, pinned at both
anchors (the end rotation is not a variable: the end carries no moment), with hidden internal nodes. They carry its mass
(`7850 kg/m^3 x A x L` unless given; half of the two end segments hangs on the anchors as weight), so the bar **sags under its
own weight** and **buckles in the plane** when the compression reaches the Euler load of the pinned column

```
P_cr = pi^2 E I / L^2          (I about the axis normal to the plane: the section's I; slenderness L / i, i = sqrt(I / A))
```

An initial bow `imperfection x L` (a half sine, stress-free; default 1e-5, 20 micrometres on 2 m) seeds the instability, because a perfectly
straight column only buckles when round-off grows. Below `P_cr` a bow `w0` is magnified to `w0 / (1 - P / P_cr)`; above it the straight shape is
unstable and the column goes to the post-buckled shape of Euler's elastica under a dead load: with `2 K(k) / pi = sqrt(P / P_cr)` the lateral
deflection is `k L / K(k)` (`K` the complete elliptic integral of the first kind): 0.37 L for `P = 1.3 P_cr`. Both are checked in
`tests/native/elements/test_bar.cpp` and `tests/validation/test_v04_physics.py`.

*Clamped ends* (v0.7). An end of an elastic Stab on a **node that has an Einspannung** (`fixed_support`) is clamped, not pinned: its section
rotation is the rotation `phi` of the node, which the support holds at `phi0`, so the end rotation against the chord is
`theta = phi - phi0 - dbeta` (`dbeta` the chord rotation) and the end carries a moment, the reaction `M` of the support. An end on any other body
(a block, a beam, the ground, a node with a Festlager or none) stays pinned. The loader decides from the scene alone, so a saved scene needs
nothing new. The Euler load follows Euler's cases (the ends held sideways): `P_cr = pi^2 E I / (K L)^2` with `K = 1` pinned - pinned, `0.6992`
clamped - pinned (`P_cr = 20.19 E I / L^2`, 2.046 x the pinned one) and `0.5` clamped - clamped; the frame's `pcr` reports the one that fits the ends.
A clamped end does not help a free end: a cantilever (clamped, top free) buckles at a quarter of the pinned load (`K = 2`), which the frame does not
report (it has no way to know that the top is free). Checked: `tests/native/elements/test_bar.cpp` (clamped - pinned column buckles at `P_cr` of
case 3, not at the pinned one; the cantilever deflects `P L^3 / 3 E I`) and `tests/validation/test_v07_physics.py` (the Knick Fall).

A truss of such members is not exactly the direct stiffness method of `mechsim.analysis.truss`: a heavy slender member sags, and a sagging member is
softer than `E A / L` (its chord shortens by `8 w^2 / 3 L`, micrometres, as much as the load deforms a stiff truss). Statically determinate members
are not affected; the redundant ones of the example `truss_elastic` shift by a few ten per cent of the largest force. With `segments = 1` or light
members the engine reproduces the stiffness method exactly.

### Damping, v0.4b

Every body has a viscous damping rate `alpha` (1/s): force `-alpha m v` and torque `-alpha J omega` (nodes, beams, the internal nodes of elastic Stabs; default 0).
Mass-proportional damping decays **every** mode like `exp(-alpha t / 2)` whatever its frequency, so a load applied suddenly makes a beam overshoot once
and then hold its static deflection (an undamped elastic system swings between 0 and twice the static response for ever). It is explicit, so `alpha dt`
is limited to 0.5 per substep. It acts on rigid-body motion as well (like a viscous medium): keep it 0 for a beam that flies free.
(Stiffness-proportional damping, the usual choice for structures, is not stable with explicit steps for stiff steel at useful rates: the highest mode would need
`beta omega^2 dt < 2`, i.e. hundreds of substeps per millisecond.)

### Beam, v0.4 (with the changes of v0.4b)

A bendable beam of length `L`, section area `A`, second moment `I`, Young's modulus `E` is a chain of node bodies
(x, y, phi each, i.e. exactly the unknowns of a beam finite element). Between neighbours i -> j a corotational
Euler-Bernoulli element (v0.4b adds the bowing term, see below): with the chord `u = (p_j - p_i) / L`, `n = perp(u)`, the elongation `e = L - L0`, the chord rotation
`dbeta` (angle from the undeformed chord to `u`) and the end rotations against the chord
`theta_i = phi_i - phi0_i - dbeta`, `theta_j = phi_j - phi0_j - dbeta` (wrapped to +-pi):

```
U = (EA / 2 L0) e^2 + (EI / L0) (2 theta_i^2 + 2 theta_i theta_j + 2 theta_j^2)
N = (EA / L0) e,   M_i = (EI / L0)(4 theta_i + 2 theta_j),   M_j = (EI / L0)(2 theta_i + 4 theta_j)
F_i = +N u - ((M_i + M_j) / L) n,   F_j = -F_i,   tau_i = -M_i,   tau_j = -M_j
```

(`-dU/dq`; the shear pair comes from `d dbeta / d p = -+ n / L`; no net force or moment). **Bowing (v0.4b)**: the chord of a bent element is shorter than the
arc, so the axial strain is `e_ax = (L - L0) + (L0 / 30)(2 theta_i^2 - theta_i theta_j + 2 theta_j^2)` and `N = (EA / L0) e_ax`; this adds
`N (L0 / 30)(4 theta_i - theta_j)` to `M_i` and `N (L0 / 30)(-theta_i + 4 theta_j)` to `M_j`. It is the geometric stiffness of the consistent beam:
a compressed member loses bending stiffness and buckles at the Euler load. A hinged end has no rotation variable: its `theta` minimises `U`
(`dU/dtheta = 0`, a few Newton steps from `-theta_other / 2`; by the envelope theorem the same forces are right and no moment acts on the end). Rigid-body motion costs nothing, for any
rotation; for small deformations this is the exact stiffness matrix of the linear beam, so a cantilever with a load at its tip
bends by `P L^3 / 3 E I` however few elements it has (and `P L^2 / 2 E I` at the tip). Mass is lumped: node k gets the mass
of the slice of beam of its own half segments, and the rotary inertia `m (trib^2 + depth^2) / 12` (the end nodes
`m (trib^2 / 3 + depth^2 / 12)`). Attachments get a node of their own, or are moved onto a node within 20 % of a segment
and keep the small offset as a rigid lever in the frame of the node. The bending moment reported at a node is
`-M_i` of the segment that starts there and `+M_j` of the one that ends there (the mean at a support), sagging positive; the stress
`|N| / A + max(|M_i|, |M_j|) y_max / I`.

Cross sections: `square` `A = a^2`, `I = a^4/12`. `I`: `A = 2 b tf + (h - 2 tf) tw`, `I = (b h^3 - (b - tw)(h - 2 tf)^3) / 12`.
`H`: the same `A`, `I = (2 tf b^3 + (h - 2 tf) tw^3) / 12`. `T`: centroid `y_c` above the bottom of the stem,
`I = sum (w h^3 / 12 + w h d^2)` over flange and stem (parallel axis). `L`: the same for leg and foot.
`tests/native/test_section.cpp`, `tests/frontend/section.test.mjs` and `tests/python/test_section_parity.py` compare all three
implementations with a decomposition into rectangles.

Textbook checks in `tests/native/test_beam.cpp`: cantilever tip deflection and rotation, the same cantilever turned by 30 degrees,
simply supported beam `5 q L^4 / 384 E I`, free fall and rest of rotated beams (no strain), conservation of momentum and angular momentum
of a spinning free beam, frequency of a cantilever with a tip mass `omega = sqrt(3 E I / L^3 (M + 33/140 m))`.

### Substeps for stiff elements, v0.4

Semi-implicit Euler is stable for `omega dt < 2`, `omega` being the highest natural frequency of the force elements. Steel is
stiff (a 2 m, 10 mm strip has modes up to some 10^3 rad/s, a steel bar of 1 kg nodes 10^4), so `World::initialize()` estimates it:
`K = -df/dq` of the element forces by central differences, the largest eigenvalue of `M^-1/2 K M^-1/2` by power iteration
(constraints can only lower it), times 1.15. `World::step(dt)` runs `ceil(omega dt / 0.25)` substeps (at most 2000). The energy error of
the stiffest mode of a symplectic Euler step is a few per cent of what the mode carries at `omega dt = 0.25`; soft systems
(`omega dt < 0.25`, every example before v0.4) take exactly one step as before.

### Solving

M is diagonal, so the Schur complement is cheap:

```
(G M⁻¹ Gᵀ) λ = γ − G M⁻¹ f
q̈ = M⁻¹ (f + Gᵀ λ)
```

The m×m system is solved with LU (`native/linalg`).

## Time integration: semi-implicit (symplectic) Euler

```
v ← v + q̈ dt
q ← q + v dt        (uses the new v)
t ← t + dt
```

Energy is not exactly conserved but stays bounded (oscillates with relative amplitude about
ω·dt/2). Validation tolerances in `tests/validation` are chosen accordingly.

## Reference results used in tests

- Mass–spring: `ω₀ = √(k/m)`, period `T = 2π/ω₀`.
- Physical pendulum pinned at distance d from the centre of mass:
  `T = 2π √(J_A / (m g d))`, `J_A = J + m d²` (small angle).
- Block on a frictionless incline (Loslager): `a = g sin(theta)` along the surface, normal force `m g cos(theta)`;
  with semi-implicit Euler `s_n = a dt² n (n + 1) / 2` is exact.
- Clamped block (fixed Lager) of length L: reaction `Fy = m g`, `M = m g L / 2` (balances the clockwise weight).
- Disc of radius r on a Festlager at its centre with a spring at the rim (stiffness k, vertical): small
  oscillations with `ω = sqrt(2 k / m)`, independent of r.
- Mass–spring–damper: `ζ = c / (2 √(k m))`, damped frequency `ω_d = ω₀ √(1 − ζ²)`, successive peaks shrink by
  `exp(−ζ ω₀ T_d)`; a mass hanging on a damper alone reaches the terminal velocity `m g / c`.
- Block of mass m hanging from two Stabs from `(±0.5, 1.5)` to its top corners `(±0.2, 0.6)`: each rod
  carries `m g / (2 cos θ)` with `cos θ = 0.9 / |(0.3, 0.9)|`.
- A mass falling 0.414 m onto a rope that goes taut loses `½ m v_r²` (`v_r` the velocity component along the rope
  at the snap); the tangential part is kept.
- Double pendulum of two uniform bars: the Lagrange equations (integrated with RK4 in
  `tests/validation/test_v03_physics.py`) with `I_cm = m (l² + w²) / 12`.
- Rigid L of two welded bars on a Festlager: physical pendulum, `T = 2π √(I_A / (M g d))`.
- Free fall with semi-implicit Euler from rest: `y_n = y_0 + g_y dt² n(n+1)/2` (exact for the scheme).
- A 2 m cantilever (10 mm square steel strip) under a tip load P and its own weight q per metre:
  `delta = P L^3 / 3 E I + q L^4 / 8 E I`; first mode `omega = 3.516 sqrt(E I / (rho A L^4))` (the lumped model: `sqrt(3 E I / (33/140 m L^3))`).
- Simply supported beam of mid-span load P: `delta = P L^3 / 48 E I`, under its own weight `5 q L^4 / 384 E I`.
- Statically determinate truss: `2 j = m + r`; member forces by the method of joints (equilibrium of every node).
